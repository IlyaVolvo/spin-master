jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn(),
  })),
}));

jest.mock('../../src/plugins/TournamentPluginRegistry', () => ({
  tournamentPluginRegistry: {
    get: jest.fn(),
  },
}));

import { completeChildTournamentWithRatings } from '../../scripts/generateTournament';
import { tournamentPluginRegistry } from '../../src/plugins/TournamentPluginRegistry';

describe('generateTournament script - child completion rating flow', () => {
  it('Prelim+Playoff: completing a preliminary RR child runs completion hook and changes ratings', async () => {
    const childId = 501;

    const childTournament: any = {
      id: childId,
      type: 'ROUND_ROBIN',
      status: 'ACTIVE',
      participants: [
        { memberId: 11, playerRatingAtTime: 1400, postRatingAtTime: null, member: { id: 11 } },
        { memberId: 12, playerRatingAtTime: 1200, postRatingAtTime: null, member: { id: 12 } },
      ],
      matches: [
        { id: 9001, member1Id: 11, member2Id: 12, winnerId: 12, player1Sets: 2, player2Sets: 3 },
      ],
      childTournaments: [],
      bracketMatches: [],
    };

    const mockPrisma: any = {
      tournament: {
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          if (where.id !== childId) throw new Error('Unexpected child id');
          childTournament.status = data.status;
          childTournament.recordedAt = data.recordedAt;
          return childTournament;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id !== childId) return null;
          return childTournament;
        }),
      },
    };

    const completionHook = jest.fn().mockImplementation(async ({ tournament }: any) => {
      // Simulate tournament-level RR rating history effect.
      tournament.participants.forEach((p: any) => {
        p.postRatingAtTime = (p.playerRatingAtTime ?? 0) + 8;
      });
    });

    (tournamentPluginRegistry.get as jest.Mock).mockReturnValue({
      onTournamentCompletionRatingCalculation: completionHook,
    });

    await completeChildTournamentWithRatings(childId, 'ROUND_ROBIN', mockPrisma);

    expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
      where: { id: childId },
      data: {
        status: 'COMPLETED',
        recordedAt: expect.any(Date),
      },
    });

    expect(completionHook).toHaveBeenCalledTimes(1);

    const ratingsChanged = childTournament.participants.every(
      (p: any) => p.postRatingAtTime !== null && p.postRatingAtTime !== p.playerRatingAtTime,
    );
    expect(ratingsChanged).toBe(true);
  });
});
