// Hashrate history helpers shared by the server (downsampling) and the chart (gap detection).
// Pure functions, no imports besides types, so they can be tested with plain `node`.

import type { HistoryPoint } from "./types";

export const HISTORY_WINDOW_MS = 24 * 3600 * 1000;
export const MAX_POINTS = 288; // points sent to the chart: 24 h -> 5-minute slots
const MIN_BUCKET_MS = 10_000; // = poll interval

/**
 * Average the history into fixed time slots, about MAX_POINTS of them over the span (5 minutes
 * for a full day; the first ~48 min are raw 10 s polls), so a fresh chart is not just a few
 * straight segments. Slots without samples are simply absent, so a period when nobody was polling
 * (PC asleep, miner offline) stays a gap instead of being blended into its neighbours.
 */
export function downsample(history: HistoryPoint[], maxPoints = MAX_POINTS): HistoryPoint[] {
  if (history.length <= maxPoints) return history;
  const span = history[history.length - 1].t - history[0].t;
  const bucketMs = Math.max(MIN_BUCKET_MS, Math.ceil(span / maxPoints));
  const out: HistoryPoint[] = [];
  let slot = Math.floor(history[0].t / bucketMs);
  let sum = 0;
  let n = 0;
  let lastT = 0;
  for (const p of history) {
    const s = Math.floor(p.t / bucketMs);
    if (s !== slot && n) {
      out.push({ t: lastT, hr: sum / n });
      sum = 0;
      n = 0;
    }
    slot = s;
    sum += p.hr;
    n++;
    lastT = p.t;
  }
  if (n) out.push({ t: lastT, hr: sum / n });
  return out;
}

/**
 * Split points into continuous runs. A jump in time much larger than the usual step (median)
 * starts a new run, so the chart does not draw a line across a period with no data.
 */
export function splitOnGaps(points: HistoryPoint[], minGapMs = 60_000): HistoryPoint[][] {
  if (points.length === 0) return [];
  const steps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
  const median = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  const gap = Math.max(minGapMs, median * 2.5);
  const runs: HistoryPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > gap) runs.push([]);
    runs[runs.length - 1].push(points[i]);
  }
  return runs;
}
