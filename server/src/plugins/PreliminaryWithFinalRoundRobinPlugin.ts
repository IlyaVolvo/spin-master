import { 
  TournamentCreationContext,
  TournamentStateChangeResult
} from './TournamentPlugin';
import { BaseCompoundTournamentPlugin } from './BaseCompoundTournamentPlugin';

export class PreliminaryWithFinalRoundRobinPlugin extends BaseCompoundTournamentPlugin {
  type = 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN';

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData } = context;
    
    const groups = additionalData?.groups || [];

    // Create main tournament
    const mainTournament = await prisma.tournament.create({
      data: {
        name,
        type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
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

  protected hasFinalPhase(): boolean {
    return true;
  }

  protected async handleFinalPhaseLogic(
    parentTournament: any,
    allChildren: any[],
    prisma: any
  ): Promise<TournamentStateChangeResult> {
    const preliminaryGroups = allChildren.filter((c: any) => c.type === 'ROUND_ROBIN' && c.groupNumber !== null);
    const finalTournament = allChildren.find((c: any) => c.type === 'ROUND_ROBIN' && c.groupNumber === null);
    
    const allPreliminariesComplete = preliminaryGroups.every((c: any) => c.status === 'COMPLETED');
    
    // If all preliminaries are done and no final exists yet, create the final round robin
    if (allPreliminariesComplete && !finalTournament) {
      // TODO: Determine top N players from each group
      return {
        shouldCreateFinalTournament: true,
        finalTournamentConfig: {
          type: 'ROUND_ROBIN',
        },
        message: 'All preliminary rounds completed. Ready to create final round robin.',
      };
    }
    
    // If final exists and is complete, mark parent as complete
    if (finalTournament && finalTournament.status === 'COMPLETED') {
      return { shouldMarkComplete: true };
    }
    
    return {};
  }
}
