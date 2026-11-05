import type { ChipStat, MinerView, NonceEvent } from "@/lib/types";
import { fmt, fmtDiff, fmtDiffShort, fmtDuration, fmtHash, fmtHashes, jPerTh } from "@/lib/format";
import { poolStatsUrl } from "@/lib/pools";
import { NonceFeed } from "./NonceFeed";
import { Sparkline } from "./Sparkline";

function Stat({ label, value, warn, good, title }: {
  label: string;
  value: React.ReactNode;
  warn?: boolean;
  good?: boolean; // highlight a key figure in green
  title?: string;
}) {
  const cls = warn ? "font-semibold text-red-400" : good ? "font-semibold text-emerald-400" : "text-zinc-200";
  return (
    <div className="flex justify-between gap-2 py-0.5" title={title}>
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{title}</div>
      {children}
    </div>
  );
}

/** Pool host; links to the pool's stats page for this wallet when the pool is known. */
function PoolHost({ host, port, user }: { host?: string; port?: number; user?: string }) {
  const text = `${host ?? "—"}${port ? `:${port}` : ""}`;
  const url = poolStatsUrl(host, user);
  if (!url) return <span className="break-all">{text}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Pool stats for this wallet"
      className="break-all underline decoration-zinc-500 decoration-dotted underline-offset-4 hover:text-amber-400 hover:decoration-amber-400">
      {text}
    </a>
  );
}

const pctColor = (p: number) => (p >= 95 ? "text-emerald-400" : p >= 85 ? "text-amber-400" : "text-red-400");

function errColor(errPct: number) {
  if (errPct === 0) return "text-emerald-400";
  if (errPct <= 0.5) return "text-amber-400";
  return "text-red-400";
}

