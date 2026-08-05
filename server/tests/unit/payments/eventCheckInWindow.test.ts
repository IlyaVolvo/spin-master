/**
 * Event check-in window — open/closed boundaries and config overrides.
 */
jest.mock('../../../src/services/systemConfigService', () => ({
  getPreregistrationConfig: jest.fn(() => ({
    defaultTournamentOffsetDays: 1,
    defaultTournamentTime: '18:00',
    registrationDeadlineOffsetMinutes: 60,
    eventCheckInLeadMinutes: 60,
    eventCheckInCloseMinutesBeforeStart: 0,
    defaultEventPriceCents: 1000,
    cancelReasonPresets: [],
  })),
}));

import { getPreregistrationConfig } from '../../../src/services/systemConfigService';
import {
  eventOutsideCheckInWindowClubChargeWarning,
  getEventCheckInWindowBounds,
  isEventCheckInWindowOpen,
} from '../../../src/payments/eventCheckInWindow';

const start = new Date('2026-08-05T18:00:00.000Z');

function eventTournament(
  overrides: Partial<{
    id: number;
    name: string | null;
    tournamentDate: Date | null;
    isEvent: boolean;
    eventCheckInLeadMinutes: number | null;
    eventCheckInCloseMinutesBeforeStart: number | null;
  }> = {},
) {
  return {
    id: 35,
    name: 'Club Championship',
    tournamentDate: start,
    isEvent: true,
    eventCheckInLeadMinutes: null as number | null,
    eventCheckInCloseMinutesBeforeStart: null as number | null,
    ...overrides,
  };
}

describe('isEventCheckInWindowOpen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPreregistrationConfig as jest.Mock).mockReturnValue({
      eventCheckInLeadMinutes: 60,
      eventCheckInCloseMinutesBeforeStart: 0,
    });
  });

  it('is closed for non-events and missing tournament date', () => {
    expect(isEventCheckInWindowOpen(eventTournament({ isEvent: false }), start)).toBe(false);
    expect(isEventCheckInWindowOpen(eventTournament({ tournamentDate: null }), start)).toBe(false);
  });

  it('opens at tournamentDate − lead (system default 60m) and closes at start', () => {
    const opensAt = new Date(start.getTime() - 60 * 60 * 1000);
    expect(isEventCheckInWindowOpen(eventTournament(), new Date(opensAt.getTime() - 1))).toBe(false);
    expect(isEventCheckInWindowOpen(eventTournament(), opensAt)).toBe(true);
    expect(isEventCheckInWindowOpen(eventTournament(), start)).toBe(true);
    expect(isEventCheckInWindowOpen(eventTournament(), new Date(start.getTime() + 1))).toBe(false);
  });

  it('uses per-tournament lead override', () => {
    const t = eventTournament({ eventCheckInLeadMinutes: 120 });
    const opensAt = new Date(start.getTime() - 120 * 60 * 1000);
    expect(isEventCheckInWindowOpen(t, new Date(opensAt.getTime() - 1))).toBe(false);
    expect(isEventCheckInWindowOpen(t, opensAt)).toBe(true);
  });

  it('uses close-before-start override (window ends before event)', () => {
    const t = eventTournament({
      eventCheckInLeadMinutes: 120,
      eventCheckInCloseMinutesBeforeStart: 30,
    });
    const closesAt = new Date(start.getTime() - 30 * 60 * 1000);
    expect(isEventCheckInWindowOpen(t, new Date(closesAt.getTime() - 1000))).toBe(true);
    expect(isEventCheckInWindowOpen(t, closesAt)).toBe(true);
    expect(isEventCheckInWindowOpen(t, new Date(closesAt.getTime() + 1))).toBe(false);
  });

  it('exposes window bounds via getEventCheckInWindowBounds', () => {
    const bounds = getEventCheckInWindowBounds(eventTournament({ eventCheckInLeadMinutes: 90 }));
    expect(bounds?.opensAt.getTime()).toBe(start.getTime() - 90 * 60 * 1000);
    expect(bounds?.closesAt.getTime()).toBe(start.getTime());
  });
});

describe('eventOutsideCheckInWindowClubChargeWarning', () => {
  beforeEach(() => {
    (getPreregistrationConfig as jest.Mock).mockReturnValue({
      eventCheckInLeadMinutes: 60,
      eventCheckInCloseMinutesBeforeStart: 0,
    });
  });

  it('returns null when not an event or window is open', () => {
    expect(eventOutsideCheckInWindowClubChargeWarning(eventTournament({ isEvent: false }), start)).toBeNull();
    expect(eventOutsideCheckInWindowClubChargeWarning(eventTournament(), start)).toBeNull();
  });

  it('warns that club charge still applies outside the window', () => {
    const early = new Date(start.getTime() - 3 * 60 * 60 * 1000);
    const warning = eventOutsideCheckInWindowClubChargeWarning(eventTournament(), early);
    expect(warning).toMatch(/Event check-in is not open yet/i);
    expect(warning).toMatch(/regular club price/i);
  });
});
