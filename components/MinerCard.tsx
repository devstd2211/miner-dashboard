import type { ChipStat, MinerView } from "@/lib/types";
import { fmt, fmtDiff, fmtDuration, fmtHash, jPerTh } from "@/lib/format";
import { Sparkline } from "./Sparkline";

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${warn ? "font-semibold text-red-400" : "text-zinc-200"}`}>{value}</span>
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

export function MinerCard({ m, now }: { m: MinerView; now: number }) {
  const s = m.snapshot;
  const ago = Math.round((now - Date.parse(m.lastSeen)) / 1000);

  const header = (
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
          <Stat label="Host" value={<span className="break-all">{s.pool.host ?? "—"}{s.pool.port ? `:${s.pool.port}` : ""}</span>} />
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
          <Stat label="Shares" value={`${s.pool.accepted} / ${s.pool.rejected} (${rejPct.toFixed(2)}%)`} warn={rejPct > 1} />
          <Stat label="Ping" value={fmt(s.pool.pingMs, 0, " ms")} />
        </Section>

        <Section title="Stats">
          <Stat label="Best diff (session)" value={fmtDiff(s.bestSessionDiff)} />
          <Stat label="Best diff (all-time)" value={fmtDiff(s.bestDiff)} />
          <Stat label="Uptime" value={fmtDuration(s.uptimeSeconds)} />
        </Section>

        {s.chips && s.chips.length > 0 && <ChipTable chips={s.chips} />}
      </div>
    </div>
  );
}
