/** HH:mm club-local wall clock helpers for host slots. */

const HM_RE = /^(\d{2}):(\d{2})$/;

export function parseHm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = HM_RE.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function hmToMinutes(hm: string): number {
  const [hour, minute] = hm.split(':').map(Number);
  return hour * 60 + minute;
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  return hmToMinutes(startTime) < hmToMinutes(endTime);
}

export function parseYmd(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function parseNonNegInt(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}
