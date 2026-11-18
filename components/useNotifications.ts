"use client";

// Browser notifications while the dashboard tab is open: a miner gets a new problem (the same
// list the cards flag) or a new best share is logged. Off by default; the 🔔 button asks for
// permission and the choice is remembered. For alerts with no browser open see lib/alerts.ts.
import { useEffect, useRef, useState } from "react";
import { minerIssues } from "@/lib/health";
import { fmtDiff } from "@/lib/format";
import type { MinersResponse } from "@/lib/types";

const KEY = "miners.notify";

export function useNotifications(data: MinersResponse | null) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const prev = useRef<{ issues: Set<string>; lastRecord: number } | null>(null);

  useEffect(() => {
    const ok = typeof Notification !== "undefined" && window.isSecureContext;
    setSupported(ok);
    try {
      setOn(ok && Notification.permission === "granted" && localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);

  async function toggle() {
    let next = !on;
    if (next && Notification.permission !== "granted") next = (await Notification.requestPermission()) === "granted";
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
  }

  useEffect(() => {
    if (!data) return;
    const issues = new Set(data.miners.flatMap((m) => minerIssues(m).map((i) => `${m.hostname}: ${i}`)));
    const records = data.records ?? [];
    const lastRecord = records[0]?.t ?? 0;
    const before = prev.current;
    prev.current = { issues, lastRecord };
    if (!before || !on) return; // first load: nothing is new
    for (const i of issues) if (!before.issues.has(i)) new Notification(`⚠ ${i}`, { tag: i });
    for (const r of records.filter((r) => r.t > before.lastRecord)) {
      new Notification(`${r.allTime ? "🏆 New all-time best" : "⛏ New best since boot"}: ${r.hostname}`, { body: fmtDiff(r.diff) });
    }
  }, [data, on]);

  return { supported, on, toggle };
}
