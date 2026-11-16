// Demo mode (open the dashboard with ?demo=N): N made-up miners generated in the browser,
// no network access. Used for README screenshots and to try the layout with many miners.
// The data is deterministic (fixed seed); every refresh adds a little noise, and now and then
// a miner finds a better share and climbs the leaderboard.
import type { ChipStat, HistoryPoint, MinersResponse, MinerSnapshot, MinerType, MinerView, NonceEvent } from "./types";

interface Model {
  type: MinerType;
  device: string;
  asic: string;
  chips: number;
  th: [number, number]; // expected hashrate range, TH/s
  jPerTh: number;
  freq: number;
  coreMv: number;
  inputV: number;
  maxA?: number;
  fans: number;
  version: string;
}

const OCTAXE: Model = { type: "nerdqaxe", device: "NerdOCTAXE-γ", asic: "BM1370", chips: 8, th: [12, 19], jPerTh: 14.8, freq: 825, coreMv: 1190, inputV: 11.8, maxA: 25, fans: 2, version: "v1.1.1" };
const QAXE: Model = { type: "nerdqaxe", device: "NerdQAxe++", asic: "BM1370", chips: 4, th: [4.8, 6.8], jPerTh: 16.7, freq: 825, coreMv: 1190, inputV: 11.8, maxA: 10, fans: 2, version: "v1.1.1" };
const GAMMA: Model = { type: "axeos", device: "601", asic: "BM1370", chips: 1, th: [1.0, 1.25], jPerTh: 15.9, freq: 525, coreMv: 1150, inputV: 4.9, fans: 1, version: "v2.15.4" };
const SUPRA: Model = { type: "axeos", device: "401", asic: "BM1368", chips: 1, th: [0.6, 0.75], jPerTh: 18.5, freq: 490, coreMv: 1166, inputV: 5.0, fans: 1, version: "v2.15.4" };

// The first three match a typical home setup; the rest cycle through the models.
const FLEET: [string, Model][] = [
  ["Octaxe", OCTAXE], ["QAxe++", QAXE], ["Gamma", GAMMA], ["Supra", SUPRA], ["Octaxe-2", OCTAXE],
  ["Gamma-Garage", GAMMA], ["QAxe-Office", QAXE], ["Gamma-Kitchen", GAMMA], ["Octaxe-Shed", OCTAXE],
  ["Supra-Balcony", SUPRA], ["QAxe-Attic", QAXE], ["Gamma-Desk", GAMMA],
];

const POOL_DIFFS = [1000, 2048, 4096, 8192, 16384, 65536];
const NETWORK_DIFF = 134.8e12;
const DEMO_WALLET = "bc1qdemo0000000000000000000000000000000000";

/** Small seeded PRNG (mulberry32), so screenshots come out the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoMiner {
  view: MinerView;
  model: Model;
  expected: number; // GH/s
}

export interface Demo {
  /** The next /api/miners response. */
  tick(): MinersResponse;
  /** Nonce feeds as /api/feed would send them, by miner id. */
  feeds(): Record<string, NonceEvent[]>;
}

