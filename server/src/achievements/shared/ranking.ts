import type { AchievementEntry, AchievementPublicMember } from '../types';

export function sanitizeAchievementMember(member: {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  rating?: number | null;
} | null | undefined): AchievementPublicMember | null {
  if (!member || typeof member.id !== 'number') return null;
  return {
    id: member.id,
    firstName: member.firstName ?? null,
    lastName: member.lastName ?? null,
    rating: member.rating ?? null,
  };
}

export function rankEntries(
  rows: Array<{
    memberId: number;
    value: number;
    label: string;
    tournamentId?: number | null;
    matchId?: number | null;
    opponentId?: number | null;
    winnerRatingBefore?: number | null;
    loserRatingBefore?: number | null;
    scoreLabel?: string | null;
  }>,
  membersById: Map<number, AchievementPublicMember>,
  limit = Number.POSITIVE_INFINITY,
): AchievementEntry[] {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value || a.memberId - b.memberId);

  const capped = Number.isFinite(limit) ? sorted.slice(0, Math.max(0, limit)) : sorted;

  const entries: AchievementEntry[] = [];
  for (const row of capped) {
    const member = membersById.get(row.memberId);
    if (!member) continue;
    entries.push({
      rank: entries.length + 1,
      member,
      value: row.value,
      label: row.label,
      tournamentId: row.tournamentId ?? null,
      matchId: row.matchId ?? null,
      opponent: row.opponentId != null ? membersById.get(row.opponentId) ?? null : null,
      winnerRatingBefore: row.winnerRatingBefore ?? null,
      loserRatingBefore: row.loserRatingBefore ?? null,
      scoreLabel: row.scoreLabel ?? null,
    });
  }
  return entries;
}
