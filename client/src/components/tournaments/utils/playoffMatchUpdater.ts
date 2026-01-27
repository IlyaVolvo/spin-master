import { createMatchUpdater, MatchData, MatchUpdateCallbacks } from './matchUpdater';
import api from '../../../utils/api';

export interface PlayoffMatchUpdateCallbacks extends MatchUpdateCallbacks {
  onBracketUpdate?: () => void;
}

/**
 * Playoff-specific match updater that handles both basic match updates and bracket match updates
 */
export class PlayoffMatchUpdater {
  private basicUpdater: ReturnType<typeof createMatchUpdater>;

  constructor(private tournamentId: number) {
    this.basicUpdater = createMatchUpdater(tournamentId);
  }

  /**
   * Create a new match and update bracket match if needed
   */
  async createMatch(
    matchData: MatchData, 
    bracketMatchId?: number,
    callbacks: PlayoffMatchUpdateCallbacks = {}
  ): Promise<any> {
    const savedMatch = await this.basicUpdater.createMatch(matchData, callbacks);

    // If this is a bracket match, update the bracket match with the new match ID
    if (bracketMatchId && savedMatch?.id) {
      try {
        await api.patch(`/tournaments/${this.tournamentId}/bracket-matches/${bracketMatchId}`, {
          matchId: savedMatch.id
        });
        
        callbacks.onBracketUpdate?.();
      } catch (err: unknown) {
        console.error('Failed to update bracket match:', err);
        // Don't fail the whole operation if bracket update fails
      }
    }

    return savedMatch;
  }

  /**
   * Update an existing match
   */
  async updateMatch(
    matchId: number, 
    matchData: MatchData, 
    callbacks: PlayoffMatchUpdateCallbacks = {}
  ): Promise<any> {
    return this.basicUpdater.updateMatch(matchId, matchData, callbacks);
  }

  /**
   * Delete/clear a match and update bracket match if needed
   */
  async deleteMatch(
    matchId: number, 
    bracketMatchId?: number,
    callbacks: PlayoffMatchUpdateCallbacks = {}
  ): Promise<void> {
    await this.basicUpdater.deleteMatch(matchId, callbacks);

    // If this is a bracket match, clear the match ID from the bracket match
    if (bracketMatchId) {
      try {
        await api.patch(`/tournaments/${this.tournamentId}/bracket-matches/${bracketMatchId}`, {
          matchId: null
        });
        
        callbacks.onBracketUpdate?.();
      } catch (err: unknown) {
        console.error('Failed to clear bracket match:', err);
        // Don't fail the whole operation if bracket update fails
      }
    }
  }
}

/**
 * Create a playoff match updater instance for a tournament
 */
export function createPlayoffMatchUpdater(tournamentId: number): PlayoffMatchUpdater {
  return new PlayoffMatchUpdater(tournamentId);
}
