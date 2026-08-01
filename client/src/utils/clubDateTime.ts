import { getSystemConfig } from './systemConfig';

/**
 * Format an instant in the club's configured timezone (not UTC/GMT unless the club is set to UTC).
 */
export function formatClubDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const timeZone = getSystemConfig().branding.clubTimezone || undefined;
  try {
    return d.toLocaleString(undefined, {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
