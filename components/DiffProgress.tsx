import { fmtDiff, fmtDiffShort } from "@/lib/format";

export interface DiffMark {
  name: string;
  best?: number; // all-time best share
  session?: number; // best share since boot
}

const pct = (v: number) =>
  v >= 1 ? `${v.toFixed(1)}%` : v >= 0.01 ? `${v.toFixed(3)}%` : `${v.toPrecision(2)}%`;

/**
 * Best shares on a log scale from the pool's share difficulty (left edge) to the network
 * difficulty (right edge, where a share would be a block). Linear progress would be an
 * invisible sliver: a 13.7G share is 0.009% of a 148T network difficulty.
 */
export function DiffProgress({ from, to, marks }: { from: number; to: number; marks: DiffMark[] }) {
  const lo = Math.log10(from);
  const hi = Math.log10(to);
  const pos = (d: number) => Math.min(100, Math.max(0, ((Math.log10(d) - lo) / (hi - lo)) * 100));

  const best = Math.max(0, ...marks.map((m) => m.best ?? 0));
  // Every power of 1000 strictly inside the range gets a tick (K, M, G, T, P).
  const ticks: number[] = [];
  for (let e = Math.ceil(lo / 3) * 3; e < hi; e += 3) if (e > lo) ticks.push(10 ** e);
  const sorted = [...marks].filter((m) => m.best).sort((a, b) => b.best! - a.best!);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3" data-testid="diff-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className="text-xs text-zinc-500">Best share → block <span className="text-zinc-600">(log scale)</span></div>
        {best > 0 && (
          <div className="text-xs text-zinc-500 tabular-nums">
            <span className="text-sm font-semibold text-zinc-200">{fmtDiff(best)}</span> ·{" "}
            {pct((best / to) * 100)} of network · {Math.round(to / best).toLocaleString()}× to go
          </div>
        )}
      </div>

      <div className="relative mt-3 h-2.5 rounded-full bg-zinc-800">
        {best > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-700 to-emerald-400"
            style={{ width: `${pos(best)}%` }}
          />
        )}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-y-0 w-px bg-zinc-950/70" style={{ left: `${pos(t)}%` }} />
        ))}
        {marks.flatMap((m) => [
          m.session ? (
            <div
              key={`${m.name}-s`}
              title={`${m.name}: best since boot ${fmtDiff(m.session)}`}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200 bg-zinc-900"
              style={{ left: `${pos(m.session)}%` }}
            />
          ) : null,
          m.best ? (
            <div
              key={`${m.name}-b`}
              title={`${m.name}: best ever ${fmtDiff(m.best)}`}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-900 bg-zinc-100"
              style={{ left: `${pos(m.best)}%` }}
            />
          ) : null,
        ])}
      </div>

      <div className="relative mt-1 h-4 text-[10px] text-zinc-500 tabular-nums">
        <span className="absolute left-0">{fmtDiffShort(from)}</span>
        {ticks
          .filter((t) => pos(t) > 8 && pos(t) < 92)
          .map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>
              {fmtDiffShort(t)}
            </span>
          ))}
        <span className="absolute right-0 text-amber-400"><span className="hidden sm:inline">block </span>{fmtDiff(to)}</span>
      </div>

      {sorted.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500 tabular-nums">
          {sorted.map((m) => (
            <span key={m.name}>
              {m.name} <span className="text-zinc-300">{fmtDiff(m.best)}</span>
              {m.session ? <span className="text-zinc-600"> / {fmtDiff(m.session)} boot</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
