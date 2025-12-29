import React from 'react';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { formatCompletedTournamentRating } from '../utils/ratingFormatter';

interface Match {
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Participant {
  memberId: number;
  member: {
    firstName: string;
    lastName: string;
    rating: number | null;
  };
  playerRatingAtTime: number | null;
  postRatingAtTime?: number | null; // Rating after tournament completion
}

interface SingleMatchHeaderProps {
  participants: Participant[];
  match?: Match | null;
  isCompleted?: boolean;
  firstPlayerMinWidth?: number;
}

/**
 * Formats a date string to show date and time with minute precision
 */
function formatMatchDateTime(dateString: string | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  // Format: MM/DD/YYYY, HH:MM
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
}

/**
 * Component for displaying single match header (with or without score)
 */
export const SingleMatchHeader: React.FC<SingleMatchHeaderProps> = ({ participants, match, isCompleted = false, firstPlayerMinWidth = 150 }) => {

  if (match) {
    // Match completed - show score
    const player1 = participants.find(p => p.memberId === match.member1Id);
    const player2 = match.member2Id ? participants.find(p => p.memberId === match.member2Id) : null;
    
    // Get rating display for completed tournaments
    // Use postRatingAtTime (rating after tournament) instead of current rating
    const player1PostRating = player1?.postRatingAtTime ?? player1?.member.rating ?? null;
    const player2PostRating = player2?.postRatingAtTime ?? player2?.member.rating ?? null;
    
    const player1RatingDisplay = isCompleted && player1 
      ? formatCompletedTournamentRating(player1.playerRatingAtTime, player1PostRating)
      : null;
    const player2RatingDisplay = isCompleted && player2
      ? formatCompletedTournamentRating(player2.playerRatingAtTime, player2PostRating)
      : null;
    
    // Determine winner (handle forfeits)
    const player1Won = match.player1Forfeit ? false : (match.player2Forfeit ? true : match.player1Sets > match.player2Sets);
    const player2Won = match.player2Forfeit ? false : (match.player1Forfeit ? true : match.player2Sets > match.player1Sets);
    const player1Color = player1Won ? '#27ae60' : (player2Won ? '#e74c3c' : '#27ae60'); // Green if won, red if lost, green if tie
    const player2Color = player2Won ? '#27ae60' : (player1Won ? '#e74c3c' : '#27ae60'); // Green if won, red if lost, green if tie
    
    // Get match date - prefer updatedAt (when result was entered) over createdAt
    const matchDate = match.updatedAt || match.createdAt;
    const matchDateDisplay = matchDate ? formatMatchDateTime(matchDate) : '';
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: '0 0 auto', minWidth: `${firstPlayerMinWidth}px`, maxWidth: `${firstPlayerMinWidth}px` }}>
          {player1 && (
            <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <span>{formatPlayerName(player1.member.firstName, player1.member.lastName, getNameDisplayOrder())}</span>
            </div>
          )}
          {player1RatingDisplay && (
            <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', marginTop: '2px', minHeight: '14px' }}>
              {player1RatingDisplay}
            </div>
          )}
          {!player1RatingDisplay && (
            <div style={{ fontSize: '11px', color: 'transparent', minHeight: '14px' }}>&nbsp;</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: '0 0 auto', minWidth: '120px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', minHeight: '24px' }}>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: player1Color, minWidth: '20px', textAlign: 'right' }}>
              {match.player1Sets}
            </span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#666' }}>:</div>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: player2Color, minWidth: '20px', textAlign: 'left' }}>
              {match.player2Sets}
            </span>
          </div>
          {matchDateDisplay && (
            <span style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', minHeight: '14px' }}>
              {matchDateDisplay}
            </span>
          )}
          {!matchDateDisplay && (
            <span style={{ fontSize: '11px', color: 'transparent', minHeight: '14px' }}>&nbsp;</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flex: '1 1 auto', minWidth: 0 }}>
          {player2 && (
            <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <span>{formatPlayerName(player2.member.firstName, player2.member.lastName, getNameDisplayOrder())}</span>
            </div>
          )}
          {player2RatingDisplay && (
            <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', marginTop: '2px', minHeight: '14px' }}>
              {player2RatingDisplay}
            </div>
          )}
          {!player2RatingDisplay && (
            <div style={{ fontSize: '11px', color: 'transparent', minHeight: '14px' }}>&nbsp;</div>
          )}
        </div>
      </div>
    );
  }

  // Match not played yet - show players
  const player1Rating = participants[0]?.playerRatingAtTime ?? participants[0]?.member.rating ?? null;
  const player2Rating = participants[1]?.playerRatingAtTime ?? participants[1]?.member.rating ?? null;
  const player1RatingDisplay = player1Rating ? String(player1Rating) : null;
  const player2RatingDisplay = player2Rating ? String(player2Rating) : null;
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: '0 0 auto', minWidth: `${firstPlayerMinWidth}px`, maxWidth: `${firstPlayerMinWidth}px` }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <span>{formatPlayerName(participants[0].member.firstName, participants[0].member.lastName, getNameDisplayOrder())}</span>
        </div>
        {player1RatingDisplay && (
          <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', marginTop: '2px' }}>
            {player1RatingDisplay}
          </div>
        )}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#666', margin: '0 2px' }}>vs</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <span>{formatPlayerName(participants[1].member.firstName, participants[1].member.lastName, getNameDisplayOrder())}</span>
        </div>
        {player2RatingDisplay && (
          <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', marginTop: '2px' }}>
            {player2RatingDisplay}
          </div>
        )}
      </div>
    </div>
  );
};

