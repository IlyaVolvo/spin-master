import { 
  TournamentPlugin, 
  TournamentEnrichmentContext, 
  EnrichedTournament, 
  TournamentCreationContext,
  MatchCompletedEvent,
  ChildTournamentCompletedEvent,
  TournamentStateChangeResult
} from './TournamentPlugin';
import { tournamentPluginRegistry } from './TournamentPluginRegistry';

export abstract class BaseCompoundTournamentPlugin implements TournamentPlugin {
  abstract type: string;
  isBasic = false;

  abstract createTournament(context: TournamentCreationContext): Promise<any>;

  // Compound tournaments cannot be modified once created
  canModify(tournament: any): boolean {
    return false;
  }

  async enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, prisma } = context;
    
    // Fetch child tournaments if not already loaded
    let children = tournament.childTournaments;
    if (!children) {
      children = await prisma.tournament.findMany({
        where: { parentTournamentId: tournament.id },
        include: {
          participants: { include: { member: true } },
          matches: true,
          bracketMatches: { include: { match: true } },
        },
      });
    }

    // Allow subclasses to enrich with type-specific config
    let enrichedTournament = await this.enrichTournamentConfig(tournament, prisma);

    // For compound tournaments, enrich child tournaments using their respective plugins
    if (children && children.length > 0) {
      const enrichedChildren = await Promise.all(
        children.map(async (child: any) => {
          const childPlugin = tournamentPluginRegistry.get(child.type);
          return await childPlugin.enrichActiveTournament({ tournament: child, prisma });
        })
      );
      
      return {
        ...enrichedTournament,
        childTournaments: enrichedChildren,
        bracketMatches: [],
      };
    }
    
    return { ...enrichedTournament, bracketMatches: [] };
  }

  async enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, postRatingMap, prisma } = context;
    
    const participantsWithPostRating = tournament.participants.map((participant: any) => {
      const key = `${tournament.id}-${participant.memberId}`;
      const postRating = postRatingMap?.get(key) ?? participant.member.rating;
      return {
        ...participant,
        postRatingAtTime: postRating,
      };
    });

    // Fetch child tournaments if not already loaded
    let children = tournament.childTournaments;
    if (!children) {
      children = await prisma.tournament.findMany({
        where: { parentTournamentId: tournament.id },
        include: {
          participants: { include: { member: true } },
          matches: true,
          bracketMatches: { include: { match: true } },
        },
      });
    }

    // Allow subclasses to enrich with type-specific config
    let enrichedTournament = await this.enrichTournamentConfig(tournament, prisma);

    // Enrich child tournaments
    if (children && children.length > 0) {
      const enrichedChildren = await Promise.all(
        children.map(async (child: any) => {
          const childPlugin = tournamentPluginRegistry.get(child.type);
          return await childPlugin.enrichCompletedTournament({ 
            tournament: child, 
            postRatingMap, 
            prisma 
          });
        })
      );
      
      return {
        ...enrichedTournament,
        participants: participantsWithPostRating,
        childTournaments: enrichedChildren,
        bracketMatches: [],
      };
    }

    return {
      ...enrichedTournament,
      participants: participantsWithPostRating,
      bracketMatches: [],
    };
  }

  isComplete(tournament: any): boolean {
    // Compound tournament is complete when all child tournaments are complete
    if (!tournament.childTournaments || tournament.childTournaments.length === 0) {
      return false;
    }
    
    return tournament.childTournaments.every((child: any) => 
      child.status === 'COMPLETED'
    );
  }

  shouldRecalculateRatings(tournament: any): boolean {
    // Compound tournaments don't recalculate ratings themselves
    // Child tournaments handle their own rating calculations
    return false;
  }

  canCancel(tournament: any): boolean {
    return true;
  }

  matchesRemaining(tournament: any): number {
    // Compound tournaments delegate to child tournaments
    // Sum up remaining matches across all active children
    if (!tournament.childTournaments || tournament.childTournaments.length === 0) {
      return 0;
    }
    return tournament.childTournaments.reduce((total: number, child: any) => {
      if (child.status === 'COMPLETED') return total;
      const childPlugin = tournamentPluginRegistry.get(child.type);
      return total + childPlugin.matchesRemaining(child);
    }, 0);
  }

  async onMatchCompleted(event: MatchCompletedEvent): Promise<TournamentStateChangeResult> {
    // Compound tournaments don't directly handle match completion
    // Matches belong to child tournaments
    return {};
  }

  async onChildTournamentCompleted(event: ChildTournamentCompletedEvent): Promise<TournamentStateChangeResult> {
    const { parentTournament, childTournament, prisma } = event;
    
    // Fetch all child tournaments to check status
    const allChildren = await prisma.tournament.findMany({
      where: { parentTournamentId: parentTournament.id },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    // Check if this compound tournament has a final tournament phase
    const hasFinalPhase = this.hasFinalPhase();
    
    if (hasFinalPhase) {
      return await this.handleFinalPhaseLogic(parentTournament, allChildren, prisma);
    } else {
      // Simple compound tournament - just check if all children are complete
      const allComplete = allChildren.every((c: any) => c.status === 'COMPLETED');
      
      if (allComplete) {
        return { shouldMarkComplete: true };
      }
    }
    
    return {};
  }

  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    // Compound tournaments aggregate schedules from child tournaments
    const { tournament, prisma } = context;
    const childSchedules = [];
    if (tournament.childTournaments) {
      for (const child of tournament.childTournaments) {
        const childPlugin = tournamentPluginRegistry.get(child.type);
        const schedule = await childPlugin.getSchedule({ tournament: child, prisma });
        childSchedules.push({ tournamentId: child.id, name: child.name, ...schedule });
      }
    }
    return { childSchedules };
  }

  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    // Compound tournaments aggregate printable views from child tournaments
    const { tournament, prisma } = context;
    const childViews = [];
    if (tournament.childTournaments) {
      for (const child of tournament.childTournaments) {
        const childPlugin = tournamentPluginRegistry.get(child.type);
        const view = await childPlugin.getPrintableView({ tournament: child, prisma });
        childViews.push({ tournamentId: child.id, name: child.name, ...view });
      }
    }
    return { childViews };
  }

  async updateMatch(context: {
    matchId: number;
    tournamentId: number;
    member1Id?: number;
    member2Id?: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
    userId?: number;
  }): Promise<{
    match: any;
    tournamentStateChange?: {
      shouldMarkComplete?: boolean;
      message?: string;
    };
  }> {
    // Compound tournaments don't own matches directly
    // Matches belong to child tournaments and are updated through their own plugins
    throw new Error('Compound tournaments do not handle matches directly. Update the child tournament match instead.');
  }

  // Hook for subclasses to enrich tournament with type-specific config
  // Default is a no-op that returns the tournament as-is
  protected async enrichTournamentConfig(tournament: any, prisma: any): Promise<any> {
    return { ...tournament };
  }

  // Abstract method for subclasses to indicate if they have a final phase
  protected abstract hasFinalPhase(): boolean;

  // Abstract method for subclasses to implement final phase logic
  protected abstract handleFinalPhaseLogic(
    parentTournament: any,
    allChildren: any[],
    prisma: any
  ): Promise<TournamentStateChangeResult>;

  // Helper method to create child tournament using appropriate plugin
  protected async createChildTournament(
    type: string,
    name: string,
    participantIds: number[],
    players: any[],
    parentTournamentId: number,
    groupNumber: number | null,
    prisma: any
  ): Promise<any> {
    const childPlugin = tournamentPluginRegistry.get(type);
    
    const childTournament = await childPlugin.createTournament({
      name,
      participantIds,
      players,
      prisma,
    });

    // Update with parent tournament ID and group number
    return await prisma.tournament.update({
      where: { id: childTournament.id },
      data: {
        parentTournament: { connect: { id: parentTournamentId } },
        groupNumber,
      },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });
  }
}
