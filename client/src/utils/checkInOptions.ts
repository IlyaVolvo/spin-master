/** Unified check-in choices from GET /club/event-checkin-options */

export type CheckInOptionKind =
  | 'regular'
  | 'event_check_in'
  | 'register_and_pay'
  | 'buy_plan';

export type CheckInOption = {
  id: string;
  kind: CheckInOptionKind;
  label: string;
  actionable: boolean;
  prepaid: boolean;
  tournamentId?: number | null;
  name?: string | null;
  tournamentDate?: string | null;
  eventPriceCents?: number | null;
  clubChargeWaived?: boolean;
  clubChargeWarning?: string | null;
  opensAt?: string | null;
  disabledReason?: 'window_not_open' | 'uncovered' | null;
};

/** Format opening time as local "at hh:mm" (browser locale 12/24h). */
export function formatOpensAtLabel(opensAt: string | null | undefined, now = new Date()): string | null {
  if (!opensAt) return null;
  const d = new Date(opensAt);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `at ${time}`;
}

/** Display label for a choice (appends " — at hh:mm" when disabled upcoming). */
export function formatCheckInOptionLabel(option: CheckInOption, now = new Date()): string {
  if (!option.actionable && option.opensAt && option.disabledReason === 'window_not_open') {
    const base = (option.name || '').trim() || option.label || `Event #${option.tournamentId}`;
    const at = formatOpensAtLabel(option.opensAt, now);
    return at ? `${base} — ${at}` : base;
  }
  return option.label;
}

export function actionableCheckInOptions(options: CheckInOption[]): CheckInOption[] {
  return options.filter((o) => o.actionable);
}

export function visibleCheckInOptions(options: CheckInOption[]): CheckInOption[] {
  return options;
}

/** Default selection: first actionable option, or null. */
export function defaultCheckInOption(options: CheckInOption[]): CheckInOption | null {
  return actionableCheckInOptions(options)[0] ?? null;
}

/** Always show the chooser when any options exist so the user can confirm or cancel. */
export function shouldShowCheckInSelector(options: CheckInOption[]): boolean {
  return options.length >= 1;
}

export type CheckInExecuteIntent =
  | { type: 'regular' }
  | { type: 'event_check_in'; tournamentId: number }
  | { type: 'register_and_pay'; tournamentId: number }
  | { type: 'buy_plan' };

export function checkInExecuteIntent(option: CheckInOption | null | undefined): CheckInExecuteIntent | null {
  if (!option || !option.actionable) return null;
  if (option.kind === 'regular') return { type: 'regular' };
  if (option.kind === 'buy_plan') return { type: 'buy_plan' };
  if (option.kind === 'event_check_in' && option.tournamentId != null) {
    return { type: 'event_check_in', tournamentId: option.tournamentId };
  }
  if (option.kind === 'register_and_pay' && option.tournamentId != null) {
    return { type: 'register_and_pay', tournamentId: option.tournamentId };
  }
  return null;
}
