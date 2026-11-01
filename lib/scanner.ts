// LAN discovery: probe every address of the local /24 subnet(s) for an AxeOS API.

import os from "node:os";
import { detectType, fetchJson, isMinerInfo, minerId } from "./miner-api";
import type { MinerRecord } from "./types";

const FALLBACK_SUBNET = "192.168.68";
const PROBE_TIMEOUT_MS = 1500;
const CONCURRENCY = 32;

// Virtual adapters (Hyper-V, WSL, VirtualBox, VPNs...) are never where the miners live.
const VIRTUAL_IFACE = /vEthernet|Hyper-V|WSL|VirtualBox|VMware|Docker|Loopback|TAP|Tunnel|VPN|Bluetooth/i;

/**
 * Subnets to scan, as "a.b.c" prefixes.
 * SCAN_SUBNETS env var (e.g. "192.168.68,10.0.0") overrides auto-detection.
 */
export function detectSubnets(extraIps: string[] = []): string[] {
  const fromEnv = process.env.SCAN_SUBNETS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv.map((s) => s.split(".").slice(0, 3).join("."));

  const subnets = new Set<string>();
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_IFACE.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      subnets.add(a.address.split(".").slice(0, 3).join("."));
    }
  }
  // Also look where known miners used to be (e.g. if the PC has several NICs).
  for (const ip of extraIps) subnets.add(ip.split(".").slice(0, 3).join("."));
  if (subnets.size === 0) subnets.add(FALLBACK_SUBNET);
  return [...subnets];
}

/** Runs `fn` over `items` with at most `limit` concurrent calls. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function probe(ip: string): Promise<MinerRecord | null> {
  let info;
  try {
    info = await fetchJson(`http://${ip}/api/system/info`, PROBE_TIMEOUT_MS);
  } catch {
    return null;
  }
  if (!isMinerInfo(info)) return null;
  return {
    id: minerId(info),
    ip,
    hostname: String(info.hostname ?? ip).trim() || ip,
    mac: typeof info.macAddr === "string" ? info.macAddr.toUpperCase() : undefined,
    type: await detectType(ip),
    lastSeen: new Date().toISOString(),
  };
}

export async function scanNetwork(subnets: string[]): Promise<MinerRecord[]> {
  const ips = subnets.flatMap((s) => Array.from({ length: 254 }, (_, i) => `${s}.${i + 1}`));
  const found = await mapLimit(ips, CONCURRENCY, probe);
  return found.filter((m): m is MinerRecord => m !== null);
}
