import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { getSystemConfig, subscribeToSystemConfig } from '../utils/systemConfig';
import { parseInvalidScorePinsFromError, type InvalidScorePins } from '../utils/matchScorePayload';
import { isOrganizer } from '../utils/auth';

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
  /** Kiosk mode: PIN for player 1 */
  member1Pin?: string;
  /** Kiosk mode: PIN for player 2 */
  member2Pin?: string;
  /** Existing generated match rows can still be first-time score entry (Swiss). */
  expectedHadResult?: boolean;
  expectedMatchUpdatedAt?: string;
}

interface MatchEntryPopupProps {
  editingMatch: MatchEntryEditingState;
  player1: Player;
  player2: Player;
  showForfeitOptions?: boolean;
  /** When true, both participant PINs are required (kiosk mode). */
  requireScorePins?: boolean;
  onSetEditingMatch: (match: MatchEntryEditingState) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  onClear?: () => void;
  showClearButton?: boolean;
  modifyConfirmationMessage?: string;
}

export const RATING_IMPACT_MODIFY_MESSAGE =
  'Modify this match result? If the winner changes, the previous result will be cancelled, ratings may be adjusted, and the corrected result will be recorded.';

export const SCORE_CORRECTION_MODIFY_MESSAGE =
  'Correct this completed result? Ratings will be recalculated for this tournament. This is only allowed while no later rating events have occurred.';

function getEditingWinnerId(match: MatchEntryEditingState): number | null {
  if (match.player1Forfeit) return match.member2Id;
  if (match.player2Forfeit) return match.member1Id;
  const player1Sets = parseInt(match.player1Sets) || 0;
  const player2Sets = parseInt(match.player2Sets) || 0;
  if (player1Sets > player2Sets) return match.member1Id;
  if (player2Sets > player1Sets) return match.member2Id;
  return null;
}

type ScoreFieldIndex = 1 | 2;

const scoreInputStyle = (isForfeit: boolean): React.CSSProperties => ({
  width: '56px',
  padding: '8px 4px',
  fontSize: '16px',
  textAlign: 'center',
  border: isForfeit ? '2px solid #ddd' : '2px solid #3498db',
  borderRadius: '4px',
  backgroundColor: isForfeit ? '#f5f5f5' : 'white',
  color: isForfeit ? '#999' : 'inherit',
  cursor: isForfeit ? 'not-allowed' : 'text',
});

