import React, { useState, useMemo } from 'react';
import type { PostSelectionFlowProps } from '../../../types/tournament';
import api from '../../../utils/api';

type Step = 'configure' | 'confirmation';

export const SwissPostSelectionFlow: React.FC<PostSelectionFlowProps> = ({
  selectedPlayerIds,
  members,
  tournamentName,
  setTournamentName,
  editingTournamentId,
  onCreated,
  onError,
  onSuccess,
  onCancel,
  onBackToPlayerSelection,
  formatPlayerName,
  nameDisplayOrder,
}) => {
  const [step, setStep] = useState<Step>('configure');

  const numPlayers = selectedPlayerIds.length;
  const minRounds = Math.ceil(Math.log2(numPlayers)) + 1;
  const maxRounds = Math.floor(numPlayers / 2);
  const [numberOfRounds, setNumberOfRounds] = useState<number>(Math.min(minRounds, maxRounds));

  // Sort players by rating for preview
  const sortedPlayers = useMemo(() => {
    return [...selectedPlayerIds]
      .map(id => {
        const player = members.find(p => p.id === id);
        return {
          id,
          name: player ? formatPlayerName(player.firstName, player.lastName, nameDisplayOrder) : 'Unknown',
          rating: player?.rating ?? 0,
        };
      })
      .sort((a, b) => b.rating - a.rating);
  }, [selectedPlayerIds, members, formatPlayerName, nameDisplayOrder]);

  const handleCreate = async () => {
    try {
      if (numPlayers % 2 !== 0) {
        onError('Swiss tournament requires an even number of players');
        return;
      }

      const tournamentData: any = {
        participantIds: selectedPlayerIds,
        type: 'SWISS',
        additionalData: {
          numberOfRounds,
        },
      };

      if (!tournamentName.trim()) {
        const dateStr = new Date().toLocaleDateString();
        tournamentData.name = `Swiss Tournament ${dateStr}`;
      } else {
        tournamentData.name = tournamentName.trim();
      }

      if (editingTournamentId) {
        await api.patch(`/tournaments/${editingTournamentId}`, tournamentData);
        onSuccess('Swiss tournament modified successfully');
      } else {
        await api.post('/tournaments', tournamentData);
        onSuccess('Swiss tournament created successfully');
      }
      onCreated();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to create tournament');
    }
  };

  // ========== CONFIGURE STEP ==========
  if (step === 'configure') {
    const isEven = numPlayers % 2 === 0;

    return (
      <div>
        <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>
          Swiss Tournament Configuration
        </h3>
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          marginBottom: '15px'
        }}>
          {!isEven && (
            <div style={{
              padding: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '6px',
              marginBottom: '16px',
              color: '#991b1b',
              fontSize: '14px',
            }}>
              Swiss tournament requires an even number of players. Currently selected: {numPlayers}.
              Please go back and adjust.
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
              Number of rounds:
            </label>
            <input
              type="number"
              min={minRounds}
              max={maxRounds}
              value={numberOfRounds}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= minRounds && value <= maxRounds) {
                  setNumberOfRounds(value);
                }
              }}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}
            />
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
              Min: {minRounds} (log2({numPlayers}) + 1), Max: {maxRounds} (50% of players)
            </div>
          </div>

          {/* Summary */}
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#f0f7ff',
            borderRadius: '6px',
            border: '1px solid #c8ddf5',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#2c5282' }}>
              Summary
            </div>
            <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.6' }}>
              <div><strong>Players:</strong> {numPlayers}</div>
              <div><strong>Rounds:</strong> {numberOfRounds}</div>
              <div><strong>Matches per round:</strong> {Math.floor(numPlayers / 2)}</div>
              <div><strong>Total matches:</strong> {numberOfRounds * Math.floor(numPlayers / 2)}</div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                After each round, players are re-paired based on current standings.
                Players with the same points play each other; within a point group,
                the highest-ranked plays the lowest-ranked they haven't faced yet.
              </div>
            </div>
          </div>

          {/* Player list preview */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#333' }}>
              Participants (by rating):
            </div>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              padding: '8px',
            }}>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} style={{
                  padding: '4px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  backgroundColor: i % 2 === 0 ? '#f9f9f9' : 'white',
                }}>
                  <span>{i + 1}. {p.name}</span>
                  <span style={{ color: '#666', fontWeight: 'bold' }}>{p.rating || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
          <button
            onClick={() => {
              if (!isEven) {
                onError('Swiss tournament requires an even number of players');
                return;
              }
              setStep('confirmation');
            }}
            disabled={!isEven}
            style={{
              padding: '10px 20px',
              backgroundColor: isEven ? '#27ae60' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isEven ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Continue
          </button>
          <button
            onClick={onBackToPlayerSelection}
            style={{
              padding: '10px 20px',
              backgroundColor: '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ========== CONFIRMATION STEP ==========
  return (
    <div>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #ddd',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
          {editingTournamentId ? 'Confirm Tournament Modification' : 'Confirm Tournament Creation'}
        </h3>

        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
          <div style={{ marginBottom: '8px' }}>
            <strong>Type:</strong> Swiss System
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Players:</strong> {numPlayers}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Rounds:</strong> {numberOfRounds}
          </div>
          <div>
            <strong>Total matches:</strong> {numberOfRounds * Math.floor(numPlayers / 2)}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4>Participants:</h4>
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '10px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {sortedPlayers.map((p, i) => (
              <div key={p.id} style={{
                padding: '4px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                backgroundColor: i % 2 === 0 ? '#f9f9f9' : 'white',
              }}>
                <span>{i + 1}. {p.name}</span>
                <span style={{ color: '#666', fontWeight: 'bold' }}>{p.rating || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={() => setStep('configure')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            style={{
              padding: '10px 20px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {editingTournamentId ? 'Modify Tournament' : 'Create Tournament'}
          </button>
        </div>
      </div>
    </div>
  );
};
