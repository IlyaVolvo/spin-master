/** Forfeit-first winner resolution (matches BaseTournamentPlugin). */
export function getMatchWinnerId(match: {
  member1Id?: number | null;
  member2Id?: number | null;
  player1Sets?: number | null;
  player2Sets?: number | null;
  player1Forfeit?: boolean | null;
  player2Forfeit?: boolean | null;
}): number | null {
  if (!match) return null;
  if (match.player1Forfeit) return match.member2Id ?? null;
  if (match.player2Forfeit) return match.member1Id ?? null;
  if ((match.player1Sets ?? 0) > (match.player2Sets ?? 0)) return match.member1Id ?? null;
  if ((match.player2Sets ?? 0) > (match.player1Sets ?? 0)) return match.member2Id ?? null;
  return null;
}

export function isByeMatch(match: { member2Id?: number | null }): boolean {
  return match.member2Id == null || match.member2Id === 0;
}

export function isForfeitMatch(match: {
  player1Forfeit?: boolean | null;
  player2Forfeit?: boolean | null;
}): boolean {
  return Boolean(match.player1Forfeit || match.player2Forfeit);
}

/** Completed competitive match: has a winner, not BYE, not forfeit. */
export function isCountableCompetitiveMatch(match: {
  member1Id?: number | null;
  member2Id?: number | null;
  player1Sets?: number | null;
  player2Sets?: number | null;
  player1Forfeit?: boolean | null;
  player2Forfeit?: boolean | null;
}): boolean {
  if (isByeMatch(match) || isForfeitMatch(match)) return false;
  return getMatchWinnerId(match) != null;
}
