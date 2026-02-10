import React, { useState, useEffect, useRef } from 'react';
import type { PostSelectionFlowProps, Member } from '../../../types/tournament';
import api from '../../../utils/api';

type Step = 'multi_toggle' | 'rearrange' | 'confirmation';

interface Props extends PostSelectionFlowProps {}

export const RoundRobinPostSelectionFlow: React.FC<Props> = ({
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
  const [step, setStep] = useState<Step>('confirmation');
  const [isMultiTournamentMode, setIsMultiTournamentMode] = useState(false);
  const [playersPerTournament, setPlayersPerTournament] = useState<string>('6');
  const [playerGroups, setPlayerGroups] = useState<number[][]>([]);
  const [draggedPlayer, setDraggedPlayer] = useState<{ playerId: number; fromGroupIndex: number } | null>(null);
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);
  const lastRecalcKeyRef = useRef<string>('');

  // Snake draft grouping
  const generateSnakeDraftGroups = (playerIds: number[], groupSize: number): number[][] => {
    const sortedPlayers = [...playerIds]
      .map(id => {
        const player = members.find(p => p.id === id);
        return { id, rating: player?.rating ?? 0 };
      })
      .sort((a, b) => b.rating - a.rating)
      .map(p => p.id);

    const numGroups = Math.ceil(sortedPlayers.length / groupSize);
    const groups: number[][] = Array(numGroups).fill(null).map(() => []);

    let playerIndex = 0;
    let round = 0;

    while (playerIndex < sortedPlayers.length) {
      const isForward = round % 2 === 0;
      if (isForward) {
        for (let groupIndex = 0; groupIndex < numGroups && playerIndex < sortedPlayers.length; groupIndex++) {
          groups[groupIndex].push(sortedPlayers[playerIndex]);
          playerIndex++;
        }
      } else {
        for (let groupIndex = numGroups - 1; groupIndex >= 0 && playerIndex < sortedPlayers.length; groupIndex--) {
          groups[groupIndex].push(sortedPlayers[playerIndex]);
          playerIndex++;
        }
      }
      round++;
    }

    return groups;
  };

  // Recalculate groups when multi-tournament mode changes
  useEffect(() => {
    if (!isMultiTournamentMode) {
      setPlayerGroups([]);
      lastRecalcKeyRef.current = '';
      return;
    }

    if (selectedPlayerIds.length === 0) {
      setPlayerGroups([]);
      lastRecalcKeyRef.current = '';
      return;
    }

    const desiredSize = parseInt(playersPerTournament) || 5;
    if (desiredSize < 3 || desiredSize > 99) {
      setPlayerGroups([]);
      lastRecalcKeyRef.current = '';
      return;
    }

    const sortedPlayerIds = [...selectedPlayerIds].sort((a, b) => a - b);
    const currentKey = `${sortedPlayerIds.join(',')}-${desiredSize}`;

    if (currentKey !== lastRecalcKeyRef.current || playerGroups.length === 0) {
      const groups = generateSnakeDraftGroups(selectedPlayerIds, desiredSize);
      setPlayerGroups(groups);
      lastRecalcKeyRef.current = currentKey;
    }
  }, [isMultiTournamentMode, selectedPlayerIds, playersPerTournament]);

  const movePlayerToGroup = (playerId: number, fromGroupIndex: number, toGroupIndex: number) => {
    if (fromGroupIndex === toGroupIndex) return;
    const newGroups = [...playerGroups];
    newGroups[fromGroupIndex] = newGroups[fromGroupIndex].filter(id => id !== playerId);
    newGroups[toGroupIndex] = [...newGroups[toGroupIndex], playerId];
    setPlayerGroups(newGroups);
  };

  const handleCreate = async () => {
    try {
      if (isMultiTournamentMode) {
        if (playerGroups.length === 0) {
          onError('No tournament groups defined. Please adjust the player groupings.');
          return;
        }

        const invalidGroups = playerGroups.filter(group => group.length < 2);
        if (invalidGroups.length > 0) {
          onError('Each tournament must have at least 2 players. Please adjust the groupings.');
          return;
        }

        const dateStr = new Date().toLocaleDateString();
        const baseName = tournamentName.trim() || `Tournament ${dateStr}`;
        const tournamentsData = playerGroups.map((group, index) => ({
          name: `${baseName}-${index + 1}`,
          participantIds: group,
          type: 'ROUND_ROBIN',
        }));

        await api.post('/tournaments/bulk', { tournaments: tournamentsData });
        onSuccess(`Successfully created ${playerGroups.length} tournament${playerGroups.length !== 1 ? 's' : ''}`);
      } else {
        const tournamentData: any = {
          participantIds: selectedPlayerIds,
          type: 'ROUND_ROBIN',
        };

        if (!tournamentName.trim()) {
          const dateStr = new Date().toLocaleDateString();
          tournamentData.name = `Tournament ${dateStr}`;
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
      }

      onCreated();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to create tournament(s)');
    }
  };

  const handleBack = () => {
    if (step === 'confirmation' && isMultiTournamentMode) {
      setStep('rearrange');
    } else if (step === 'rearrange') {
      setStep('confirmation');
      // Go back to the toggle where they can disable multi-mode
    } else {
      onBackToPlayerSelection();
    }
  };

  // Rearrange step
  if (step === 'rearrange' && isMultiTournamentMode) {
    return (
      <div>
        <h3 style={{ marginBottom: '15px' }}>Rearrangement Players</h3>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
          Players are listed with their ratings. Drag and drop players between tournaments to reorganize them.
        </p>
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#fafafa', maxHeight: '500px', overflowY: 'auto' }}>
          {playerGroups.map((group, groupIndex) => {
            const sortedGroup = [...group].sort((a, b) => {
              const playerA = members.find(p => p.id === a);
              const playerB = members.find(p => p.id === b);
              return (playerB?.rating ?? 0) - (playerA?.rating ?? 0);
            });

            return (
              <div
                key={groupIndex}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedPlayer && draggedPlayer.fromGroupIndex !== groupIndex) {
                    setDragOverGroupIndex(groupIndex);
                  }
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverGroupIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedPlayer && draggedPlayer.fromGroupIndex !== groupIndex) {
                    movePlayerToGroup(draggedPlayer.playerId, draggedPlayer.fromGroupIndex, groupIndex);
                    setDraggedPlayer(null);
                    setDragOverGroupIndex(null);
                  }
                }}
                style={{
                  padding: '10px',
                  marginBottom: '10px',
                  marginTop: groupIndex > 0 ? '20px' : '0',
                  paddingTop: groupIndex > 0 ? '20px' : '10px',
                  borderTop: groupIndex > 0 ? '3px solid #3498db' : 'none',
                  backgroundColor: dragOverGroupIndex === groupIndex ? '#e8f4f8' : 'transparent',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <h5 style={{ margin: 0, color: '#3498db' }}>
                    Tournament {groupIndex + 1} ({group.length} players)
                  </h5>
                  {dragOverGroupIndex === groupIndex && (
                    <span style={{ fontSize: '12px', color: '#3498db', fontStyle: 'italic' }}>
                      Drop here to move player
                    </span>
                  )}
                </div>

                {sortedGroup.map((playerId) => {
                  const player = members.find(p => p.id === playerId);
                  if (!player) return null;
                  const isDragging = draggedPlayer?.playerId === playerId;

                  return (
                    <div
                      key={playerId}
                      draggable
                      onDragStart={(e) => {
                        setDraggedPlayer({ playerId, fromGroupIndex: groupIndex });
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedPlayer(null);
                        setDragOverGroupIndex(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        marginBottom: '4px',
                        backgroundColor: isDragging ? '#e0e0e0' : 'white',
                        borderRadius: '4px',
                        border: '1px solid #e0e0e0',
                        cursor: 'grab',
                        opacity: isDragging ? 0.5 : 1,
                        transition: 'opacity 0.2s, background-color 0.2s',
                        userSelect: 'none',
                      }}
                      title="Drag to move to another tournament"
                    >
                      <span style={{ fontSize: '16px', color: '#999' }}>⋮⋮</span>
                      <span style={{ flex: 1, fontSize: '14px' }}>
                        {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                      </span>
                      {player.rating !== null && player.rating !== undefined && (
                        <span style={{ fontSize: '13px', color: '#666', minWidth: '60px', textAlign: 'right', fontWeight: 'bold' }}>
                          {player.rating}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={handleBack}
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
            Cancel
          </button>
          <button
            onClick={() => setStep('confirmation')}
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
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Confirmation step
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
          {isMultiTournamentMode ? 'Confirm Multi-Tournament Creation' : 'Confirm Tournament Creation'}
        </h3>

        {/* Multi-tournament toggle */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isMultiTournamentMode}
              onChange={(e) => {
                setIsMultiTournamentMode(e.target.checked);
                if (e.target.checked) {
                  const desiredSize = parseInt(playersPerTournament) || 6;
                  const groups = generateSnakeDraftGroups(selectedPlayerIds, desiredSize);
                  setPlayerGroups(groups);
                }
              }}
            />
            <span style={{ fontSize: '14px' }}>Split into multiple tournaments</span>
          </label>
          {isMultiTournamentMode && (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px' }}>Players per tournament:</label>
              <input
                type="number"
                min="3"
                max="99"
                value={playersPerTournament}
                onChange={(e) => setPlayersPerTournament(e.target.value)}
                style={{ width: '60px', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <button
                onClick={() => setStep('rearrange')}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Rearrange
              </button>
            </div>
          )}
        </div>

        {!isMultiTournamentMode && (
          <div style={{ marginBottom: '20px' }}>
            <h4>Selected Players ({selectedPlayerIds.length}):</h4>
            <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', maxHeight: '300px', overflowY: 'auto' }}>
              {selectedPlayerIds.map(playerId => {
                const player = members.find(p => p.id === playerId);
                if (!player) return null;
                return (
                  <div key={playerId} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</span>
                    {player.rating !== null && <span style={{ color: '#666' }}>{player.rating}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isMultiTournamentMode && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px' }}>
              {playerGroups.length} Tournament{playerGroups.length !== 1 ? 's' : ''} will be created
            </h4>
            <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#fafafa', maxHeight: '400px', overflowY: 'auto' }}>
              {playerGroups.map((group, groupIndex) => {
                const sortedGroup = [...group].sort((a, b) => {
                  const playerA = members.find(p => p.id === a);
                  const playerB = members.find(p => p.id === b);
                  return (playerB?.rating ?? 0) - (playerA?.rating ?? 0);
                });

                return (
                  <div key={groupIndex} style={{
                    marginBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                    paddingBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                    borderBottom: groupIndex < playerGroups.length - 1 ? '2px solid #3498db' : 'none'
                  }}>
                    <h5 style={{ margin: '0 0 10px 0', color: '#3498db' }}>
                      Tournament {groupIndex + 1} ({group.length} players)
                    </h5>
                    {sortedGroup.map((playerId) => {
                      const player = members.find(p => p.id === playerId);
                      if (!player) return null;
                      return (
                        <div key={playerId} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</span>
                          {player.rating !== null && <span style={{ color: '#666', fontWeight: 'bold' }}>{player.rating}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
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
            {isMultiTournamentMode ? `Create ${playerGroups.length} Tournaments` : (editingTournamentId ? 'Modify Tournament' : 'Create Tournament')}
          </button>
        </div>
      </div>
    </div>
  );
};
