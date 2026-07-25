import type { CorrectionEligibility, Tournament } from '../types/tournament';

export function matchHasResult(match: {
  player1Sets?: number | null;
  player2Sets?: number | null;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
}): boolean {
  const hasScore = (match.player1Sets ?? 0) > 0 || (match.player2Sets ?? 0) > 0;
  return hasScore || Boolean(match.player1Forfeit || match.player2Forfeit);
}

/** Scored match DB ids from tournament payload (mirrors server ACTIVE eligibility rules). */
export function scoredMatchIdsForTournament(tournament: Tournament): number[] {
  const ids: number[] = [];
  for (const m of tournament.matches ?? []) {
    if (m.id && matchHasResult(m)) {
      ids.push(m.id);
    }
  }
  for (const bm of tournament.bracketMatches ?? []) {
    const m = bm.match;
    if (m?.id && matchHasResult(m)) {
      ids.push(m.id);
    }
  }
  return ids;
}

export function computeActiveModificationEligibility(tournament: Tournament): CorrectionEligibility {
  if (tournament.cancelled) {
    return { allowed: false, reason: 'Tournament was cancelled', correctableMatchIds: [] };
  }
  const ids = scoredMatchIdsForTournament(tournament);
  if (ids.length === 0) {
    return { allowed: false, reason: 'No scored matches to modify', correctableMatchIds: [] };
  }
  return { allowed: true, correctableMatchIds: ids };
}

export function isMatchCorrectable(
  matchId: number | undefined | null,
  eligibility: CorrectionEligibility | undefined,
): boolean {
  if (!matchId || !eligibility?.allowed) return false;
  return eligibility.correctableMatchIds.includes(matchId);
}

export const SCORE_MODIFY_CLICK_HINT = 'Click to modify score';
export const SCORE_CORRECT_CLICK_HINT = 'Click to correct score';
/** @deprecated Use getScoreModificationClickHint */
export const CORRECTION_CLICK_HINT = SCORE_CORRECT_CLICK_HINT;

export function getScoreModificationClickHint(tournamentStatus?: string): string {
  return tournamentStatus === 'COMPLETED' ? SCORE_CORRECT_CLICK_HINT : SCORE_MODIFY_CLICK_HINT;
}

export function isCorrectionClick(
  event: { ctrlKey: boolean },
  isOrganizer: boolean,
  matchId: number | undefined | null,
  eligibility: CorrectionEligibility | undefined,
): boolean {
  return isOrganizer && event.ctrlKey && isMatchCorrectable(matchId, eligibility);
}

/** True when correction mode is on (Ctrl held) and this match may be corrected. */
export function shouldOpenCorrectionEditor(
  correctionModeActive: boolean,
  matchId: number | undefined | null,
  eligibility: CorrectionEligibility | undefined,
): boolean {
  return correctionModeActive && isMatchCorrectable(matchId, eligibility);
}

/** Match belongs to a completed/correctable tournament result set (even when Ctrl is not held). */
export function isCorrectionTargetMatch(
  matchId: number | undefined | null,
  eligibility: CorrectionEligibility | undefined,
): boolean {
  if (!matchId || !eligibility?.allowed) return false;
  return eligibility.correctableMatchIds.includes(matchId);
}

export function tournamentHasCorrectionTargets(
  eligibility: CorrectionEligibility | undefined,
): boolean {
  return Boolean(eligibility?.allowed && eligibility.correctableMatchIds.length > 0);
}

export function getCorrectionBannerText(
  correctionModeActive: boolean,
  isOrganizer: boolean,
  eligibility: CorrectionEligibility | undefined,
  tournamentStatus?: string,
): string | null {
  if (!correctionModeActive || !isOrganizer) return null;
  if (!eligibility) return null;
  if (eligibility.allowed) {
    return tournamentStatus === 'COMPLETED'
      ? 'Score correction — click a highlighted result'
      : 'Score modification — click a highlighted result';
  }
  return eligibility.reason
    ? `Modification unavailable — ${eligibility.reason}`
    : 'Modification unavailable';
}

export function tournamentCorrectionEligibility(tournament: Tournament): CorrectionEligibility | undefined {
  if (tournament.status === 'ACTIVE') {
    return computeActiveModificationEligibility(tournament);
  }
  return tournament.correctionEligibility;
}
