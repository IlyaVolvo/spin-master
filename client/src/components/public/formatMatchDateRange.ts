/** Format a match-play date range for public results display. */
export function formatMatchDateRange(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
): string {
  if (!from && !to) return '—';
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const fromOk = fromDate && !Number.isNaN(fromDate.getTime());
  const toOk = toDate && !Number.isNaN(toDate.getTime());
  if (!fromOk && !toOk) return '—';
  if (fromOk && !toOk) return fromDate!.toLocaleDateString();
  if (!fromOk && toOk) return toDate!.toLocaleDateString();

  const fromLabel = fromDate!.toLocaleDateString();
  const toLabel = toDate!.toLocaleDateString();
  if (fromLabel === toLabel) return fromLabel;
  return `${fromLabel} – ${toLabel}`;
}
