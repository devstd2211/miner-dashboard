// Log of best shares: every time a miner beats its best share since boot, the dashboard notes
// it in data/best-shares.json, so records survive miner reboots (the miner itself only keeps
// the all-time best). The first minutes after a reboot are skipped: there the best share
// climbs every few seconds and would flood the log.
//
// The last best shares seen of every miner are kept in data/best-last.json, so a record found
// while the dashboard was stopped (PC off, restart) is still logged when it comes back, marked
// `whileOff`. If the miner rebooted meanwhile, its best since boot started over: then only a
// new all-time best can be told apart.

import { dataFile, readJsonFile, writeJsonFile } from "./json-file";
import type { BestRecord, MinerSnapshot } from "./types";

const FILE = dataFile("best-shares.json");
const LAST_FILE = dataFile("best-last.json");
const KEEP = 500;
const SKIP_UPTIME_S = 600;

interface Last {
  t: number; // ms, when it was seen
  session?: number;
  best?: number;
  uptime?: number; // s
}

const g = globalThis as unknown as {
  __records?: { list: BestRecord[]; last: Record<string, Last>; loaded: boolean; lastSavedAt: number };
};
const state = (g.__records ??= { list: [], last: {}, loaded: false, lastSavedAt: 0 });

export async function loadRecords() {
  if (state.loaded) return;
  state.loaded = true;
  const list = await readJsonFile<BestRecord[]>(FILE);
  if (Array.isArray(list)) state.list = list;
  const last = await readJsonFile<Record<string, Last>>(LAST_FILE);
  if (last && typeof last === "object") state.last = last;
}

function add(rec: BestRecord) {
  state.list.unshift(rec);
  state.list.length = Math.min(state.list.length, KEEP);
  writeJsonFile(FILE, () => state.list).catch((e) => console.error("[records] save failed", e));
}

/** What the dashboard knew before this reading: the previous poll, or best-last.json after a restart. */
function before(prev: MinerSnapshot | undefined, saved: Last | undefined): (Last & { gap: boolean }) | undefined {
  if (prev) return { t: Date.now(), session: prev.bestSessionDiff, best: prev.bestDiff, uptime: prev.uptimeSeconds, gap: false };
  return saved && { ...saved, gap: true };
}

/** Compare two readings of one miner; returns the new record, if any. */
export function noteBest(id: string, hostname: string, prev: MinerSnapshot | undefined, next: MinerSnapshot): BestRecord | undefined {
  const now = Date.now();
  const was = before(prev, state.last[id]);
  const last: Last = { t: now, session: next.bestSessionDiff, best: next.bestDiff, uptime: next.uptimeSeconds };
  const changed = state.last[id]?.session !== last.session || state.last[id]?.best !== last.best;
  state.last[id] = last;
  // Bests only change now and then: save on change, plus once a minute for the uptime.
  if (changed || now - state.lastSavedAt > 60_000) {
    state.lastSavedAt = now;
    writeJsonFile(LAST_FILE, () => state.last).catch((e) => console.error("[records] save failed", e));
  }
  if (!was) return undefined; // never seen this miner before

  let rec: BestRecord | undefined;
  if (was.gap) {
    // Same boot if the uptime grew by about the time that passed (with a minute of slack).
    const sameBoot = was.uptime !== undefined && next.uptimeSeconds !== undefined &&
      next.uptimeSeconds >= was.uptime + (now - was.t) / 1000 - 60;
    if (sameBoot && next.bestSessionDiff && was.session && next.bestSessionDiff > was.session) {
      rec = { t: now, id, hostname, diff: next.bestSessionDiff, allTime: next.bestSessionDiff > (was.best ?? 0), whileOff: true };
    } else if (next.bestDiff && was.best && next.bestDiff > was.best) {
      rec = { t: now, id, hostname, diff: next.bestDiff, allTime: true, whileOff: true };
    }
  } else {
    const s = next.bestSessionDiff;
    if (s && was.session && s > was.session && (next.uptimeSeconds ?? Infinity) >= SKIP_UPTIME_S) {
      rec = { t: now, id, hostname, diff: s, allTime: s > (was.best ?? 0) };
    }
  }
  if (rec) add(rec);
  return rec;
}

export const getRecords = (limit = 50): BestRecord[] => state.list.slice(0, limit);
