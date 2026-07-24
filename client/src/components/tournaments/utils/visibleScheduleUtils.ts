/**
 * Shared visible-schedule row helpers (type-agnostic).
 * Playoff/Swiss builders live in their plugins.
 */
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import type { ScheduleRound } from '../plugins/roundRobinUtils';
import type { TournamentParticipant } from '../../../types/tournament';

export interface VisibleScheduleRow {
  roundNumber: number;
  matchNumber: number;
  player1Name: string;
  player2Name: string;
  player1Rating: string;
  player2Rating: string;
  isPlayed: boolean;
}

export function getParticipantRatingDisplay(participant: TournamentParticipant | undefined): string {
  if (!participant) return '';
  const stored = participant.playerRatingAtTime;
  const current = participant.member.rating ?? null;
  if (stored === null || current === null) return '';
  if (stored === current) return current.toString();
  return `${stored}→${current}`;
}

export function getSchedulePlayerName(participants: TournamentParticipant[], memberId: number): string {
  const participant = participants.find((p) => p.memberId === memberId);
  if (!participant) return 'TBD';
  return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
}

export function getSchedulePlayerRating(participants: TournamentParticipant[], memberId: number): string {
  const participant = participants.find((p) => p.memberId === memberId);
  return getParticipantRatingDisplay(participant);
}

export function isScheduleMatchComplete(match: {
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
