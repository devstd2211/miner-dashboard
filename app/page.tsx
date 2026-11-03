"use client";

import { useCallback, useEffect, useState } from "react";
import { DiffProgress } from "@/components/DiffProgress";
import { MinerCard } from "@/components/MinerCard";
import { fmt, fmtDiff, fmtDiffShort, fmtHash, jPerTh } from "@/lib/format";
import type { MinersResponse, NonceEvent } from "@/lib/types";

const REFRESH_MS = 5000;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<MinersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [feeds, setFeeds] = useState<Record<string, NonceEvent[]>>({});

  const load = useCallback(async () => {
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
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Live nonces/shares from the miners' logs (server-sent events; reconnects by itself).
  useEffect(() => {
    const es = new EventSource("/api/feed");
    es.onmessage = (e) => {
      const { id, events } = JSON.parse(e.data) as { id: string; events: NonceEvent[] };
      setFeeds((f) => ({ ...f, [id]: events }));
    };
    return () => es.close();
  }, []);

  async function rescan() {
    setRescanning(true);
    try {
      await fetch("/api/rescan", { method: "POST" });
      await load();
    } finally {
      setRescanning(false);
    }
  }

  const miners = data?.miners ?? [];
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
  const poolDiffMax = maxOf((m) => m.snapshot?.poolDifficulty);
  const networkDiff = maxOf((m) => m.snapshot?.networkDifficulty);
  const blockHeight = maxOf((m) => m.snapshot?.blockHeight);
  const scanning = rescanning || data?.scan.scanning;

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Miners</h1>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {error && <span className="text-red-400">API error: {error}</span>}
          {data?.scan.lastScanAt && (
            <span>
              last scan {new Date(data.scan.lastScanAt).toLocaleTimeString()} · {data.scan.subnets.map((s) => `${s}.0/24`).join(", ")}
            </span>
          )}
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
        <Tile label="Best diff (all-time)" value={fmtDiff(maxOf((m) => m.snapshot?.bestDiff))} />
        <Tile label="Best diff (session)" value={fmtDiff(maxOf((m) => m.snapshot?.bestSessionDiff))} />
      </section>

      {networkDiff && (
        <section className="-mt-3 mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile
            label="Pool difficulty"
            value={poolDiffMin === poolDiffMax ? fmtDiffShort(poolDiffMin) : `${fmtDiffShort(poolDiffMin)}–${fmtDiffShort(poolDiffMax)}`}
            sub="share target"
          />
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {miners.map((m) => (
          <MinerCard key={m.id} m={m} now={data!.now} feed={feeds[m.id]} />
        ))}
      </section>
    </main>
  );
}
