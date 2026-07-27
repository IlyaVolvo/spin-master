import { ACHIEVEMENT_CATEGORY_LABELS } from '../categoryIds';
import type { AchievementPlugin } from '../types';
import { getMatchWinnerId, isCountableCompetitiveMatch } from '../shared/matchWinner';
import { rankEntries } from '../shared/ranking';

export const mostWinsPlugin: AchievementPlugin = {
  id: 'most_wins',
  title: ACHIEVEMENT_CATEGORY_LABELS.most_wins,
  supportsScope: () => true,
  compute: (ctx) => {
    const wins = new Map<number, number>();
    for (const match of ctx.matches) {
      if (!isCountableCompetitiveMatch(match)) continue;
      const winnerId = getMatchWinnerId(match);
      if (winnerId == null) continue;
      wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    }
    return rankEntries(
      Array.from(wins.entries()).map(([memberId, value]) => ({
        memberId,
        value,
        label: String(value),
      })),
      ctx.membersById,
    );
  },
};
