import React, { useState, useEffect } from 'react';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  rating: number | null;
}

interface BracketPreviewProps {
  players: Player[];
  bracketPositions: Array<number | null>; // Array of player IDs in bracket order (null for BYE)
  onBracketChange: (positions: Array<number | null>) => void;
  onReseed: (numSeeds: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onTempZoneChange?: (hasPlayer: boolean) => void;
  initialNumSeeds?: number; // Initial number of seeds from parent
}

export const BracketPreview: React.FC<BracketPreviewProps> = ({
  players,
  bracketPositions,
  onBracketChange,
  onReseed,
  onDragStateChange,
  onTempZoneChange,
  initialNumSeeds,
}) => {
  const [draggedPlayerId, setDraggedPlayerId] = useState<number | null>(null);
  const [draggedFromPosition, setDraggedFromPosition] = useState<number | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);
  const [localPositions, setLocalPositions] = useState<Array<number | null>>(bracketPositions);
  const [tempDropZonePlayer, setTempDropZonePlayer] = useState<number | null>(null);
  const [isDraggingFromTempZone, setIsDraggingFromTempZone] = useState(false);
  const [rejectedDropPosition, setRejectedDropPosition] = useState<number | null>(null);
  
  // Calculate max number of seeded players:
  // No more than a quarter of the bracket size (next power of 2 >= numPlayers).
  // Must be a power of 2 >= 2, or 0 if bracket size < 8.
  const calculateMaxSeeds = (numPlayers: number): number => {
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
    return bracketSize >= 8 ? bracketSize / 4 : 0;
  };

  // Get valid seed values: all powers of 2 <= maxSeeds (including 0 for random)
  const getValidSeedValues = (): number[] => {
    const maxSeeds = calculateMaxSeeds(players.length);
    const values: number[] = [0]; // 0 means random seeding
    let power = 1; // Start from 2^1 = 2
    let value = Math.pow(2, power);
    while (value <= maxSeeds) {
      values.push(value);
      power++;
      value = Math.pow(2, power);
    }
    return values;
  };
  
  const validSeedValues = getValidSeedValues();
  
  // Calculate default: use the calculated max seeds
  const defaultNumSeeds = calculateMaxSeeds(players.length);
  
  // Use initialNumSeeds if provided, otherwise use default
  const [numSeeds, setNumSeeds] = useState<number>(initialNumSeeds !== undefined ? initialNumSeeds : defaultNumSeeds);
  
  // Update numSeeds when initialNumSeeds changes from parent
  useEffect(() => {
    if (initialNumSeeds !== undefined) {
      const validValues = getValidSeedValues();
      if (validValues.includes(initialNumSeeds)) {
        setNumSeeds(initialNumSeeds);
      }
    }
  }, [initialNumSeeds, players.length]);
  
  // Update numSeeds when bracket size changes
  useEffect(() => {
    const newValidValues = getValidSeedValues();
    const newDefault = calculateMaxSeeds(players.length);
    
    // If current numSeeds is not a valid value, reset to default
    if (!newValidValues.includes(numSeeds)) {
      setNumSeeds(newDefault);
    }
  }, [players.length, numSeeds]);

  useEffect(() => {
    setLocalPositions(bracketPositions);
  }, [bracketPositions]);

  useEffect(() => {
    if (onTempZoneChange) {
      onTempZoneChange(tempDropZonePlayer !== null);
    }
  }, [tempDropZonePlayer, onTempZoneChange]);

  const getPlayerById = (playerId: number | null): Player | undefined => {
    if (!playerId) return undefined;
    return players.find(p => p.id === playerId);
  };

  const handleDragStart = (e: React.DragEvent, playerId: number, position: number) => {
    if (!playerId) return;
    setDraggedPlayerId(playerId);
    setDraggedFromPosition(position);
    setIsDraggingFromTempZone(false);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
    if (onDragStateChange) {
      onDragStateChange(true);
    }
  };

  const handleDragOver = (e: React.DragEvent, position: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredPosition(position);
  };

  const handleDragLeave = () => {
    setHoveredPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetPosition: number) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredPosition(null);

    if (!draggedPlayerId || draggedFromPosition === null) {
      setIsDraggingFromTempZone(false);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return;
    }
    
