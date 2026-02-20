import React, { useState, useMemo } from 'react';
import type { PostSelectionFlowProps } from '../../../types/tournament';
import api from '../../../utils/api';
import { snakeDraftGroups, computeGroupCapacities } from './roundRobinUtils';

type Step = 'configure' | 'confirm_groups' | 'confirmation';

/**
 * Compute valid playoff bracket sizes.
 * Must be a power of 2, >= (numGroups + prequalified), < totalPlayers.
 */
function getValidPlayoffSizes(numGroups: number, prequalified: number, totalPlayers: number): number[] {
  const minSize = numGroups + prequalified;
  const sizes: number[] = [];
  let size = 2;
  while (size <= totalPlayers) {
    if (size >= minSize && size < totalPlayers) {
      sizes.push(size);
    }
    size *= 2;
  }
  return sizes;
}

export const PreliminaryWithFinalPlayoffPostSelectionFlow: React.FC<PostSelectionFlowProps> = ({
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
  const [groupSize, setGroupSize] = useState<number>(4);
  const [playoffBracketSize, setPlayoffBracketSize] = useState<number>(0);
  const [autoQualifiedCount, setAutoQualifiedCount] = useState<number>(0);
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

  // Auto-qualified players are the top N by rating
  const autoQualifiedMemberIds = useMemo(() => {
    return sortedSelectedPlayers.slice(0, autoQualifiedCount).map(p => p.id);
  }, [sortedSelectedPlayers, autoQualifiedCount]);

  // Preliminary players are everyone except auto-qualified
  const preliminaryPlayerIds = useMemo(() => {
    return sortedSelectedPlayers
      .filter(p => !autoQualifiedMemberIds.includes(p.id))
      .map(p => p.id);
  }, [sortedSelectedPlayers, autoQualifiedMemberIds]);

  // Number of groups based on preliminary players and group size
  const numGroups = useMemo(() => {
    if (preliminaryPlayerIds.length === 0) return 0;
    return computeGroupCapacities(preliminaryPlayerIds.length, groupSize).length;
  }, [preliminaryPlayerIds, groupSize]);

  // Valid playoff bracket sizes
  const validPlayoffSizes = useMemo(() => {
    return getValidPlayoffSizes(numGroups, autoQualifiedCount, selectedPlayerIds.length);
  }, [numGroups, autoQualifiedCount, selectedPlayerIds.length]);

  // Auto-select smallest valid playoff size when options change
  useMemo(() => {
    if (validPlayoffSizes.length > 0 && !validPlayoffSizes.includes(playoffBracketSize)) {
      setPlayoffBracketSize(validPlayoffSizes[0]);
    }
  }, [validPlayoffSizes]);

  // Snake-draft grouping for preliminary players
  function generateSnakeDraftGroups(playerIds: number[], desiredGroupSize: number): number[][] {
    return snakeDraftGroups(playerIds, desiredGroupSize, (id) => members.find(p => p.id === id));
  }

  const handleContinueFromConfigure = () => {
    if (validPlayoffSizes.length === 0) {
      onError('No valid playoff bracket size available for this configuration');
      return;
    }
    if (!validPlayoffSizes.includes(playoffBracketSize)) {
      onError('Please select a valid playoff bracket size');
      return;
    }
    if (preliminaryPlayerIds.length < 2) {
      onError('Need at least 2 players in the preliminary phase');
      return;
    }
    const groups = generateSnakeDraftGroups(preliminaryPlayerIds, groupSize);
    setPlayerGroups(groups);
    setStep('confirm_groups');
  };

  const handleCreate = async () => {
    try {
      if (playerGroups.length === 0) {
        onError('No preliminary groups defined.');
        return;
      }

      const invalidGroups = playerGroups.filter(group => group.length < 2);
      if (invalidGroups.length > 0) {
        onError('Each preliminary group must have at least 2 players. Please adjust the groupings.');
        return;
      }

      const tournamentData: any = {
        participantIds: selectedPlayerIds,
        type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
        additionalData: {
          groups: playerGroups,
          playoffBracketSize,
          autoQualifiedCount,
          autoQualifiedMemberIds,
        },
      };

      if (!tournamentName.trim()) {
        const dateStr = new Date().toLocaleDateString();
        tournamentData.name = `Preliminary + Playoff ${dateStr}`;
      } else {
        tournamentData.name = tournamentName.trim();
      }

      if (editingTournamentId) {
        await api.patch(`/tournaments/${editingTournamentId}`, tournamentData);
        onSuccess('Preliminary + Final Playoff tournament modified successfully');
      } else {
        await api.post('/tournaments', tournamentData);
        onSuccess('Preliminary + Final Playoff tournament created successfully');
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

  // How many extra spots beyond prequalified + group winners
  const extraSpots = playoffBracketSize - autoQualifiedCount - numGroups;

  // ========== CONFIGURE STEP ==========
  if (step === 'configure') {
    return (
      <div>
        <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>
          Tournament Configuration
        </h3>
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          marginBottom: '15px'
        }}>
          {/* Auto-qualified count */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
              Auto-qualified players (highest rated, skip preliminary):
            </label>
            <input
              type="number"
              min="0"
              max={Math.max(0, selectedPlayerIds.length - 6)}
              value={autoQualifiedCount}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 0) {
                  setAutoQualifiedCount(value);
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
              Default: 0. These players go directly to the playoff bracket.
            </div>
          </div>

          {/* Group size */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
              Players per preliminary group:
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
              Desired group size (3-12). Actual size may be 1 less if not evenly divisible.
            </div>
          </div>

          {/* Playoff bracket size */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
              Playoff bracket size:
            </label>
            {validPlayoffSizes.length > 0 ? (
              <select
                value={playoffBracketSize}
                onChange={(e) => setPlayoffBracketSize(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                {validPlayoffSizes.map(size => (
                  <option key={size} value={size}>{size} players</option>
                ))}
              </select>
            ) : (
              <div style={{ padding: '10px', color: '#e74c3c', fontSize: '13px' }}>
                No valid bracket size available. Adjust group size or auto-qualified count.
              </div>
            )}
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
              Must be a power of 2, at least {autoQualifiedCount + numGroups} ({autoQualifiedCount} prequalified + {numGroups} group winner{numGroups !== 1 ? 's' : ''})
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
              {autoQualifiedCount > 0 && (
                <div><strong>Auto-qualified:</strong> {autoQualifiedCount} (highest rated → skip to playoff)</div>
              )}
              <div><strong>Preliminary players:</strong> {preliminaryPlayerIds.length}</div>
              <div><strong>Preliminary groups:</strong> {numGroups} groups of ~{groupSize} players</div>
              <div><strong>Playoff bracket:</strong> {playoffBracketSize} players</div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#555' }}>
                <strong>Playoff qualification:</strong> {autoQualifiedCount > 0 ? `${autoQualifiedCount} prequalified + ` : ''}
                {numGroups} group winner{numGroups !== 1 ? 's' : ''}
                {extraSpots > 0 && (
                  <span style={{ color: '#27ae60' }}> + {extraSpots} best 2nd/3rd place by rating</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
          <button
            onClick={handleContinueFromConfigure}
            disabled={validPlayoffSizes.length === 0}
            style={{
              padding: '10px 20px',
              backgroundColor: validPlayoffSizes.length > 0 ? '#27ae60' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: validPlayoffSizes.length > 0 ? 'pointer' : 'not-allowed',
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
          Confirm Groups & Auto-Qualified
        </h3>

        {/* Auto-qualified players */}
        {autoQualifiedMemberIds.length > 0 && (
          <div style={{
            border: '2px solid #f39c12',
            borderRadius: '8px',
            padding: '15px',
            backgroundColor: '#fef9e7',
            marginBottom: '15px',
          }}>
            <h5 style={{ margin: '0 0 10px 0', color: '#f39c12' }}>
              Auto-Qualified ({autoQualifiedMemberIds.length} players → Playoff directly)
            </h5>
            {autoQualifiedMemberIds.map(id => {
              const { name, rating } = getPlayerDisplay(id);
              return (
                <div
                  key={id}
                  style={{
                    padding: '6px 12px',
                    margin: '4px 0',
                    border: '1px solid #f5d89a',
                    borderRadius: '4px',
                    backgroundColor: '#fffdf0',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{name}</span>
                  {rating > 0 && <span style={{ color: '#f39c12', fontWeight: 'bold' }}>{rating}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Playoff info */}
        <div style={{
          padding: '10px 15px',
          backgroundColor: '#e8f5e9',
          borderRadius: '6px',
          border: '1px solid #a5d6a7',
          marginBottom: '15px',
          fontSize: '13px',
        }}>
          <strong>Playoff bracket:</strong> {playoffBracketSize} players |{' '}
          <strong>Qualification:</strong> {autoQualifiedCount > 0 ? `${autoQualifiedCount} prequalified + ` : ''}
          all 1st places{extraSpots > 0 ? ` + ${extraSpots} best 2nd/3rd by rating` : ''}
        </div>

        {/* Preliminary groups */}
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
            onClick={() => setStep('configure')}
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

        {/* Configuration summary */}
        <div style={{ marginBottom: '20px' }}>
          <h4>Tournament Configuration:</h4>
          <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Type:</strong> Preliminary Round Robins + Final Playoff
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Total Players:</strong> {selectedPlayerIds.length}
            </div>
            {autoQualifiedCount > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <strong>Auto-Qualified:</strong> {autoQualifiedCount} players (skip to playoff)
              </div>
            )}
            <div style={{ marginBottom: '8px' }}>
              <strong>Preliminary Groups:</strong> {playerGroups.length} groups
            </div>
            <div>
              <strong>Playoff Bracket:</strong> {playoffBracketSize} players
            </div>
          </div>
        </div>

        {/* Auto-qualified players */}
        {autoQualifiedMemberIds.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4>Auto-Qualified Players:</h4>
            <div style={{
              border: '2px solid #f39c12',
              borderRadius: '4px',
              padding: '15px',
              backgroundColor: '#fef9e7',
            }}>
              {autoQualifiedMemberIds.map(id => {
                const { name, rating } = getPlayerDisplay(id);
                return (
                  <div key={id} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{name}</span>
                    {rating > 0 && <span style={{ color: '#f39c12', fontWeight: 'bold' }}>{rating}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Preliminary groups */}
        <div style={{ marginBottom: '20px' }}>
          <h4>Preliminary Round Robin Groups:</h4>
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
