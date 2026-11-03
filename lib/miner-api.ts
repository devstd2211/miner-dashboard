// HTTP access to AxeOS / NerdQAxe miners and normalization of their JSON.
//
// Unit quirks observed on real devices (NerdQAxe v1.1.1):
//   /api/system/info: voltage and coreVoltageActual in mV, current in mA (currentA in A),
//                     max current is `maxCurrentA`, pool host is `stratumURL`.
//   /api/v2/dashboard: power.voltage in V, power.coreVoltageActual in V, max current is
//                     `power.currentAMax`, pools[] carry host/connected/active.
// Stock AxeOS (Bitaxe) only has /api/system/info; older versions report bestDiff as a
// string like "4.29G".

import type { ChipStat, MinerSnapshot, MinerType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export async function fetchJson(url: string, timeoutMs: number): Promise<Json> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(await res.text()); // throws on HTML (e.g. SPA fallback page)
}

export function isMinerInfo(info: Json): boolean {
  return (
    info != null &&
    typeof info === "object" &&
    typeof info.hashRate === "number" &&
    (typeof info.ASICModel === "string" || typeof info.asicModel === "string")
  );
}

export function minerId(info: Json): string {
  const mac = typeof info.macAddr === "string" ? info.macAddr.trim().toUpperCase() : "";
  return mac || String(info.hostname ?? "").trim().toLowerCase();
}

/** Checked during discovery: is /api/v2/dashboard available (NerdQAxe firmware)? */
export async function detectType(ip: string, timeoutMs = 2500): Promise<MinerType> {
  try {
    const d = await fetchJson(`http://${ip}/api/v2/dashboard`, timeoutMs);
    return d && typeof d.performance === "object" ? "nerdqaxe" : "axeos";
  } catch {
    return "axeos";
  }
}

export interface MinerReading {
  id: string;
  snapshot: MinerSnapshot;
}

