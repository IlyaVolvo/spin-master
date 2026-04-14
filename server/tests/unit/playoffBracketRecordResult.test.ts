/**
 * recordPlayoffBracketMatchResult — validation and create/link path
 * (advanceWinner uses the service Prisma client; success-path integration is covered elsewhere.)
 */
import {
  recordPlayoffBracketMatchResult,
  PlayoffBracketResultError,
} from '../../src/services/playoffBracketService';

describe('recordPlayoffBracketMatchResult', () => {
  function makePrisma(overrides: Partial<{
    bracketMatch: any;
  }> = {}) {
    const bracketMatch = overrides.bracketMatch !== undefined ? overrides.bracketMatch : null;
    return {
      bracketMatch: {
        findUnique: jest.fn().mockResolvedValue(bracketMatch),
        update: jest.fn().mockResolvedValue({}),
      },
      match: {
        create: jest.fn().mockResolvedValue({ id: 1, member1Id: 1, member2Id: 2 }),
      },
    };
  }

  it('throws 404 when bracket row is missing', async () => {
    const prisma = makePrisma({ bracketMatch: null });
    await expect(
      recordPlayoffBracketMatchResult(prisma as any, {
        tournamentId: 1,
        bracketMatchId: 99,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
      })
    ).rejects.toMatchObject({ message: 'Bracket match not found', statusCode: 404 });
  });

  it('throws when bracket is for another tournament', async () => {
    const prisma = makePrisma({
      bracketMatch: {
        id: 1,
        tournamentId: 2,
        member1Id: 1,
        member2Id: 2,
        match: null,
        tournament: { status: 'ACTIVE' },
      },
    });
    await expect(
      recordPlayoffBracketMatchResult(prisma as any, {
        tournamentId: 1,
        bracketMatchId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
      })
    ).rejects.toBeInstanceOf(PlayoffBracketResultError);
  });

  it('throws when tournament is not active', async () => {
    const prisma = makePrisma({
      bracketMatch: {
        id: 1,
        tournamentId: 1,
        member1Id: 1,
        member2Id: 2,
        match: null,
        tournament: { status: 'COMPLETED' },
      },
    });
    await expect(
      recordPlayoffBracketMatchResult(prisma as any, {
        tournamentId: 1,
        bracketMatchId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
      })
    ).rejects.toMatchObject({ message: 'Tournament is not active' });
  });

  it('throws when member2Id is null (opponent not yet determined)', async () => {
    const prisma = makePrisma({
      bracketMatch: {
        id: 1,
        tournamentId: 1,
        member1Id: 1,
        member2Id: null,
        match: null,
        tournament: { status: 'ACTIVE' },
      },
    });
    await expect(
      recordPlayoffBracketMatchResult(prisma as any, {
        tournamentId: 1,
        bracketMatchId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
      })
    ).rejects.toMatchObject({
      message: 'Both players must be determined before entering a result',
    });
  });

  it('throws when a result already exists', async () => {
    const prisma = makePrisma({
      bracketMatch: {
        id: 1,
        tournamentId: 1,
        member1Id: 1,
        member2Id: 2,
        match: { id: 50 },
        tournament: { status: 'ACTIVE' },
      },
    });
    await expect(
      recordPlayoffBracketMatchResult(prisma as any, {
        tournamentId: 1,
        bracketMatchId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
      })
    ).rejects.toMatchObject({
      message: 'Match already has a result. Clear it first to re-enter.',
    });
    expect(prisma.match.create).not.toHaveBeenCalled();
  });
});
