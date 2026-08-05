import { getPreregistrationConfig } from '../services/systemConfigService';

export type EventCheckInTournament = {
  id: number;
  name: string | null;
  tournamentDate: Date | null;
  isEvent: boolean;
  eventCheckInLeadMinutes: number | null;
  eventCheckInCloseMinutesBeforeStart: number | null;
};

/** Open/close instants for event check-in, or null when not applicable. */
export function getEventCheckInWindowBounds(
  tournament: EventCheckInTournament,
): { opensAt: Date; closesAt: Date; start: Date } | null {
  if (!tournament.isEvent || !tournament.tournamentDate) return null;
  const cfg = getPreregistrationConfig();
  const lead =
    tournament.eventCheckInLeadMinutes != null
      ? tournament.eventCheckInLeadMinutes
      : cfg.eventCheckInLeadMinutes;
  const closeBefore =
    tournament.eventCheckInCloseMinutesBeforeStart != null
      ? tournament.eventCheckInCloseMinutesBeforeStart
      : cfg.eventCheckInCloseMinutesBeforeStart;

  const start = new Date(tournament.tournamentDate);
  if (!Number.isFinite(start.getTime())) return null;
  const opensAt = new Date(start.getTime() - lead * 60 * 1000);
  const closesAt = new Date(start.getTime() - closeBefore * 60 * 1000);
  return { opensAt, closesAt, start };
}

/** Whether now is inside the event check-in window for a tournament. */
export function isEventCheckInWindowOpen(
  tournament: EventCheckInTournament,
  now = new Date(),
): boolean {
  const bounds = getEventCheckInWindowBounds(tournament);
  if (!bounds) return false;
  const t = now.getTime();
  return t >= bounds.opensAt.getTime() && t <= bounds.closesAt.getTime();
}

/**
 * When registering/paying for an event outside the event check-in window,
 * the member is not covered for today's club visit by the event fee.
 */
export function eventOutsideCheckInWindowClubChargeWarning(
  tournament: EventCheckInTournament,
  now = new Date(),
): string | null {
  if (!tournament.isEvent) return null;
  if (isEventCheckInWindowOpen(tournament, now)) return null;
  return (
    'Event check-in is not open yet. If you visit the club today, you will also be charged ' +
    'the regular club price for today, in addition to the event fee. Event check-in (no regular club charge) ' +
    'is only available in the check-in window before the event.'
  );
}
