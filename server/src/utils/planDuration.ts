/**
 * Compute exclusive end datetime from an inclusive start.
 * validFrom = start (inclusive); validTo = result (exclusive).
 */
export type DurationUnit = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

export function computeValidTo(
  startInclusive: Date,
  unit: DurationUnit,
  value: number,
): Date {
  const n = Math.max(1, Math.floor(value) || 1);
  const end = new Date(startInclusive.getTime());

  switch (unit) {
    case 'DAY':
      end.setDate(end.getDate() + n);
      break;
    case 'WEEK':
      end.setDate(end.getDate() + n * 7);
      break;
    case 'MONTH':
      end.setMonth(end.getMonth() + n);
      break;
    case 'QUARTER':
      end.setMonth(end.getMonth() + n * 3);
      break;
    case 'YEAR':
      end.setFullYear(end.getFullYear() + n);
      break;
    default:
      end.setMonth(end.getMonth() + n);
  }

  return end;
}
