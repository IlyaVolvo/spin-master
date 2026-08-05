import { getPreregistrationConfig } from '../services/systemConfigService';

export type EventCheckInTournament = {
  id: number;
  name: string | null;
  tournamentDate: Date | null;
  isEvent: boolean;
  eventCheckInLeadMinutes: number | null;
  eventCheckInCloseMinutesBeforeStart: number | null;
};

/** Whether now is inside the event check-in window for a tournament. */
export function isEventCheckInWindowOpen(
  tournament: EventCheckInTournament,
  now = new Date(),
): boolean {
  if (!tournament.isEvent || !tournament.tournamentDate) return false;
  const cfg = getPreregistrationConfig();
  const lead =
    tournament.eventCheckInLeadMinutes != null
      ? tournament.eventCheckInLeadMinutes
      : cfg.eventCheckInLeadMinutes;
  const closeBefore =
    tournament.eventCheckInCloseMinutesBeforeStart != null
      ? tournament.eventCheckInCloseMinutesBeforeStart
      : cfg.eventCheckInCloseMinutesBeforeStart;

  const start = new Date(tournament.tournamentDate).getTime();
  const opensAt = start - lead * 60 * 1000;
  const closesAt = start - closeBefore * 60 * 1000;
  const t = now.getTime();
  return t >= opensAt && t <= closesAt;
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
