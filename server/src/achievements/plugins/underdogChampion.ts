import { ACHIEVEMENT_CATEGORY_LABELS } from '../categoryIds';
import type { AchievementPlugin } from '../types';
import { resolveChampionMemberId } from '../shared/champion';
import { rankEntries } from '../shared/ranking';

export const underdogChampionPlugin: AchievementPlugin = {
  id: 'underdog_champion',
  title: ACHIEVEMENT_CATEGORY_LABELS.underdog_champion,
  supportsScope: (scope) => scope.type === 'tournament',
  compute: async (ctx) => {
    if (ctx.scope.type !== 'tournament') return [];
    const rootId = ctx.scope.tournamentId;
    const resolved = await resolveChampionMemberId(ctx, rootId);
    if (!resolved) return [];

    const fieldParticipants = ctx.participants.filter(
      (p) => p.tournamentId === resolved.fieldTournamentId,
    );
    if (fieldParticipants.length === 0) return [];

    const withRating = fieldParticipants
      .map((p) => ({
        memberId: p.memberId,
        rating: p.playerRatingAtTime,
      }))
      .filter((p) => p.rating != null) as Array<{ memberId: number; rating: number }>;

    if (withRating.length === 0) return [];

    const lowest = Math.min(...withRating.map((p) => p.rating));
    const championRating = withRating.find((p) => p.memberId === resolved.championId)?.rating;
    if (championRating == null || championRating !== lowest) return [];

    // Only one underdog champion per tournament scope
    return rankEntries(
      [
        {
          memberId: resolved.championId,
          value: Math.max(1, lowest > 0 ? 10000 - lowest : 1),
          label: String(lowest),
          tournamentId: rootId,
        },
      ],
      ctx.membersById,
    );
  },
};
