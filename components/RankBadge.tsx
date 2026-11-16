/** Place in the leaderboard (best share since boot); #1 gets a trophy. */
export function RankBadge({ rank }: { rank?: number }) {
  if (!rank) return null;
  return (
    <span
      title={`#${rank} by best share since boot`}
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        rank === 1 ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-400"
      }`}
    >
      {rank === 1 ? "🏆 #1" : `#${rank}`}
    </span>
  );
}
