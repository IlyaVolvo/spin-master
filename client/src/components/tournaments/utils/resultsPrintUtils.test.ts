import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../../../types/tournament';
import '../plugins'; // register plugins for mode helpers / final-phase layout
import {
  getSupportedResultsPrintModes,
  resolveChildResultsPrintMode,
} from './resultsPrintModes';
import {
  buildAbbreviatedStandingsTableHtml,
  buildBasicResultsDocumentHtml,
  buildCompoundResultsDocumentHtml,
  buildFullRoundRobinResultsHtml,
  buildStandardRoundRobinResultsHtml,
} from './resultsPrintUtils';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
});

function member(id: number, firstName: string, lastName: string, rating: number) {
  return { id, firstName, lastName, rating, birthDate: null, isActive: true };
}

function makeRrTournament(overrides: Partial<Tournament> = {}): Tournament {
  const m1 = member(1, 'Alice', 'Alpha', 1500);
  const m2 = member(2, 'Bob', 'Beta', 1400);
  return {
    id: 10,
    name: 'Thursday RR',
    type: 'ROUND_ROBIN',
    status: 'COMPLETED',
    createdAt: '2026-01-15T18:00:00.000Z',
    recordedAt: '2026-01-15T21:00:00.000Z',
    cancelled: false,
    participants: [
      { id: 101, memberId: 1, member: m1, playerRatingAtTime: 1500 } as any,
      { id: 102, memberId: 2, member: m2, playerRatingAtTime: 1400 } as any,
    ],
    matches: [
      {
        id: 201,
        member1Id: 1,
        member2Id: 2,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
      } as any,
    ],
    bracketMatches: [],
    ...overrides,
  } as Tournament;
}

function makePlayoffChild(): Tournament {
  const m1 = member(3, 'Cara', 'Champ', 1600);
  const m2 = member(4, 'Dan', 'Duel', 1550);
  return {
    id: 20,
    name: 'Final Playoff',
    type: 'PLAYOFF',
    status: 'COMPLETED',
    createdAt: '2026-01-15T18:00:00.000Z',
    cancelled: false,
    participants: [
      { id: 201, memberId: 3, member: m1, playerRatingAtTime: 1600 } as any,
      { id: 202, memberId: 4, member: m2, playerRatingAtTime: 1550 } as any,
    ],
    matches: [],
    bracketMatches: [
      {
        id: 1,
        round: 1,
        position: 1,
        member1Id: 3,
        member2Id: 4,
        match: {
          id: 301,
          member1Id: 3,
          member2Id: 4,
          player1Sets: 3,
          player2Sets: 2,
          player1Forfeit: false,
          player2Forfeit: false,
        },
      } as any,
    ],
  } as Tournament;
}

describe('resultsPrintModes', () => {
  it('RR supports standard and abbreviated only', () => {
    expect(getSupportedResultsPrintModes(makeRrTournament())).toEqual([
      'standard',
      'abbreviated',
    ]);
  });

  it('Playoff supports only standard', () => {
    expect(getSupportedResultsPrintModes(makePlayoffChild())).toEqual(['standard']);
  });

  it('Multi RR parent unions child RR modes (standard + abbreviated)', () => {
    const child = makeRrTournament({ id: 11, name: 'Group A' });
    const parent = {
      id: 50,
      name: 'Multi RR',
      type: 'MULTI_ROUND_ROBINS',
      status: 'COMPLETED',
      createdAt: '2026-01-15T18:00:00.000Z',
      cancelled: false,
      participants: child.participants,
      matches: [],
      childTournaments: [{ ...child, groupNumber: 1 }],
    } as Tournament;
    expect(getSupportedResultsPrintModes(parent)).toEqual([
      'standard',
      'abbreviated',
    ]);
  });

  it('resolves unsupported child modes to standard', () => {
    const playoff = makePlayoffChild();
    expect(resolveChildResultsPrintMode(playoff, 'detailed')).toBe('standard');
    expect(resolveChildResultsPrintMode(playoff, 'abbreviated')).toBe('standard');
    expect(resolveChildResultsPrintMode(makeRrTournament(), 'detailed')).toBe('standard');
    expect(resolveChildResultsPrintMode(makeRrTournament(), 'abbreviated')).toBe('abbreviated');
  });
});

