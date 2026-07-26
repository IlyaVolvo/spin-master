import type { AchievementPeriodPreset, AchievementScope } from '../types';

export function parseInclusiveDateBound(value: unknown, endOfDay: boolean): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function periodBounds(
  period: AchievementPeriodPreset,
  now = new Date(),
): { from: Date | null; to: Date | null } {
  if (period === 'forever') return { from: null, to: null };
  const to = now;
  const from = new Date(now.getTime());
  if (period === 'week') from.setUTCDate(from.getUTCDate() - 7);
  else if (period === 'month') from.setUTCDate(from.getUTCDate() - 30);
  else if (period === 'year') from.setUTCDate(from.getUTCDate() - 365);
  return { from, to };
}

export type ParseScopeResult =
  | { ok: true; scope: AchievementScope }
  | { ok: false; status: 400; error: string };

export function parseAchievementScope(query: {
  tournamentId?: unknown;
  period?: unknown;
  from?: unknown;
  to?: unknown;
}): ParseScopeResult {
  const hasTournament =
    query.tournamentId != null && String(query.tournamentId).trim() !== '';
  const hasPeriod = query.period != null && String(query.period).trim() !== '';
  const hasFrom = query.from != null && String(query.from).trim() !== '';
  const hasTo = query.to != null && String(query.to).trim() !== '';
  const hasCustom = hasFrom || hasTo;

  if (hasTournament && (hasPeriod || hasCustom)) {
    return {
      ok: false,
      status: 400,
      error: 'Provide tournamentId or a period/custom date range, not both',
    };
  }

  if (hasTournament) {
    const raw = String(query.tournamentId);
    const tournamentId = parseInt(raw, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || String(tournamentId) !== raw) {
      return { ok: false, status: 400, error: 'Invalid tournamentId' };
    }
    return { ok: true, scope: { type: 'tournament', tournamentId } };
  }

  if (hasPeriod && hasCustom) {
    return {
      ok: false,
      status: 400,
      error: 'Provide period preset or custom from/to, not both',
    };
  }

  if (hasPeriod) {
    const period = String(query.period);
    if (!['week', 'month', 'year', 'forever'].includes(period)) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid period; use week, month, year, or forever',
      };
    }
    const bounds = periodBounds(period as AchievementPeriodPreset);
    return {
      ok: true,
      scope: {
        type: 'period',
        period: period as AchievementPeriodPreset,
        from: bounds.from,
        to: bounds.to,
      },
    };
  }

  if (hasCustom) {
    const fromBound = hasFrom ? parseInclusiveDateBound(query.from, false) : null;
    const toBound = hasTo ? parseInclusiveDateBound(query.to, true) : null;
    if (hasFrom && !fromBound) {
      return { ok: false, status: 400, error: 'Invalid from date; use YYYY-MM-DD' };
    }
    if (hasTo && !toBound) {
      return { ok: false, status: 400, error: 'Invalid to date; use YYYY-MM-DD' };
    }
    if (fromBound && toBound && fromBound > toBound) {
      return { ok: false, status: 400, error: 'from date must be on or before to date' };
    }
    return {
      ok: true,
      scope: { type: 'period', period: 'custom', from: fromBound, to: toBound },
    };
  }

  // Default: current month rolling window
  const bounds = periodBounds('month');
  return {
    ok: true,
    scope: { type: 'period', period: 'month', from: bounds.from, to: bounds.to },
  };
}

export function isTimestampInScope(
  timestamp: Date,
  scope: AchievementScope,
): boolean {
  if (scope.type === 'tournament') return true;
  if (scope.from && timestamp < scope.from) return false;
  if (scope.to && timestamp > scope.to) return false;
  return true;
}
