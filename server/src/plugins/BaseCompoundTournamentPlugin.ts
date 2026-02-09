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

  async enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, prisma } = context;
    
    // For compound tournaments, enrich child tournaments using their respective plugins
    if (tournament.childTournaments) {
      const enrichedChildren = await Promise.all(
        tournament.childTournaments.map(async (child: any) => {
          const childPlugin = tournamentPluginRegistry.get(child.type);
          return await childPlugin.enrichActiveTournament({ tournament: child, prisma });
        })
      );
      
      return {
        ...tournament,
        childTournaments: enrichedChildren,
        bracketMatches: [],
      };
    }
    
    return { ...tournament, bracketMatches: [] };
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

    // Enrich child tournaments
    if (tournament.childTournaments) {
      const enrichedChildren = await Promise.all(
        tournament.childTournaments.map(async (child: any) => {
          const childPlugin = tournamentPluginRegistry.get(child.type);
          return await childPlugin.enrichCompletedTournament({ 
            tournament: child, 
            postRatingMap, 
            prisma 
          });
        })
      );
      
      return {
        ...tournament,
        participants: participantsWithPostRating,
        childTournaments: enrichedChildren,
        bracketMatches: [],
      };
    }

    return {
      ...tournament,
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

  canDelete(tournament: any): boolean {
    // Can delete if no child tournaments have matches
    if (!tournament.childTournaments) return true;
    return tournament.childTournaments.every((child: any) => 
      !child.matches || child.matches.length === 0
    );
  }

  canCancel(tournament: any): boolean {
    return true;
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
        parentTournamentId,
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