describe('resultsPrintUtils', () => {
  it('builds abbreviated results grid with place, rating changes, and match scores', () => {
    const tournament = makeRrTournament({
      participants: [
        {
          id: 101,
          memberId: 1,
          member: { id: 1, firstName: 'Alice', lastName: 'Alpha', rating: 1520, birthDate: null, isActive: true },
          playerRatingAtTime: 1500,
          postRatingAtTime: 1520,
          rrCompletionRating: 1520,
          rrCompletionRatingChange: 20,
        } as any,
        {
          id: 102,
          memberId: 2,
          member: { id: 2, firstName: 'Bob', lastName: 'Beta', rating: 1380, birthDate: null, isActive: true },
          playerRatingAtTime: 1400,
          postRatingAtTime: 1380,
          rrCompletionRating: 1380,
          rrCompletionRatingChange: -20,
        } as any,
      ],
    });
    const html = buildAbbreviatedStandingsTableHtml(tournament);

    expect(html).toContain('abbreviated-standings');
    expect(html).toContain('abbreviated-results-grid');
    expect(html).toContain('Pos / Player');
    expect(html).toContain('1. Alice');
    expect(html).toContain('(1520) (1500/(+20))');
    expect(html).toContain('rating-line');
    expect(html).toContain('font-size: 10px');
    expect(html).toContain('3 - 1');
    expect(html).not.toContain('Final Standings');
    expect(html).not.toContain('Sets Won');
    expect(html).not.toContain('WG');
    expect(html).not.toMatch(/>W</);
    expect(html).not.toMatch(/1\.\s*Alice[\s\S]*?rating-line[\s\S]*?<\/td>/);
  });

  it('standard RR results include abbreviated grid plus W/L/WG/LG', () => {
    const html = buildStandardRoundRobinResultsHtml(makeRrTournament());
    expect(html).toContain('standard-standings');
    expect(html).toContain('abbreviated-results-grid');
    expect(html).toContain('>WG</th>');
    expect(html).toContain('>LG</th>');
    expect(html).toContain('3 - 1');
    expect(html).not.toContain('Final Standings');
    expect(html).not.toContain('Results Matrix');
    // Summary headers (not the score cell W forfeit)
    expect(html).toContain('>W</th>');
    expect(html).toContain('>L</th>');
  });

  it('full RR builder still produces Final Standings and Results Matrix', () => {
    const html = buildFullRoundRobinResultsHtml(makeRrTournament());
    expect(html).toContain('Final Standings');
    expect(html).toContain('Results Matrix');
    expect(html).toContain('results-matrix');
    expect(html).toContain('Sets Won');
  });

  it('abbreviated basic document uses minimal header and standings only', () => {
    const html = buildBasicResultsDocumentHtml(makeRrTournament(), {
      mode: 'abbreviated',
      typeName: 'Round Robin',
    });
    expect(html).toContain('Thursday RR');
    expect(html).toContain('<strong>Date:</strong>');
    expect(html).not.toContain('Participants:');
    expect(html).not.toContain('Results Matrix');
    expect(html).toContain('abbreviated-standings');
  });

  it('standard basic document uses compact header and standard grid', () => {
    const html = buildBasicResultsDocumentHtml(makeRrTournament(), {
      mode: 'standard',
      typeName: 'Round Robin',
    });
    expect(html).toContain('standard-standings');
    expect(html).toContain('>WG</th>');
    expect(html).not.toContain('Participants:');
    expect(html).not.toContain('Final Standings');
  });

  it('abbreviated compound uses abbreviated RR child and playoff standard tables, stacked vertically', () => {
    const rrChild = makeRrTournament({ id: 11, name: 'Group A' });
    const playoffChild = makePlayoffChild();
    const parent = {
      id: 99,
      name: 'Prelim Event',
      type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
      status: 'COMPLETED',
      createdAt: '2026-01-15T18:00:00.000Z',
      cancelled: false,
      participants: [...rrChild.participants, ...playoffChild.participants],
      matches: [],
      childTournaments: [
        { ...rrChild, groupNumber: 1 },
        { ...playoffChild, groupNumber: null },
      ],
    } as Tournament;

    const html = buildCompoundResultsDocumentHtml(parent, { mode: 'abbreviated' });
    expect(html).not.toBeNull();
    expect(html!).toContain('Prelim Event');
    expect(html!).toContain('Group A');
    expect(html!).toContain('Final Playoff');
    expect(html!).toContain('abbreviated-standings');
    expect(html!).toContain('compound-results-sections');
    expect(html!).toContain('compound-results-section');
    expect(html!).toContain('final-phase');
    expect(html!).toContain('playoff-round');
    expect(html!).toContain('Cara');
    expect(html!).toContain('Dan');
    expect(html!).not.toContain('Results Matrix');
    expect(html!).not.toContain('players</span>');
    expect(html!).not.toContain('Sub-tournaments:');
  });

  it('standard compound uses standard RR grid and playoff tables', () => {
    const rrChild = makeRrTournament({ id: 11, name: 'Group A' });
    const playoffChild = makePlayoffChild();
    const parent = {
      id: 99,
      name: 'Prelim Event',
      type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
      status: 'COMPLETED',
      createdAt: '2026-01-15T18:00:00.000Z',
      cancelled: false,
      participants: [...rrChild.participants, ...playoffChild.participants],
      matches: [],
      childTournaments: [
        { ...rrChild, groupNumber: 1 },
        { ...playoffChild, groupNumber: null },
      ],
    } as Tournament;

    const html = buildCompoundResultsDocumentHtml(parent, { mode: 'standard' });
    expect(html).not.toBeNull();
    expect(html!).toContain('standard-standings');
    expect(html!).toContain('>WG</th>');
    expect(html!).toContain('playoff-round');
    expect(html!).not.toContain('Sub-tournaments:');
  });

  it('prelim+final abbreviated puts Final RR on its own row via final-phase', () => {
    const groupA = makeRrTournament({ id: 11, name: 'Group A', groupNumber: 1 } as any);
    const groupB = makeRrTournament({ id: 12, name: 'Group B', groupNumber: 2 } as any);
    const finalRr = makeRrTournament({ id: 13, name: 'Final Round Robin', groupNumber: null } as any);
    const parent = {
      id: 100,
      name: 'Prelim + Final RR',
      type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
      status: 'COMPLETED',
      createdAt: '2026-01-15T18:00:00.000Z',
      cancelled: false,
      participants: [...groupA.participants, ...groupB.participants, ...finalRr.participants],
      matches: [],
      childTournaments: [groupA, groupB, finalRr],
    } as Tournament;

    const html = buildCompoundResultsDocumentHtml(parent, { mode: 'abbreviated' });
    expect(html).not.toBeNull();
    expect(html!).toContain('Group A');
    expect(html!).toContain('Group B');
    expect(html!).toContain('Final Round Robin');
    expect(html!).toMatch(/final-phase[\s\S]*Final Round Robin/);
    expect(html!).not.toMatch(/final-phase[\s\S]*Group A/);
  });
});
