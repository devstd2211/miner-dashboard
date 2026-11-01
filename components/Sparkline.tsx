import type { HistoryPoint } from "@/lib/types";
import { fmtHash } from "@/lib/format";

/** Hashrate history as a tiny SVG area chart, with an optional dashed "expected" line. */
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

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.hr).toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;
  const spanH = (t1 - t0) / 3_600_000;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full">
        <path d={area} fill="rgb(245 158 11 / 0.12)" />
        <path d={line} fill="none" stroke="rgb(245 158 11)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {expected !== undefined && (
          <line x1="0" x2={W} y1={y(expected)} y2={y(expected)} stroke="rgb(161 161 170 / 0.5)"
            strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-500">
        <span>{spanH >= 1 ? `${spanH.toFixed(1)} h` : `${Math.round(spanH * 60)} min`} ago</span>
        <span>min {fmtHash(Math.min(...values))} · max {fmtHash(Math.max(...values))}</span>
        <span>now</span>
      </div>
    </div>
  );
}
