/**
 * Playoff score writes: universal scoring + playoff bracket preflight / refresh hooks.
 * Score rules/endpoints live in matchScoreSubmit; bracket rules stay playoff-owned.
 */
import {
  clearTournamentMatchScore,
  type MatchScoreData,
  type MatchScorePins,
  type MatchScoreWriteCallbacks,
  upsertTournamentMatchScore,
} from '../../../utils/matchScoreSubmit';
import {
  getPlayoffFirstResultBlockedReason,
  type PlayoffBracketSlotForGuard,
} from './playoffBracketPlayability';

export type { PlayoffBracketSlotForGuard };

export interface PlayoffMatchUpdateCallbacks extends MatchScoreWriteCallbacks {
  onBracketUpdate?: () => void;
}

export class PlayoffMatchUpdater {
  constructor(private tournamentId: number) {}

  /**
   * First result for a bracket slot (matchId = bracketMatchId; server links the row).
   */
  async createMatch(
    matchData: MatchScoreData,
    bracketMatchId: number,
    callbacks: PlayoffMatchUpdateCallbacks = {},
    bracketSlot?: PlayoffBracketSlotForGuard | null,
    pins?: MatchScorePins
  ): Promise<unknown> {
    const saved = await upsertTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId: bracketMatchId,
      matchData,
      pins,
      callbacks,
      assertCanSubmit: bracketSlot
        ? () => getPlayoffFirstResultBlockedReason(bracketSlot)
        : undefined,
    });
    callbacks.onBracketUpdate?.();
    return saved;
  }

  async updateMatch(
    matchId: number,
    matchData: MatchScoreData,
    callbacks: PlayoffMatchUpdateCallbacks = {},
    pins?: MatchScorePins
  ): Promise<unknown> {
    const saved = await upsertTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId,
      matchData,
      pins,
      callbacks,
    });
    return saved;
  }

  async deleteMatch(
    matchId: number,
    callbacks: PlayoffMatchUpdateCallbacks = {}
  ): Promise<void> {
    await clearTournamentMatchScore({
      tournamentId: this.tournamentId,
      matchId,
      callbacks,
    });
    callbacks.onBracketUpdate?.();
  }
}

export function createPlayoffMatchUpdater(tournamentId: number): PlayoffMatchUpdater {
  return new PlayoffMatchUpdater(tournamentId);
}
