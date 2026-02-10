import React, { useState, useEffect } from 'react';
import type { PostSelectionFlowProps, Member } from '../../../types/tournament';
import { BracketPreview } from '../../BracketPreview';
import api from '../../../utils/api';

type Step = 'organize_bracket' | 'completion';

export const PlayoffPostSelectionFlow: React.FC<PostSelectionFlowProps> = ({
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
  const [step, setStep] = useState<Step>('organize_bracket');
  const [bracketPositions, setBracketPositions] = useState<Array<number | null>>([]);
  const [isDraggingInBracket, setIsDraggingInBracket] = useState(false);
  const [hasPlayerInTempZone, setHasPlayerInTempZone] = useState(false);
  const [numSeedsForBracket, setNumSeedsForBracket] = useState<number | undefined>(undefined);

  const calculateMaxSeeds = (numPlayers: number): number => {
    const quarterPlayers = Math.floor(numPlayers / 4);
    if (quarterPlayers < 2) return 0;
    return Math.pow(2, Math.floor(Math.log2(quarterPlayers)));
  };

  const fetchBracketPreview = async (numSeeds?: number) => {
    try {
      const seeds = numSeeds ?? calculateMaxSeeds(selectedPlayerIds.length);
      if (numSeedsForBracket === undefined) {
        setNumSeedsForBracket(seeds);
      }
      const response = await api.post('/tournaments/preview', {
        tournamentType: 'PLAYOFF',
        participantIds: selectedPlayerIds,
        numSeeds: seeds,
      });
      setBracketPositions(response.data.bracketPositions);
    } catch (error: any) {
      onError('Failed to generate bracket. Please try again.');
    }
  };

  const handleReseedBracket = async (numSeeds: number) => {
    setNumSeedsForBracket(numSeeds);
    try {
      const response = await api.post('/tournaments/preview', {
        tournamentType: 'PLAYOFF',
        participantIds: selectedPlayerIds,
        numSeeds: numSeeds,
      });
      setBracketPositions(response.data.bracketPositions);
    } catch (error: any) {
      onError('Failed to generate bracket preview. Please try again.');
    }
  };

  // Generate bracket on mount
  useEffect(() => {
    if (bracketPositions.length === 0 && selectedPlayerIds.length >= 4) {
      fetchBracketPreview();
    }
  }, [selectedPlayerIds]);

  const players = selectedPlayerIds
    .map(id => members.find(p => p.id === id))
    .filter((p): p is Member => p !== undefined);

  const handleCreate = async () => {
    try {
      const tournamentData: any = {
        participantIds: selectedPlayerIds,
        type: 'PLAYOFF',
      };

      if (bracketPositions.length > 0) {
        const playersInBracket = bracketPositions.filter((id): id is number => id !== null);
        const missingPlayers = selectedPlayerIds.filter(id => !playersInBracket.includes(id));
        if (missingPlayers.length > 0) {
          onError('Some players are missing from the bracket. Please reorganize the bracket.');
          return;
        }
        tournamentData.bracketPositions = bracketPositions;
      }

      if (!tournamentName.trim()) {
        const dateStr = new Date().toLocaleDateString();
        tournamentData.name = `Playoff ${dateStr}`;
      } else {
        tournamentData.name = tournamentName.trim();
      }

      if (editingTournamentId) {
        await api.patch(`/tournaments/${editingTournamentId}/participants`, {
          participantIds: selectedPlayerIds
        });
        await api.patch(`/tournaments/${editingTournamentId}/name`, {
          name: tournamentData.name,
          createdAt: new Date().toISOString()
        });
        onSuccess('Tournament modified successfully');
      } else {
        await api.post('/tournaments', tournamentData);
        onSuccess('Tournament created successfully');
      }

      onCreated();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to create tournament');
    }
  };

  // Organize bracket step
  if (step === 'organize_bracket') {
    return (
      <div>
        {bracketPositions.length > 0 ? (
          <BracketPreview
            players={players}
            bracketPositions={bracketPositions}
            onBracketChange={setBracketPositions}
            onReseed={handleReseedBracket}
            onDragStateChange={setIsDraggingInBracket}
            onTempZoneChange={setHasPlayerInTempZone}
            initialNumSeeds={numSeedsForBracket}
          />
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            Loading bracket preview...
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
          <button
            onClick={() => setStep('completion')}
            disabled={isDraggingInBracket || hasPlayerInTempZone}
            style={{
              padding: '10px 20px',
              backgroundColor: (isDraggingInBracket || hasPlayerInTempZone) ? '#95a5a6' : '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isDraggingInBracket || hasPlayerInTempZone) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              opacity: (isDraggingInBracket || hasPlayerInTempZone) ? 0.7 : 1,
            }}
            title={isDraggingInBracket ? 'Finish dragging player to enable tournament creation' : hasPlayerInTempZone ? 'Clear temporary drop zone to enable tournament creation' : 'Continue'}
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
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Completion step - first round matches preview
  return (
    <div>
      <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>First Round Matches</h3>
      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: 'white',
        maxHeight: '500px',
        overflowY: 'auto'
      }}>
        {(() => {
          const firstRoundMatches: Array<{ player1: number | null, player2: number | null }> = [];
          for (let i = 0; i < bracketPositions.length; i += 2) {
            firstRoundMatches.push({
              player1: bracketPositions[i] ?? null,
              player2: bracketPositions[i + 1] ?? null
            });
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {firstRoundMatches.map((match, index) => {
                const player1 = match.player1 ? members.find(p => p.id === match.player1) : null;
                const player2 = match.player2 ? members.find(p => p.id === match.player2) : null;

                return (
                  <div
                    key={index}
                    style={{
                      padding: '12px 16px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      backgroundColor: '#f9f9f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '20px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      <span style={{
                        fontWeight: 'bold',
                        color: '#666',
                        minWidth: '30px',
                        fontSize: '14px'
                      }}>
                        Match {index + 1}:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        {player1 ? (
                          <>
                            <span style={{ fontWeight: '500' }}>
                              {player1.firstName} {player1.lastName}
                            </span>
                            <span style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '12px' }}>
                              ({player1.rating})
                            </span>
                          </>
                        ) : (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>BYE</span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: '#999', fontSize: '18px', fontWeight: 'bold' }}>vs</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
                      {player2 ? (
                        <>
                          <span style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '12px' }}>
                            ({player2.rating})
                          </span>
                          <span style={{ fontWeight: '500' }}>
                            {player2.firstName} {player2.lastName}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>BYE</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
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
          Create a Tournament
        </button>
        <button
          onClick={() => setStep('organize_bracket')}
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
          Cancel
        </button>
      </div>
    </div>
  );
};
