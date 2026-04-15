import request from 'supertest';
import type { Application } from 'express';
import { app } from '../../src/index';
import { roundRobinPairs } from './helpers';

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Record a round-robin result (winner listed as member1). */
export async function postRrMatch(
  tournamentId: number,
  token: string,
  winnerId: number,
  loserId: number,
  setsWin = 3,
  setsLose = 1,
  application: Application = app,
): Promise<void> {
  await request(application)
    .post(`/api/tournaments/${tournamentId}/matches`)
    .set(authHeader(token))
    .send({
      member1Id: winnerId,
      member2Id: loserId,
      player1Sets: setsWin,
      player2Sets: setsLose,
    })
    .expect(201);
}

/** All RR matches with scores; does not PATCH complete (for capturing pre-completion anchors). */
export async function playAllRoundRobinMatches(
  tournamentId: number,
  token: string,
  participantIds: number[],
  pickWinner: (a: number, b: number) => number,
  application: Application = app,
): Promise<void> {
  for (const [a, b] of roundRobinPairs(participantIds)) {
    const w = pickWinner(a, b);
    await postRrMatch(tournamentId, token, w, w === a ? b : a, 3, 1, application);
  }
}

/** Play every RR pair then PATCH complete (USATT-style batch rating at completion). */
export async function completeRoundRobin(
  tournamentId: number,
  token: string,
  participantIds: number[],
  pickWinner: (a: number, b: number) => number,
  application: Application = app,
): Promise<void> {
  await playAllRoundRobinMatches(tournamentId, token, participantIds, pickWinner, application);
  await request(application)
    .patch(`/api/tournaments/${tournamentId}/complete`)
    .set(authHeader(token))
    .expect(200);
}