    // Don't allow dropping on same position
    if (draggedFromPosition === targetPosition) {
      setDraggedPlayerId(null);
      setDraggedFromPosition(null);
      setIsDraggingFromTempZone(false);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return;
    }

    const targetPlayerId = localPositions[targetPosition - 1];
    const sourcePlayerId = localPositions[draggedFromPosition - 1];
    
    // Don't allow dropping if target is BYE and source is also BYE (would create double BYE)
    if (targetPlayerId === null && sourcePlayerId === null) {
      setDraggedPlayerId(null);
      setDraggedFromPosition(null);
      setIsDraggingFromTempZone(false);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return;
    }

    //  Only allow dropping on BYE slots
    // Reject drop on existing players - player returns to original position
    if (targetPlayerId !== null) {
      // Can't drop on existing player when temp zone has a player
      // Show visual feedback that drop was rejected
      setRejectedDropPosition(targetPosition);
      setTimeout(() => {
        setRejectedDropPosition(null);
        setHoveredPosition(null);
      }, 500); // Clear after animation
      
      // Reset drag state - player returns to original position (no position update)
      setDraggedPlayerId(null);
      setDraggedFromPosition(null);
      setIsDraggingFromTempZone(false);
      setHoveredPosition(null);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return; // Exit early - no position changes
    }

    // Swap players (or move player to BYE position, moving BYE to player's position)
    const updated = [...localPositions];
    
    // Special case: If dropping on a BYE slot and there's a player in temp zone,
    // place the dragged player in the BYE slot, leave temp zone player in temp zone
    // The freed position becomes a BYE
    if (targetPlayerId === null && tempDropZonePlayer !== null) {
      updated[targetPosition - 1] = draggedPlayerId; // Place dragged player in BYE slot
      updated[draggedFromPosition - 1] = null; // Freed position becomes BYE (temp zone player stays in temp zone)
      // Don't clear temp zone - player stays there until explicitly moved
    } else {
      // Normal swap (only when temp zone is empty)
      updated[draggedFromPosition - 1] = targetPlayerId;
      updated[targetPosition - 1] = draggedPlayerId;
    }
    
    // Check if this swap would create a match with two BYEs
    // Find which match the target position is in
    const targetMatchIndex = Math.floor((targetPosition - 1) / 2);
    const targetMatchStart = targetMatchIndex * 2;
    const targetMatchPlayer1 = updated[targetMatchStart];
    const targetMatchPlayer2 = updated[targetMatchStart + 1];
    
    // Also check the source match
    const sourceMatchIndex = Math.floor((draggedFromPosition - 1) / 2);
    const sourceMatchStart = sourceMatchIndex * 2;
    const sourceMatchPlayer1 = updated[sourceMatchStart];
    const sourceMatchPlayer2 = updated[sourceMatchStart + 1];
    
    // Prevent if either match would have two BYEs
    if ((targetMatchPlayer1 === null && targetMatchPlayer2 === null) ||
        (sourceMatchPlayer1 === null && sourceMatchPlayer2 === null)) {
      setDraggedPlayerId(null);
      setDraggedFromPosition(null);
      setIsDraggingFromTempZone(false);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return;
    }
    
