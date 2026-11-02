import type { NonceEvent } from "@/lib/types";

const PER_CHIP = 4;

const MARK: Record<NonceEvent["status"], { sym: string; cls: string; title: string }> = {
  found: { sym: "", cls: "", title: "below the pool difficulty, not sent" },
  submitted: { sym: "→", cls: "text-amber-400", title: "sent to the pool, waiting for the answer" },
  accepted: { sym: "↑", cls: "text-emerald-400", title: "share accepted by the pool" },
  rejected: { sym: "↓", cls: "text-red-400", title: "share rejected by the pool" },
};

/** Short difficulty: 3 significant digits, "19.2K", "478K", "336". */
function shortDiff(d: number) {
  const units = ["", "K", "M", "G", "T"];
  let i = 0;
  while (d >= 1000 && i < units.length - 1) {
    d /= 1000;
    i++;
  }
  return `${d >= 100 ? Math.round(d) : d.toPrecision(3)}${units[i]}`;
}

// Fixed cell width (no truncation): nonce + 5-char diff + arrow.
const CELL = "inline-block w-[15.5ch] shrink-0 whitespace-nowrap";

function Cell({ e, i }: { e?: NonceEvent; i: number }) {
  if (!e) return <span className={`${CELL} text-zinc-800`}>········</span>;
  const mark = MARK[e.status];
  const share = e.status !== "found";
  return (
    <span
      className={`${CELL} ${i === 0 ? "nonce-in" : ""}`}
      style={{ opacity: 1 - (i / PER_CHIP) * 0.6 }}
      title={`nonce ${e.nonce} · diff ${e.diff ?? "?"} of ${e.poolDiff ?? "?"} · ${mark.title}${e.reason ? `: ${e.reason}` : ""}`}
    >
      <span className={share ? "text-zinc-100" : "text-zinc-500"}>{e.nonce.toLowerCase()}</span>
      {e.diff !== undefined && (
        <span className={`${share ? "text-zinc-300" : "text-zinc-500"}`}> {shortDiff(e.diff)}</span>
      )}
      {mark.sym && <span className={`ml-0.5 text-sm font-bold ${mark.cls}`}>{mark.sym}</span>}
    </span>
  );
}

/**
 * Latest nonces the ASICs found, from the miner's log. One row per chip (numbered like the Chips
 * table) with its last 4 nonces, newest left: 8 chips = 8×4, 4 chips = 4×4, Bitaxe = 1×4.
 * Nothing is truncated: if 4 cells do not fit the card width, a chip's row becomes 2×2 (cells
 * go in pairs, so it never breaks 3+1). Fixed cell widths keep the columns aligned.
 * ↑ accepted share, ↓ rejected, → waiting for the pool; no mark: below pool difficulty, not sent.
 */
export function NonceFeed({ events, chips = 1 }: { events?: NonceEvent[]; chips?: number }) {
  const all = events ?? [];
  return (
    <div className="font-mono text-xs leading-5">
      {Array.from({ length: Math.max(1, chips) }, (_, chip) => {
        // Single-chip Bitaxe: take everything (asic is always 0 there, but be lenient).
        const mine = (chips <= 1 ? all : all.filter((e) => e.asic === chip)).slice(0, PER_CHIP);
        const cell = (i: number) => <Cell key={mine[i]?.nonce ?? `${chip}-${i}`} e={mine[i]} i={i} />;
        return (
          <div key={chip} className="flex gap-x-3">
            <span className="w-[2ch] shrink-0 text-right text-zinc-600">{chip + 1}</span>
            <div className="flex flex-wrap gap-x-3">
              <div className="flex gap-x-3">{cell(0)}{cell(1)}</div>
              <div className="flex gap-x-3">{cell(2)}{cell(3)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
