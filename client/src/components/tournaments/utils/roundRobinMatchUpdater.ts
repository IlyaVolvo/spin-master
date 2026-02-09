import { MatchData, MatchUpdateCallbacks } from './matchUpdater';
import api from '../../../utils/api';

export interface RoundRobinMatchUpdateCallbacks extends MatchUpdateCallbacks {
  onTournamentComplete?: () => void;
}

/**
 * Round Robin-specific match updater that handles matrix-specific logic
 * Uses round robin-specific API endpoints for proper tournament management
 */
export class RoundRobinMatchUpdater {
  constructor(private tournamentId: number) {}

  /**
   * Validate match data before saving
   */
  private validateMatchData(matchData: MatchData): string | null {
    // Validate forfeit: only one player can forfeit
    if (matchData.player1Forfeit && matchData.player2Forfeit) {
      return 'Only one player can forfeit';
    }

    // Validate scores: cannot be equal (including 0:0) unless it's a forfeit
    if (!matchData.player1Forfeit && !matchData.player2Forfeit) {
      const player1Sets = matchData.player1Sets || 0;
      const player2Sets = matchData.player2Sets || 0;
      // Disallow equal scores including 0:0
      if (player1Sets === player2Sets) {
        return 'Scores cannot be equal. One player must win.';
      }
    }

    return null;
  }

  /**
   * Create a new match for round robin tournament
   */
  async createMatch(
    matchData: MatchData, 
    callbacks: RoundRobinMatchUpdateCallbacks = {}
  ): Promise<any> {
    const validationError = this.validateMatchData(matchData);
    if (validationError) {
      callbacks.onError?.(validationError);
      throw new Error(validationError);
    }

    try {
      const apiData: any = {
        member1Id: matchData.member1Id,
        member2Id: matchData.member2Id,
      };

      // If forfeit, send forfeit flags; otherwise send sets
      if (matchData.player1Forfeit || matchData.player2Forfeit) {
        apiData.player1Forfeit = matchData.player1Forfeit || false;
        apiData.player2Forfeit = matchData.player2Forfeit || false;
      } else {
        apiData.player1Sets = matchData.player1Sets || 0;
        apiData.player2Sets = matchData.player2Sets || 0;
        apiData.player1Forfeit = false;
        apiData.player2Forfeit = false;
      }

      // For round robin tournaments, use the dedicated round robin endpoint
      // Use matchId = 0 for new matches (server will create with new ID)
      const response = await api.patch(`/tournaments/${this.tournamentId}/round-robin-matches/0`, apiData);
      const savedMatch = response.data;
      
      callbacks.onSuccess?.('Match result added successfully');
      callbacks.onMatchUpdate?.(savedMatch);
      
      // Update tournament data
      await this.refreshTournament(callbacks.onTournamentUpdate);
      
      // Check if tournament was completed
      if (savedMatch.tournamentCompleted) {
        callbacks.onTournamentComplete?.();
      }
      
      return savedMatch;
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const errorMessage = apiError || 'Failed to create match result';
      callbacks.onError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Update an existing match
   */
  async updateMatch(
    matchId: number, 
    matchData: MatchData, 
    callbacks: RoundRobinMatchUpdateCallbacks = {}
  ): Promise<any> {
    const validationError = this.validateMatchData(matchData);
    if (validationError) {
      callbacks.onError?.(validationError);
      throw new Error(validationError);
    }

    try {
      const apiData: any = {
        member1Id: matchData.member1Id,
        member2Id: matchData.member2Id,
      };

      // If forfeit, send forfeit flags; otherwise send sets
      if (matchData.player1Forfeit || matchData.player2Forfeit) {
        apiData.player1Forfeit = matchData.player1Forfeit || false;
        apiData.player2Forfeit = matchData.player2Forfeit || false;
      } else {
        apiData.player1Sets = matchData.player1Sets || 0;
        apiData.player2Sets = matchData.player2Sets || 0;
        apiData.player1Forfeit = false;
        apiData.player2Forfeit = false;
      }

      const response = await api.patch(`/tournaments/${this.tournamentId}/round-robin-matches/${matchId}`, apiData);
      const savedMatch = response.data;
      
      callbacks.onSuccess?.('Match result updated successfully');
      callbacks.onMatchUpdate?.(savedMatch);
      
      // Update tournament data
      await this.refreshTournament(callbacks.onTournamentUpdate);
      
      // Check if tournament was completed
      if (savedMatch.tournamentCompleted) {
        callbacks.onTournamentComplete?.();
      }
      
      return savedMatch;
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const errorMessage = apiError || 'Failed to update match result';
      callbacks.onError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Delete/clear a match
   */
  async deleteMatch(
    matchId: number, 
    callbacks: RoundRobinMatchUpdateCallbacks = {}
  ): Promise<void> {
    try {
      await api.delete(`/tournaments/${this.tournamentId}/matches/${matchId}`);
      
      callbacks.onSuccess?.('Match result cleared successfully');
      callbacks.onMatchUpdate?.({ cleared: true, matchId });
      
      // Update tournament data
      await this.refreshTournament(callbacks.onTournamentUpdate);
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const errorMessage = apiError || 'Failed to clear match result';
      callbacks.onError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Refresh tournament data from server
   */
  private async refreshTournament(onTournamentUpdate?: (tournament: any) => void): Promise<void> {
    if (onTournamentUpdate) {
      try {
        const response = await api.get(`/tournaments/${this.tournamentId}`);
        onTournamentUpdate(response.data);
      } catch (err) {
        console.error('Failed to refresh tournament:', err);
      }
    }
  }
}

/**
 * Create a round robin match updater instance for a tournament
 */
export function createRoundRobinMatchUpdater(tournamentId: number): RoundRobinMatchUpdater {
  return new RoundRobinMatchUpdater(tournamentId);
}
