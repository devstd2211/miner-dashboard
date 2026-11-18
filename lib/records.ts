// Log of best shares: every time a miner beats its best share since boot, the dashboard notes
// it in data/best-shares.json, so records survive miner reboots (the miner itself only keeps
// the all-time best). The first minutes after a reboot are skipped: there the best share
// climbs every few seconds and would flood the log.

import fs from "node:fs/promises";
import path from "node:path";
import type { BestRecord, MinerSnapshot } from "./types";

const FILE = path.join(process.cwd(), "data", "best-shares.json");
const KEEP = 500;
const SKIP_UPTIME_S = 600;

const g = globalThis as unknown as { __records?: { list: BestRecord[]; loaded: boolean } };
const state = (g.__records ??= { list: [], loaded: false });

export async function loadRecords() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const list = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (Array.isArray(list)) state.list = list;
  } catch {} // no file yet
}

async function save() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE + ".tmp", JSON.stringify(state.list));
  await fs.rename(FILE + ".tmp", FILE);
}

/** Compare two readings of one miner; returns the new record, if any. */
export function noteBest(id: string, hostname: string, prev: MinerSnapshot | undefined, next: MinerSnapshot): BestRecord | undefined {
  const before = prev?.bestSessionDiff;
  const now = next.bestSessionDiff;
  if (!before || !now || now <= before) return undefined; // first reading, no change, or a reboot
  if ((next.uptimeSeconds ?? Infinity) < SKIP_UPTIME_S) return undefined;
  const rec: BestRecord = { t: Date.now(), id, hostname, diff: now, allTime: now > (prev.bestDiff ?? 0) };
  state.list.unshift(rec);
  state.list.length = Math.min(state.list.length, KEEP);
  save().catch((e) => console.error("[records] save failed", e));
  return rec;
}

export const getRecords = (limit = 50): BestRecord[] => state.list.slice(0, limit);
