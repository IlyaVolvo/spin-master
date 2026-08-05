import type { Tournament, TournamentRegistration } from '../types/tournament';
import { getSystemConfig } from './systemConfig';

export function countHeldRegistrations(registrations: TournamentRegistration[]): number {
  return registrations.filter((r) => r.status === 'PENDING' || r.status === 'REGISTERED').length;
}

export function isRegistrationUnpaid(registration: TournamentRegistration, isEvent: boolean): boolean {
  if (!isEvent) return false;
  if (registration.status === 'PENDING') return true;
  if (registration.status === 'REGISTERED') {
    return !registration.eventPayment || registration.eventPayment.status !== 'SUCCEEDED';
  }
  return false;
}

export function registrationStatusLabel(
  registration: TournamentRegistration,
  isEvent: boolean,
): string {
  if (registration.status === 'PENDING') return 'Pending payment';
  if (isRegistrationUnpaid(registration, isEvent)) return 'Unpaid';
  if (registration.status === 'REGISTERED') return 'Registered';
  if (registration.status === 'DECLINED') return 'Declined';
  return 'Invited';
}

export function isEventCheckInWindowOpen(
  tournament: Pick<
    Tournament,
    | 'isEvent'
    | 'tournamentDate'
    | 'eventCheckInLeadMinutes'
    | 'eventCheckInCloseMinutesBeforeStart'
  >,
  now = new Date(),
): boolean {
  if (!tournament.isEvent || !tournament.tournamentDate) return false;
  const cfg = getSystemConfig().preregistration;
  const lead =
    tournament.eventCheckInLeadMinutes != null
      ? tournament.eventCheckInLeadMinutes
      : cfg.eventCheckInLeadMinutes;
  const closeBefore =
    tournament.eventCheckInCloseMinutesBeforeStart != null
      ? tournament.eventCheckInCloseMinutesBeforeStart
      : cfg.eventCheckInCloseMinutesBeforeStart;
  const start = new Date(tournament.tournamentDate).getTime();
  if (!Number.isFinite(start)) return false;
  const t = now.getTime();
  return t >= start - lead * 60 * 1000 && t <= start - closeBefore * 60 * 1000;
}

export function getEventCheckInLeadMinutes(
  tournament: Pick<Tournament, 'eventCheckInLeadMinutes'>,
): number {
  const cfg = getSystemConfig().preregistration;
  return tournament.eventCheckInLeadMinutes != null
    ? tournament.eventCheckInLeadMinutes
    : cfg.eventCheckInLeadMinutes;
}

export function getEventCheckInOpensAt(
  tournament: Pick<Tournament, 'tournamentDate' | 'eventCheckInLeadMinutes'>,
): Date | null {
  if (!tournament.tournamentDate) return null;
  const start = new Date(tournament.tournamentDate);
  if (!Number.isFinite(start.getTime())) return null;
  return new Date(start.getTime() - getEventCheckInLeadMinutes(tournament) * 60 * 1000);
}

export const EVENT_OUTSIDE_WINDOW_CLUB_CHARGE_WARNING =
  'Event check-in is not open yet. If you visit the club today, you will also be charged ' +
  'the regular club price for today, in addition to the event fee. Event check-in (no regular club charge) ' +
  'is only available in the check-in window before the event.';
