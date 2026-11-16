import { Fragment } from "react";
import type { MinerView, NonceEvent } from "@/lib/types";
import { fmt, fmtDiff, fmtDiffShort, fmtDuration, fmtHash, jPerTh } from "@/lib/format";
import { ASIC_TEMP_MAX, hashratePct, minerIssues, rejectPct, REJECT_PCT_MAX, VR_TEMP_MAX } from "@/lib/health";
import { MinerCard, pctColor } from "./MinerCard";
import { RankBadge } from "./RankBadge";

const TH = "px-2 py-1.5 font-normal whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap tabular-nums";
const hot = (v: number | undefined, max: number) => ((v ?? 0) >= max ? "font-semibold text-red-400" : "");

/** One row per miner; clicking the name opens the full card under the row. */
export function MinerTable({ miners, now, feeds, expanded, toggle, ranks }: {
  miners: MinerView[];
  ranks: Record<string, number>;
  now: number;
  feeds: Record<string, NonceEvent[]>;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const cols = 13;
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
      <table className="w-full text-sm" data-testid="miner-table">
        <thead className="text-xs text-zinc-500">
          <tr className="text-right">
            <th className={`${TH} text-left`}>Miner</th>
            <th className={TH}>Hashrate</th>
            <th className={TH}>% exp.</th>
            <th className={TH}>1 h</th>
            <th className={TH}>Power</th>
            <th className={TH}>J/TH</th>
            <th className={TH}>ASIC</th>
            <th className={TH}>VRM</th>
            <th className={TH}>Shares ↑ / ↓</th>
            <th className={TH}>Share diff</th>
            <th className={TH}>Best boot</th>
            <th className={TH}>Best ever</th>
            <th className={TH}>Uptime</th>
          </tr>
        </thead>
        <tbody>
          {miners.map((m) => {
            const s = m.snapshot;
            const issues = minerIssues(m);
            const pct = s && hashratePct(s.hashRate, s.expectedHashRate);
            const open = expanded.has(m.id);
            const ago = Math.round((now - Date.parse(m.lastSeen)) / 1000);
            return (
              <Fragment key={m.id}>
                <tr className={`border-t border-zinc-800/60 text-right hover:bg-zinc-800/30 ${!m.online ? "opacity-60" : ""}`}>
                  <td className={`${TD} text-left`}>
                    <button onClick={() => toggle(m.id)} className="flex items-center gap-2 text-left" title="Show the full card">
                      <span className="w-3 text-zinc-600">{open ? "▾" : "▸"}</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${m.online ? "bg-emerald-400" : "bg-red-500"}`} />
                      <span className="font-medium">{m.hostname}</span>
                      <RankBadge rank={ranks[m.id]} />
                    </button>
                    <div className="pl-[2.6rem] text-[11px] text-zinc-500">
                      <a href={`http://${m.ip}/`} target="_blank" rel="noreferrer" className="hover:text-amber-400">{m.ip} ↗</a>
                      {s && ` · ${s.asicCount ?? 1}× ${s.asicModel}`}
                      {!m.online && <span className="text-red-400"> · offline {fmtDuration(ago)}</span>}
                      {m.online && issues.length > 0 && <span className="text-amber-400"> · ⚠ {issues.join(", ")}</span>}
                    </div>
                  </td>
                  {s ? (
                    <>
                      <td className={`${TD} font-semibold`}>{fmtHash(s.hashRate)}</td>
                      <td className={`${TD} ${pct !== undefined ? pctColor(pct) : ""}`}>{pct !== undefined ? `${pct.toFixed(1)}%` : "—"}</td>
                      <td className={`${TD} text-zinc-400`}>{fmtHash(s.hashRate1h)}</td>
                      <td className={TD}>{fmt(s.power, 1, " W")}</td>
                      <td className={TD}>{fmt(jPerTh(s.power, s.hashRate), 2)}</td>
                      <td className={`${TD} ${hot(s.asicTemp, ASIC_TEMP_MAX)}`}>{fmt(s.asicTemp, 1, "°")}</td>
                      <td className={`${TD} ${hot(s.vrTemp, VR_TEMP_MAX)}`}>{fmt(s.vrTemp, 1, "°")}</td>
                      <td className={TD}>
                        <span className="text-emerald-400">{s.pool.accepted.toLocaleString("en-US")}</span>
                        {" / "}
                        <span className={s.pool.rejected ? `text-red-400 ${rejectPct(s.pool.accepted, s.pool.rejected) > REJECT_PCT_MAX ? "font-semibold" : ""}` : ""}>
                          {s.pool.rejected.toLocaleString("en-US")}
                        </span>
                      </td>
                      <td className={`${TD} font-semibold text-emerald-400`}>{fmtDiffShort(s.poolDifficulty)}</td>
                      <td className={`${TD} text-emerald-400`}>{fmtDiff(s.bestSessionDiff)}</td>
                      <td className={`${TD} font-semibold text-emerald-400`}>{fmtDiff(s.bestDiff)}</td>
                      <td className={`${TD} text-zinc-400`}>{fmtDuration(s.uptimeSeconds)}</td>
                    </>
                  ) : (
                    <td className={`${TD} text-left text-zinc-500`} colSpan={cols - 1}>No data yet. {m.lastError}</td>
                  )}
                </tr>
                {open && (
                  <tr>
                    <td colSpan={cols} className="p-2">
                      <div className="max-w-[720px]">
                        <MinerCard m={m} now={now} feed={feeds[m.id]} rank={ranks[m.id]} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
