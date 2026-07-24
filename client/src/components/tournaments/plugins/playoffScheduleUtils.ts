/**
 * Playoff plugin: visible schedule / generateSchedule for print + schedule panel.
 */
import type { Tournament } from '../../../types/tournament';
import type { ScheduleRound } from './roundRobinUtils';
import {
  getSchedulePlayerName,
  getSchedulePlayerRating,
  isScheduleMatchComplete,
  visibleScheduleToScheduleRounds,
  type VisibleScheduleRow,
} from '../utils/visibleScheduleUtils';

export function buildPlayoffVisibleSchedule(tournament: Tournament): VisibleScheduleRow[] {
  const participants = tournament.participants || [];
  const bracketMatches = tournament.bracketMatches || [];
  if (bracketMatches.length === 0) return [];

  const bracketByRound: Record<number, typeof bracketMatches> = {};
  bracketMatches.forEach((bm) => {
    if (!bracketByRound[bm.round]) bracketByRound[bm.round] = [];
    bracketByRound[bm.round].push(bm);
  });
  Object.keys(bracketByRound).forEach((round) => {
    bracketByRound[parseInt(round, 10)].sort((a, b) => a.position - b.position);
  });

  const rows: VisibleScheduleRow[] = [];
  let matchNum = 1;

  Object.entries(bracketByRound)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .forEach(([round, matches]) => {
      const roundNum = parseInt(round, 10);
      matches.forEach((bm) => {
        const isBye = !bm.member1Id || !bm.member2Id || bm.member1Id === 0 || bm.member2Id === 0;
        if (isBye) return;

        const member1Id = bm.member1Id as number;
        const member2Id = bm.member2Id as number;

        rows.push({
          roundNumber: roundNum,
          matchNumber: matchNum++,
          player1Name: getSchedulePlayerName(participants, member1Id),
          player2Name: getSchedulePlayerName(participants, member2Id),
          player1Rating: getSchedulePlayerRating(participants, member1Id),
          player2Rating: getSchedulePlayerRating(participants, member2Id),
          isPlayed: isScheduleMatchComplete(bm.match),
        });
      });
    });

  return rows;
}

export function generatePlayoffSchedule(tournament: Tournament): ScheduleRound[] {
  return visibleScheduleToScheduleRounds(buildPlayoffVisibleSchedule(tournament));
}
