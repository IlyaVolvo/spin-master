import React, { useState, useMemo } from 'react';
import type { PostSelectionFlowProps } from '../../../types/tournament';
import api from '../../../utils/api';
import { rankBasedGroups, computeGroupCapacities } from './roundRobinUtils';

type Step = 'select_group_size' | 'confirm_groups' | 'confirmation';

export const MultiRoundRobinsPostSelectionFlow: React.FC<PostSelectionFlowProps> = ({
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
  const [step, setStep] = useState<Step>('select_group_size');
  const [groupSize, setGroupSize] = useState<number>(4);
  const [playerGroups, setPlayerGroups] = useState<number[][]>([]);
  const [draggedPlayer, setDraggedPlayer] = useState<{ playerId: number; fromGroupIndex: number } | null>(null);
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);

  // Sort all selected players by rating (descending)
  const sortedSelectedPlayers = useMemo(() => {
    return [...selectedPlayerIds]
      .map(id => {
        const player = members.find(p => p.id === id);
        return { id, rating: player?.rating ?? 0 };
      })
      .sort((a, b) => b.rating - a.rating);
  }, [selectedPlayerIds, members]);

  const numGroups = useMemo(() => {
    if (sortedSelectedPlayers.length === 0) return 0;
    return computeGroupCapacities(sortedSelectedPlayers.length, groupSize).length;
  }, [sortedSelectedPlayers, groupSize]);

  const handleContinueFromGroupSize = () => {
    if (sortedSelectedPlayers.length < 4) {
      onError('Need at least 4 players for Multi Round Robin');
      return;
    }
    if (groupSize < 3) {
      onError('Group size must be at least 3');
      return;
    }
    const groups = rankBasedGroups(selectedPlayerIds, groupSize, (id) => members.find(p => p.id === id));
    setPlayerGroups(groups);
    setStep('confirm_groups');
  };

  const handleCreate = async () => {
    try {
      if (playerGroups.length < 2) {
        onError('Need at least 2 groups for Multi Round Robin.');
        return;
      }

      const invalidGroups = playerGroups.filter(group => group.length < 2);
      if (invalidGroups.length > 0) {
        onError('Each group must have at least 2 players. Please adjust the groupings.');
        return;
      }

      const tournamentData: any = {
        participantIds: selectedPlayerIds,
        type: 'MULTI_ROUND_ROBINS',
        additionalData: {
          groups: playerGroups,
        },
      };

      if (!tournamentName.trim()) {
        const dateStr = new Date().toLocaleDateString();
        tournamentData.name = `Multi Round Robin ${dateStr}`;
      } else {
        tournamentData.name = tournamentName.trim();
      }

      if (editingTournamentId) {
        await api.patch(`/tournaments/${editingTournamentId}`, tournamentData);
        onSuccess('Multi Round Robin tournament modified successfully');
      } else {
        await api.post('/tournaments', tournamentData);
        onSuccess('Multi Round Robin tournament created successfully');
      }
      onCreated();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to create tournament');
    }
  };

  const getPlayerDisplay = (id: number) => {
    const player = members.find(p => p.id === id);
    if (!player) return { name: 'Unknown', rating: 0 };
    return {
      name: formatPlayerName(player.firstName, player.lastName, nameDisplayOrder),
      rating: player.rating ?? 0,
    };
  };

  // ========== SELECT GROUP SIZE STEP ==========
  if (step === 'select_group_size') {
    return (
      <div>
        <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>
          Multi Round Robin Configuration
        </h3>
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          marginBottom: '15px'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
              Players per group:
            </label>
            <input
              type="number"
              min="3"
              max="12"
              value={groupSize}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 3 && value <= 12) {
                  setGroupSize(value);
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
              Desired group size (3-12). Players are split by rating: highest rated go to Group 1, next to Group 2, etc.
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
              <div><strong>Total players:</strong> {selectedPlayerIds.length}</div>
              <div><strong>Groups:</strong> {numGroups} groups of ~{groupSize} players</div>
              <div><strong>Grouping:</strong> By rating (strongest players together in Group 1)</div>
              {numGroups > 0 && sortedSelectedPlayers.length % groupSize !== 0 && (
                <div style={{ color: '#e67e22' }}>
                  <strong>Note:</strong> Last group will have {sortedSelectedPlayers.length % groupSize} players
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
          <button
            onClick={handleContinueFromGroupSize}
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

  // ========== CONFIRM GROUPS STEP ==========
  if (step === 'confirm_groups') {
    return (
      <div>
        <h3 style={{
          marginBottom: '15px',
          fontSize: '18px',
          fontWeight: 'bold',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 10,
          padding: '10px 0',
          borderBottom: '1px solid #e0e0e0'
        }}>
          Confirm Groups (drag players to rearrange)
        </h3>

        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          maxHeight: '500px',
          overflowY: 'auto',
          marginTop: '10px'
        }}>
          {playerGroups.map((group, groupIndex) => {
            const sortedGroup = [...group]
              .map(id => {
                const player = members.find(p => p.id === id);
                return { id, player, rating: player?.rating ?? 0 };
              })
              .sort((a, b) => b.rating - a.rating);

            return (
              <div
                key={groupIndex}
                style={{
                  marginBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                  paddingBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                  borderBottom: groupIndex < playerGroups.length - 1 ? '2px solid #3498db' : 'none'
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverGroupIndex(groupIndex);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedPlayer && dragOverGroupIndex === groupIndex) {
                    const newGroups = [...playerGroups];
                    newGroups[draggedPlayer.fromGroupIndex] = newGroups[draggedPlayer.fromGroupIndex].filter(id => id !== draggedPlayer.playerId);
                    newGroups[groupIndex] = [...newGroups[groupIndex], draggedPlayer.playerId];
                    setPlayerGroups(newGroups);
                    setDraggedPlayer(null);
                    setDragOverGroupIndex(null);
                  }
                }}
              >
                <h5 style={{ margin: '0 0 10px 0', color: '#3498db' }}>
                  Group {groupIndex + 1} ({group.length} players)
                </h5>
                {sortedGroup.map(({ id, player, rating }) => {
                  if (!player) return null;
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => setDraggedPlayer({ playerId: id, fromGroupIndex: groupIndex })}
                      onDragEnd={() => {
                        setDraggedPlayer(null);
                        setDragOverGroupIndex(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        margin: '4px 0',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        backgroundColor: dragOverGroupIndex === groupIndex ? '#e8f4f8' : '#f9f9f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        cursor: 'move'
                      }}
                    >
                      <span>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</span>
                      {rating > 0 && <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{rating}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
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
          <button
            onClick={() => setStep('select_group_size')}
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
          Confirm Tournament Creation
        </h3>

        {/* Configuration summary */}
        <div style={{ marginBottom: '20px' }}>
          <h4>Tournament Configuration:</h4>
          <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Type:</strong> Multi Round Robin
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Total Players:</strong> {selectedPlayerIds.length}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Groups:</strong> {playerGroups.length}
            </div>
            <div>
              <strong>Completion:</strong> Tournament ends when all groups finish
            </div>
          </div>
        </div>

        {/* Groups */}
        <div style={{ marginBottom: '20px' }}>
          <h4>Round Robin Groups:</h4>
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '15px',
            backgroundColor: '#fafafa',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            {playerGroups.map((group, groupIndex) => {
              const sortedGroup = [...group]
                .map(id => {
                  const player = members.find(p => p.id === id);
                  return { id, player, rating: player?.rating ?? 0 };
                })
                .sort((a, b) => b.rating - a.rating);

              return (
                <div key={groupIndex} style={{
                  marginBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                  paddingBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                  borderBottom: groupIndex < playerGroups.length - 1 ? '2px solid #3498db' : 'none'
                }}>
                  <h5 style={{ margin: '0 0 10px 0', color: '#3498db' }}>
                    Group {groupIndex + 1} ({group.length} players)
                  </h5>
                  {sortedGroup.map(({ id, player, rating }) => {
                    if (!player) return null;
                    return (
                      <div key={id} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</span>
                        {rating > 0 && <span style={{ color: '#666', fontWeight: 'bold' }}>{rating}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={() => setStep('confirm_groups')}
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
