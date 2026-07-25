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
  winnerId: number | null;
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

export interface CorrectionEligibility {
  allowed: boolean;
  reason?: string;
  correctableMatchIds: number[];
}

export interface TournamentPlugin {
  type: string;
  isBasic: boolean;

  /**
   * Create/modify rule checks (player counts, bracket size, rounds, group size).
   * Returns an error message or null when valid.
   */
  validateCreateRules?(participantCount: number, data: any): string | null;

  /**
   * Completed score correction: rebuild ratings as one tournament-level batch
   * (e.g. round robin) instead of replaying each match.
   */
  scoreCorrectionUsesBatchTournamentRatings?: boolean;

  /**
   * When replaying per-match ratings after correction, seed from current member
   * ratings (playoff) rather than historical enrollment ratings.
   */
  scoreCorrectionUsesCurrentMemberRatings?: boolean;

  /**
   * Prefer TOURNAMENT_COMPLETED rating_history over post-tournament cache when
   * resolving display ratings after completion.
   */
  preferCompletionRatingHistory?: boolean;

  /**
   * Treat bracketMatch-linked scored matches as evidence the event has started
   * (used when gating preliminary corrections once a final phase begins).
   */
  checksBracketMatchesForStarted?: boolean;

  /** Compound parents: identify the final-phase child among siblings */
  isFinalPhaseChild?(child: any): boolean;

  /** Compound parents: identify a preliminary-group child among siblings */
  isPreliminaryGroupChild?(child: any): boolean;
  
  // Data enrichment methods
  enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament>;
  enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament>;
  
  // Creation method
  createTournament(context: TournamentCreationContext): Promise<Tournament>;
  
  // Modification method - for tournaments that haven't started yet
  modifyTournament?(context: {
    tournamentId: number;
    name: string;
    participantIds: number[];
    players: any[];
    prisma: any;
    additionalData?: Record<string, any>;
  }): Promise<Tournament>;
  
  // Query methods - plugins answer questions about their state
  isComplete(tournament: any): boolean;
  canCancel(tournament: any): boolean;
  canModify(tournament: any): boolean;

  /** Post-completion score correction eligibility for organizers */
  getCorrectionEligibility?(context: {
    tournament: any;
    prisma: any;
  }): Promise<CorrectionEligibility>;

  /** Throws if a completed-tournament match cannot be corrected */
  assertMatchCorrectable?(context: {
    tournament: any;
    match: any;
    prisma: any;
  }): Promise<void>;
  
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
    skipRatingCalculation?: boolean;
    tournamentStateChange?: {
      shouldMarkComplete?: boolean;
      message?: string;
    };
  }>;

  cancelMatch?(context: {
    matchId: number;
    tournamentId: number;
    prisma: any;
    userId?: number;
  }): Promise<{ match?: any; message?: string }>;
  
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
