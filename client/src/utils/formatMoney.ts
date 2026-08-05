/** Format integer cents as USD (e.g. 1250 → "$12.50"). */
export function formatMoney(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
