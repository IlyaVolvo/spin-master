import React from 'react';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';

interface Player {
  id: number;
  firstName: string;
  lastName: string;
}

interface EditingMatch {
  matchId: number;
  member1Id: number;
  member2Id: number;
  player1Sets: string;
  player2Sets: string;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}

interface MatchEntryPopupProps {
  editingMatch: EditingMatch;
  player1: Player;
  player2: Player;
  showForfeitOptions?: boolean;
  onSetEditingMatch: (match: EditingMatch) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear?: () => void;
  showClearButton?: boolean;
}

export const MatchEntryPopup: React.FC<MatchEntryPopupProps> = ({
  editingMatch,
  player1,
  player2,
  showForfeitOptions = true,
  onSetEditingMatch,
  onSave,
  onCancel,
  onClear,
  showClearButton = false,
}) => {
  const isForfeit = editingMatch.player1Forfeit || editingMatch.player2Forfeit;
  
  const player1Sets = parseInt(editingMatch.player1Sets) || 0;
  const player2Sets = parseInt(editingMatch.player2Sets) || 0;
  const scoresEqual = !isForfeit && player1Sets === player2Sets;
  const isDisabled = scoresEqual;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      padding: '20px',
      backgroundColor: 'white',
      borderRadius: '4px',
      border: '2px dashed #3498db',
      maxWidth: '600px',
      width: '90%',
      zIndex: 10001,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    }}>
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flex: 1 }}>
          {/* Player 1 */}
          <div style={{ 
            textAlign: 'center',
            opacity: isForfeit ? 0.4 : 1,
            backgroundColor: isForfeit ? '#f5f5f5' : 'transparent',
            padding: isForfeit ? '8px' : '0',
            borderRadius: isForfeit ? '4px' : '0',
            transition: 'all 0.2s',
          }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '5px', 
              fontSize: '14px', 
              fontWeight: 'bold',
              color: isForfeit ? '#999' : 'inherit',
            }}>
              {formatPlayerName(player1.firstName, player1.lastName, getNameDisplayOrder())}
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={editingMatch.player1Sets}
              onChange={(e) => onSetEditingMatch({
                ...editingMatch,
                player1Sets: e.target.value,
              })}
              disabled={isForfeit}
              style={{ 
                width: '80px', 
                padding: '8px', 
                fontSize: '16px', 
                textAlign: 'center', 
                border: isForfeit ? '2px solid #ddd' : '2px solid #3498db', 
                borderRadius: '4px',
                backgroundColor: isForfeit ? '#f5f5f5' : 'white',
                color: isForfeit ? '#999' : 'inherit',
                cursor: isForfeit ? 'not-allowed' : 'text',
              }}
            />
          </div>
          
          {/* Separator */}
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            color: isForfeit ? '#ddd' : '#3498db',
            opacity: isForfeit ? 0.4 : 1,
          }}>:</div>
          
          {/* Player 2 */}
          <div style={{ 
            textAlign: 'center',
            opacity: isForfeit ? 0.4 : 1,
            backgroundColor: isForfeit ? '#f5f5f5' : 'transparent',
            padding: isForfeit ? '8px' : '0',
            borderRadius: isForfeit ? '4px' : '0',
            transition: 'all 0.2s',
          }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '5px', 
              fontSize: '14px', 
              fontWeight: 'bold',
              color: isForfeit ? '#999' : 'inherit',
            }}>
              {formatPlayerName(player2.firstName, player2.lastName, getNameDisplayOrder())}
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={editingMatch.player2Sets}
              onChange={(e) => onSetEditingMatch({
                ...editingMatch,
                player2Sets: e.target.value,
              })}
              disabled={isForfeit}
              style={{ 
                width: '80px', 
                padding: '8px', 
                fontSize: '16px', 
                textAlign: 'center', 
                border: isForfeit ? '2px solid #ddd' : '2px solid #3498db', 
                borderRadius: '4px',
                backgroundColor: isForfeit ? '#f5f5f5' : 'white',
                color: isForfeit ? '#999' : 'inherit',
                cursor: isForfeit ? 'not-allowed' : 'text',
              }}
            />
          </div>
        </div>
        
        {/* Forfeit options - only for ROUND_ROBIN and PLAYOFF */}
        {showForfeitOptions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '20px', paddingLeft: '20px', borderLeft: '1px solid #ddd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="editPlayer1Forfeit"
                checked={editingMatch.player1Forfeit}
                onChange={(e) => {
                  onSetEditingMatch({
                    ...editingMatch,
                    player1Forfeit: e.target.checked,
                    player2Forfeit: false,
                    player1Sets: '0',
                    player2Sets: e.target.checked ? '1' : editingMatch.player2Sets,
                  });
                }}
                disabled={editingMatch.player2Forfeit}
                style={{ cursor: editingMatch.player2Forfeit ? 'not-allowed' : 'pointer' }}
              />
              <label htmlFor="editPlayer1Forfeit" style={{ margin: 0, cursor: editingMatch.player2Forfeit ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                Player 1 Forfeit
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="editPlayer2Forfeit"
                checked={editingMatch.player2Forfeit}
                onChange={(e) => {
                  onSetEditingMatch({
                    ...editingMatch,
                    player2Forfeit: e.target.checked,
                    player1Forfeit: false,
                    player1Sets: e.target.checked ? '1' : editingMatch.player1Sets,
                    player2Sets: '0',
                  });
                }}
                disabled={editingMatch.player1Forfeit}
                style={{ cursor: editingMatch.player1Forfeit ? 'not-allowed' : 'pointer' }}
              />
              <label htmlFor="editPlayer2Forfeit" style={{ margin: 0, cursor: editingMatch.player1Forfeit ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                Player 2 Forfeit
              </label>
            </div>
            {showClearButton && onClear && (
              <button
                onClick={onClear}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  marginTop: '10px',
                }}
              >
                Clear Result
              </button>
            )}
          </div>
        )}
        
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginLeft: '20px' }}>
          <button
            onClick={onCancel}
            title="Cancel"
            style={{
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e74c3c',
            }}
          >
            ❌
          </button>
          <button
            onClick={onSave}
            title={isDisabled ? 'Scores cannot be equal' : (editingMatch.matchId === 0 ? 'Enter Score & Complete Match' : 'Save Changes')}
            disabled={isDisabled}
            style={{
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDisabled ? '#95a5a6' : '#27ae60',
            }}
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 20 20" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{
                display: 'block',
                opacity: isDisabled ? 0.5 : 0.8,
              }}
            >
              <rect 
                x="2" 
                y="3" 
                width="16" 
                height="14" 
                rx="2" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                fill="none"
              />
              <line 
                x1="10" 
                y1="3" 
                x2="10" 
                y2="17" 
                stroke="currentColor" 
                strokeWidth="1.5"
              />
              <text 
                x="5.5" 
                y="12" 
                fontSize="8" 
                fontWeight="bold" 
                fill="currentColor" 
                textAnchor="middle"
                fontFamily="Arial, sans-serif"
              >
                {player1Sets}
              </text>
              <text 
                x="14.5" 
                y="12" 
                fontSize="8" 
                fontWeight="bold" 
                fill="currentColor" 
                textAnchor="middle"
                fontFamily="Arial, sans-serif"
              >
                {player2Sets}
              </text>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

