import type { NonceEvent } from "@/lib/types";
import { fmtDiffShort } from "@/lib/format";

/** The newest nonce with a known difficulty (feeds are newest first). */
export const lastNonce = (events?: NonceEvent[]) => events?.find((e) => e.diff !== undefined);

/**
 * Difficulty of the nonce the miner found last, from the live log feed. Fades in on every new
 * nonce; amber when it beat the pool's share difficulty (it went to the pool as a share).
 */
export function LiveDiff({ events, className = "" }: { events?: NonceEvent[]; className?: string }) {
  const e = lastNonce(events);
  if (!e) return <span className="text-zinc-600">—</span>;
  const share = e.status !== "found";
  return (
    <span
      key={e.nonce}
      className={`nonce-in tabular-nums ${share ? "text-amber-400" : "text-zinc-200"} ${className}`}
      title={`last nonce ${e.nonce.toLowerCase()} · diff ${e.diff} of ${e.poolDiff ?? "?"}${share ? " · sent to the pool" : ""}`}
      data-testid="live-diff"
    >
      {fmtDiffShort(e.diff)}
    </span>
  );
}
