// Problems worth a glance, shared by every view (full cards, compact cards, table).
import type { MinerView } from "./types";

export const ASIC_TEMP_MAX = 70; // °C
export const VR_TEMP_MAX = 80; // °C
export const LOW_HASHRATE_PCT = 85; // of expected, 1 h average
export const REJECT_PCT_MAX = 1;

export const hashratePct = (hr?: number, expected?: number) => (hr !== undefined && expected ? (hr / expected) * 100 : undefined);
export const rejectPct = (accepted: number, rejected: number) =>
  accepted + rejected ? (rejected / (accepted + rejected)) * 100 : 0;
export const isHighCurrent = (a?: number, max?: number) => (a !== undefined && max ? a > max * 0.9 : false);

/** Short labels of what is wrong with a miner; empty when all is well. */
export function minerIssues(m: MinerView): string[] {
  if (!m.online) return ["offline"];
  const s = m.snapshot;
  if (!s) return ["no data"];
  const out: string[] = [];
  if (s.pool.connected === false) out.push("pool down");
  if (s.pool.usingFallback) out.push("fallback pool");
  if ((s.asicTemp ?? 0) >= ASIC_TEMP_MAX) out.push("ASIC hot");
  if ((s.vrTemp ?? 0) >= VR_TEMP_MAX) out.push("VRM hot");
  const pct = hashratePct(s.hashRate1h ?? s.hashRate, s.expectedHashRate);
  if (pct !== undefined && pct < LOW_HASHRATE_PCT) out.push("low hashrate");
  if (rejectPct(s.pool.accepted, s.pool.rejected) > REJECT_PCT_MAX) out.push("rejects");
  if (isHighCurrent(s.currentA, s.currentAMax)) out.push("high current");
  return out;
}

/**
 * Leaderboard order: online miners by best share since boot (highest first), offline ones last.
 * Problems do not change the order, they are flagged on the card instead.
 */
export function sortMiners(miners: MinerView[]): MinerView[] {
  return [...miners].sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      (b.snapshot?.bestSessionDiff ?? 0) - (a.snapshot?.bestSessionDiff ?? 0) ||
      a.hostname.localeCompare(b.hostname, undefined, { numeric: true }),
  );
}
