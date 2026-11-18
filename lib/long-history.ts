// Long history (30 days) of hashrate and ASIC temperature: 15-minute averages per miner,
// persisted to data/history-long.json so it survives dashboard restarts. The 24 h chart keeps
// using the finer in-memory history (lib/store.ts).

import fs from "node:fs/promises";
import path from "node:path";
import { downsample } from "./history";
import type { HistoryPoint } from "./types";

const FILE = path.join(process.cwd(), "data", "history-long.json");
const BUCKET_MS = 15 * 60_000;
export const LONG_KEEP_MS = 30 * 86_400_000;

interface Acc {
  slot: number;
  hr: number;
  n: number;
  temp: number;
  nt: number;
}

const g = globalThis as unknown as {
  __longHistory?: { points: Record<string, HistoryPoint[]>; acc: Record<string, Acc>; loaded: boolean };
};
const state = (g.__longHistory ??= { points: {}, acc: {}, loaded: false });

export async function loadLongHistory() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const data = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (data && typeof data === "object") state.points = data;
  } catch {} // no file yet
}

async function save() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE + ".tmp", JSON.stringify(state.points));
  await fs.rename(FILE + ".tmp", FILE);
}

const toPoint = (a: Acc): HistoryPoint => ({
  t: a.slot * BUCKET_MS + BUCKET_MS / 2,
  hr: a.hr / a.n,
  ...(a.nt ? { temp: a.temp / a.nt } : {}),
});

/** One successful poll. Closes the previous 15-minute slot when a new one starts. */
export function noteLong(id: string, t: number, hr: number, temp?: number) {
  const slot = Math.floor(t / BUCKET_MS);
  const a = state.acc[id];
  if (a && a.slot !== slot) {
    const list = (state.points[id] ??= []);
    list.push(toPoint(a));
    const cutoff = t - LONG_KEEP_MS;
    while (list.length && list[0].t < cutoff) list.shift();
    save().catch((e) => console.error("[long-history] save failed", e));
  }
  if (!a || a.slot !== slot) state.acc[id] = { slot, hr: 0, n: 0, temp: 0, nt: 0 };
  const cur = state.acc[id];
  cur.hr += hr;
  cur.n++;
  if (temp !== undefined) {
    cur.temp += temp;
    cur.nt++;
  }
}

/** The last `rangeMs` of one miner, the running slot included, at most ~300 points. */
export function getLongHistory(id: string, rangeMs: number): HistoryPoint[] {
  const from = Date.now() - Math.min(rangeMs, LONG_KEEP_MS);
  const a = state.acc[id];
  const points = [...(state.points[id] ?? []), ...(a?.n ? [toPoint(a)] : [])].filter((p) => p.t >= from);
  return downsample(points, 300);
}