const stepperButtonStyle = (isForfeit: boolean, disabled: boolean): React.CSSProperties => ({
  width: '28px',
  height: '20px',
  padding: 0,
  border: '1px solid #ccc',
  borderRadius: '3px',
  backgroundColor: disabled || isForfeit ? '#f5f5f5' : '#fff',
  color: disabled || isForfeit ? '#bbb' : '#333',
  cursor: disabled || isForfeit ? 'not-allowed' : 'pointer',
  fontSize: '11px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

interface ScoreFieldWithStepperProps {
  fieldIndex: ScoreFieldIndex;
  inputId: string;
  label: string;
  value: string;
  isForfeit: boolean;
  scoreMax: number;
  inputRef: React.RefObject<HTMLInputElement>;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

const ScoreFieldWithStepper: React.FC<ScoreFieldWithStepperProps> = ({
  fieldIndex,
  inputId,
  label,
  value,
  isForfeit,
  scoreMax,
  inputRef,
  onKeyDown,
  onIncrement,
  onDecrement,
}) => {
  const numericValue = parseInt(value) || 0;
  const atMin = numericValue <= 0;
  const atMax = numericValue >= scoreMax;

  return (
    <div style={{
      textAlign: 'center',
      opacity: isForfeit ? 0.4 : 1,
      backgroundColor: isForfeit ? '#f5f5f5' : 'transparent',
      padding: isForfeit ? '8px' : '0',
      borderRadius: isForfeit ? '4px' : '0',
      transition: 'all 0.2s',
    }}>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          marginBottom: '5px',
          fontSize: '14px',
          fontWeight: 'bold',
          color: isForfeit ? '#999' : 'inherit',
        }}
      >
        {label}
      </label>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Player ${fieldIndex} score`}
          value={value}
          readOnly
          onKeyDown={onKeyDown}
          disabled={isForfeit}
          style={scoreInputStyle(isForfeit)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Increase player ${fieldIndex} score`}
            title="Increase score"
            disabled={isForfeit || atMax}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onIncrement}
            style={stepperButtonStyle(isForfeit, atMax)}
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Decrease player ${fieldIndex} score`}
            title="Decrease score"
            disabled={isForfeit || atMin}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onDecrement}
            style={stepperButtonStyle(isForfeit, atMin)}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
};

export const MatchEntryPopup: React.FC<MatchEntryPopupProps> = ({
  editingMatch,
  player1,
  player2,
  showForfeitOptions = true,
  requireScorePins = false,
  onSetEditingMatch,
  onSave,
  onCancel,
  onClear,
  showClearButton = false,
  modifyConfirmationMessage = 'Modify this match result? This will update the recorded score.',
}) => {
  const [confirmAction, setConfirmAction] = useState<'modify' | 'clear' | null>(null);
  const [systemConfig, setSystemConfig] = useState(() => getSystemConfig());
  const [invalidScorePins, setInvalidScorePins] = useState<InvalidScorePins>({
    member1: false,
    member2: false,
  });
  const originalWinnerIdRef = useRef(getEditingWinnerId(editingMatch));
  const player1InputRef = useRef<HTMLInputElement>(null);
  const player2InputRef = useRef<HTMLInputElement>(null);
  const member1PinInputRef = useRef<HTMLInputElement>(null);
  const member2PinInputRef = useRef<HTMLInputElement>(null);
  const editingMatchRef = useRef(editingMatch);
  editingMatchRef.current = editingMatch;
  const isForfeit = editingMatch.player1Forfeit || editingMatch.player2Forfeit;
  const isModification = editingMatch.matchId > 0 && editingMatch.expectedHadResult !== false;
  const winnerChanged = isModification && getEditingWinnerId(editingMatch) !== originalWinnerIdRef.current;
  const scoreRule = systemConfig.tournamentRules.matchScore;
  const nameOrder = getNameDisplayOrder();
  const player1DisplayName = formatPlayerName(player1.firstName, player1.lastName, nameOrder);
  const player2DisplayName = formatPlayerName(player2.firstName, player2.lastName, nameOrder);
  /** Forfeits: organizers only (kiosk mode makes isOrganizer false). */
  const allowForfeitOptions = showForfeitOptions && isOrganizer();

  const player1Sets = parseInt(editingMatch.player1Sets) || 0;
  const player2Sets = parseInt(editingMatch.player2Sets) || 0;
  const scoresEqual = !scoreRule.allowEqualScores && !isForfeit && player1Sets === player2Sets;
  const missingScorePins =
    requireScorePins &&
    (!editingMatch.member1Pin?.trim() || !editingMatch.member2Pin?.trim());
  const isDisabled = scoresEqual || missingScorePins;

  useEffect(() => subscribeToSystemConfig(setSystemConfig), []);

  useEffect(() => {
    if (!isForfeit) {
      player1InputRef.current?.focus();
      player1InputRef.current?.select();
    }
  }, [isForfeit]);

  const applyInvalidScorePins = useCallback(
    (err: unknown) => {
      const pins = parseInvalidScorePinsFromError(err);
      if (!pins || (!pins.member1 && !pins.member2)) return false;
      // Only mark/clear sides the server reported as wrong.
      setInvalidScorePins({
        member1: pins.member1 === true,
        member2: pins.member2 === true,
      });
      const current = editingMatchRef.current;
      onSetEditingMatch({
        ...current,
        member1Pin: pins.member1 ? '' : (current.member1Pin ?? ''),
        member2Pin: pins.member2 ? '' : (current.member2Pin ?? ''),
      });
      requestAnimationFrame(() => {
        if (pins.member1) {
          member1PinInputRef.current?.focus();
        } else if (pins.member2) {
          member2PinInputRef.current?.focus();
        }
      });
      return true;
    },
    [onSetEditingMatch],
  );

  const trySave = useCallback(async () => {
    if (isDisabled) return;
    if (winnerChanged) {
      setConfirmAction('modify');
      return;
    }
    try {
      await Promise.resolve(onSave());
    } catch (err) {
      applyInvalidScorePins(err);
    }
  }, [isDisabled, winnerChanged, onSave, applyInvalidScorePins]);

  const clampScore = useCallback(
    (value: number) => Math.min(scoreRule.max, Math.max(0, value)),
    [scoreRule.max],
  );

  const applyDigit = useCallback(
    (fieldIndex: ScoreFieldIndex, digit: string) => {
      if (fieldIndex === 1) {
        onSetEditingMatch({
          ...editingMatch,
          player1Sets: digit,
          player2Sets: '0',
        });
        return;
      }
      onSetEditingMatch({
        ...editingMatch,
        player2Sets: digit,
      });
    },
    [editingMatch, onSetEditingMatch],
  );

  const applyBackspace = useCallback(
    (fieldIndex: ScoreFieldIndex) => {
      if (fieldIndex === 1) {
        onSetEditingMatch({
          ...editingMatch,
          player1Sets: '0',
          player2Sets: '0',
        });
        return;
      }
      onSetEditingMatch({
        ...editingMatch,
        player2Sets: '0',
      });
    },
    [editingMatch, onSetEditingMatch],
  );

  const adjustScore = useCallback(
    (fieldIndex: ScoreFieldIndex, delta: number) => {
      const current = fieldIndex === 1 ? player1Sets : player2Sets;
      const next = String(clampScore(current + delta));
      if (fieldIndex === 1) {
        onSetEditingMatch({
          ...editingMatch,
          player1Sets: next,
        });
        return;
      }
      onSetEditingMatch({
        ...editingMatch,
        player2Sets: next,
      });
    },
    [clampScore, editingMatch, onSetEditingMatch, player1Sets, player2Sets],
  );

  const handleScoreKeyDown = useCallback(
    (fieldIndex: ScoreFieldIndex) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) {
          if (fieldIndex === 1) {
            player2InputRef.current?.focus();
            player2InputRef.current?.select();
          } else {
            player1InputRef.current?.focus();
            player1InputRef.current?.select();
          }
        } else if (fieldIndex === 1) {
          player2InputRef.current?.focus();
          player2InputRef.current?.select();
        } else {
          player1InputRef.current?.focus();
          player1InputRef.current?.select();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        trySave();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        adjustScore(fieldIndex, 1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        adjustScore(fieldIndex, -1);
        return;
      }
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        applyDigit(fieldIndex, event.key);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        applyBackspace(fieldIndex);
      }
    },
    [adjustScore, applyBackspace, applyDigit, onCancel, trySave],
  );

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
            onConfirm: async () => {
              try {
                await Promise.resolve(onSave());
              } catch (err) {
                applyInvalidScorePins(err);
              }
            },
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
          <ScoreFieldWithStepper
            fieldIndex={1}
            inputId="match-entry-player1-score"
            label={formatPlayerName(player1.firstName, player1.lastName, getNameDisplayOrder())}
            value={editingMatch.player1Sets}
            isForfeit={isForfeit}
            scoreMax={scoreRule.max}
            inputRef={player1InputRef}
            onKeyDown={handleScoreKeyDown(1)}
            onIncrement={() => adjustScore(1, 1)}
            onDecrement={() => adjustScore(1, -1)}
          />

          {/* Separator */}
          <div style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: isForfeit ? '#ddd' : '#3498db',
            opacity: isForfeit ? 0.4 : 1,
          }}>:</div>

          {/* Player 2 */}
          <ScoreFieldWithStepper
            fieldIndex={2}
            inputId="match-entry-player2-score"
            label={formatPlayerName(player2.firstName, player2.lastName, getNameDisplayOrder())}
            value={editingMatch.player2Sets}
            isForfeit={isForfeit}
            scoreMax={scoreRule.max}
            inputRef={player2InputRef}
            onKeyDown={handleScoreKeyDown(2)}
            onIncrement={() => adjustScore(2, 1)}
            onDecrement={() => adjustScore(2, -1)}
          />
        </div>

        {/* Forfeit options — organizers only (hidden in kiosk) */}
        {allowForfeitOptions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '20px', paddingLeft: '20px', borderLeft: '1px solid #ddd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="editPlayer1Forfeit"
                tabIndex={-1}
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
                {player1DisplayName} Forfeit
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="editPlayer2Forfeit"
                tabIndex={-1}
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
                {player2DisplayName} Forfeit
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
            tabIndex={-1}
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
            onClick={trySave}
            tabIndex={-1}
            title={
              missingScorePins
                ? 'Enter both participant PINs'
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

      {requireScorePins && (
        <div style={{ width: '100%', paddingTop: '4px', borderTop: '1px solid #eee' }}>
          <style>{`
            .kiosk-score-pin-invalid::placeholder {
              color: #e74c3c;
              opacity: 1;
            }
          `}</style>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Participant PINs (required in kiosk mode)
          </label>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              ref={member1PinInputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className={invalidScorePins.member1 ? 'kiosk-score-pin-invalid' : undefined}
              value={editingMatch.member1Pin ?? ''}
              onChange={(e) => {
                if (invalidScorePins.member1) {
                  setInvalidScorePins((prev) => ({ ...prev, member1: false }));
                }
                onSetEditingMatch({
                  ...editingMatch,
                  member1Pin: e.target.value.replace(/\D/g, ''),
                });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancel();
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void trySave();
                }
              }}
              placeholder={`${player1.firstName}'s PIN`}
              aria-invalid={invalidScorePins.member1}
              style={{
                flex: '1 1 140px',
                maxWidth: '180px',
                padding: '8px',
                fontSize: '14px',
                border: `2px solid ${invalidScorePins.member1 ? '#e74c3c' : '#ccc'}`,
                borderRadius: '4px',
                color: invalidScorePins.member1 ? '#e74c3c' : 'inherit',
                // Only tint typed digits; leave fill unset when empty so red placeholder shows.
                WebkitTextFillColor:
                  invalidScorePins.member1 && (editingMatch.member1Pin ?? '')
                    ? '#e74c3c'
                    : undefined,
                boxSizing: 'border-box',
              }}
            />
            <input
              ref={member2PinInputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className={invalidScorePins.member2 ? 'kiosk-score-pin-invalid' : undefined}
              value={editingMatch.member2Pin ?? ''}
              onChange={(e) => {
                if (invalidScorePins.member2) {
                  setInvalidScorePins((prev) => ({ ...prev, member2: false }));
                }
                onSetEditingMatch({
                  ...editingMatch,
                  member2Pin: e.target.value.replace(/\D/g, ''),
                });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancel();
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void trySave();
                }
              }}
              placeholder={`${player2.firstName}'s PIN`}
              aria-invalid={invalidScorePins.member2}
              style={{
                flex: '1 1 140px',
                maxWidth: '180px',
                padding: '8px',
                border: `2px solid ${invalidScorePins.member2 ? '#e74c3c' : '#ccc'}`,
                borderRadius: '4px',
                fontSize: '14px',
                color: invalidScorePins.member2 ? '#e74c3c' : 'inherit',
                WebkitTextFillColor:
                  invalidScorePins.member2 && (editingMatch.member2Pin ?? '')
                    ? '#e74c3c'
                    : undefined,
                boxSizing: 'border-box',
              }}
            />
          </div>
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
                void confirmConfig.onConfirm?.();
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
