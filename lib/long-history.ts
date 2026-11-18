// Long history (30 days) of hashrate and ASIC temperature: 15-minute averages per miner,
// persisted to data/history-long.json so it survives dashboard restarts. The 24 h chart keeps
// using the finer in-memory history (lib/store.ts).

import { downsample } from "./history";
import { dataFile, readJsonFile, writeJsonFile } from "./json-file";
import type { HistoryPoint } from "./types";

const FILE = dataFile("history-long.json");
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
  const data = await readJsonFile<Record<string, HistoryPoint[]>>(FILE);
  if (data && typeof data === "object") state.points = data;
}

// The running slot is saved too (as a finished point), so stopping the dashboard loses nothing.
const save = () =>
  writeJsonFile(FILE, () =>
    Object.fromEntries(
      Object.keys({ ...state.points, ...state.acc }).map((id) => {
        const a = state.acc[id];
        return [id, [...(state.points[id] ?? []), ...(a?.n ? [toPoint(a)] : [])]];
      }),
    ),
  );

/** Called every minute by the store. */
export const saveLongHistory = () => save().catch((e) => console.error("[long-history] save failed", e));

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
