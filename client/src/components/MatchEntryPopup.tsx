import React, { useEffect, useRef, useState } from 'react';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { getSystemConfig, subscribeToSystemConfig } from '../utils/systemConfig';

interface Player {
  id: number;
  firstName: string;
  lastName: string;
}

export interface MatchEntryEditingState {
  matchId: number;
  member1Id: number;
  member2Id: number;
  player1Sets: string;
  player2Sets: string;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  /** When required for non-organizer players, filled before save */
  opponentPassword?: string;
  /** Existing generated match rows can still be first-time score entry (Swiss). */
  expectedHadResult?: boolean;
  expectedMatchUpdatedAt?: string;
}

interface MatchEntryPopupProps {
  editingMatch: MatchEntryEditingState;
  player1: Player;
  player2: Player;
  showForfeitOptions?: boolean;
  /** When true, opponent password is required to enable Save (non-organizer recording for two players). */
  requireOpponentPassword?: boolean;
  onSetEditingMatch: (match: MatchEntryEditingState) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear?: () => void;
  showClearButton?: boolean;
  modifyConfirmationMessage?: string;
}

export const RATING_IMPACT_MODIFY_MESSAGE =
  'Modify this match result? If the winner changes, the previous result will be cancelled, ratings may be adjusted, and the corrected result will be recorded.';

function getEditingWinnerId(match: MatchEntryEditingState): number | null {
  if (match.player1Forfeit) return match.member2Id;
  if (match.player2Forfeit) return match.member1Id;
  const player1Sets = parseInt(match.player1Sets) || 0;
  const player2Sets = parseInt(match.player2Sets) || 0;
  if (player1Sets > player2Sets) return match.member1Id;
  if (player2Sets > player1Sets) return match.member2Id;
  return null;
}

export const MatchEntryPopup: React.FC<MatchEntryPopupProps> = ({
  editingMatch,
  player1,
  player2,
  showForfeitOptions = true,
  requireOpponentPassword = false,
  onSetEditingMatch,
  onSave,
  onCancel,
  onClear,
  showClearButton = false,
  modifyConfirmationMessage = 'Modify this match result? This will update the recorded score.',
}) => {
  const [confirmAction, setConfirmAction] = useState<'modify' | 'clear' | null>(null);
  const [systemConfig, setSystemConfig] = useState(() => getSystemConfig());
  const originalWinnerIdRef = useRef(getEditingWinnerId(editingMatch));
  const isForfeit = editingMatch.player1Forfeit || editingMatch.player2Forfeit;
  const isModification = editingMatch.matchId > 0 && editingMatch.expectedHadResult !== false;
  const winnerChanged = isModification && getEditingWinnerId(editingMatch) !== originalWinnerIdRef.current;
  const scoreRule = systemConfig.tournamentRules.matchScore;
  
  const player1Sets = parseInt(editingMatch.player1Sets) || 0;
  const player2Sets = parseInt(editingMatch.player2Sets) || 0;
  const scoresEqual = !scoreRule.allowEqualScores && !isForfeit && player1Sets === player2Sets;
  const missingOpponentPassword = requireOpponentPassword && !editingMatch.opponentPassword?.trim();
  const isDisabled = scoresEqual || missingOpponentPassword;

  useEffect(() => subscribeToSystemConfig(setSystemConfig), []);

  const confirmConfig =
    confirmAction === 'clear'
      ? {
          title: 'Remove Match Result',
          message: 'Remove this match result? This will undo any rating or bracket effects when required.',
          confirmText: 'Remove Result',
          confirmColor: '#e74c3c',
          onConfirm: onClear,
        }
      : confirmAction === 'modify'
        ? {
            title: 'Modify Match Result',
            message: modifyConfirmationMessage,
            confirmText: 'Modify Result',
            confirmColor: '#27ae60',
            onConfirm: onSave,
          }
        : null;

  return (
    <>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
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
              min={scoreRule.min}
              max={scoreRule.max}
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
              min={scoreRule.min}
              max={scoreRule.max}
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
        
        {/* Forfeit options  for all but non tournament macthes */}
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
                onClick={() => setConfirmAction('clear')}
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
            onClick={() => {
              if (winnerChanged) {
                setConfirmAction('modify');
              } else {
                onSave();
              }
            }}
            title={
              missingOpponentPassword
                ? 'Enter opponent password'
                : isDisabled
                  ? 'Scores cannot be equal'
                  : !isModification
                    ? 'Enter Score & Complete Match'
                    : 'Save Changes'
            }
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

      {requireOpponentPassword && (
        <div style={{ width: '100%', paddingTop: '4px', borderTop: '1px solid #eee' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Opponent password (required to confirm this result)
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={editingMatch.opponentPassword ?? ''}
            onChange={(e) =>
              onSetEditingMatch({
                ...editingMatch,
                opponentPassword: e.target.value,
              })
            }
            placeholder="Other player signs off"
            style={{
              width: '100%',
              maxWidth: '360px',
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>
      )}
      </div>
    </div>
    {confirmConfig && (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002,
          padding: '16px',
        }}
      >
        <div
          className="card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-result-confirm-title"
          style={{
            width: '100%',
            maxWidth: '440px',
            margin: 0,
            borderTop: `4px solid ${confirmConfig.confirmColor}`,
          }}
        >
          <h3 id="match-result-confirm-title" style={{ marginBottom: '12px', color: confirmConfig.confirmColor }}>
            {confirmConfig.title}
          </h3>
          <p style={{ marginBottom: '20px', lineHeight: 1.45, color: '#555' }}>{confirmConfig.message}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              style={{ backgroundColor: '#95a5a6', color: 'white' }}
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmAction(null);
                confirmConfig.onConfirm?.();
              }}
              style={{ backgroundColor: confirmConfig.confirmColor, color: 'white' }}
            >
              {confirmConfig.confirmText}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

