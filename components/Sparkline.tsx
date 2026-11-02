import type { HistoryPoint } from "@/lib/types";
import { fmtHash } from "@/lib/format";
import { splitOnGaps } from "@/lib/history";

const fmtGap = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.round(ms / 60_000)} min`);

/**
 * Hashrate history as a tiny SVG area chart, with an optional dashed "expected" line.
 * Periods without data (dashboard asleep, miner offline) are left empty, not bridged by a line.
 */
export function Sparkline({ points, expected }: { points: HistoryPoint[]; expected?: number }) {
  const W = 300;
  const H = 56;
  if (points.length < 2) {
    return <div className="flex h-14 items-center text-xs text-zinc-600">collecting history…</div>;
  }

  const values = points.map((p) => p.hr);
  let min = Math.min(...values, expected ?? Infinity);
  let max = Math.max(...values, expected ?? -Infinity);
  const pad = (max - min) * 0.1 || max * 0.05 || 1;
  min -= pad;
  max += pad;

  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;

  const runs = splitOnGaps(points);
  const gaps = runs.slice(1).map((run, i) => {
    const prev = runs[i];
    const from = prev[prev.length - 1].t;
    return { x1: x(from), x2: x(run[0].t), ms: run[0].t - from };
  });
  const lines = runs.map((run) => {
    const d = run.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.hr).toFixed(1)}`).join("");
    // A lone point gets a zero-length segment: with round caps it renders as a dot.
    return run.length === 1 ? `${d}h0.01` : d;
  });
  const areas = runs.map(
    (run, i) => `${lines[i]}L${x(run[run.length - 1].t).toFixed(1)},${H}L${x(run[0].t).toFixed(1)},${H}Z`,
  );
  const spanH = (t1 - t0) / 3_600_000;

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full">
          {gaps.map((g, i) => (
            <rect key={i} data-gap x={g.x1} width={g.x2 - g.x1} y="0" height={H} fill="rgb(113 113 122 / 0.12)">
              <title>no data</title>
            </rect>
          ))}
          {areas.map((d, i) => <path key={i} d={d} fill="rgb(245 158 11 / 0.12)" />)}
          {lines.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="rgb(245 158 11)" strokeWidth="1.5" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          ))}
          {expected !== undefined && (
            <line x1="0" x2={W} y1={y(expected)} y2={y(expected)} stroke="rgb(161 161 170 / 0.5)"
              strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Label wide gaps in HTML: text inside the stretched SVG would be distorted. */}
        {gaps
          .filter((g) => g.x2 - g.x1 > W * 0.15)
          .map((g, i) => (
            <span key={i} style={{ left: `${((g.x1 + g.x2) / 2 / W) * 100}%` }}
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-900 px-1 text-[10px] text-zinc-500">
              no data · {fmtGap(g.ms)}
            </span>
          ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-500">
        <span>{spanH >= 1 ? `${spanH.toFixed(1)} h` : `${Math.round(spanH * 60)} min`} ago</span>
        <span>min {fmtHash(Math.min(...values))} · max {fmtHash(Math.max(...values))}</span>
        <span>now</span>
      </div>
    </div>
  );
}