/** Reads a miner and returns a normalized snapshot. Throws if the miner does not answer. */
export async function readMiner(ip: string, type: MinerType, timeoutMs = 4000): Promise<MinerReading> {
  const [info, dash] = await Promise.all([
    fetchJson(`http://${ip}/api/system/info`, timeoutMs),
    type === "nerdqaxe"
      ? fetchJson(`http://${ip}/api/v2/dashboard`, timeoutMs).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!isMinerInfo(info)) throw new Error("not a miner response");
  return { id: minerId(info), snapshot: normalize(info, dash) };
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** "4.29G" -> 4.29e9; numbers pass through. */
export function parseDiff(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/^([\d.]+)\s*([kKMGTPE]?)$/);
  if (!m) return undefined;
  const mult: Record<string, number> = { "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
  return parseFloat(m[1]) * mult[m[2]];
}

function normalize(info: Json, dash: Json | null): MinerSnapshot {
  const perf = dash?.performance;
  const pwr = dash?.power;
  const thermal = dash?.thermal;
  const stratum = dash?.stratum ?? info.stratum;

  const asicCount = num(info.asicCount) ?? num(perf?.asicCount);
  const smallCoreCount = num(info.smallCoreCount) ?? num(perf?.smallCoreCount);
  const frequency = num(info.frequency) ?? num(perf?.frequency);
  const expectedHashRate =
    frequency && smallCoreCount
      ? (frequency * smallCoreCount * (asicCount ?? 1)) / 1000
      : num(info.expectedHashrate);

  // Fans: dashboard has a clean array; otherwise use fanspeed/fanrpm(/2) from info.
  let fans: MinerSnapshot["fans"];
  if (Array.isArray(thermal?.fans)) {
    fans = thermal.fans.map((f: Json) => ({ speed: num(f.speed), rpm: num(f.rpm) }));
  } else {
    fans = [{ speed: num(info.fanspeed), rpm: num(info.fanrpm) }];
    const rpm2 = num(info.fanrpm2) ?? num(info.fan2rpm);
    if (rpm2 !== undefined && ((num(info.fanCount) ?? 1) > 1 || rpm2 > 0)) {
      fans.push({ speed: num(info.fanspeed2), rpm: rpm2 });
    }
  }

  // Pool: prefer the active pool from the dashboard / info.stratum.pools.
  const usingFallback = Boolean(stratum?.usingFallback ?? info.isUsingFallbackStratum);
  const pools: Json[] = Array.isArray(stratum?.pools) ? stratum.pools : [];
  const pool = pools.find((p) => p.active) ?? pools[usingFallback && pools.length > 1 ? 1 : 0];
  const host = pool?.host ?? (usingFallback ? info.fallbackStratumURL : info.stratumURL);
  const port = num(pool?.port) ?? num(usingFallback ? info.fallbackStratumPort : info.stratumPort);
  const user = pool?.user ?? (usingFallback ? info.fallbackStratumUser : info.stratumUser);

  const chips: ChipStat[] | undefined = Array.isArray(perf?.chips)
    ? perf.chips.map((c: Json) => ({ hashRate: num(c.hashRate) ?? 0, errorHashRate: num(c.errorHashRate) ?? 0 }))
    : undefined;

  const infoVoltage = num(info.voltage);
  const infoCurrentA = num(info.currentA) ?? (num(info.current) !== undefined ? info.current / 1000 : undefined);

  const power = num(pwr?.watts) ?? num(info.power) ?? 0;
  const voltage = num(pwr?.voltage) ?? (infoVoltage !== undefined ? infoVoltage / 1000 : undefined);
  const currentA = num(pwr?.currentA) ?? infoCurrentA;
  // On stock Bitaxe the current is measured on the ASIC core rail: input V × A then is far
  // above the reported power (e.g. 4.9 V × 10.9 A = 53 W vs 17.5 W).
  const currentIsCore =
    voltage !== undefined && currentA !== undefined && power > 0 && voltage * currentA > power * 1.5;

  return {
    hostname: String(info.hostname ?? "").trim(),
    mac: typeof info.macAddr === "string" ? info.macAddr.toUpperCase() : undefined,
    deviceModel: info.deviceModel ?? info.boardVersion,
    asicModel: String(info.ASICModel ?? info.asicModel),
    asicCount,
    version: info.version,

    hashRate: num(perf?.hashRate) ?? info.hashRate,
    hashRate1m: num(perf?.hashRate1m) ?? num(info.hashRate_1m),
    hashRate10m: num(perf?.hashRate10m) ?? num(info.hashRate_10m),
    hashRate1h: num(perf?.hashRate1h) ?? num(info.hashRate_1h),
    hashRate1d: num(perf?.hashRate1d) ?? num(info.hashRate_1d),
    expectedHashRate,

    power,
    voltage,
    currentA,
    currentAMax: num(pwr?.currentAMax) ?? num(info.maxCurrentA),
    currentIsCore,

    asicTemp: num(thermal?.asicTemp) ?? num(info.temp),
    vrTemp: num(thermal?.vrTemp) ?? num(info.vrTemp),
    fans,

    frequency,
    coreVoltage: num(info.coreVoltage),
    coreVoltageActual:
      num(info.coreVoltageActual) ??
      (num(pwr?.coreVoltageActual) !== undefined ? pwr.coreVoltageActual * 1000 : undefined),

    pool: {
      host,
      port,
      user: typeof user === "string" ? user : undefined,
      connected: typeof pool?.connected === "boolean" ? pool.connected : undefined,
      usingFallback,
      accepted: num(pool?.accepted) ?? num(info.sharesAccepted) ?? 0,
      rejected: num(pool?.rejected) ?? num(info.sharesRejected) ?? 0,
      pingMs: num(pool?.pingRtt) ?? num(info.lastpingrtt) ?? num(info.responseTime),
    },

    bestDiff: parseDiff(perf?.bestDiff ?? info.bestDiff),
    bestSessionDiff: parseDiff(perf?.bestSessionDiff ?? info.bestSessionDiff),
    poolDifficulty: num(info.poolDifficulty) ?? num(pool?.poolDifficulty),
    networkDifficulty: parseDiff(info.networkDifficulty ?? pool?.networkDifficulty),
    blockHeight: num(info.blockHeight) ?? num(dash?.coinbase?.blockHeaders?.[0]?.blockHeight),
    uptimeSeconds: num(info.uptimeSeconds) ?? num(dash?.system?.uptime),
    totalHashes: num(info.totalHashes),

    chips,
  };
}
