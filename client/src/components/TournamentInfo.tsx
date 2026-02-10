import React from 'react';
import { formatTournamentDates } from '../utils/dateFormatter';

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null;
}

interface TournamentParticipant {
  id: number;
  memberId: number;
  member: Member;
  playerRatingAtTime: number | null;
  postRatingAtTime?: number | null;
}

interface Match {
  id: number;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  createdAt?: string;
  updatedAt?: string;
  round?: number | null;
  position?: number | null;
  nextMatchId?: number | null;
  player1RatingBefore?: number | null;
  player1RatingChange?: number | null;
  player2RatingBefore?: number | null;
  player2RatingChange?: number | null;
}

interface Tournament {
  id: number;
  name: string | null;
  type?: 'ROUND_ROBIN' | 'PLAYOFF';
  createdAt: string;
  recordedAt?: string;
  status: 'ACTIVE' | 'COMPLETED';
  participants: TournamentParticipant[];
  matches: Match[];
  bracketMatches?: Array<{
    id: number;
    member1Id: number | null;
    member2Id: number | null;
    round: number;
    position: number;
    player1Id: number | null;
    player2Id: number | null;
    nextMatchId: number | null;
    match?: Match | null;
  }>;
}

interface TournamentInfoProps {
  tournament: Tournament;
  countNonForfeitedMatches: (tournament: any) => number;
  alignRight?: boolean;
}

export const TournamentInfo: React.FC<TournamentInfoProps> = ({
  tournament,
  countNonForfeitedMatches,
  alignRight = false,
}) => {
  return (
    <p style={{ 
      fontSize: '14px', 
      color: '#666', 
      margin: alignRight ? 0 : '5px 0 0 0',
      textAlign: alignRight ? 'right' : 'left'
    }}>
      {formatTournamentDates(tournament.createdAt, tournament.recordedAt)} • {tournament.participants.length} participants • {countNonForfeitedMatches(tournament)} matches
    </p>
  );
};

