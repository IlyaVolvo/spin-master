import React from 'react';
import { useNavigate } from 'react-router-dom';

interface StandaloneMatchDisplayProps {
  match: any; // Standalone match data with isStandaloneMatch: true
  maxPlayerNameWidth?: number;
}

export const StandaloneMatchDisplay: React.FC<StandaloneMatchDisplayProps> = ({ 
  match, 
  maxPlayerNameWidth = 150 
}) => {
  const navigate = useNavigate();

  const saveStateBeforeNavigate = () => {
    // Save current scroll position and UI state
    sessionStorage.setItem('tournamentsScrollPosition', window.scrollY.toString());
    sessionStorage.setItem('tournamentsExpandedDetails', JSON.stringify(Array.from([]))); // Will be handled by parent
  };

  const handleViewStatistics = () => {
    if (match.matches.length > 0) {
      const member1Id = match.matches[0].member1Id;
      const member2Id = match.matches[0].member2Id;
      saveStateBeforeNavigate();
      navigate('/statistics', { 
        state: { 
          playerIds: [member1Id, member2Id].filter(id => id !== null) as number[],
          from: 'tournaments'
        } 
      });
    }
  };

  const handleViewHistory = () => {
    if (match.matches.length > 0) {
      const member1Id = match.matches[0].member1Id;
      const member2Id = match.matches[0].member2Id;
      saveStateBeforeNavigate();
      navigate('/history', { 
        state: { 
          playerId: member1Id, 
          opponentIds: member2Id ? [member2Id] : [],
          from: 'tournaments'
        } 
      });
    }
  };

  const getPlayerName = (participant: any) => {
    if (!participant || !participant.member) return 'Unknown';
    return `${participant.member.firstName || ''} ${participant.member.lastName || ''}`.trim();
  };

  const getPlayerRating = (participant: any) => {
    if (!participant) return null;
    return participant.playerRatingAtTime || participant.member?.rating || null;
  };

  return (
    <div 
      style={{ 
        marginBottom: '10px', 
        padding: '8px', 
        border: '1px solid #ddd', 
        borderRadius: '4px',
        backgroundColor: '#f9f9f9'
      }}
    >
      {/* Match score and action buttons in the same line */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: '10px'
      }}>
        {/* Custom match layout with proper alignment */}
        {match.matches.length > 0 && match.participants.length >= 2 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Player 1 */}
            <div style={{ 
              minWidth: `${maxPlayerNameWidth}px`, 
              textAlign: 'right',
              fontWeight: 'bold',
              fontSize: '16px'
            }}>
              <div>
                {getPlayerName(match.participants[0])}
              </div>
              {getPlayerRating(match.participants[0]) && (
                <div style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                  {getPlayerRating(match.participants[0])}
                </div>
              )}
            </div>

            {/* Score and Date */}
            <div style={{ 
              minWidth: '60px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {/* Score */}
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 'bold', 
                color: '#2c3e50'
              }}>
                {match.matches[0].player1Sets} : {match.matches[0].player2Sets}
              </div>
              
              {/* Date under score */}
              {match.recordedAt && (
                <div style={{ 
                  fontSize: '10px', 
                  color: '#666', 
                  marginTop: '2px',
                  whiteSpace: 'nowrap'
                }}>
                  {new Date(match.recordedAt).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Player 2 */}
            <div style={{ 
              minWidth: `${maxPlayerNameWidth}px`, 
              textAlign: 'left',
              fontWeight: 'bold',
              fontSize: '16px'
            }}>
              <div>
                {getPlayerName(match.participants[1])}
              </div>
              {getPlayerRating(match.participants[1]) && (
                <div style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                  {getPlayerRating(match.participants[1])}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#95a5a6',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
            }}
          >
            🏓 MATCH
          </div>
        )}

        {/* Action buttons on the far right */}
        {match.matches.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={handleViewStatistics}
              title="View Statistics for both players"
              style={{
                padding: '4px 8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3498db',
                borderRadius: '4px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e8f4f8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              📊
            </button>
            <button
              onClick={handleViewHistory}
              title="View History between these players"
              style={{
                padding: '4px 8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e67e22',
                borderRadius: '4px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef4e8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              📜
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
