import { describe, it, expect, beforeEach } from 'vitest';
import { TournamentStatus, type Tournament } from '../types/tournament';
import {
  clearTournamentDetailCache,
  getCachedTournamentDetail,
  invalidateTournamentDetailCache,
  replaceTournamentInTree,
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

  it('does not cache a child payload as a root', () => {
    const parent = makeTournament({
      id: 10,
      status: TournamentStatus.ACTIVE,
      childTournaments: [makeTournament({ id: 11, status: TournamentStatus.ACTIVE })],
    });
    setCachedTournamentDetail(parent);
    setCachedTournamentDetail({
      ...makeTournament({ id: 11, status: TournamentStatus.ACTIVE }),
      parentTournamentId: 10,
    } as Tournament);
    expect(getCachedTournamentDetail(10)).toBeNull();
    expect(getCachedTournamentDetail(11)).toBeNull();
  });

  it('replaces a nested child in the tree', () => {
    const root = makeTournament({
      id: 10,
      status: TournamentStatus.ACTIVE,
      childTournaments: [
        makeTournament({
          id: 11,
          status: TournamentStatus.ACTIVE,
          matches: [],
        }),
      ],
    });
    const updatedChild = makeTournament({
      id: 11,
      status: TournamentStatus.ACTIVE,
      matches: [{ id: 1 } as never],
    });
    const next = replaceTournamentInTree(root, updatedChild);
    expect(next).not.toBe(root);
    expect(next.childTournaments?.[0]?.matches?.length).toBe(1);
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
