import { fmtDiff, fmtDiffShort } from "@/lib/format";

export interface DiffMark {
  name: string;
  best?: number; // all-time best share
  session?: number; // best share since boot
  last?: number; // newest nonce from the live feed
  color?: string; // the miner's colour (lib/colors.ts)
  leader?: boolean; // #1 on the leaderboard (best share since boot): gets the crown
}

const pct = (v: number) =>
  v >= 1 ? `${v.toFixed(1)}%` : v >= 0.01 ? `${v.toFixed(3)}%` : `${v.toPrecision(2)}%`;

/**
 * Best shares on a log scale up to the network difficulty (right edge, where a share would be
 * a block). Linear progress would be an invisible sliver: a 13.7G share is 0.009% of a 148T
 * network difficulty. The left edge sits a bit below the pool's share difficulty (`share`,
 * marked with a line): nonces under it are found but not sent to the pool.
 * Thin ticks in each miner's colour are its newest nonce; they hop along with the live feed
 * (nonces below the left edge stay at the edge).
 */
export function DiffProgress({ from, to, share, marks }: { from: number; to: number; share?: number; marks: DiffMark[] }) {
  const lo = Math.log10(from);
  const hi = Math.log10(to);
  const pos = (d: number) => Math.min(100, Math.max(0, ((Math.log10(d) - lo) / (hi - lo)) * 100));

  const best = Math.max(0, ...marks.map((m) => m.best ?? 0));
  // Every power of 1000 strictly inside the range gets a tick (K, M, G, T, P).
  const ticks: number[] = [];
  for (let e = Math.ceil(lo / 3) * 3; e < hi; e += 3) if (e > lo) ticks.push(10 ** e);
  const sorted = [...marks].filter((m) => m.best).sort((a, b) => b.best! - a.best!);
  // Many miners: draw only the all-time best, as smaller dots (the per-miner "since boot"
  // values stay in the legend below).
  const dense = marks.length > 6;
  const colorOf = (m: DiffMark) => m.color ?? "var(--color-zinc-100)";
  const leader = marks.find((m) => m.leader && (m.session ?? m.best));
  const crownAt = leader ? (leader.session ?? leader.best)! : undefined;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3" data-testid="diff-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className="text-xs text-zinc-500">
          Best share → block <span className="text-zinc-600">(log scale)</span>
          <span className="ml-2 inline-flex items-center gap-2.5 text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-300" /> best ever
            </span>
            {!dense && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-zinc-300" /> since boot
              </span>
            )}
            {marks.some((m) => m.last) && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-[3px] rounded-sm bg-zinc-300" /> last nonce
              </span>
            )}
            <span>· colour = miner</span>
          </span>
        </div>
        {best > 0 && (
          <div className="text-xs text-zinc-500 tabular-nums">
            <span className="text-sm font-semibold text-zinc-200">{fmtDiff(best)}</span> ·{" "}
            {pct((best / to) * 100)} of network · {Math.round(to / best).toLocaleString()}× to go
          </div>
        )}
      </div>

      <div className={`relative h-2.5 rounded-full bg-zinc-800 ${crownAt ? "mt-6" : "mt-3"}`}>
        {best > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-700 to-emerald-400"
            style={{ width: `${pos(best)}%` }}
          />
        )}
        {share && (
          <div
            className="absolute inset-y-0 left-0 rounded-l-full bg-zinc-950/50"
            style={{ width: `${pos(share)}%` }}
            title="Below the share difficulty: nonces found but not sent to the pool"
          />
        )}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-y-0 w-px bg-zinc-950/70" style={{ left: `${pos(t)}%` }} />
        ))}
        {share && (
          <div
            data-testid="share-line"
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-emerald-300/80"
            style={{ left: `${pos(share)}%` }}
            title={`Share difficulty ${fmtDiff(share)}: a nonce at or above it goes to the pool`}
          />
        )}
        {marks.flatMap((m) => [
          m.last ? (
            <div
              key={`${m.name}-l`}
              title={`${m.name}: last nonce ${fmtDiff(m.last)}`}
              data-testid="live-mark"
              className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm ring-1 ring-zinc-950 transition-[left] duration-500 ease-out"
              style={{ left: `${pos(m.last)}%`, background: m.color ?? "#fbbf24" }}
            />
          ) : null,
          // Dense: only the leader's "since boot" ring, under its crown.
          m.session && (!dense || m.leader) ? (
            <div
              key={`${m.name}-s`}
              title={`${m.name}: best since boot ${fmtDiff(m.session)}`}
              data-testid="session-mark"
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-zinc-900 ring-1 ring-zinc-950"
              style={{ left: `${pos(m.session)}%`, borderColor: colorOf(m) }}
            />
          ) : null,
          m.best ? (
            <div
              key={`${m.name}-b`}
              title={`${m.name}: best ever ${fmtDiff(m.best)}`}
              data-testid="best-mark"
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 ${dense ? "h-3 w-3" : "h-3.5 w-3.5"}`}
              style={{ left: `${pos(m.best)}%`, background: colorOf(m) }}
            />
          ) : null,
        ])}
        {leader && crownAt && (
          <div
            title={`${leader.name}: #1, best since boot ${fmtDiff(leader.session)}`}
            data-testid="crown"
            className="pointer-events-none absolute bottom-full mb-0.5 -translate-x-1/2 text-sm leading-none transition-[left] duration-700 ease-out"
            style={{ left: `${pos(crownAt)}%` }}
          >
            👑
          </div>
        )}
      </div>

      <div className="relative mt-1 h-4 text-[10px] text-zinc-500 tabular-nums">
        <span className="absolute left-0">{fmtDiffShort(from)}</span>
        {share && (
          <span className="absolute -translate-x-1/2 text-emerald-300/80" style={{ left: `${pos(share)}%` }}>
            share {fmtDiffShort(share)}
          </span>
        )}
        {ticks
          .filter((t) => pos(t) > 8 && pos(t) < 92 && !(share && Math.abs(pos(t) - pos(share)) < 6))
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
            <span key={m.name} className="inline-flex items-center gap-1">
              {m.color && <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: m.color }} />}
              {m.leader && <span title="#1 by best share since boot">👑</span>}
              {m.name} <span className="text-zinc-300">{fmtDiff(m.best)}</span>
              {m.session ? <span className="text-zinc-600"> / {fmtDiff(m.session)} boot</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
