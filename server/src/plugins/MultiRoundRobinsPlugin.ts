import { 
  TournamentCreationContext,
  TournamentStateChangeResult
} from './TournamentPlugin';
import { BaseCompoundTournamentPlugin } from './BaseCompoundTournamentPlugin';

export class MultiRoundRobinsPlugin extends BaseCompoundTournamentPlugin {
  type = 'MULTI_ROUND_ROBINS';

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData } = context;
    
    const groups = additionalData?.groups || [];

    // Create main tournament
    const mainTournament = await prisma.tournament.create({
      data: {
        name,
        type: 'MULTI_ROUND_ROBINS',
        status: 'ACTIVE',
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find(p => p.id === memberId);
            return {
              memberId,
              playerRatingAtTime: player?.rating || null,
            };
          }),
        },
      },
    });

    // Create child Round Robin tournaments for each group using base class helper
    await Promise.all(
      groups.map(async (group: number[], index: number) => {
        const groupPlayers = players.filter(p => group.includes(p.id));
        const groupName = `${name} - Group ${index + 1}`;
        
        return await this.createChildTournament(
          'ROUND_ROBIN',
          groupName,
          group,
          groupPlayers,
          mainTournament.id,
          index + 1,
          prisma
        );
      })
    );

    // Reload main tournament with all data
    return await prisma.tournament.findUnique({
      where: { id: mainTournament.id },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        childTournaments: {
          include: {
            participants: {
              include: {
                member: true,
              },
            },
            matches: true,
          },
        },
      },
    });
  }

  protected async recreateChildren(context: {
    tournamentId: number;
    name: string;
    participantIds: number[];
    players: any[];
    prisma: any;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    const { tournamentId, name, players, prisma, additionalData } = context;
    const groups: number[][] = additionalData?.groups || [];

    // Re-create child Round Robin tournaments for each group
    await Promise.all(
      groups.map(async (group: number[], index: number) => {
        const groupPlayers = players.filter((p: any) => group.includes(p.id));
        const groupName = `${name} - Group ${index + 1}`;

        return await this.createChildTournament(
          'ROUND_ROBIN',
          groupName,
          group,
          groupPlayers,
          tournamentId,
          index + 1,
          prisma
        );
      })
    );
  }

  protected hasFinalPhase(): boolean {
    return false; // No final phase, just parallel groups
  }

  protected async handleFinalPhaseLogic(
    parentTournament: any,
    allChildren: any[],
    prisma: any
  ): Promise<TournamentStateChangeResult> {
    // This should never be called since hasFinalPhase returns false
    // But we need to implement it for the abstract class
    return {};
  }
}
