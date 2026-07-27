import { ACHIEVEMENT_CATEGORY_LABELS } from '../categoryIds';
import type { AchievementPlugin } from '../types';
import { rankEntries } from '../shared/ranking';

/** Club-wide net rating rise over the period (sum of rating changes). */
export const clubLadderMoversPlugin: AchievementPlugin = {
  id: 'club_ladder_movers',
  title: ACHIEVEMENT_CATEGORY_LABELS.club_ladder_movers,
  supportsScope: (scope) => scope.type === 'period',
  compute: (ctx) => {
    const netByMember = new Map<number, number>();
    for (const row of ctx.ratingHistory) {
      if (row.ratingChange == null) continue;
      netByMember.set(
        row.memberId,
        (netByMember.get(row.memberId) ?? 0) + row.ratingChange,
      );
    }
    return rankEntries(
      Array.from(netByMember.entries()).map(([memberId, value]) => ({
        memberId,
        value,
        label: value > 0 ? `+${value}` : String(value),
      })),
      ctx.membersById,
    );
  },
};
