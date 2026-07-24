/**
 * Round-robin score writes: universal scoring + RR-specific completion hook.
 * Score rules/endpoints live in matchScoreSubmit; this only wires RR callbacks.
 */
import {
  clearTournamentMatchScore,
  type MatchScoreData,
  type MatchScorePins,
  type MatchScoreWriteCallbacks,
  upsertTournamentMatchScore,
} from '../../../utils/matchScoreSubmit';

export interface RoundRobinMatchUpdateCallbacks extends MatchScoreWriteCallbacks {
  onTournamentComplete?: () => void;
}

function maybeNotifyComplete(
  saved: unknown,
  callbacks: RoundRobinMatchUpdateCallbacks
): void {
  if (
    saved &&
    typeof saved === 'object' &&
    (saved as { tournamentCompleted?: boolean }).tournamentCompleted
  ) {
    callbacks.onTournamentComplete?.();
  }
}

export class RoundRobinMatchUpdater {
  constructor(private tournamentId: number) {}

  async createMatch(
    matchData: MatchScoreData,
    callbacks: RoundRobinMatchUpdateCallbacks = {},
    pins?: MatchScorePins
  ): Promise<unknown> {
    const saved = await upsertTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId: 0,
      matchData,
      pins,
      callbacks,
    });
    maybeNotifyComplete(saved, callbacks);
    return saved;
  }

  async updateMatch(
    matchId: number,
    matchData: MatchScoreData,
    callbacks: RoundRobinMatchUpdateCallbacks = {},
    pins?: MatchScorePins
  ): Promise<unknown> {
    const saved = await upsertTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId,
      matchData,
      pins,
      callbacks,
    });
    maybeNotifyComplete(saved, callbacks);
    return saved;
  }

  async deleteMatch(
    matchId: number,
    callbacks: RoundRobinMatchUpdateCallbacks = {}
  ): Promise<void> {
    return clearTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId,
      callbacks,
    });
  }
}

export function createRoundRobinMatchUpdater(tournamentId: number): RoundRobinMatchUpdater {
  return new RoundRobinMatchUpdater(tournamentId);
}
