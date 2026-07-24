/**
 * Compatibility facade over universal match score writes.
 * Prefer importing from `utils/matchScoreSubmit` for new code.
 * Tournament-type behavior belongs in plugins, not here.
 */
import {
  buildMatchScorePayload,
  clearTournamentMatchScore,
  createTournamentMatchScore,
  type MatchScoreData,
  type MatchScorePins,
  type MatchScoreWriteCallbacks,
  upsertTournamentMatchScore,
  validateMatchScoreData,
} from '../../../utils/matchScoreSubmit';

export type MatchData = MatchScoreData;
export type { MatchScorePins };
export type MatchUpdateCallbacks = MatchScoreWriteCallbacks;

export function buildMatchApiData(matchData: MatchData, pins?: MatchScorePins): Record<string, unknown> {
  return buildMatchScorePayload(matchData, pins);
}

/**
 * Thin wrapper around universal score writes for callers that still use a class API.
 */
export class MatchUpdater {
  constructor(private tournamentId: number) {}

  async createMatch(
    matchData: MatchData,
    callbacks: MatchUpdateCallbacks = {},
    pins?: MatchScorePins
  ): Promise<unknown> {
    return createTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchData,
      pins,
      callbacks,
    });
  }

  async updateMatch(
    matchId: number,
    matchData: MatchData,
    callbacks: MatchUpdateCallbacks = {},
    pins?: MatchScorePins
  ): Promise<unknown> {
    return upsertTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId,
      matchData,
      pins,
      callbacks,
    });
  }

  async deleteMatch(matchId: number, callbacks: MatchUpdateCallbacks = {}): Promise<void> {
    return clearTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId,
      callbacks,
    });
  }
}

export function createMatchUpdater(tournamentId: number): MatchUpdater {
  return new MatchUpdater(tournamentId);
}

export { validateMatchScoreData };
