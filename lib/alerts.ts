// Server-side alerts: a problem that lasts ALERT_AFTER_MS (offline, pool down, too hot, ...;
// the same list the cards flag, lib/health.ts) and its recovery, plus new best shares.
// Always written to the server log; also sent to Telegram when TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID are set (e.g. in .env.local). Works with no browser open.

import { minerIssues } from "./health";
import { fmtDiff } from "./format";
import type { BestRecord, MinerView } from "./types";

const ALERT_AFTER_MS = 60_000;

const g = globalThis as unknown as { __alerts?: Map<string, { since: number; sent: boolean }> };
const active = (g.__alerts ??= new Map());

async function send(text: string) {
  console.log(`[alert] ${text}`);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[alert] telegram: HTTP ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error("[alert] telegram failed", e);
  }
}

/** Called after every poll with the current state of all miners. */
export function checkAlerts(miners: MinerView[], now = Date.now()) {
  const current = new Set<string>();
  const names = new Map(miners.map((m) => [m.id, m.hostname]));
  for (const m of miners) {
    for (const issue of minerIssues(m)) {
      const key = `${m.id}|${issue}`;
      current.add(key);
      const a = active.get(key);
      if (!a) active.set(key, { since: now, sent: false });
      else if (!a.sent && now - a.since >= ALERT_AFTER_MS) {
        a.sent = true;
        send(`⚠ ${m.hostname}: ${issue}`);
      }
    }
  }
  for (const [key, a] of active) {
    if (current.has(key)) continue;
    active.delete(key);
    const [id, issue] = key.split("|");
    if (a.sent && names.has(id)) send(`✅ ${names.get(id)}: ${issue} — back to normal`);
  }
}

export function alertRecord(r: BestRecord) {
  const off = r.whileOff ? " (found while the dashboard was off)" : "";
  send(`${r.allTime ? "🏆 New all-time best" : "⛏ New best since boot"} on ${r.hostname}: ${fmtDiff(r.diff)}${off}`);
}
