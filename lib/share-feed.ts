// Live nonce/share feed: one websocket per miner to its log stream (ws://IP/api/ws, the same
// one the miner's own web UI shows), parsed into "nonce found -> submitted -> accepted/rejected".
//
// Log lines seen on real devices (ANSI colours stripped):
//   AxeOS v2.15:    asic_result: ID: 6ae5..., ASIC nr: 0, Core: 123/1, ver: 200C2000 Nonce E29EF5F6 diff 7349.8 of 1000.
//   NerdQAxe 1.1.1: asic_result: (Pri) Job ID: 70 AsicNr: 1 Ver: 21E64000 Nonce CDF68620; Extranonce2 ... diff 4588.6/4244/73.6M
//   both:           stratum_api: tx: {"id":48615,"method":"mining.submit","params":[user, job, en2, ntime, "e29ef5f6", ver]}
//   both:           ...rx: {"result":true,"error":null,"id":48615}
// AxeOS logs the submit *before* the asic_result line of the same nonce, so events are
// matched by nonce in either order. If a firmware changes this format the feed just stays
// empty; nothing else on the dashboard depends on it.

import type { NonceEvent } from "./types";

const KEEP_PER_ASIC = 4; // newest nonces kept per chip
const KEEP_EVENTS = 64; // per miner in total (8 chips × 4 plus slack), newest first
const RECONNECT_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000; // no log lines this long -> reconnect

type Listener = (minerId: string, events: NonceEvent[]) => void;

interface Feed {
  ip: string;
  ws?: WebSocket;
  events: NonceEvent[];
  submits: Map<number, string>; // stratum request id -> nonce
  lastMsgAt: number;
  retry?: NodeJS.Timeout;
  closed: boolean;
}

const g = globalThis as unknown as { __shareFeed?: { feeds: Map<string, Feed>; listeners: Set<Listener> } };
const state = (g.__shareFeed ??= { feeds: new Map(), listeners: new Set() });

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const RE_AXEOS = /asic_result:.*Nonce ([0-9A-Fa-f]{8}) diff ([\d.]+) of ([\d.]+)/;
const RE_NERD = /asic_result:.*Nonce ([0-9A-Fa-f]{8});.*diff ([\d.]+)\/([\d.]+)\//;
const RE_ASIC = /ASIC ?nr:? (\d+)/i; // "ASIC nr: 0" (AxeOS), "AsicNr: 5" (NerdQAxe)

function jsonAfter(line: string, marker: string): Record<string, unknown> | undefined {
  const i = line.indexOf(marker);
  const start = i < 0 ? -1 : line.indexOf("{", i);
  const end = line.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(line.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Find the event for a nonce or create it at the front. */
function upsert(f: Feed, nonce: string): NonceEvent {
  let ev = f.events.find((e) => e.nonce === nonce);
  if (!ev) {
    ev = { t: Date.now(), nonce, status: "found" };
    f.events.unshift(ev);
    f.events.length = Math.min(f.events.length, KEEP_EVENTS);
  }
  return ev;
}

/** Keep only the newest KEEP_PER_ASIC events of each chip. */
function trimPerAsic(f: Pick<Feed, "events">) {
  const count = new Map<number | undefined, number>();
  f.events = f.events.filter((e) => {
    const n = (count.get(e.asic) ?? 0) + 1;
    count.set(e.asic, n);
    return n <= KEEP_PER_ASIC;
  });
}

/** Parse one log line. Returns true if the feed changed. Exported for tests. */
export function parseLine(f: Pick<Feed, "events" | "submits">, raw: string): boolean {
  const line = raw.replace(ANSI, "");
  const found = line.match(RE_AXEOS) ?? line.match(RE_NERD);
  if (found) {
    const ev = upsert(f as Feed, found[1].toUpperCase());
    ev.diff = parseFloat(found[2]);
    ev.poolDiff = parseFloat(found[3]);
    const asic = line.match(RE_ASIC);
    if (asic) ev.asic = parseInt(asic[1], 10);
    trimPerAsic(f);
    return true;
  }
  if (line.includes("mining.submit")) {
    const msg = jsonAfter(line, "tx:");
    const params = msg?.params;
    if (typeof msg?.id === "number" && Array.isArray(params) && typeof params[4] === "string") {
      const nonce = params[4].toUpperCase();
      f.submits.set(msg.id, nonce);
      if (f.submits.size > 50) f.submits.delete(f.submits.keys().next().value!);
      const ev = upsert(f as Feed, nonce);
      if (ev.status === "found") ev.status = "submitted";
      return true;
    }
    return false;
  }
  if (line.includes("rx:") && line.includes('"result"')) {
    const msg = jsonAfter(line, "rx:");
    const nonce = typeof msg?.id === "number" ? f.submits.get(msg.id) : undefined;
    const ev = nonce && f.events.find((e) => e.nonce === nonce);
    if (!msg || !nonce) return false;
    f.submits.delete(msg.id as number);
    if (!ev) return false;
    const ok = msg.result === true && msg.error == null;
    ev.status = ok ? "accepted" : "rejected";
    if (!ok) ev.reason = Array.isArray(msg.error) ? String(msg.error[1] ?? msg.error[0]) : msg.error ? String(msg.error) : undefined;
    return true;
  }
  return false;
}

function emit(minerId: string, f: Feed) {
  const events = f.events.map((e) => ({ ...e }));
  state.listeners.forEach((l) => l(minerId, events));
}

function connect(minerId: string, f: Feed) {
  clearTimeout(f.retry);
  if (f.closed) return;
  const ws = new WebSocket(`ws://${f.ip}/api/ws`);
  f.ws = ws;
  f.lastMsgAt = Date.now();
  const retry = () => {
    if (f.ws !== ws) return;
    f.ws = undefined;
    try {
      ws.close();
    } catch {}
    if (!f.closed) f.retry = setTimeout(() => connect(minerId, f), RECONNECT_MS);
  };
  ws.onmessage = (e) => {
    f.lastMsgAt = Date.now();
    let changed = false;
    for (const line of String(e.data).split("\n")) changed = parseLine(f, line) || changed;
    if (changed) emit(minerId, f);
  };
  ws.onerror = retry;
  ws.onclose = retry;
}

/** Keep a log connection to this miner (called on every poll; cheap when nothing changed). */
export function ensureFeed(minerId: string, ip: string) {
  let f = state.feeds.get(minerId);
  if (f && f.ip !== ip) {
    stopFeed(minerId); // new DHCP address
    f = undefined;
  }
  if (!f) {
    f = { ip, events: [], submits: new Map(), lastMsgAt: 0, closed: false };
    state.feeds.set(minerId, f);
    connect(minerId, f);
  } else if (f.ws && Date.now() - f.lastMsgAt > IDLE_TIMEOUT_MS) {
    f.ws.close(); // stuck connection: onclose schedules a reconnect
  }
}

export function stopFeed(minerId: string) {
  const f = state.feeds.get(minerId);
  if (!f) return;
  f.closed = true;
  clearTimeout(f.retry);
  f.ws?.close();
  state.feeds.delete(minerId);
}

export function getFeeds(): [string, NonceEvent[]][] {
  return [...state.feeds].map(([id, f]): [string, NonceEvent[]] => [id, f.events.map((e: NonceEvent) => ({ ...e }))]);
}

export function subscribe(l: Listener): () => void {
  state.listeners.add(l);
  return () => state.listeners.delete(l);
}
