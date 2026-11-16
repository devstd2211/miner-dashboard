"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DiffProgress } from "@/components/DiffProgress";
import { MinerCard } from "@/components/MinerCard";
import { MinerCompact } from "@/components/MinerCompact";
import { MinerTable } from "@/components/MinerTable";
import { createDemo, type Demo } from "@/lib/demo";
import { sortMiners } from "@/lib/health";
import { fmt, fmtDiff, fmtDiffShort, fmtHash, jPerTh } from "@/lib/format";
import type { MinersResponse, NonceEvent } from "@/lib/types";

const REFRESH_MS = 5000;
// More miners than this: compact cards by default, nonce feeds collapsed in full cards.
const MANY = 6;

type View = "full" | "compact" | "table";
const VIEWS: { id: View; label: string }[] = [
  { id: "full", label: "Cards" },
  { id: "compact", label: "Compact" },
  { id: "table", label: "Table" },
];
const VIEW_KEY = "miners.view";

// Cards fill the width: as many columns as fit at the minimum width, but at most maxCols
// (a track is never narrower than 1/maxCols of the row; 16px = gap-4).
const grid = (min: number, maxCols: number) => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(max(min(100%, ${min}px), calc((100% - ${(maxCols - 1) * 16}px) / ${maxCols})), 1fr))`,
});

function Tile({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${good ? "text-emerald-400" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<MinersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [feeds, setFeeds] = useState<Record<string, NonceEvent[]>>({});
  const [chosenView, setChosenView] = useState<View | null>(null); // null: pick by miner count
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Miners that just climbed the leaderboard: id -> time, cleared after the glow animation.
  const [climbed, setClimbed] = useState<Record<string, number>>({});
  const prevRanks = useRef<Record<string, number> | null>(null);
  // ?demo=N shows N made-up miners instead of the real ones (README screenshots, layout tests).
  const demo = useRef<Demo | null>(null);
  const [mode, setMode] = useState<"pending" | "live" | "demo">("pending");

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("demo"));
    if (n > 0) demo.current = createDemo(Math.min(Math.floor(n), 60));
    setMode(demo.current ? "demo" : "live");
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "full" || v === "compact" || v === "table") setChosenView(v);
    } catch {}
  }, []);
  function chooseView(v: View) {
    setChosenView(v);
    setExpanded(new Set());
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    if (demo.current) {
      setData(demo.current.tick());
      setFeeds(demo.current.feeds());
      return;
    }
    try {
      const res = await fetch("/api/miners", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (mode === "pending") return;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, mode]);

  // Live nonces/shares from the miners' logs (server-sent events; reconnects by itself).
  useEffect(() => {
    if (mode !== "live") return;
    const es = new EventSource("/api/feed");
    es.onmessage = (e) => {
      const { id, events } = JSON.parse(e.data) as { id: string; events: NonceEvent[] };
      setFeeds((f) => ({ ...f, [id]: events }));
    };
    return () => es.close();
  }, [mode]);

  async function rescan() {
    if (demo.current) return load();
    setRescanning(true);
    try {
      await fetch("/api/rescan", { method: "POST" });
      await load();
    } finally {
      setRescanning(false);
    }
  }

  const miners = sortMiners(data?.miners ?? []);
  // Leaderboard place by best share since boot; offline miners have no place.
  const ranks: Record<string, number> = {};
  miners.filter((m) => m.online).forEach((m, i) => (ranks[m.id] = i + 1));
  const ranksKey = JSON.stringify(ranks);

  useEffect(() => {
    const now: Record<string, number> = JSON.parse(ranksKey);
    const prev = prevRanks.current;
    prevRanks.current = now;
    if (!prev) return; // first load: nothing climbed
    const up = Object.keys(now).filter((id) => prev[id] !== undefined && now[id] < prev[id]);
    if (!up.length) return;
    const t = Date.now();
    setClimbed((c) => ({ ...c, ...Object.fromEntries(up.map((id) => [id, t])) }));
    // Not cancelled on the next change: every climb clears its own entry.
    setTimeout(() => setClimbed((c) => Object.fromEntries(Object.entries(c).filter(([, at]) => at !== t))), 5000);
  }, [ranksKey]);
  const many = miners.length > MANY;
  const view: View = chosenView ?? (many ? "compact" : "full");
  const online = miners.filter((m) => m.online && m.snapshot);
  const totalHash = online.reduce((s, m) => s + m.snapshot!.hashRate, 0);
  const totalPower = online.reduce((s, m) => s + m.snapshot!.power, 0);
  const maxOf = (pick: (m: (typeof miners)[number]) => number | undefined) => {
    const vals = miners.map(pick).filter((v): v is number => v !== undefined);
    return vals.length ? Math.max(...vals) : undefined;
  };
  const minOf = (pick: (m: (typeof miners)[number]) => number | undefined) => {
    const vals = miners.map(pick).filter((v): v is number => v !== undefined && v > 0);
    return vals.length ? Math.min(...vals) : undefined;
  };
  const poolDiffMin = minOf((m) => m.snapshot?.poolDifficulty);
  const networkDiff = maxOf((m) => m.snapshot?.networkDifficulty);
  const blockHeight = maxOf((m) => m.snapshot?.blockHeight);
  const scanning = rescanning || data?.scan.scanning;
  // Share difficulty tile: one row per difficulty, miners that share it listed together.
  const diffGroups = [...online]
    .filter((m) => m.snapshot!.poolDifficulty)
    .reduce((acc, m) => {
      const d = m.snapshot!.poolDifficulty!;
      acc.set(d, [...(acc.get(d) ?? []), m.hostname]);
      return acc;
    }, new Map<number, string[]>());

  return (
    <main className="mx-auto max-w-[3200px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          Miners
          {mode === "demo" && (
            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400" title="Made-up miners (?demo=N)">
              demo data
            </span>
          )}
        </h1>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {error && <span className="text-red-400">API error: {error}</span>}
          {data?.scan.lastScanAt && (
            <span>
              last scan {new Date(data.scan.lastScanAt).toLocaleTimeString()} · {data.scan.subnets.map((s) => `${s}.0/24`).join(", ")}
            </span>
          )}
          <div className="flex overflow-hidden rounded-md border border-zinc-700 text-sm" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => chooseView(v.id)}
                aria-pressed={view === v.id}
                className={`px-2.5 py-1.5 ${view === v.id ? "bg-zinc-700 text-zinc-100" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            onClick={rescan}
            disabled={!!scanning}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Total hashrate" value={fmtHash(totalHash)} />
        <Tile label="Total power" value={fmt(totalPower, 0, " W")} />
        <Tile label="Efficiency" value={fmt(jPerTh(totalPower, totalHash), 2, " J/TH")} />
        <Tile label="Online" value={`${online.length} / ${miners.length}`} />
        <Tile label="Best diff (all-time)" value={fmtDiff(maxOf((m) => m.snapshot?.bestDiff))} good />
        <Tile label="Best diff (session)" value={fmtDiff(maxOf((m) => m.snapshot?.bestSessionDiff))} good />
      </section>

      {networkDiff && (
        <section className="-mt-3 mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
            title="Minimum difficulty a nonce needs to be sent to the pool as a share. The pool sets it per miner (vardiff) to match its hashrate."
          >
            <div className="text-xs text-zinc-500">Share difficulty (set by pool)</div>
            <div className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto text-sm tabular-nums">
              {[...diffGroups]
                .sort(([a], [b]) => a - b)
                .map(([d, names]) => (
                  <div key={d} className="flex justify-between gap-2" title={names.join(", ")}>
                    <span className="truncate text-zinc-400">{names.join(", ")}</span>
                    <span className="shrink-0 font-semibold text-emerald-400">
                      {names.length > 1 && <span className="font-normal text-zinc-500">{names.length}× </span>}
                      {fmtDiffShort(d)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
          <Tile
            label="Network difficulty"
            value={fmtDiff(networkDiff)}
            sub={blockHeight ? `block ${blockHeight.toLocaleString()}` : undefined}
          />
          <div className="col-span-2 md:col-span-3 xl:col-span-4">
            <DiffProgress
              from={poolDiffMin ?? 1000}
              to={networkDiff}
              marks={miners.map((m) => ({
                name: m.hostname,
                best: m.snapshot?.bestDiff,
                session: m.snapshot?.bestSessionDiff,
              }))}
            />
          </div>
        </section>
      )}

      {!data && !error && <p className="text-zinc-500">Loading…</p>}
      {data && miners.length === 0 && (
        <p className="text-zinc-500">{scanning ? "Scanning the network…" : "No miners found. Press Rescan."}</p>
      )}

      {data && view === "table" && miners.length > 0 && (
        <MinerTable miners={miners} now={data.now} feeds={feeds} expanded={expanded} toggle={toggle} ranks={ranks} />
      )}
      {data && view !== "table" && (
        <section className={`grid gap-4 ${view === "compact" ? "items-start" : ""}`} style={view === "compact" ? grid(300, 8) : grid(440, miners.length > 3 ? 4 : 3)}>
          {miners.map((m) =>
            view === "compact" && !expanded.has(m.id) ? (
              <MinerCompact key={m.id} m={m} now={data.now} onExpand={() => toggle(m.id)} rank={ranks[m.id]} flash={!!climbed[m.id]} />
            ) : (
              <MinerCard
                key={m.id}
                m={m}
                now={data.now}
                feed={feeds[m.id]}
                feedCollapsed={many}
                rank={ranks[m.id]}
                flash={!!climbed[m.id]}
                onCollapse={view === "compact" ? () => toggle(m.id) : undefined}
              />
            ),
          )}
        </section>
      )}
    </main>
  );
}
