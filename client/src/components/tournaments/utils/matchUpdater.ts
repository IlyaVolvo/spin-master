import api from '../../../utils/api';

export interface MatchData {
  member1Id: number;
  member2Id: number | null;
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
}

export interface MatchUpdateCallbacks {
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
  onTournamentUpdate?: (tournament: any) => void;
  onMatchUpdate?: (match: any) => void;
}

/**
 * Standard match update functionality for all tournament types
 */
export class MatchUpdater {
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
   * Create a new match
   */
  async createMatch(matchData: MatchData, callbacks: MatchUpdateCallbacks = {}): Promise<any> {
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

      const response = await api.post(`/tournaments/${this.tournamentId}/matches`, apiData);
      const savedMatch = response.data;
      
      callbacks.onSuccess?.('Match result added successfully');
      callbacks.onMatchUpdate?.(savedMatch);
      
      // Update tournament data
      await this.refreshTournament(callbacks.onTournamentUpdate);
      
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
  async updateMatch(matchId: number, matchData: MatchData, callbacks: MatchUpdateCallbacks = {}): Promise<any> {
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

      const response = await api.patch(`/tournaments/${this.tournamentId}/matches/${matchId}`, apiData);
      const savedMatch = response.data;
      
      callbacks.onSuccess?.('Match result updated successfully');
      callbacks.onMatchUpdate?.(savedMatch);
      
      // Update tournament data
      await this.refreshTournament(callbacks.onTournamentUpdate);
      
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
  async deleteMatch(matchId: number, callbacks: MatchUpdateCallbacks = {}): Promise<void> {
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
 * Create a match updater instance for a tournament
 */
export function createMatchUpdater(tournamentId: number): MatchUpdater {
  return new MatchUpdater(tournamentId);
}
