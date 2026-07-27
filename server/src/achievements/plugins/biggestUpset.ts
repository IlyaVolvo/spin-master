import { ACHIEVEMENT_CATEGORY_LABELS } from '../categoryIds';
import type { AchievementPlugin } from '../types';
import {
  getMatchWinnerId,
  isCountableCompetitiveMatch,
} from '../shared/matchWinner';
import { rankEntries } from '../shared/ranking';

function enrollmentRating(
  ctx: Parameters<AchievementPlugin['compute']>[0],
  tournamentId: number | null,
  memberId: number,
): number | null {
  if (tournamentId == null) return null;
  const p = ctx.participants.find(
    (x) => x.tournamentId === tournamentId && x.memberId === memberId,
  );
  return p?.playerRatingAtTime ?? null;
}

function ratingBeforeMatch(
  ctx: Parameters<AchievementPlugin['compute']>[0],
  matchId: number,
  memberId: number,
  tournamentId: number | null,
): number | null {
  const history = ctx.ratingHistory.find(
    (h) => h.matchId === matchId && h.memberId === memberId,
  );
  if (history?.rating != null && history.ratingChange != null) {
    return history.rating - history.ratingChange;
  }
  return enrollmentRating(ctx, tournamentId, memberId);
}

function scoreLabel(match: {
  member1Id: number;
  player1Sets: number;
  player2Sets: number;
  winnerId: number;
}): string {
  if (match.winnerId === match.member1Id) {
    return `${match.player1Sets}–${match.player2Sets}`;
  }
  return `${match.player2Sets}–${match.player1Sets}`;
}

/**
 * Biggest upset = largest pre-match rating gap when the lower-rated player wins.
 * One row per upset match (not rating points lost by the favorite).
 */
export const biggestUpsetPlugin: AchievementPlugin = {
  id: 'biggest_upset',
  title: ACHIEVEMENT_CATEGORY_LABELS.biggest_upset,
  supportsScope: () => true,
  compute: (ctx) => {
    const upsets: Array<{
      memberId: number;
      value: number;
      label: string;
      tournamentId: number | null;
      matchId: number;
      opponentId: number;
      winnerRatingBefore: number;
      loserRatingBefore: number;
      scoreLabel: string;
    }> = [];

    for (const match of ctx.matches) {
      if (!isCountableCompetitiveMatch(match)) continue;
      const winnerId = getMatchWinnerId(match);
      if (winnerId == null || match.member2Id == null) continue;
      const loserId = winnerId === match.member1Id ? match.member2Id : match.member1Id;
      if (loserId == null) continue;

      const winnerBefore = ratingBeforeMatch(ctx, match.id, winnerId, match.tournamentId);
      const loserBefore = ratingBeforeMatch(ctx, match.id, loserId, match.tournamentId);
      if (winnerBefore == null || loserBefore == null) continue;
      const gap = loserBefore - winnerBefore;
      if (gap <= 0) continue;

      upsets.push({
        memberId: winnerId,
        value: gap,
        label: String(gap),
        tournamentId: match.tournamentId,
        matchId: match.id,
        opponentId: loserId,
        winnerRatingBefore: winnerBefore,
        loserRatingBefore: loserBefore,
        scoreLabel: scoreLabel({
          member1Id: match.member1Id,
          player1Sets: match.player1Sets,
          player2Sets: match.player2Sets,
          winnerId,
        }),
      });
    }

    return rankEntries(upsets, ctx.membersById);
  },
};