    setLocalPositions(updated);
    onBracketChange(updated);
    setDraggedPlayerId(null);
    setDraggedFromPosition(null);
    setIsDraggingFromTempZone(false);
    if (onDragStateChange) {
      onDragStateChange(false);
    }
  };

  const handleDragEnd = () => {
    // If player is in temp zone, keep them there (don't auto-return)
    setDraggedPlayerId(null);
    setDraggedFromPosition(null);
    setHoveredPosition(null);
    setIsDraggingFromTempZone(false);
    if (onDragStateChange) {
      onDragStateChange(false);
    }
  };

  const handleDropInTempZone = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedPlayerId || draggedFromPosition === null) return;
    
    // Check if the match has 2 players (not a BYE match)
    const matchIndex = Math.floor((draggedFromPosition - 1) / 2);
    const matchStart = matchIndex * 2;
    const matchPlayer1 = localPositions[matchStart];
    const matchPlayer2 = localPositions[matchStart + 1];
    const hasTwoPlayers = matchPlayer1 !== null && matchPlayer2 !== null;
    
    // Only allow moving to temp zone if the match has 2 players
    if (!hasTwoPlayers) {
      setDraggedPlayerId(null);
      setDraggedFromPosition(null);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return;
    }
    
    // If temp zone already has a player, swap them
    if (tempDropZonePlayer) {
      const updated = [...localPositions];
      updated[draggedFromPosition - 1] = tempDropZonePlayer;
      setLocalPositions(updated);
      setTempDropZonePlayer(draggedPlayerId);
      onBracketChange(updated);
    } else {
      // Move player to temp zone
      const updated = [...localPositions];
      updated[draggedFromPosition - 1] = null; // Clear original position (becomes BYE temporarily)
      setLocalPositions(updated);
      setTempDropZonePlayer(draggedPlayerId);
      onBracketChange(updated);
    }
    
    setDraggedPlayerId(null);
    setDraggedFromPosition(null);
    setIsDraggingFromTempZone(false);
    if (onDragStateChange) {
      onDragStateChange(false);
    }
  };

  const handleDragStartFromTemp = (e: React.DragEvent) => {
    if (!tempDropZonePlayer) return;
    setDraggedPlayerId(tempDropZonePlayer);
    setIsDraggingFromTempZone(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    if (onDragStateChange) {
      onDragStateChange(true);
    }
  };

  const handleDropFromTempZone = (e: React.DragEvent, targetPosition: number) => {
    e.preventDefault();
    if (tempDropZonePlayer === null) return;
    
    const targetPlayerId = localPositions[targetPosition - 1];
    
    // Allow dropping on BYE slots - replace BYE with player from temp zone
    if (targetPlayerId === null) {
      // Dropping on BYE slot - place the player there and clear temp zone
      const updated = [...localPositions];
      updated[targetPosition - 1] = tempDropZonePlayer;
      
      // Check if this would create a match with two BYEs
      const targetMatchIndex = Math.floor((targetPosition - 1) / 2);
      const targetMatchStart = targetMatchIndex * 2;
      const targetMatchPlayer1 = updated[targetMatchStart];
      const targetMatchPlayer2 = updated[targetMatchStart + 1];
      
      if (targetMatchPlayer1 === null && targetMatchPlayer2 === null) {
        // Would create two BYEs - don't allow
        setDraggedPlayerId(null);
        if (onDragStateChange) {
          onDragStateChange(false);
        }
        return;
      }
      
      // Valid drop on BYE - place player and clear temp zone
      setLocalPositions(updated);
      onBracketChange(updated);
      setTempDropZonePlayer(null);
      setDraggedPlayerId(null);
      setIsDraggingFromTempZone(false);
      if (onDragStateChange) {
        onDragStateChange(false);
      }
      return;
    }

    // Dropping on a non-BYE slot (player already there) - swap not allowed
    // Only allow dropping on BYE slots from temp zone
    setDraggedPlayerId(null);
    setIsDraggingFromTempZone(false);
    if (onDragStateChange) {
      onDragStateChange(false);
    }
  };

  // Calculate bracket size (next power of 2)
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(players.length)));
  
  // Group positions into matches for first round
  const firstRoundMatches: Array<{ player1Pos: number; player2Pos: number; matchNum: number }> = [];
  for (let i = 0; i < bracketSize; i += 2) {
    firstRoundMatches.push({
      player1Pos: i + 1,
      player2Pos: i + 2,
      matchNum: (i / 2) + 1,
    });
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>Organize Bracket</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>Seeds:</span>
            <select
              value={numSeeds}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && validSeedValues.includes(value)) {
                  setNumSeeds(value);
                  // Immediately update parent state so details reflect the change
                  onReseed(value);
                }
              }}
              style={{
                padding: '4px 8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '80px',
              }}
            >
              {validSeedValues.map(value => (
                <option key={value} value={value}>
                  {value === 0 ? '0 (Random)' : value.toString()}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => onReseed(numSeeds)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Seed by Rating
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
      `}</style>
      <div style={{ marginBottom: '15px', fontSize: '14px', color: '#666' }}>
        <p style={{ margin: '0 0 10px 0' }}>
          <strong>Round 1</strong> - Drag players to reposition them in the bracket
        </p>
        <p style={{ margin: 0, fontSize: '12px', fontStyle: 'italic' }}>
          💡 Top seeds get BYEs. Weakest players play early matches. Drag players to customize the bracket. Use the temporary drop zone to hold a player while rearranging.
        </p>
      </div>

      {/* Temporary Drop Zone - styled like a player cell */}
      <div
        style={{
          marginBottom: '15px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: '300px',
            padding: '8px',
            backgroundColor: tempDropZonePlayer ? '#e3f2fd' : '#fff3cd',
            border: tempDropZonePlayer ? '2px solid #2196f3' : '2px dashed #ffc107',
            borderRadius: '4px',
            textAlign: 'center',
            minHeight: '50px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            cursor: tempDropZonePlayer ? 'default' : 'default',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleDropInTempZone}
        >
          {tempDropZonePlayer && (
            <>
              <button
                onClick={() => {
                  setTempDropZonePlayer(null);
                }}
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  padding: '4px 8px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                title="Clear temporary drop zone"
              >
                ✕
              </button>
              <div 
                draggable
                onDragStart={handleDragStartFromTemp}
                onDragEnd={handleDragEnd}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  gap: '4px',
                  cursor: 'grab',
                  width: '100%',
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#1976d2', fontSize: '16px' }}>
                  {(() => {
                    const player = getPlayerById(tempDropZonePlayer);
                    return player ? formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder()) : 'Player';
                  })()}
                </div>
                {(() => {
                  const player = getPlayerById(tempDropZonePlayer);
                  return player?.rating ? (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Rating: {player.rating}
                    </div>
                  ) : null;
                })()}
              </div>
            </>
          )}
          {!tempDropZonePlayer && (
            <div style={{ color: '#856404', fontWeight: 'bold', fontSize: '13px' }}>
              Drop player here temporarily
            </div>
          )}
        </div>
      </div>


      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {firstRoundMatches.map((match) => {
          const player1Id = localPositions[match.player1Pos - 1];
          const player2Id = localPositions[match.player2Pos - 1];
          const player1 = getPlayerById(player1Id);
          const player2 = getPlayerById(player2Id);
          const player1IsBye = player1Id === null;
          const player2IsBye = player2Id === null;

          // Ensure no match has two BYEs
          const hasTwoByes = player1IsBye && player2IsBye;
          if (hasTwoByes) {
          }

          const isPlayer1Dragged = draggedPlayerId === player1Id;
          const isPlayer2Dragged = draggedPlayerId === player2Id;
          const isPlayer1Hovered = hoveredPosition === match.player1Pos;
          const isPlayer2Hovered = hoveredPosition === match.player2Pos;
          
          // Can't drag a player if the other player in the match is a BYE (would create 2 BYEs)
          const canDragPlayer1 = !player1IsBye && !!player1Id && !player2IsBye;
          const canDragPlayer2 = !player2IsBye && !!player2Id && !player1IsBye;
          
          // Check if dropping is not allowed on this position
          const isPlayer1DropNotAllowed = (isPlayer1Hovered && player1Id !== null && 
            ((tempDropZonePlayer !== null && draggedPlayerId && !isDraggingFromTempZone) || 
             (isDraggingFromTempZone))) || rejectedDropPosition === match.player1Pos;
          const isPlayer2DropNotAllowed = (isPlayer2Hovered && player2Id !== null && 
            ((tempDropZonePlayer !== null && draggedPlayerId && !isDraggingFromTempZone) || 
             (isDraggingFromTempZone))) || rejectedDropPosition === match.player2Pos;
          
          // Check if we should show grey hover (hovering over existing player - illegal drop)
          // Grey hover when hovering over existing players (not BYE slots) - always illegal
          const isPlayer1GreyHover = isPlayer1Hovered && player1Id !== null && 
                                     draggedPlayerId && !isDraggingFromTempZone && !isPlayer1DropNotAllowed;
          const isPlayer2GreyHover = isPlayer2Hovered && player2Id !== null && 
                                     draggedPlayerId && !isDraggingFromTempZone && !isPlayer2DropNotAllowed;
          
          // Check if this is the source position (player being dragged from here)
          const isPlayer1SourcePosition = draggedFromPosition === match.player1Pos && draggedPlayerId !== null;
          const isPlayer2SourcePosition = draggedFromPosition === match.player2Pos && draggedPlayerId !== null;

          return (
            <div
              key={match.matchNum}
              style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '10px',
                backgroundColor: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
              }}
            >
              <div style={{ minWidth: '40px', textAlign: 'center', fontWeight: 'bold', color: '#666' }}>
                Match {match.matchNum}
              </div>
              
              {/* Player 1 */}
              <div
                draggable={canDragPlayer1}
                onDragStart={(e) => {
                  if (canDragPlayer1) {
                    e.stopPropagation();
                    handleDragStart(e, player1Id!, match.player1Pos);
                  } else {
                    e.preventDefault();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // If dragging from temp zone, only allow dropping on BYE slots
                  if (isDraggingFromTempZone) {
                    if (player1Id === null) {
                      e.dataTransfer.dropEffect = 'move';
                    } else {
                      e.dataTransfer.dropEffect = 'none';
                    }
                  } else if (draggedPlayerId) {
                    // If temp zone has a player, only allow dropping on BYE slots
                    if (tempDropZonePlayer !== null) {
                      if (player1Id === null) {
                        e.dataTransfer.dropEffect = 'move';
                      } else {
                        e.dataTransfer.dropEffect = 'none';
                      }
                    } else {
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }
                  handleDragOver(e, match.player1Pos);
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isDraggingFromTempZone) {
                    handleDropFromTempZone(e, match.player1Pos);
                  } else if (draggedPlayerId) {
                    handleDrop(e, match.player1Pos);
                  }
                }}
                title={
                  isPlayer1DropNotAllowed ? 'Cannot drop here: Only BYE slots are allowed when temp zone has a player' :
                  !canDragPlayer1 && !player1IsBye && player1Id ? 'Cannot drag: other player in match is BYE' : ''
                }
                onDragEnd={handleDragEnd}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: isPlayer1DropNotAllowed ? '#ffebee' : 
                                   isPlayer1Dragged ? '#ffebee' : 
                                   isPlayer1SourcePosition ? '#9e9e9e' : 
                                   isPlayer1GreyHover ? '#9e9e9e' : 
                                   isPlayer1Hovered && !isPlayer1DropNotAllowed && player1Id === null ? '#e8f5e9' : 
                                   isPlayer1Hovered && !isPlayer1DropNotAllowed && player1Id !== null && draggedPlayerId ? '#9e9e9e' : 
                                   isPlayer1Hovered && !isPlayer1DropNotAllowed ? '#e8f5e9' : 
                                   player1IsBye ? '#f0f0f0' : '#fff',
                  border: isPlayer1DropNotAllowed ? '2px solid #f44336' : 
                         isPlayer1SourcePosition ? '2px solid #757575' : 
                         isPlayer1GreyHover ? '2px solid #757575' : 
                         isPlayer1Hovered && !isPlayer1DropNotAllowed && player1Id === null ? '2px solid #4caf50' : 
                         isPlayer1Hovered && !isPlayer1DropNotAllowed && player1Id !== null && draggedPlayerId ? '2px solid #757575' : 
                         isPlayer1Hovered && !isPlayer1DropNotAllowed ? '2px solid #4caf50' : 
                         isPlayer1Dragged ? '2px dashed #f44336' : 
                         '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: isPlayer1DropNotAllowed ? 'not-allowed' : 
                         canDragPlayer1 ? 'grab' : 'default',
                  minHeight: '50px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  opacity: isPlayer1Dragged ? 0.5 : isPlayer1DropNotAllowed ? 0.7 : 1,
                  transition: 'all 0.2s',
                  position: 'relative',
                  animation: rejectedDropPosition === match.player1Pos ? 'shake 0.5s' : 'none',
                }}
              >
                {isPlayer1DropNotAllowed && (
                  <div style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    color: '#f44336',
                    fontSize: '18px',
                    fontWeight: 'bold',
                  }}>✕</div>
                )}
                {player1IsBye ? (
                  <span style={{ color: '#999', fontStyle: 'italic', textAlign: 'center' }}>BYE</span>
                ) : player1 ? (
                  <>
                    <div style={{ fontWeight: 'bold', textAlign: 'center' }}>
                      {formatPlayerName(player1.firstName, player1.lastName, getNameDisplayOrder())}
                    </div>
                    {player1.rating && (
                      <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '4px' }}>
                        Rating: {player1.rating}
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#999', textAlign: 'center' }}>Empty</span>
                )}
              </div>

              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#999' }}>vs</div>

              {/* Player 2 */}
              <div
                draggable={canDragPlayer2}
                onDragStart={(e) => {
                  if (canDragPlayer2) {
                    e.stopPropagation();
                    handleDragStart(e, player2Id!, match.player2Pos);
                  } else {
                    e.preventDefault();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // If dragging from temp zone, only allow dropping on BYE slots
                  if (isDraggingFromTempZone) {
                    if (player2Id === null) {
                      e.dataTransfer.dropEffect = 'move';
                    } else {
                      e.dataTransfer.dropEffect = 'none';
                    }
                  } else if (draggedPlayerId) {
                    // If temp zone has a player, only allow dropping on BYE slots
                    if (tempDropZonePlayer !== null) {
                      if (player2Id === null) {
                        e.dataTransfer.dropEffect = 'move';
                      } else {
                        e.dataTransfer.dropEffect = 'none';
                      }
                    } else {
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }
                  handleDragOver(e, match.player2Pos);
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isDraggingFromTempZone) {
                    handleDropFromTempZone(e, match.player2Pos);
                  } else if (draggedPlayerId) {
                    handleDrop(e, match.player2Pos);
                  }
                }}
                title={
                  isPlayer2DropNotAllowed ? 'Cannot drop here: Only BYE slots are allowed when temp zone has a player' :
                  !canDragPlayer2 && !player2IsBye && player2Id ? 'Cannot drag: other player in match is BYE' : ''
                }
                onDragEnd={handleDragEnd}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: isPlayer2DropNotAllowed ? '#ffebee' : 
                                   isPlayer2Dragged ? '#ffebee' : 
                                   isPlayer2SourcePosition ? '#9e9e9e' : 
                                   isPlayer2GreyHover ? '#9e9e9e' : 
                                   isPlayer2Hovered && !isPlayer2DropNotAllowed && player2Id === null ? '#e8f5e9' : 
                                   isPlayer2Hovered && !isPlayer2DropNotAllowed && player2Id !== null && draggedPlayerId ? '#9e9e9e' : 
                                   isPlayer2Hovered && !isPlayer2DropNotAllowed ? '#e8f5e9' : 
                                   player2IsBye ? '#f0f0f0' : '#fff',
                  border: isPlayer2DropNotAllowed ? '2px solid #f44336' : 
                         isPlayer2SourcePosition ? '2px solid #757575' : 
                         isPlayer2GreyHover ? '2px solid #757575' : 
                         isPlayer2Hovered && !isPlayer2DropNotAllowed && player2Id === null ? '2px solid #4caf50' : 
                         isPlayer2Hovered && !isPlayer2DropNotAllowed && player2Id !== null && draggedPlayerId ? '2px solid #757575' : 
                         isPlayer2Hovered && !isPlayer2DropNotAllowed ? '2px solid #4caf50' : 
                         isPlayer2Dragged ? '2px dashed #f44336' : 
                         '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: isPlayer2DropNotAllowed ? 'not-allowed' : 
                         canDragPlayer2 ? 'grab' : 'default',
                  minHeight: '50px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  opacity: isPlayer2Dragged ? 0.5 : isPlayer2DropNotAllowed ? 0.7 : 1,
                  transition: 'all 0.2s',
                  position: 'relative',
                  animation: rejectedDropPosition === match.player2Pos ? 'shake 0.5s' : 'none',
                }}
              >
                {isPlayer2DropNotAllowed && (
                  <div style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    color: '#f44336',
                    fontSize: '18px',
                    fontWeight: 'bold',
                  }}>✕</div>
                )}
                {player2IsBye ? (
                  <span style={{ color: '#999', fontStyle: 'italic', textAlign: 'center' }}>BYE</span>
                ) : player2 ? (
                  <>
                    <div style={{ fontWeight: 'bold', textAlign: 'center' }}>
                      {formatPlayerName(player2.firstName, player2.lastName, getNameDisplayOrder())}
                    </div>
                    {player2.rating && (
                      <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '4px' }}>
                        Rating: {player2.rating}
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#999', textAlign: 'center' }}>Empty</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
