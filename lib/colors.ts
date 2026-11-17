// A fixed colour per miner: its square next to the name and its "last nonce" tick on the
// best-share bar. Assigned by sorted id, so colours do not jump when the leaderboard changes.
// No greens in the list: the bar's fill is emerald.

const PALETTE = [
  // The first ten are as far apart as possible; similar shades only come after them.
  "#38bdf8", // sky
  "#f472b6", // pink
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#a3e635", // lime
  "#fb923c", // orange
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
  "#d6a374", // tan
  "#818cf8", // indigo
  "#2dd4bf", // teal
  "#fde047", // yellow
  "#94a3b8", // slate
  // no red: it reads as offline / error
];

export function minerColors(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  [...ids].sort().forEach((id, i) => {
    // More miners than colours: spread the rest around the hue circle (golden angle).
    out[id] = PALETTE[i] ?? `hsl(${Math.round((i * 137.5) % 360)} 80% 65%)`;
  });
  return out;
}
