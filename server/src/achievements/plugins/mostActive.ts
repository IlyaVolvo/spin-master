import { ACHIEVEMENT_CATEGORY_LABELS } from '../categoryIds';
import type { AchievementPlugin } from '../types';
import { isCountableCompetitiveMatch } from '../shared/matchWinner';
import { rankEntries } from '../shared/ranking';

export const mostActivePlugin: AchievementPlugin = {
  id: 'most_active',
  title: ACHIEVEMENT_CATEGORY_LABELS.most_active,
  supportsScope: () => true,
  compute: (ctx) => {
    const played = new Map<number, number>();
    for (const match of ctx.matches) {
      if (!isCountableCompetitiveMatch(match)) continue;
      played.set(match.member1Id, (played.get(match.member1Id) ?? 0) + 1);
      if (match.member2Id != null) {
        played.set(match.member2Id, (played.get(match.member2Id) ?? 0) + 1);
      }
    }
    return rankEntries(
      Array.from(played.entries()).map(([memberId, value]) => ({
        memberId,
        value,
        label: String(value),
      })),
      ctx.membersById,
    );
  },
};
