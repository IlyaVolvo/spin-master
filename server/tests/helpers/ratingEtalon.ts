/**
 * Deterministic expected member ratings for functional tests.
 * Uses the same point-exchange and formulas as production (getPointExchange, RR 4-pass export).
 * Assertions compare persisted ratings after API flows — catches double-application and wrong math without spying on hooks.
 */

import {
  applyRoundRobinComputedFinalsToMemberRatings,
  calculateRatingsForRoundRobinTournament,
  getPointExchange,
} from '../../src/services/usattRatingService';

export async function expectedRatingsAfterRoundRobinCompletion(
  tournament: any,
  anchorsBeforeCompletion: Map<number, number | null>,
): Promise<Map<number, number>> {
  const computed = await calculateRatingsForRoundRobinTournament(tournament);
  return applyRoundRobinComputedFinalsToMemberRatings(tournament, computed, anchorsBeforeCompletion);
}

/** Swiss: each match uses enrollment snapshots; DB stores last match result per player (processing order). */
export async function expectedRatingsSwissEnrollmentLastWrite(
  matches: Array<{
    id: number;
    round: number | null;
    member1Id: number;
    member2Id: number | null;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
  }>,
  participants: Array<{
    memberId: number;
    playerRatingAtTime: number | null;
    member?: { rating: number | null };
  }>,
): Promise<Map<number, number>> {
  const enroll = new Map<number, number>();
  for (const p of participants) {
    enroll.set(p.memberId, p.playerRatingAtTime ?? p.member?.rating ?? 1200);
  }

  const played = matches.filter(
    (m) =>
      m.member2Id &&
      m.member2Id !== 0 &&
      !m.player1Forfeit &&
      !m.player2Forfeit &&
      (m.player1Sets > 0 || m.player2Sets > 0),
  );
  played.sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.id - b.id);

  const last = new Map<number, number>();
  for (const m of played) {
    const m1 = m.member1Id;
    const m2 = m.member2Id!;
    const r1 = enroll.get(m1) ?? 1200;
    const r2 = enroll.get(m2) ?? 1200;
    const ratingDiff = r2 - r1;
    const player1Won = m.player1Sets > m.player2Sets;
    const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);
    const points = await getPointExchange(Math.abs(ratingDiff), isUpset);
    let n1 = r1;
    let n2 = r2;
    if (player1Won) {
      n1 += points;
      n2 -= points;
    } else {
      n1 -= points;
      n2 += points;
    }
    n1 = Math.max(0, Math.round(n1));
    n2 = Math.max(0, Math.round(n2));
    last.set(m1, n1);
    last.set(m2, n2);
  }
  return last;
}

/** Playoff: incremental current ratings (same as adjustRatingsForSingleMatch with useCurrentMemberRatings). */
export async function expectedRatingsPlayoffBracketChain(
  bracketMatches: Array<{
    round: number;
    position: number;
    member1Id: number | null;
    member2Id: number | null;
    match: {
      member1Id: number;
      member2Id: number | null;
      player1Sets: number;
      player2Sets: number;
      player1Forfeit: boolean;
      player2Forfeit: boolean;
    } | null;
  }>,
  initialRatings: Map<number, number>,
): Promise<Map<number, number>> {
  const ratings = new Map(initialRatings);
  const playable = bracketMatches.filter(
    (bm) =>
      bm.member1Id != null &&
      bm.member1Id !== 0 &&
      bm.member2Id != null &&
      bm.member2Id !== 0 &&
      bm.match &&
      bm.match.member2Id &&
      !bm.match.player1Forfeit &&
      !bm.match.player2Forfeit &&
      (bm.match.player1Sets > 0 || bm.match.player2Sets > 0),
  );
  playable.sort((a, b) => a.round - b.round || a.position - b.position);

  for (const bm of playable) {
    const m = bm.match!;
    const p1 = m.member1Id;
    const p2 = m.member2Id!;
    const r1 = ratings.get(p1) ?? 1200;
    const r2 = ratings.get(p2) ?? 1200;
    const ratingDiff = r2 - r1;
    const player1Won = m.player1Sets > m.player2Sets;
    const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);
    const points = await getPointExchange(Math.abs(ratingDiff), isUpset);
    let n1 = r1;
    let n2 = r2;
    if (player1Won) {
      n1 += points;
      n2 -= points;
    } else {
      n1 -= points;
      n2 += points;
    }
    ratings.set(p1, Math.max(0, Math.round(n1)));
    ratings.set(p2, Math.max(0, Math.round(n2)));
  }
  return ratings;
}
