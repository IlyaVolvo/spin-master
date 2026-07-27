import type { AchievementContext } from '../types';
import { getMatchWinnerId, isForfeitMatch } from './matchWinner';

type Standing = {
  memberId: number;
  wins: number;
  losses: number;
  setDiff: number;
  points: number;
  rating: number;
};

function buildRrOrSwissStandings(
  ctx: AchievementContext,
  tournamentId: number,
  mode: 'rr' | 'swiss',
): Standing[] {
  const participantIds = ctx.participants
    .filter((p) => p.tournamentId === tournamentId)
    .map((p) => p.memberId);
  const byId = new Map<number, Standing>();
  for (const memberId of participantIds) {
    const p = ctx.participants.find(
      (x) => x.tournamentId === tournamentId && x.memberId === memberId,
    );
    byId.set(memberId, {
      memberId,
      wins: 0,
      losses: 0,
      setDiff: 0,
      points: 0,
      rating: p?.playerRatingAtTime ?? p?.member.rating ?? 0,
    });
  }

  for (const match of ctx.matches) {
    if (match.tournamentId !== tournamentId) continue;
    if (match.member2Id == null || match.member2Id === 0) continue;
    const winnerId = getMatchWinnerId(match);
    if (winnerId == null) continue;
    const loserId = winnerId === match.member1Id ? match.member2Id : match.member1Id;
    if (loserId == null) continue;
    const winner = byId.get(winnerId);
    const loser = byId.get(loserId);
    if (!winner || !loser) continue;
    winner.wins += 1;
    loser.losses += 1;
    winner.points += 1;
    if (!isForfeitMatch(match)) {
      winner.setDiff += (winnerId === match.member1Id
        ? match.player1Sets - match.player2Sets
        : match.player2Sets - match.player1Sets);
      loser.setDiff -= (winnerId === match.member1Id
        ? match.player1Sets - match.player2Sets
        : match.player2Sets - match.player1Sets);
    }
  }

  const list = Array.from(byId.values());
  if (mode === 'swiss') {
    list.sort((a, b) => b.points - a.points || b.rating - a.rating || a.memberId - b.memberId);
  } else {
    list.sort(
      (a, b) =>
        b.wins - a.wins || b.setDiff - a.setDiff || a.memberId - b.memberId,
    );
  }
  return list;
}

export async function resolveChampionMemberId(
  ctx: AchievementContext,
  rootTournamentId: number,
): Promise<{ championId: number; fieldTournamentId: number } | null> {
  const root = ctx.tournamentsById.get(rootTournamentId);
  if (!root) return null;

  let fieldTournamentId = rootTournamentId;
  let fieldType = root.type;

  if (
    root.type === 'PRELIMINARY_WITH_FINAL_PLAYOFF' ||
    root.type === 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN' ||
    root.type === 'MULTI_ROUND_ROBINS'
  ) {
    const children = Array.from(ctx.tournamentsById.values()).filter(
      (t) => t.parentTournamentId === rootTournamentId,
    );
    let finalChild =
      root.type === 'PRELIMINARY_WITH_FINAL_PLAYOFF'
        ? children.find((c) => c.type === 'PLAYOFF')
        : root.type === 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN'
          ? children.find((c) => c.type === 'ROUND_ROBIN' && c.groupNumber == null)
          : null;
    // MULTI_ROUND_ROBINS: no single champion — skip
    if (!finalChild) return null;
    fieldTournamentId = finalChild.id;
    fieldType = finalChild.type;
  }

  if (fieldType === 'PLAYOFF') {
    const bracketFinal = await ctx.prisma.bracketMatch.findFirst({
      where: { tournamentId: fieldTournamentId, round: 1 },
      include: { match: true },
    });
    if (bracketFinal?.match) {
      const winnerId = getMatchWinnerId(bracketFinal.match);
      if (winnerId != null) return { championId: winnerId, fieldTournamentId };
    }
    return null;
  }

  if (fieldType === 'ROUND_ROBIN') {
    const standings = buildRrOrSwissStandings(ctx, fieldTournamentId, 'rr');
    if (standings.length === 0) return null;
    return { championId: standings[0].memberId, fieldTournamentId };
  }

  if (fieldType === 'SWISS') {
    const standings = buildRrOrSwissStandings(ctx, fieldTournamentId, 'swiss');
    if (standings.length === 0) return null;
    return { championId: standings[0].memberId, fieldTournamentId };
  }

  return null;
}
