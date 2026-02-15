import { Tournament, TournamentParticipant, Match } from '@prisma/client';

export interface EnrichedTournament extends Record<string, any> {
  id: number;
  type: string;
  status: string;
  participants: TournamentParticipant[];
  matches: Match[];
  [key: string]: any;
}

export interface TournamentEnrichmentContext {
  tournament: any;
  postRatingMap?: Map<string, number | null>;
  prisma: any;
}

export interface TournamentCreationContext {
  name: string;
  participantIds: number[];
  players: any[];
  prisma: any;
  bracketPositions?: number[];
  roundRobinSize?: number;
  groups?: number[][];
  additionalData?: Record<string, any>;
}

export interface TournamentCompletionContext {
  tournament: any;
  prisma: any;
}

export interface TournamentCancellationContext {
  tournament: any;
  prisma: any;
}

export interface TournamentDeletionContext {
  tournament: any;
  prisma: any;
}

export interface MatchCompletedEvent {
  tournament: any;
  match: any;
  winnerId: number;
  bracketMatchId?: number | null;
  prisma: any;
}

export interface ChildTournamentCompletedEvent {
  parentTournament: any;
  childTournament: any;
  prisma: any;
}

export interface TournamentStateChangeResult {
  shouldMarkComplete?: boolean;
  shouldCreateFinalTournament?: boolean;
  finalTournamentConfig?: any;
  tournamentCompleted?: boolean;
  message?: string;
}

export interface TournamentPlugin {
  type: string;
  isBasic: boolean;
  
  // Data enrichment methods
  enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament>;
  enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament>;
  
  // Creation method
  createTournament(context: TournamentCreationContext): Promise<Tournament>;
  
  // Query methods - plugins answer questions about their state
  isComplete(tournament: any): boolean;
  canDelete(tournament: any): boolean;
  canCancel(tournament: any): boolean;
  
  // Returns the number of matches remaining before the tournament is complete
  // When this reaches 0, the tournament should be marked as complete
  matchesRemaining(tournament: any): number;
  
  // Schedule and print - required for all tournament types
  // Returns match schedule in a standardized format
  // For compound tournaments, aggregates schedules from child tournaments
  getSchedule(context: { tournament: any; prisma: any }): Promise<any>;
  
  // Returns printable view of tournament (for reports, exports, etc.)
  // Format depends on tournament type (bracket view, standings table, etc.)
  getPrintableView(context: { tournament: any; prisma: any }): Promise<any>;
  
  // Event notification methods - plugins are notified of events and can react
  onMatchCompleted?(event: MatchCompletedEvent): Promise<TournamentStateChangeResult>;
  onChildTournamentCompleted?(event: ChildTournamentCompletedEvent): Promise<TournamentStateChangeResult>;
  
  // Rating calculation - all plugins receive these calls, but can choose to do nothing
  // Called when a match is completed - plugin decides if/how to calculate ratings
  onMatchRatingCalculation?(context: { tournament: any; match: any; winnerId: number; prisma: any }): Promise<void>;
  // Called when tournament is completed - plugin decides if/how to calculate final ratings
  onTournamentCompletionRatingCalculation?(context: { tournament: any; prisma: any }): Promise<void>;
  
  // Match resolution - some tournament typemay need to map speicfu==ic information during the tournament
  // Returns resolved match data or null if match cannot be resolved
  resolveMatchId?(context: {
    matchId: number;
    tournamentId: number;
    prisma: any;
  }): Promise<{
    match: any;
    bracketMatchId?: number;
    isBracketMatchId?: boolean;
  } | null>;
  
  // Match update - plugins handle match creation/update with type-specific logic
  // matchId can be: a real Match ID, a bracketMatchId (for playoffs), or 0 (for new match creation)
  // member1Id/member2Id are provided for match creation or when the caller knows the players
  // Returns the updated/created match and any tournament state changes
  updateMatch(context: {
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
  }>;
  
  // Generic plugin-specific request handler
  // Allows plugins to define their own custom endpoints
  handlePluginRequest?(context: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    resource: string;
    tournamentId: number;
    data?: any;
    query?: any;
    prisma: any;
    userId?: number;
  }): Promise<any>;
  
  // Cancellation/Deletion handlers
  onCancel?(context: TournamentCancellationContext): Promise<{ shouldKeepMatches: boolean; message?: string }>;
  onDelete?(context: TournamentDeletionContext): Promise<void>;
}
