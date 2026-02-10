import React, { useState } from 'react';
import type { PostSelectionFlowProps, Member } from '../../../types/tournament';
import api from '../../../utils/api';

type Step = 'select_group_size' | 'confirm_groups' | 'select_playoff_size' | 'confirmation';

export const PreliminaryAndPlayoffPostSelectionFlow: React.FC<PostSelectionFlowProps> = ({
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
  const [roundRobinSize, setRoundRobinSize] = useState<number>(6);
  const [playerGroups, setPlayerGroups] = useState<number[][]>([]);
  const [playoffBracketSize, setPlayoffBracketSize] = useState<number | null>(null);
  const [draggedPlayer, setDraggedPlayer] = useState<{ playerId: number; fromGroupIndex: number } | null>(null);
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);

  function generateSnakeDraftGroups(playerIds: number[], groupSize: number): number[][] {
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
        for (let gi = 0; gi < numGroups && playerIndex < sortedPlayers.length; gi++) {
          groups[gi].push(sortedPlayers[playerIndex]);
          playerIndex++;
        }
      } else {
        for (let gi = numGroups - 1; gi >= 0 && playerIndex < sortedPlayers.length; gi--) {
          groups[gi].push(sortedPlayers[playerIndex]);
          playerIndex++;
        }
      }
      round++;
    }

    return groups;
  }

  const getValidPlayoffSizes = (): number[] => {
    const numGroups = playerGroups.length;
    const totalPlayers = selectedPlayerIds.length;
    const validSizes: number[] = [];
    let powerOf2 = 2;
    while (powerOf2 < totalPlayers) {
      if (powerOf2 >= numGroups) {
        validSizes.push(powerOf2);
      }
      powerOf2 *= 2;
    }
    return validSizes;
  };

  const handleCreate = async () => {
    try {
      if (playerGroups.length === 0) {
        onError('No Round Robin groups defined. Please adjust the player groupings.');
        return;
      }

      if (playoffBracketSize === null) {
        onError('Please select a playoff bracket size');
        return;
      }

      const invalidGroups = playerGroups.filter(group => group.length < 2);
      if (invalidGroups.length > 0) {
        onError('Each Round Robin group must have at least 2 players. Please adjust the groupings.');
        return;
      }

      const tournamentData: any = {
        participantIds: selectedPlayerIds,
        type: 'PRELIMINARY_AND_PLAYOFF',
        roundRobinSize: roundRobinSize,
        playoffBracketSize: playoffBracketSize,
        groups: playerGroups,
      };

      if (!tournamentName.trim()) {
        const dateStr = new Date().toLocaleDateString();
        tournamentData.name = `Round Robin + Playoff ${dateStr}`;
      } else {
        tournamentData.name = tournamentName.trim();
      }

      await api.post('/tournaments', tournamentData);
      onSuccess('Round Robin + Playoff tournament created successfully');
      onCreated();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to create tournament');
    }
  };

  // select_group_size step
  if (step === 'select_group_size') {
    const numGroups = selectedPlayerIds.length > 0 ? Math.ceil(selectedPlayerIds.length / roundRobinSize) : 0;
    return (
      <div>
        <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>
          Round Robin Group Size
        </h3>
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          marginBottom: '15px'
        }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
            Players per Round Robin group:
          </label>
          <input
            type="number"
            min="3"
            max="12"
            value={roundRobinSize}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 3 && value <= 12) {
                setRoundRobinSize(value);
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
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            Number of players per Round Robin group (3-12)
          </div>
          {numGroups > 0 && (
            <div style={{ marginTop: '12px', fontSize: '14px', color: '#27ae60', fontWeight: 'bold' }}>
              → {numGroups} Round Robin group{numGroups !== 1 ? 's' : ''} will be created
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
          <button
            onClick={() => {
              const groups = generateSnakeDraftGroups(selectedPlayerIds, roundRobinSize);
              setPlayerGroups(groups);
              setStep('confirm_groups');
            }}
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

  // confirm_groups step
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
          Round Robin Groups ({playerGroups.length} groups)
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
            onClick={() => {
              const validSizes = getValidPlayoffSizes();
              if (validSizes.length > 0) {
                setPlayoffBracketSize(validSizes[0]);
                setStep('select_playoff_size');
              } else {
                onError('Cannot determine valid playoff bracket size');
              }
            }}
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
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // select_playoff_size step
  if (step === 'select_playoff_size') {
    const validSizes = getValidPlayoffSizes();

    return (
      <div>
        <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>
          Select Playoff Bracket Size
        </h3>
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white'
        }}>
          <p style={{ marginBottom: '15px', color: '#666' }}>
            Choose the size of the playoff bracket. Must be a power of 2, greater than or equal to the number of groups ({playerGroups.length}), and less than the total number of players ({selectedPlayerIds.length}).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {validSizes.map(size => (
              <label
                key={size}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  border: playoffBracketSize === size ? '2px solid #3498db' : '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: playoffBracketSize === size ? '#e8f4f8' : 'white'
                }}
              >
                <input
                  type="radio"
                  name="playoffBracketSize"
                  value={size}
                  checked={playoffBracketSize === size}
                  onChange={() => setPlayoffBracketSize(size)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '16px', fontWeight: '500' }}>
                  {size} players
                </span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
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
              fontWeight: 'bold',
            }}
          >
            Back
          </button>
          <button
            onClick={() => setStep('confirmation')}
            disabled={playoffBracketSize === null}
            style={{
              padding: '10px 20px',
              backgroundColor: playoffBracketSize === null ? '#95a5a6' : '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: playoffBracketSize === null ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              opacity: playoffBracketSize === null ? 0.6 : 1,
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // confirmation step
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

        <div style={{ marginBottom: '20px' }}>
          <h4>Tournament Configuration:</h4>
          <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Round Robin Groups:</strong> {playerGroups.length} groups &lt;= {roundRobinSize} players
            </div>
            <div>
              <strong>Playoff Bracket Size:</strong> {playoffBracketSize} players
            </div>
          </div>
          <h4>Round Robin Groups:</h4>
          <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#fafafa', maxHeight: '400px', overflowY: 'auto' }}>
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
            onClick={() => setStep('select_playoff_size')}
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
            Create Tournament
          </button>
        </div>
      </div>
    </div>
  );
};
