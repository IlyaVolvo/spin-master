export type AttendanceStatusFilter = 'all' | 'present' | 'rejected';

/**
 * Parse Attendance Log status query (`status`, with legacy `present` / `onlyPresent`).
 */
export function parseAttendanceStatusFilter(query: {
  status?: unknown;
  present?: unknown;
  onlyPresent?: unknown;
}): AttendanceStatusFilter {
  const statusRaw = typeof query.status === 'string' ? query.status.trim().toLowerCase() : '';
  if (statusRaw === 'present' || statusRaw === 'rejected') {
    return statusRaw;
  }
  if (
    query.present === '1' ||
    query.present === 'true' ||
    query.onlyPresent === '1' ||
    query.onlyPresent === 'true'
  ) {
    return 'present';
  }
  return 'all';
}

/** Prisma where fragment for Attendance Log status filter. */
export function attendanceStatusWhere(
  statusFilter: AttendanceStatusFilter,
): Record<string, unknown> {
  if (statusFilter === 'present') {
    return { checkOutAt: null, rejectedAt: null };
  }
  if (statusFilter === 'rejected') {
    return { rejectedAt: { not: null } };
  }
  return {};
}
