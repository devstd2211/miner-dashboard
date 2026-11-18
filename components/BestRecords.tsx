import type { BestRecord } from "@/lib/types";
import { fmtDiff } from "@/lib/format";

const SHOW = 12;

function ago(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** Log of new best shares since boot (lib/records.ts), newest first; survives miner reboots. */
export function BestRecords({ records, now, colors }: { records: BestRecord[]; now: number; colors: Record<string, string> }) {
  return (
    <details className="group mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3" data-testid="best-records">
      <summary className="cursor-pointer list-none text-xs text-zinc-500 select-none">
        Best share log <span className="text-zinc-600">({records.length})</span>{" "}
        <span className="group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span>
        {records[0] && (
          <span className="ml-2 text-zinc-400">
            last: {records[0].hostname} <span className="text-emerald-400">{fmtDiff(records[0].diff)}</span> · {ago(now - records[0].t)}
          </span>
        )}
      </summary>
      {records.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">No records yet: a miner has to beat its best share since boot.</p>
      ) : (
        <table className="mt-2 w-full max-w-3xl text-sm tabular-nums">
          <tbody>
            {records.slice(0, SHOW).map((r) => (
              <tr key={`${r.id}-${r.t}`} className="border-t border-zinc-800/60">
                <td className="py-1 text-zinc-500" title={new Date(r.t).toLocaleString()}>{ago(now - r.t)}</td>
                <td className="py-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: colors[r.id] ?? "#71717a" }} />
                    {r.hostname}
                  </span>
                </td>
                <td className="py-1 text-right font-semibold text-emerald-400">{fmtDiff(r.diff)}</td>
                <td className="py-1 pl-3 text-right text-xs">
                  {r.allTime ? <span className="text-amber-400">🏆 all-time</span> : <span className="text-zinc-500">since boot</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
