// In-memory state of all miners: list (persisted to data/miners.json), latest readings,
// 24 h hashrate history (in memory, not persisted) and the background poller.

import fs from "node:fs/promises";
import path from "node:path";
import { readMiner } from "./miner-api";
import { detectSubnets, scanNetwork } from "./scanner";
import { downsample, HISTORY_WINDOW_MS } from "./history";
import type { HistoryPoint, MinerRecord, MinerSnapshot, MinersResponse, ScanStatus } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "miners.json");
const POLL_INTERVAL_MS = 10_000;
const OFFLINE_AFTER_MS = 30_000;
const SAVE_EVERY_MS = 60_000;
// If a miner is offline this long, rescan automatically (it may have a new DHCP address)...
const AUTO_RESCAN_OFFLINE_MS = 60_000;
// ...but not more often than this.
const AUTO_RESCAN_MIN_INTERVAL_MS = 5 * 60_000;

interface MinerState {
  record: MinerRecord;
  snapshot?: MinerSnapshot;
  lastOkAt?: number; // ms; only successful polls since server start
  lastError?: string;
  history: HistoryPoint[]; // oldest first, only the last 24 h
}

interface Store {
  miners: Map<string, MinerState>;
  scan: ScanStatus;
  scanPromise?: Promise<number>;
  timer?: NodeJS.Timeout;
  started: boolean;
  lastSaveAt: number;
}

// globalThis keeps a single store even if Next bundles this module more than once
// (instrumentation hook and route handlers) or hot-reloads it in dev.
const g = globalThis as unknown as { __minerStore?: Store };
const store: Store = (g.__minerStore ??= {
  miners: new Map(),
  scan: { scanning: false, subnets: [] },
  started: false,
  lastSaveAt: 0,
});

function addRecord(record: MinerRecord) {
  const existing = store.miners.get(record.id);
  if (existing) existing.record = { ...existing.record, ...record };
  else store.miners.set(record.id, { record, history: [] });
}

async function load(): Promise<boolean> {
  try {
    const list = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as MinerRecord[];
    list.forEach(addRecord);
    return true;
  } catch {
    return false; // missing or broken file -> scan
  }
}

async function save() {
  const list = [...store.miners.values()].map((m) => m.record);
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(list, null, 2));
  await fs.rename(tmp, DATA_FILE);
  store.lastSaveAt = Date.now();
}

/** Scan the LAN and merge results by id (MAC/hostname), so a new IP updates the old entry. */
export function rescan(): Promise<number> {
  if (store.scanPromise) return store.scanPromise;
  store.scanPromise = (async () => {
    const knownIps = [...store.miners.values()].map((m) => m.record.ip);
    const subnets = detectSubnets(knownIps);
    store.scan = { ...store.scan, scanning: true, subnets };
    try {
      const found = await scanNetwork(subnets);
      found.forEach(addRecord);
      store.scan.lastScanFound = found.length;
      console.log(`[scan] ${subnets.join(", ")}: found ${found.map((m) => `${m.hostname}@${m.ip}`).join(", ") || "nothing"}`);
      await save();
      await pollAll();
      return found.length;
    } finally {
      store.scan.scanning = false;
      store.scan.lastScanAt = new Date().toISOString();
      store.scanPromise = undefined;
    }
  })();
  return store.scanPromise;
}

async function pollOne(m: MinerState) {
  try {
    const { id, snapshot } = await readMiner(m.record.ip, m.record.type);
    // DHCP may have handed this IP to another device: don't show its data under this name.
    if (id !== m.record.id) throw new Error(`IP ${m.record.ip} now belongs to ${snapshot.hostname || id}`);
    const now = Date.now();
    m.snapshot = snapshot;
    m.lastOkAt = now;
    m.lastError = undefined;
    m.record.lastSeen = new Date(now).toISOString();
    m.record.hostname = snapshot.hostname || m.record.hostname;
    m.history.push({ t: now, hr: snapshot.hashRate });
    pruneHistory(m, now);
  } catch (e) {
    m.lastError = e instanceof Error ? e.message : String(e);
  }
}

async function pollAll() {
  await Promise.all([...store.miners.values()].map(pollOne));
  if (Date.now() - store.lastSaveAt > SAVE_EVERY_MS) await save().catch(() => {});
}

async function tick() {
  await pollAll();
  const now = Date.now();
  // Rescan if a miner went missing, or if nothing was found yet (e.g. the first scan ran at
  // boot before the network was up).
  const someoneLost =
    store.miners.size === 0 ||
    [...store.miners.values()].some((m) => now - lastSeenMs(m) > AUTO_RESCAN_OFFLINE_MS);
  const lastScan = store.scan.lastScanAt ? Date.parse(store.scan.lastScanAt) : 0;
  if (someoneLost && now - lastScan > AUTO_RESCAN_MIN_INTERVAL_MS) {
    rescan().catch((e) => console.error("[scan] failed", e));
  }
}

/** Drop points older than 24 h. Pruning by time, not by count, matters after sleep/offline gaps. */
function pruneHistory(m: MinerState, now: number) {
  const cutoff = now - HISTORY_WINDOW_MS;
  let i = 0;
  while (i < m.history.length && m.history[i].t < cutoff) i++;
  if (i) m.history.splice(0, i);
}

const lastSeenMs = (m: MinerState) => m.lastOkAt ?? (Date.parse(m.record.lastSeen) || 0);

/** Starts the background poller once per process. Safe to call many times. */
export function ensureStarted() {
  if (store.started) return;
  store.started = true;
  (async () => {
    const hasFile = await load();
    if (hasFile) await pollAll();
    else await rescan();
  })()
    .catch((e) => console.error("[store] startup failed", e))
    .finally(() => {
      store.timer = setInterval(() => tick().catch((e) => console.error("[poll] failed", e)), POLL_INTERVAL_MS);
    });
}

export function getState(): MinersResponse {
  const now = Date.now();
  store.miners.forEach((m) => pruneHistory(m, now)); // a miner that stopped answering ages out too
  const miners = [...store.miners.values()]
    .map((m) => ({
      ...m.record,
      online: m.lastOkAt !== undefined && now - m.lastOkAt <= OFFLINE_AFTER_MS,
      lastError: m.lastError,
      snapshot: m.snapshot,
      history: downsample(m.history),
    }))
    .sort((a, b) => a.hostname.localeCompare(b.hostname)); // stable order, cards do not jump
  return { now, miners, scan: store.scan };
}