function ChipTable({ chips }: { chips: ChipStat[] }) {
  return (
    <Section title="Chips">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-zinc-500">
          <tr>
            <th className="text-left font-normal">#</th>
            <th className="text-right font-normal">Hashrate</th>
            <th className="text-right font-normal">Error</th>
          </tr>
        </thead>
        <tbody>
          {chips.map((c, i) => {
            const err = c.hashRate > 0 ? (c.errorHashRate / c.hashRate) * 100 : 0;
            return (
              <tr key={i} className="border-t border-zinc-800/60">
                <td className="py-0.5 text-zinc-500">{i + 1}</td>
                <td className="text-right">{fmtHash(c.hashRate)}</td>
                <td className={`text-right ${errColor(err)}`}>{err.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

export function MinerCard({ m, now, feed }: { m: MinerView; now: number; feed?: NonceEvent[] }) {
  const s = m.snapshot;
  const ago = Math.round((now - Date.parse(m.lastSeen)) / 1000);

  const header = (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.online ? "bg-emerald-400" : "bg-red-500"}`} />
            <h2 className="truncate text-lg font-semibold">{m.hostname}</h2>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            <a href={`http://${m.ip}`} target="_blank" rel="noreferrer" className="hover:text-zinc-300">{m.ip}</a>
            {s && ` · ${s.deviceModel ?? ""} ${s.asicCount ?? 1}× ${s.asicModel}`}
            {s?.version && ` · ${s.version}`}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <a
            href={`http://${m.ip}/`}
            target="_blank"
            rel="noreferrer"
            title={`Open the miner's own dashboard (${m.ip})`}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-amber-500/60 hover:text-amber-400"
          >
            {m.type === "nerdqaxe" ? "NerdQAxe UI" : "AxeOS UI"} ↗
          </a>
          {!m.online && (
            <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
              offline · {fmtDuration(ago)}
            </span>
          )}
        </div>
      </div>
      {m.online && (
        <div className="mt-1.5">
          <NonceFeed events={feed} chips={s?.asicCount ?? 1} />
        </div>
      )}
    </div>
  );

  if (!s) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-zinc-900/60 p-4">
        {header}
        <p className="mt-3 text-sm text-zinc-500">No data yet. {m.lastError}</p>
      </div>
    );
  }

  const pctNow = s.expectedHashRate ? (s.hashRate / s.expectedHashRate) * 100 : undefined;
  const pct1h = s.expectedHashRate && s.hashRate1h ? (s.hashRate1h / s.expectedHashRate) * 100 : undefined;
  const highCurrent = s.currentA !== undefined && s.currentAMax ? s.currentA > s.currentAMax * 0.9 : false;
  const total = s.pool.accepted + s.pool.rejected;
  const rejPct = total ? (s.pool.rejected / total) * 100 : 0;
  // NerdQAxe has no hash counter: estimate from the average hashrate since boot.
  // (stock AxeOS has no 1-day average, only 1 h)
  const avgHr = ((s.uptimeSeconds ?? 0) >= 86400 ? s.hashRate1d : undefined) ?? s.hashRate1h ?? s.hashRate;
  const hashesSinceBoot = s.uptimeSeconds && avgHr ? avgHr * 1e9 * s.uptimeSeconds : undefined;

  return (
    <div className={`rounded-xl border bg-zinc-900/60 p-4 ${m.online ? "border-zinc-800" : "border-red-900/60 opacity-70"}`}>
      {header}
      {!m.online && m.lastError && <p className="mt-1 text-xs text-red-400/80">{m.lastError}</p>}

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{fmtHash(s.hashRate)}</div>
          <div className="text-xs text-zinc-500">
            1h {fmtHash(s.hashRate1h)} · expected {fmtHash(s.expectedHashRate)}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-zinc-400" title="shares since boot: accepted / rejected">
            shares <span className="text-emerald-400">↑ {s.pool.accepted.toLocaleString("en-US")}</span>
            {" · "}
            <span className={s.pool.rejected > 0 ? "text-red-400" : "text-zinc-400"}>↓ {s.pool.rejected.toLocaleString("en-US")}</span>
          </div>
        </div>
        <div className="text-right tabular-nums">
          {pctNow !== undefined && <div className={`text-xl font-semibold ${pctColor(pctNow)}`}>{pctNow.toFixed(1)}%</div>}
          {pct1h !== undefined && <div className={`text-xs ${pctColor(pct1h)}`}>1h {pct1h.toFixed(1)}%</div>}
        </div>
      </div>

      <div className="mt-3">
        <Sparkline points={m.history} expected={s.expectedHashRate} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Section title="Power">
          <Stat label="Power" value={fmt(s.power, 1, " W")} />
          <Stat label="Input" value={fmt(s.voltage, 2, " V")} />
          <Stat
            label={s.currentIsCore ? "Core current" : "Current"}
            value={`${fmt(s.currentA, 2, " A")}${s.currentAMax ? ` / ${s.currentAMax} A` : ""}`}
            warn={highCurrent}
          />
          <Stat label="Efficiency" value={fmt(jPerTh(s.power, s.hashRate), 2, " J/TH")} />
        </Section>

        <Section title="Thermal">
          <Stat label="ASIC" value={fmt(s.asicTemp, 1, " °C")} warn={(s.asicTemp ?? 0) >= 70} />
          <Stat label="VRM" value={fmt(s.vrTemp, 1, " °C")} warn={(s.vrTemp ?? 0) >= 80} />
          {s.fans.map((f, i) => (
            <Stat key={i} label={`Fan ${s.fans.length > 1 ? i + 1 : ""}`} value={`${fmt(f.speed, 0, "%")} · ${fmt(f.rpm, 0, " rpm")}`} />
          ))}
        </Section>

        <Section title="Tuning">
          <Stat label="Frequency" value={fmt(s.frequency, 0, " MHz")} />
          <Stat
            label="Core (set / actual)"
            value={`${fmt(s.coreVoltage, 0)} / ${fmt(s.coreVoltageActual, 0, " mV")}`}
          />
        </Section>

        <Section title="Pool">
          <Stat label="Host" value={<PoolHost host={s.pool.host} port={s.pool.port} user={s.pool.user} />} />
          <Stat
            label="Status"
            value={
              <>
                {s.pool.connected === undefined ? "—" : s.pool.connected ? "connected" : "disconnected"}
                {s.pool.usingFallback && <span className="ml-1 text-amber-400">(fallback)</span>}
              </>
            }
            warn={s.pool.connected === false}
          />
          <Stat
            label="Shares"
            value={
              <>
                {s.pool.accepted} / {s.pool.rejected}{" "}
                <span className={s.pool.rejected > 0 ? `text-red-400 ${rejPct > 1 ? "font-semibold" : ""}` : undefined}>
                  ({rejPct.toFixed(2)}%)
                </span>
              </>
            }
          />
          <Stat label="Ping" value={fmt(s.pool.pingMs, 0, " ms")} />
        </Section>

        <Section title="Stats">
          <Stat
            label="Share difficulty (pool)"
            value={fmtDiffShort(s.poolDifficulty)}
            good={s.poolDifficulty !== undefined}
            title="Share target the pool assigned to this miner (vardiff)"
          />
          <Stat label="Best diff (session)" value={fmtDiff(s.bestSessionDiff)} good={s.bestSessionDiff !== undefined} />
          <Stat label="Best diff (all-time)" value={fmtDiff(s.bestDiff)} good={s.bestDiff !== undefined} />
          <Stat label="Uptime" value={fmtDuration(s.uptimeSeconds)} />
          <Stat label="Hashes (since boot)" value={hashesSinceBoot ? `≈ ${fmtHashes(hashesSinceBoot)}` : "—"} />
          {s.totalHashes !== undefined && <Stat label="Hashes (lifetime)" value={fmtHashes(s.totalHashes)} />}
        </Section>

        {s.chips && s.chips.length > 0 && <ChipTable chips={s.chips} />}
      </div>
    </div>
  );
}
