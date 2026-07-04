import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import type { ScheduleRound } from '../plugins/roundRobinUtils';
import type { Tournament, TournamentParticipant } from '../../../types/tournament';

export interface VisibleScheduleRow {
  roundNumber: number;
  matchNumber: number;
  player1Name: string;
  player2Name: string;
  player1Rating: string;
  player2Rating: string;
  isPlayed: boolean;
}

function getParticipantRatingDisplay(participant: TournamentParticipant | undefined): string {
  if (!participant) return '';
  const stored = participant.playerRatingAtTime;
  const current = participant.member.rating ?? null;
  if (stored === null || current === null) return '';
  if (stored === current) return current.toString();
  return `${stored}→${current}`;
}

function getPlayerName(participants: TournamentParticipant[], memberId: number): string {
  const participant = participants.find((p) => p.memberId === memberId);
  if (!participant) return 'TBD';
  return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
}

function getPlayerRating(participants: TournamentParticipant[], memberId: number): string {
  const participant = participants.find((p) => p.memberId === memberId);
  return getParticipantRatingDisplay(participant);
}

function isMatchComplete(match: {
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
} | null | undefined): boolean {
  if (!match) return false;
  return (
    (match.player1Sets ?? 0) > 0 ||
    (match.player2Sets ?? 0) > 0 ||
    Boolean(match.player1Forfeit) ||
    Boolean(match.player2Forfeit)
  );
}

/** Same rows shown in PlayoffSchedulePanel (non-bye bracket slots, played struck through on screen). */
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
          player1Name: getPlayerName(participants, member1Id),
          player2Name: getPlayerName(participants, member2Id),
          player1Rating: getPlayerRating(participants, member1Id),
          player2Rating: getPlayerRating(participants, member2Id),
          isPlayed: isMatchComplete(bm.match),
        });
      });
    });

  return rows;
}

/** Same rows shown in SwissSchedulePanel (all created matches by round). */
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
          player1Name: getPlayerName(participants, match.member1Id),
          player2Name: match.member2Id ? getPlayerName(participants, match.member2Id) : 'BYE',
          player1Rating: getPlayerRating(participants, match.member1Id),
          player2Rating: match.member2Id ? getPlayerRating(participants, match.member2Id) : '',
          isPlayed: isMatchComplete(match),
        });
      });
    });

  return rows;
}

/** Convert visible rows to ScheduleRound[] for plugin generateSchedule / print pipeline. */
export function visibleScheduleToScheduleRounds(rows: VisibleScheduleRow[]): ScheduleRound[] {
  const byRound = new Map<number, VisibleScheduleRow[]>();
  rows.forEach((row) => {
    if (!byRound.has(row.roundNumber)) byRound.set(row.roundNumber, []);
    byRound.get(row.roundNumber)!.push(row);
  });

  return Array.from(byRound.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, roundRows]) => ({
      round,
      matches: roundRows.map((row) => ({
        matchNumber: row.matchNumber,
        round: row.roundNumber,
        member1Id: 0,
        member1Name: row.player1Name,
        member1StoredRating: null,
        member1CurrentRating: null,
        member2Id: 0,
        member2Name: row.player2Name,
        member2StoredRating: null,
        member2CurrentRating: null,
        player1Rating: row.player1Rating,
        player2Rating: row.player2Rating,
        isPlayed: row.isPlayed,
      })),
    }));
}

export function generatePlayoffSchedule(tournament: Tournament): ScheduleRound[] {
  return visibleScheduleToScheduleRounds(buildPlayoffVisibleSchedule(tournament));
}

export function generateSwissSchedule(tournament: Tournament): ScheduleRound[] {
  return visibleScheduleToScheduleRounds(buildSwissVisibleSchedule(tournament));
}
