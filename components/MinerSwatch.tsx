/** The miner's colour (lib/colors.ts): the same colour marks its last nonce on the best-share bar. */
export function MinerSwatch({ color }: { color?: string }) {
  if (!color) return null;
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
      style={{ background: color }}
      title="This miner's colour on the best-share bar"
      data-testid="miner-swatch"
    />
  );
}
