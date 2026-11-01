// Types shared by the server (lib/*) and the UI (app/, components/).

export type MinerType = "nerdqaxe" | "axeos";

/** One entry in data/miners.json. */
export interface MinerRecord {
  id: string; // MAC address if the API exposes it, otherwise hostname
  ip: string;
  hostname: string;
  mac?: string;
  type: MinerType;
  lastSeen: string; // ISO timestamp
}

export interface ChipStat {
  hashRate: number; // GH/s
  errorHashRate: number; // GH/s
}

export interface Fan {
  speed?: number; // %
  rpm?: number;
}

/** Normalized reading of one miner. All units are fixed: GH/s, W, V, A, °C, MHz, mV. */
export interface MinerSnapshot {
  hostname: string;
  mac?: string;
  deviceModel?: string;
  asicModel: string;
  asicCount?: number;
  version?: string;

  hashRate: number;
  hashRate1m?: number;
  hashRate10m?: number;
  hashRate1h?: number;
  hashRate1d?: number;
  expectedHashRate?: number;

  power: number;
  voltage?: number;
  currentA?: number;
  currentAMax?: number;
  currentIsCore?: boolean; // stock AxeOS reports ASIC core-rail current, not input current

  asicTemp?: number;
  vrTemp?: number;
  fans: Fan[];

  frequency?: number;
  coreVoltage?: number; // configured, mV
  coreVoltageActual?: number; // measured, mV

  pool: {
    host?: string;
    port?: number;
    connected?: boolean;
    usingFallback: boolean;
    accepted: number;
    rejected: number;
    pingMs?: number;
  };

  bestDiff?: number;
  bestSessionDiff?: number;
  uptimeSeconds?: number;

  chips?: ChipStat[]; // nerdqaxe only
}

export interface HistoryPoint {
  t: number; // ms since epoch
  hr: number; // GH/s
}

/** One miner as returned by GET /api/miners. */
export interface MinerView extends MinerRecord {
  online: boolean;
  lastError?: string;
  snapshot?: MinerSnapshot; // last successful reading
  history: HistoryPoint[];
}

export interface ScanStatus {
  scanning: boolean;
  lastScanAt?: string;
  lastScanFound?: number;
  subnets: string[];
}

export interface MinersResponse {
  now: number;
  miners: MinerView[];
  scan: ScanStatus;
}
