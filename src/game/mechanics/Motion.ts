/** Normalised back-and-forth motion with real waiting windows at both ends. */
export function shuttleFraction(elapsed: number, period: number, dwell: number): number {
  const t = ((elapsed % period) + period) % period;
  const travel = (period - 2 * dwell) / 2;
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t < dwell) return 0;
  if (t < dwell + travel) return ease((t - dwell) / travel);
  if (t < 2 * dwell + travel) return 1;
  return 1 - ease((t - 2 * dwell - travel) / travel);
}
