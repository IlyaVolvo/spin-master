/**
 * Universal match score write path (tournament + standalone).
 * Type-specific post-save behavior (bracket refresh, RR completion, etc.)
 * stays in plugins/callers via callbacks — this module does not know tournament types.
 */
import api from './api';
import {
  attachScorePinsIfNeeded,
  enrichErrorWithInvalidScorePins,
  isScorePinAuthErrorMessage,
  ScorePinAuthError,
} from './matchScorePayload';

export type MatchScoreData = {
  member1Id: number;
  member2Id: number | null;
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  expectedHadResult?: boolean;
  expectedMatchUpdatedAt?: string;
};

export type MatchScorePins = {
  member1Pin?: string;
  member2Pin?: string;
};

export type MatchScoreWriteCallbacks = {
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTournamentUpdate?: (tournament: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMatchUpdate?: (match: any) => void;
};

/** Client-side score rules shared by all tournament types and standalone matches. */
export function validateMatchScoreData(matchData: MatchScoreData): string | null {
  if (matchData.player1Forfeit && matchData.player2Forfeit) {
    return 'Only one player can forfeit';
  }

  if (!matchData.player1Forfeit && !matchData.player2Forfeit) {
    const player1Sets = matchData.player1Sets || 0;
    const player2Sets = matchData.player2Sets || 0;
    if (player1Sets === player2Sets) {
      return 'Scores cannot be equal. One player must win.';
    }
  }

  return null;
}

/** Build API body for a score write (sets/forfeit + optional kiosk PINs). */
export function buildMatchScorePayload(
  matchData: MatchScoreData,
  pins?: MatchScorePins
): Record<string, unknown> {
  const apiData: Record<string, unknown> = {
    member1Id: matchData.member1Id,
    member2Id: matchData.member2Id,
  };

  if (matchData.player1Forfeit || matchData.player2Forfeit) {
    apiData.player1Forfeit = matchData.player1Forfeit || false;
    apiData.player2Forfeit = matchData.player2Forfeit || false;
  } else {
    apiData.player1Sets = matchData.player1Sets || 0;
    apiData.player2Sets = matchData.player2Sets || 0;
    apiData.player1Forfeit = false;
    apiData.player2Forfeit = false;
  }

  if (matchData.expectedHadResult !== undefined) {
    apiData.expectedHadResult = matchData.expectedHadResult;
  }
  if (matchData.expectedMatchUpdatedAt) {
    apiData.expectedMatchUpdatedAt = matchData.expectedMatchUpdatedAt;
  }

  attachScorePinsIfNeeded(apiData, pins);
  return apiData;
}

/** True when the error should show as a page/banner message (not field-level PIN UI). */
export function shouldSurfaceMatchScoreError(err: Error): boolean {
  if (err instanceof ScorePinAuthError) return false;
  if ((err as Error & { invalidPins?: unknown }).invalidPins) return false;
  if (isScorePinAuthErrorMessage(err.message)) return false;
  return true;
}

export function notifyMatchScoreWriteError(
  onError: ((message: string) => void) | undefined,
  err: Error
): void {
  if (onError && shouldSurfaceMatchScoreError(err)) {
    onError(err.message);
  }
}

async function refreshTournament(
  tournamentId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTournamentUpdate?: (tournament: any) => void
): Promise<void> {
  if (!onTournamentUpdate) return;
  try {
    const response = await api.get(`/tournaments/${tournamentId}`);
    onTournamentUpdate(response.data);
  } catch (err) {
    console.error('Failed to refresh tournament:', err);
  }
}

function throwValidation(
  matchData: MatchScoreData,
  callbacks: MatchScoreWriteCallbacks
): void {
  const validationError = validateMatchScoreData(matchData);
  if (validationError) {
    callbacks.onError?.(validationError);
    throw new Error(validationError);
  }
}

export type UpsertTournamentMatchScoreParams = {
  tournamentId: number;
  /**
   * Match row id, bracket match id (server resolves), or `0` for lazy create
   * (e.g. round-robin first result for a pair).
   */
  matchId: number;
  matchData: MatchScoreData;
  pins?: MatchScorePins;
  callbacks?: MatchScoreWriteCallbacks;
  /** Plugin-owned preflight (e.g. playoff slot readiness). Return error message or null. */
  assertCanSubmit?: () => string | null;
  successMessage?: string;
  /** When false, skip GET tournament refresh after write (caller handles response). Default true. */
  refreshTournament?: boolean;
};

/**
 * Universal tournament score upsert: PATCH /tournaments/:id/matches/:matchId
 * (including matchId `0` for create-on-write).
 */
export async function upsertTournamentMatchScore(
  params: UpsertTournamentMatchScoreParams
): Promise<unknown> {
  const {
    tournamentId,
    matchId,
    matchData,
    pins,
    callbacks = {},
    assertCanSubmit,
    successMessage,
    refreshTournament: doRefresh = true,
  } = params;

  throwValidation(matchData, callbacks);

  const blocked = assertCanSubmit?.();
  if (blocked) {
    callbacks.onError?.(blocked);
    throw new Error(blocked);
  }

  try {
    const apiData = buildMatchScorePayload(matchData, pins);
    const response = await api.patch(
      `/tournaments/${tournamentId}/matches/${matchId}`,
      apiData
    );
    const saved = response.data;

    const isCreate = matchId === 0;
    callbacks.onSuccess?.(
      successMessage ||
        (isCreate ? 'Match result added successfully' : 'Match result updated successfully')
    );
    callbacks.onMatchUpdate?.(saved);

    if (doRefresh) {
      await refreshTournament(tournamentId, callbacks.onTournamentUpdate);
    }

    return saved;
  } catch (err: unknown) {
    const enriched = enrichErrorWithInvalidScorePins(
      err,
      matchId === 0 ? 'Failed to create match result' : 'Failed to update match result'
    );
    notifyMatchScoreWriteError(callbacks.onError, enriched);
    throw enriched;
  }
}

export type CreateTournamentMatchScoreParams = {
  tournamentId: number;
  matchData: MatchScoreData;
  pins?: MatchScorePins;
  callbacks?: MatchScoreWriteCallbacks;
  assertCanSubmit?: () => string | null;
  successMessage?: string;
  refreshTournament?: boolean;
};

/** POST /tournaments/:id/matches — explicit create (when the route is used). */
export async function createTournamentMatchScore(
  params: CreateTournamentMatchScoreParams
): Promise<unknown> {
  const {
    tournamentId,
    matchData,
    pins,
    callbacks = {},
    assertCanSubmit,
    successMessage = 'Match result added successfully',
    refreshTournament: doRefresh = true,
  } = params;

  throwValidation(matchData, callbacks);

  const blocked = assertCanSubmit?.();
  if (blocked) {
    callbacks.onError?.(blocked);
    throw new Error(blocked);
  }

  try {
    const apiData = buildMatchScorePayload(matchData, pins);
    const response = await api.post(`/tournaments/${tournamentId}/matches`, apiData);
    const saved = response.data;

    callbacks.onSuccess?.(successMessage);
    callbacks.onMatchUpdate?.(saved);

    if (doRefresh) {
      await refreshTournament(tournamentId, callbacks.onTournamentUpdate);
    }

    return saved;
  } catch (err: unknown) {
    const enriched = enrichErrorWithInvalidScorePins(err, 'Failed to create match result');
    notifyMatchScoreWriteError(callbacks.onError, enriched);
    throw enriched;
  }
}

export type ClearTournamentMatchScoreParams = {
  tournamentId: number;
  matchId: number;
  callbacks?: MatchScoreWriteCallbacks;
  successMessage?: string;
  refreshTournament?: boolean;
};

/** DELETE /tournaments/:id/matches/:matchId */
export async function clearTournamentMatchScore(
  params: ClearTournamentMatchScoreParams
): Promise<void> {
  const {
    tournamentId,
    matchId,
    callbacks = {},
    successMessage = 'Match result cleared successfully',
    refreshTournament: doRefresh = true,
  } = params;

  try {
    await api.delete(`/tournaments/${tournamentId}/matches/${matchId}`);
    callbacks.onSuccess?.(successMessage);
    callbacks.onMatchUpdate?.({ cleared: true, matchId });

    if (doRefresh) {
      await refreshTournament(tournamentId, callbacks.onTournamentUpdate);
    }
  } catch (err: unknown) {
    const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    const errorMessage = apiError || 'Failed to clear match result';
    callbacks.onError?.(errorMessage);
    throw new Error(errorMessage);
  }
}

export type CreateStandaloneMatchScoreParams = {
  matchData: MatchScoreData;
  pins?: MatchScorePins;
};

/** POST /tournaments/matches/create — non-tournament (club) match. */
export async function createStandaloneMatchScore(
  params: CreateStandaloneMatchScoreParams
): Promise<unknown> {
  const { matchData, pins } = params;
  const validationError = validateMatchScoreData(matchData);
  if (validationError) {
    throw new Error(validationError);
  }

  try {
    const apiData = buildMatchScorePayload(matchData, pins);
    const response = await api.post('/tournaments/matches/create', apiData);
    return response.data;
  } catch (err: unknown) {
    throw enrichErrorWithInvalidScorePins(err, 'Failed to record match');
  }
}
