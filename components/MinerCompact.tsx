import type { MinerView, NonceEvent } from "@/lib/types";
import { fmt, fmtDiff, fmtDiffShort, fmtDuration, fmtHash, jPerTh } from "@/lib/format";
import { ASIC_TEMP_MAX, hashratePct, minerIssues, rejectPct, REJECT_PCT_MAX } from "@/lib/health";
import { LiveDiff } from "./LiveDiff";
import { pctColor } from "./MinerCard";
import { MinerSwatch } from "./MinerSwatch";
import { RankBadge } from "./RankBadge";
import { Sparkline } from "./Sparkline";

function Mini({ label, value, cls = "text-zinc-200" }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`truncate tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

/** Small card for pages with many miners: key numbers only, "more" opens the full card. */
export function MinerCompact({ m, now, feed, onExpand, rank, flash, color }: {
  m: MinerView;
  color?: string;
  now: number;
  feed?: NonceEvent[];
  onExpand: () => void;
  rank?: number;
  flash?: boolean;
}) {
  const s = m.snapshot;
  const issues = minerIssues(m);
  const ago = Math.round((now - Date.parse(m.lastSeen)) / 1000);
  const pct = s && hashratePct(s.hashRate, s.expectedHashRate);
  const rej = s ? rejectPct(s.pool.accepted, s.pool.rejected) : 0;
  const border = !m.online ? "border-red-900/60 opacity-60" : issues.length ? "border-amber-600/60" : "border-zinc-800";

  return (
    <div className={`flex flex-col rounded-xl border bg-zinc-900/60 p-3 ${border} ${flash ? "rank-up" : ""}`} data-testid="miner-compact">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${m.online ? "bg-emerald-400" : "bg-red-500"}`} />
            <MinerSwatch color={color} />
            <h2 className="truncate font-semibold">{m.hostname}</h2>
            <RankBadge rank={rank} />
          </div>
          <div className="truncate text-[11px] text-zinc-500">
            <a href={`http://${m.ip}`} target="_blank" rel="noreferrer" className="hover:text-zinc-300">{m.ip}</a>
            {s && ` · ${s.asicCount ?? 1}× ${s.asicModel}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a href={`http://${m.ip}/`} target="_blank" rel="noreferrer" title={`Open the miner's own dashboard (${m.ip})`}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:border-amber-500/60 hover:text-amber-400">
            UI ↗
          </a>
          <button onClick={onExpand} title="Show the full card"
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200">
            more ▾
          </button>
        </div>
      </div>

      {(!m.online || issues.length > 0) && (
        <div className={`mt-1 truncate text-[11px] ${m.online ? "text-amber-400" : "text-red-400"}`} title={m.lastError}>
          {m.online ? `⚠ ${issues.join(" · ")}` : `offline · ${fmtDuration(ago)}${m.lastError ? ` · ${m.lastError}` : ""}`}
        </div>
      )}

      {!s ? (
        <p className="mt-2 text-xs text-zinc-500">No data yet.</p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="text-2xl font-semibold tabular-nums">{fmtHash(s.hashRate)}</div>
            {pct !== undefined && <div className={`text-sm font-semibold tabular-nums ${pctColor(pct)}`}>{pct.toFixed(1)}%</div>}
          </div>
          <div className="mt-1">
            <Sparkline points={m.history} expected={s.expectedHashRate} compact />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
            <Mini label="Power" value={fmt(s.power, 1, " W")} />
            <Mini label="J/TH" value={fmt(jPerTh(s.power, s.hashRate), 2)} />
            <Mini label="ASIC" value={fmt(s.asicTemp, 1, " °C")}
              cls={(s.asicTemp ?? 0) >= ASIC_TEMP_MAX ? "font-semibold text-red-400" : undefined} />
            <Mini
              label="Shares ↑ / ↓"
              value={<><span className="text-emerald-400">{s.pool.accepted.toLocaleString("en-US")}</span> / <span className={s.pool.rejected ? "text-red-400" : ""}>{s.pool.rejected}</span></>}
              cls={rej > REJECT_PCT_MAX ? "font-semibold" : undefined}
            />
            <Mini label="Share diff" value={fmtDiffShort(s.poolDifficulty)} cls="font-semibold text-emerald-400" />
            <Mini label="Best ever" value={fmtDiff(s.bestDiff)} cls="font-semibold text-emerald-400" />
            <Mini label="Last nonce" value={m.online ? <LiveDiff events={feed} className="font-semibold" /> : "—"} />
            <Mini label="Best boot" value={fmtDiff(s.bestSessionDiff)} cls="text-emerald-400" />
            <Mini label="Uptime" value={fmtDuration(s.uptimeSeconds)} cls="text-zinc-400" />
          </div>
        </>
      )}
    </div>
  );
}
