import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Tournament, TournamentRegistration } from '../types/tournament';

vi.mock('./systemConfig', () => ({
  getSystemConfig: () => ({
    preregistration: {
      eventCheckInLeadMinutes: 60,
      eventCheckInCloseMinutesBeforeStart: 0,
      defaultEventPriceCents: 1000,
    },
  }),
}));

import {
  countHeldRegistrations,
  EVENT_OUTSIDE_WINDOW_CLUB_CHARGE_WARNING,
  getEventCheckInOpensAt,
  isEventCheckInWindowOpen,
  isRegistrationUnpaid,
  registrationStatusLabel,
} from './tournamentEventUtils';

const start = new Date('2026-08-05T18:00:00.000Z');

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 35,
    name: 'Club Championship',
    type: 'ROUND_ROBIN',
    status: 'PRE_REGISTRATION',
    isEvent: true,
    eventPriceCents: 1000,
    tournamentDate: start.toISOString(),
    eventCheckInLeadMinutes: null,
    eventCheckInCloseMinutesBeforeStart: null,
    ...overrides,
  } as Tournament;
}

function registration(overrides: Partial<TournamentRegistration> = {}): TournamentRegistration {
  return {
    id: 9,
    memberId: 170,
    status: 'REGISTERED',
    ...overrides,
  } as TournamentRegistration;
}

describe('tournamentEventUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(start.getTime() - 30 * 60 * 1000));
  });

  it('countHeldRegistrations counts PENDING + REGISTERED', () => {
    expect(
      countHeldRegistrations([
        registration({ status: 'INVITED' }),
        registration({ status: 'PENDING' }),
        registration({ status: 'REGISTERED' }),
        registration({ status: 'DECLINED' }),
      ]),
    ).toBe(2);
  });

  it('isRegistrationUnpaid for event PENDING and unpaid REGISTERED', () => {
    expect(isRegistrationUnpaid(registration({ status: 'PENDING' }), true)).toBe(true);
    expect(
      isRegistrationUnpaid(
        registration({ status: 'REGISTERED', eventPayment: { id: 1, status: 'SUCCEEDED' } as any }),
        true,
      ),
    ).toBe(false);
    expect(
      isRegistrationUnpaid(
        registration({ status: 'REGISTERED', eventPayment: { id: 1, status: 'PENDING' } as any }),
        true,
      ),
    ).toBe(true);
    expect(isRegistrationUnpaid(registration({ status: 'PENDING' }), false)).toBe(false);
  });

  it('registrationStatusLabel covers event payment states', () => {
    expect(registrationStatusLabel(registration({ status: 'PENDING' }), true)).toBe('Pending payment');
    expect(
      registrationStatusLabel(
        registration({ status: 'REGISTERED', eventPayment: { status: 'SUCCEEDED' } as any }),
        true,
      ),
    ).toBe('Registered');
    expect(
      registrationStatusLabel(
        registration({ status: 'REGISTERED', eventPayment: null as any }),
        true,
      ),
    ).toBe('Unpaid');
    expect(registrationStatusLabel(registration({ status: 'DECLINED' }), true)).toBe('Declined');
    expect(registrationStatusLabel(registration({ status: 'INVITED' }), true)).toBe('Invited');
  });

  it('isEventCheckInWindowOpen uses system lead when override is null', () => {
    expect(isEventCheckInWindowOpen(tournament(), new Date(start.getTime() - 61 * 60 * 1000))).toBe(
      false,
    );
    expect(isEventCheckInWindowOpen(tournament(), new Date(start.getTime() - 30 * 60 * 1000))).toBe(
      true,
    );
    expect(isEventCheckInWindowOpen(tournament({ isEvent: false }), start)).toBe(false);
  });

  it('getEventCheckInOpensAt subtracts lead minutes', () => {
    const opens = getEventCheckInOpensAt(tournament());
    expect(opens?.toISOString()).toBe(new Date(start.getTime() - 60 * 60 * 1000).toISOString());
    expect(
      getEventCheckInOpensAt(tournament({ eventCheckInLeadMinutes: 120 }))?.getTime(),
    ).toBe(start.getTime() - 120 * 60 * 1000);
    expect(getEventCheckInOpensAt(tournament({ tournamentDate: null }))).toBeNull();
  });

  it('exports outside-window club charge warning copy', () => {
    expect(EVENT_OUTSIDE_WINDOW_CLUB_CHARGE_WARNING).toMatch(/regular club price/i);
  });
});
