import React, { useState, useMemo } from 'react';
import { TournamentSetupProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import './PlayoffSetupPanel.css';

interface PlayoffSetupData {
  name: string;
  participants: Array<{
    id: number;
    name: string;
    rating: number | null;
  }>;
  bracketSize: number;
  isDoubleElimination: boolean;
  seedByRating: boolean;
}

export const PlayoffSetupPanel: React.FC<TournamentSetupProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const [setupData, setSetupData] = useState<PlayoffSetupData>({
    name: '',
    participants: [],
    bracketSize: 8,
    isDoubleElimination: false,
    seedByRating: true,
  });
  const [availablePlayers, setAvailablePlayers] = useState<Array<{
    id: number;
    firstName: string;
    lastName: string;
    rating: number | null;
    isActive: boolean;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Valid bracket sizes (powers of 2)
  const validBracketSizes = [2, 4, 8, 16, 32, 64];

  // Load available players
  React.useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const response = await fetch('/api/members');
        const players = await response.json();
        setAvailablePlayers(players.filter((p: any) => p.isActive));
      } catch (error) {
        onError('Failed to load players');
      }
    };
    fetchPlayers();
  }, [onError]);

  // Filter players based on search
  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return availablePlayers;
    
    const searchLower = searchTerm.toLowerCase();
    return availablePlayers.filter(player => {
      const fullName = formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder()).toLowerCase();
      return fullName.includes(searchLower);
    });
  }, [availablePlayers, searchTerm]);

  // Auto-adjust bracket size when participants change
  React.useEffect(() => {
    const participantCount = setupData.participants.length;
    if (participantCount > 0) {
      const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(participantCount)));
      if (nextPowerOfTwo <= 64 && nextPowerOfTwo !== setupData.bracketSize) {
        setSetupData(prev => ({ ...prev, bracketSize: nextPowerOfTwo }));
      }
    }
  }, [setupData.participants.length, setupData.bracketSize]);

  const handleAddParticipant = (player: any) => {
    if (setupData.participants.some(p => p.id === player.id)) {
      return; // Already added
    }

    if (setupData.participants.length >= setupData.bracketSize) {
      onError(`Cannot add more than ${setupData.bracketSize} participants to this bracket`);
      return;
    }

    const participant = {
      id: player.id,
      name: formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder()),
      rating: player.rating
    };

    setSetupData(prev => ({
      ...prev,
      participants: [...prev.participants, participant]
    }));
  };

  const handleRemoveParticipant = (participantId: number) => {
    setSetupData(prev => ({
      ...prev,
      participants: prev.participants.filter(p => p.id !== participantId)
    }));
  };

  const handleBracketSizeChange = (newSize: number) => {
    if (setupData.participants.length > newSize) {
      onError(`Cannot reduce bracket size below current participant count (${setupData.participants.length})`);
      return;
    }
    setSetupData(prev => ({ ...prev, bracketSize: newSize }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!setupData.name.trim()) {
      onError('Tournament name is required');
      return;
    }

    if (setupData.participants.length < 2) {
      onError('At least 2 participants are required');
      return;
    }

    if (setupData.participants.length > setupData.bracketSize) {
      onError('Number of participants cannot exceed bracket size');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: setupData.name,
          type: 'PLAYOFF',
          participantIds: setupData.participants.map(p => p.id),
          bracketSize: setupData.bracketSize,
          isDoubleElimination: setupData.isDoubleElimination,
          seedByRating: setupData.seedByRating,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create tournament');
      }

      const tournament = await response.json();
      onComplete(tournament);
    } catch (error) {
      onError('Failed to create Playoff tournament');
    } finally {
      setLoading(false);
    }
  };

  const totalMatches = setupData.isDoubleElimination 
    ? (setupData.bracketSize * 2) - 1 
    : setupData.bracketSize - 1;

  const totalRounds = Math.log2(setupData.bracketSize);

  return (
    <div className="playoff-setup">
      <div className="playoff-setup__section">
        <h4>Tournament Details</h4>
        <div className="form-group">
          <label htmlFor="tournament-name">Tournament Name</label>
          <input
            id="tournament-name"
            type="text"
            value={setupData.name}
            onChange={(e) => setSetupData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter tournament name"
            maxLength={100}
          />
        </div>

        <div className="playoff-setup__options">
          <div className="form-group">
            <label htmlFor="bracket-size">Bracket Size</label>
            <select
              id="bracket-size"
              value={setupData.bracketSize}
              onChange={(e) => handleBracketSizeChange(parseInt(e.target.value))}
            >
              {validBracketSizes.map(size => (
                <option key={size} value={size} disabled={setupData.participants.length > size}>
                  {size} participants
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={setupData.isDoubleElimination}
                onChange={(e) => setSetupData(prev => ({ ...prev, isDoubleElimination: e.target.checked }))}
              />
              Double Elimination
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={setupData.seedByRating}
                onChange={(e) => setSetupData(prev => ({ ...prev, seedByRating: e.target.checked }))}
              />
              Seed by Rating
            </label>
          </div>
        </div>
      </div>

      <div className="playoff-setup__section">
        <h4>Participants ({setupData.participants.length}/{setupData.bracketSize})</h4>
        <div className="playoff-setup__search">
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="playoff-setup__players-grid">
          <div className="playoff-setup__available">
            <h5>Available Players</h5>
            <div className="player-list">
              {filteredPlayers.map(player => (
                <div
                  key={player.id}
                  className={`player-item ${setupData.participants.some(p => p.id === player.id) ? 'selected' : ''} ${setupData.participants.length >= setupData.bracketSize ? 'disabled' : ''}`}
                  onClick={() => handleAddParticipant(player)}
                >
                  <span className="player-name">
                    {formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder())}
                  </span>
                  {player.rating !== null && (
                    <span className="player-rating">{player.rating}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="playoff-setup__selected">
            <h5>Selected Participants</h5>
            <div className="player-list">
              {setupData.participants.map(participant => (
                <div
                  key={participant.id}
                  className="player-item selected"
                  onClick={() => handleRemoveParticipant(participant.id)}
                >
                  <span className="player-name">{participant.name}</span>
                  {participant.rating !== null && (
                    <span className="player-rating">{participant.rating}</span>
                  )}
                  <button className="remove-button" onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveParticipant(participant.id);
                  }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {setupData.participants.length >= 2 && (
        <div className="playoff-setup__summary">
          <div className="summary-stats">
            <p><strong>Tournament Type:</strong> {setupData.isDoubleElimination ? 'Double Elimination' : 'Single Elimination'}</p>
            <p><strong>Total Rounds:</strong> {totalRounds}</p>
            <p><strong>Total Matches:</strong> {totalMatches}</p>
            <p><strong>Byes:</strong> {setupData.bracketSize - setupData.participants.length}</p>
          </div>
        </div>
      )}

      <div className="playoff-setup__actions">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="button-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || setupData.participants.length < 2}
          className="button-primary"
        >
          {loading ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </div>
  );
};