export function createDemo(count: number): Demo {
  const rnd = rng(2211);
  const around = (v: number, spread: number) => v * (1 + (rnd() - 0.5) * 2 * spread);
  const logBetween = (lo: number, hi: number) => 10 ** (Math.log10(lo) + rnd() * (Math.log10(hi) - Math.log10(lo)));
  const start = Date.now();

  const miners: DemoMiner[] = Array.from({ length: count }, (_, i) => {
    const [base, model] = FLEET[i % FLEET.length];
    const name = i < FLEET.length ? base : `${base}-${Math.floor(i / FLEET.length) + 1}`;
    const expected = (model.th[0] + rnd() * (model.th[1] - model.th[0])) * 1000;
    const uptime = Math.round(logBetween(3 * 3600, 25 * 86400));
    const bestSession = logBetween(5e7, 3e10);
    const mac = `02:00:00:00:00:${(i + 16).toString(16).toUpperCase()}`;
    const ip = `192.168.1.${101 + i}`;
    const poolDifficulty = POOL_DIFFS[Math.floor(rnd() * POOL_DIFFS.length)];
    const accepted = Math.round((expected / 1000) * (uptime / 3600) * (40 + rnd() * 30) * (8192 / poolDifficulty) ** 0.3);
    const snapshot: MinerSnapshot = {
      hostname: name,
      mac,
      deviceModel: model.device,
      asicModel: model.asic,
      asicCount: model.chips,
      version: model.version,
      hashRate: around(expected, 0.03),
      hashRate1m: around(expected, 0.015),
      hashRate10m: around(expected, 0.01),
      hashRate1h: around(expected, 0.01),
      hashRate1d: model.type === "nerdqaxe" ? around(expected, 0.01) : undefined,
      expectedHashRate: expected,
      power: around((expected / 1000) * model.jPerTh, 0.02),
      voltage: around(model.inputV, 0.01),
      currentA: model.maxA ? ((expected / 1000) * model.jPerTh) / model.inputV : around(10.9, 0.02),
      currentAMax: model.maxA,
      currentIsCore: model.type === "axeos",
      asicTemp: around(55, 0.08),
      vrTemp: around(model.type === "axeos" ? 54 : 46, 0.05),
      fans: Array.from({ length: model.fans }, () => ({ speed: Math.round(around(70, 0.25)), rpm: Math.round(around(2600, 0.3)) })),
      frequency: model.freq,
      coreVoltage: model.coreMv,
      coreVoltageActual: model.coreMv - Math.round(rnd() * 8),
      pool: {
        host: "solo.stratum.braiins.com",
        port: 3333,
        user: `${DEMO_WALLET}.${name.toLowerCase()}`,
        connected: true,
        usingFallback: false,
        accepted,
        rejected: Math.round(accepted * logBetween(0.0003, 0.004)),
        pingMs: Math.round(around(35, 0.4)),
      },
      bestDiff: bestSession * logBetween(1, 20),
      bestSessionDiff: bestSession,
      poolDifficulty,
      networkDifficulty: NETWORK_DIFF,
      blockHeight: 976_170,
      uptimeSeconds: uptime,
      totalHashes: model.type === "axeos" ? expected * 1e9 * uptime * logBetween(2, 6) : undefined,
      chips: model.type === "nerdqaxe" ? chipStats(expected, model.chips, rnd) : undefined,
    };
    const history: HistoryPoint[] = Array.from({ length: 288 }, (_, k) => ({
      t: start - (287 - k) * 300_000,
      hr: expected * (1 + (rnd() + rnd() + rnd() - 1.5) * 0.02),
    }));
    const view: MinerView = {
      id: mac,
      ip,
      hostname: name,
      mac,
      type: model.type,
      lastSeen: new Date(start).toISOString(),
      online: true,
      snapshot,
      history,
    };
    return { view, model, expected };
  });

  // A few things to look at: one miner offline, one running hot, one with too many rejects.
  if (count >= 6) {
    const off = miners[count - 2].view;
    off.online = false;
    off.lastError = "connect ETIMEDOUT";
    off.lastSeen = new Date(start - 7 * 60_000).toISOString();
  }
  if (count >= 8) miners[3].view.snapshot!.asicTemp = 72.6;
  if (count >= 10) miners[6].view.snapshot!.pool.rejected = Math.round(miners[6].view.snapshot!.pool.accepted * 0.025);

  let ticks = 0;
  const feeds: Record<string, NonceEvent[]> = {};

  return {
    tick() {
      const now = start + ticks * 5000; // advance like the real 5 s refresh
      ticks++;
      for (const { view, expected } of miners) {
        if (!view.online) continue;
        const s = view.snapshot!;
        view.lastSeen = new Date(now).toISOString();
        if (ticks > 1) {
          s.hashRate = around(expected, 0.03);
          s.hashRate1m = around(expected, 0.015);
          s.pool.accepted += Math.round(rnd() * 3);
          s.uptimeSeconds! += 5;
          if (ticks % 60 === 0) view.history = [...view.history.slice(1), { t: now, hr: around(expected, 0.02) }];
        }
        feeds[view.id] = nonceFeed(s, rnd, now);
      }
      // About every 30 s a miner other than the leader finds a better share and takes the lead.
      const online = miners.filter((m) => m.view.online).map((m) => m.view.snapshot!);
      if (ticks > 1 && online.length > 1 && rnd() < 1 / 6) {
        const top = Math.max(...online.map((s) => s.bestSessionDiff ?? 0));
        const others = online.filter((s) => s.bestSessionDiff !== top);
        const lucky = others[Math.floor(rnd() * others.length)];
        lucky.bestSessionDiff = top * around(1.4, 0.2);
        lucky.bestDiff = Math.max(lucky.bestDiff ?? 0, lucky.bestSessionDiff);
      }
      return {
        now,
        miners: miners.map((m) => structuredClone(m.view)),
        scan: { scanning: false, lastScanAt: new Date(start).toISOString(), lastScanFound: count, subnets: ["192.168.1"] },
      };
    },
    feeds: () => ({ ...feeds }),
  };
}

function chipStats(expected: number, chips: number, rnd: () => number): ChipStat[] {
  return Array.from({ length: chips }, () => {
    const hashRate = (expected / chips) * (1 + (rnd() - 0.5) * 0.06);
    return { hashRate, errorHashRate: rnd() < 0.8 ? 0 : hashRate * rnd() * 0.008 };
  });
}

/** 4 recent nonces per chip, newest first; shares at or above the pool difficulty are accepted. */
function nonceFeed(s: MinerSnapshot, rnd: () => number, now: number): NonceEvent[] {
  const pool = s.poolDifficulty ?? 1000;
  const out: NonceEvent[] = [];
  for (let k = 0; k < 4; k++) {
    for (let chip = 0; chip < (s.asicCount ?? 1); chip++) {
      const diff = Math.round(pool * 10 ** ((rnd() - 0.6) * 2.2));
      out.push({
        t: now - k * 1500 - chip * 100,
        nonce: Math.floor(rnd() * 2 ** 32).toString(16).toUpperCase().padStart(8, "0"),
        asic: chip,
        diff,
        poolDiff: pool,
        status: diff >= pool ? "accepted" : "found",
      });
    }
  }
  return out;
}
