/**
 * Swiss plugin: visible schedule / generateSchedule for print + schedule panel.
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

export function buildSwissVisibleSchedule(tournament: Tournament): VisibleScheduleRow[] {
  const participants = tournament.participants || [];
  const matches = tournament.matches || [];
  if (matches.length === 0) return [];

  const roundsMap = new Map<number, typeof matches>();
  matches.forEach((match) => {
    const round = (match as { round?: number }).round || 1;
    if (!roundsMap.has(round)) roundsMap.set(round, []);
    roundsMap.get(round)!.push(match);
  });

  const rows: VisibleScheduleRow[] = [];
  let matchNum = 1;

  Array.from(roundsMap.keys())
    .sort((a, b) => a - b)
    .forEach((roundNum) => {
      const roundMatches = roundsMap.get(roundNum)!;
      roundMatches.forEach((match) => {
        rows.push({
          roundNumber: roundNum,
          matchNumber: matchNum++,
          player1Name: getSchedulePlayerName(participants, match.member1Id),
          player2Name: match.member2Id ? getSchedulePlayerName(participants, match.member2Id) : 'BYE',
          player1Rating: getSchedulePlayerRating(participants, match.member1Id),
          player2Rating: match.member2Id ? getSchedulePlayerRating(participants, match.member2Id) : '',
          isPlayed: isScheduleMatchComplete(match),
        });
      });
    });

  return rows;
}

export function generateSwissSchedule(tournament: Tournament): ScheduleRound[] {
  return visibleScheduleToScheduleRounds(buildSwissVisibleSchedule(tournament));
}
