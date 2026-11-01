export const fmtHash = (gh?: number) =>
  gh === undefined ? "—" : gh >= 1000 ? `${(gh / 1000).toFixed(2)} TH/s` : `${gh.toFixed(0)} GH/s`;

export function fmtDiff(d?: number) {
  if (d === undefined) return "—";
  const units = ["", "K", "M", "G", "T", "P", "E"];
  let i = 0;
  while (d >= 1000 && i < units.length - 1) {
    d /= 1000;
    i++;
  }
  return `${d.toFixed(d >= 100 ? 0 : 2)}${units[i]}`;
}

export function fmtDuration(seconds?: number) {
  if (seconds === undefined) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

export const fmt = (v: number | undefined, digits: number, unit = "") =>
  v === undefined ? "—" : `${v.toFixed(digits)}${unit}`;

/** Joules per terahash. */
export const jPerTh = (watts?: number, gh?: number) =>
  watts !== undefined && gh ? watts / (gh / 1000) : undefined;
