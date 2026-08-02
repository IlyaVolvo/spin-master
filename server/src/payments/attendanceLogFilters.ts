export const ATTENDANCE_STATUS_VALUES = ['present', 'out', 'rejected'] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUS_VALUES)[number];

const ALL_STATUSES: AttendanceStatusValue[] = [...ATTENDANCE_STATUS_VALUES];

function isAttendanceStatus(value: string): value is AttendanceStatusValue {
  return (ATTENDANCE_STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * Parse Attendance Log status query.
 * Accepts `status=present,out,rejected` (comma-separated), repeated `status`,
 * legacy single `present` / `rejected` / `all`, and legacy `present` / `onlyPresent` flags.
 * Missing/empty/`all` → all three statuses (no filter).
 */
export function parseAttendanceStatusFilter(query: {
  status?: unknown;
  present?: unknown;
  onlyPresent?: unknown;
}): AttendanceStatusValue[] {
  const selected = new Set<AttendanceStatusValue>();

  const addFromRaw = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (!normalized || normalized === 'all') return;
    for (const part of normalized.split(',')) {
      const token = part.trim();
      if (isAttendanceStatus(token)) selected.add(token);
    }
  };

  if (typeof query.status === 'string') {
    addFromRaw(query.status);
  } else if (Array.isArray(query.status)) {
    for (const item of query.status) {
      if (typeof item === 'string') addFromRaw(item);
    }
  }

  if (selected.size === 0) {
    if (
      query.present === '1' ||
      query.present === 'true' ||
      query.onlyPresent === '1' ||
      query.onlyPresent === 'true'
    ) {
      return ['present'];
    }
    return [...ALL_STATUSES];
  }

  return ATTENDANCE_STATUS_VALUES.filter((s) => selected.has(s));
}

function clauseForStatus(status: AttendanceStatusValue): Record<string, unknown> {
  if (status === 'present') {
    return { checkOutAt: null, rejectedAt: null };
  }
  if (status === 'out') {
    return { checkOutAt: { not: null }, rejectedAt: null };
  }
  return { rejectedAt: { not: null } };
}

/** Prisma where fragment for Attendance Log multi status filter. */
export function attendanceStatusWhere(
  statusFilter: AttendanceStatusValue[],
): Record<string, unknown> {
  const unique = ATTENDANCE_STATUS_VALUES.filter((s) => statusFilter.includes(s));
  if (unique.length === 0 || unique.length === ATTENDANCE_STATUS_VALUES.length) {
    return {};
  }
  if (unique.length === 1) {
    return clauseForStatus(unique[0]);
  }
  return { OR: unique.map((s) => clauseForStatus(s)) };
}
