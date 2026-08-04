import { describe, it, expect, beforeEach } from 'vitest';
import { TournamentStatus, type Tournament } from '../types/tournament';
import {
  clearTournamentDetailCache,
  getCachedTournamentDetail,
  invalidateTournamentDetailCache,
  setCachedTournamentDetail,
  shouldNetworkRefreshCachedTournament,
} from './tournamentDetailCache';

function makeTournament(
  overrides: Partial<Tournament> & { id: number; status: TournamentStatus },
): Tournament {
  return {
    name: 'T',
    type: 'ROUND_ROBIN',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [],
    matches: [],
    ...overrides,
  } as Tournament;
}

describe('tournamentDetailCache', () => {
  beforeEach(() => {
    clearTournamentDetailCache();
  });

  it('stores and returns root tournament by id', () => {
    const t = makeTournament({ id: 1, status: TournamentStatus.ACTIVE });
    setCachedTournamentDetail(t);
    expect(getCachedTournamentDetail(1)?.id).toBe(1);
  });

  it('resolves child id to root tournament', () => {
    const t = makeTournament({
      id: 10,
      status: TournamentStatus.ACTIVE,
      childTournaments: [makeTournament({ id: 11, status: TournamentStatus.ACTIVE })],
    });
    setCachedTournamentDetail(t);
    expect(getCachedTournamentDetail(11)?.id).toBe(10);
  });

  it('invalidates root when child id is targeted', () => {
    const t = makeTournament({
      id: 10,
      status: TournamentStatus.COMPLETED,
      childTournaments: [makeTournament({ id: 11, status: TournamentStatus.COMPLETED })],
    });
    setCachedTournamentDetail(t);
    invalidateTournamentDetailCache(11);
    expect(getCachedTournamentDetail(10)).toBeNull();
    expect(getCachedTournamentDetail(11)).toBeNull();
  });

  it('skips network refresh for completed tournaments', () => {
    expect(
      shouldNetworkRefreshCachedTournament(makeTournament({ id: 1, status: TournamentStatus.COMPLETED })),
    ).toBe(false);
    expect(
      shouldNetworkRefreshCachedTournament(makeTournament({ id: 1, status: TournamentStatus.ACTIVE })),
    ).toBe(true);
    expect(
      shouldNetworkRefreshCachedTournament(
        makeTournament({ id: 1, status: TournamentStatus.PRE_REGISTRATION }),
      ),
    ).toBe(true);
  });
});
