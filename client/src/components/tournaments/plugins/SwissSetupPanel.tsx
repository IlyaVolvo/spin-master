import React, { useState, useMemo } from 'react';
import { TournamentSetupProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { calculateSwissDefaultRounds, getSystemConfig } from '../../../utils/systemConfig';
import './SwissSetupPanel.css';

interface SwissSetupData {
  name: string;
  participants: Array<{
    id: number;
    name: string;
    rating: number | null;
  }>;
  numberOfRounds: number;
  pairByRating: boolean;
}

export const SwissSetupPanel: React.FC<TournamentSetupProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const swissRules = getSystemConfig().tournamentRules.swiss;
  const [setupData, setSetupData] = useState<SwissSetupData>({
    name: '',
    participants: [],
    numberOfRounds: 3,
    pairByRating: swissRules.pairByRating,
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

  // Load available players
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const membersResponse = await fetch('/api/members');
        const players = await membersResponse.json();
        setAvailablePlayers(players.filter((p: any) => p.isActive));
      } catch (error) {
        onError('Failed to load data');
      }
    };
    loadData();
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

  // Auto-adjust number of rounds when participants change
  React.useEffect(() => {
    const participantCount = setupData.participants.length;
    if (participantCount >= swissRules.minPlayers) {
      const maxRounds = Math.floor(participantCount / swissRules.maxRoundsDivisor);
      const suggestedRounds = calculateSwissDefaultRounds(participantCount, swissRules.maxRoundsDivisor);
      
      if (setupData.numberOfRounds > maxRounds) {
        setSetupData(prev => ({ ...prev, numberOfRounds: maxRounds }));
      } else if (setupData.numberOfRounds === 3) {
        setSetupData(prev => ({ ...prev, numberOfRounds: suggestedRounds }));
      }
    }
  }, [setupData.participants.length, setupData.numberOfRounds, swissRules]);

  const handleAddParticipant = (player: any) => {
    if (setupData.participants.some(p => p.id === player.id)) {
      return; // Already added
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

  const handleRoundsChange = (newRounds: number) => {
    const maxRounds = Math.floor(setupData.participants.length / swissRules.maxRoundsDivisor);
    if (newRounds < 3) {
      onError('Number of rounds must be at least 3');
      return;
    }
    if (newRounds > maxRounds) {
      onError(`Number of rounds cannot exceed ${maxRounds}`);
      return;
    }
    setSetupData(prev => ({ ...prev, numberOfRounds: newRounds }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!setupData.name.trim()) {
      onError('Tournament name is required');
      return;
    }

    if (setupData.participants.length < swissRules.minPlayers) {
      onError(`Swiss tournament requires at least ${swissRules.minPlayers} participants for meaningful pairings`);
      return;
    }

    if (setupData.numberOfRounds < 3) {
      onError('Number of rounds must be at least 3');
      return;
    }

    const maxRounds = Math.floor(setupData.participants.length / swissRules.maxRoundsDivisor);
    if (setupData.numberOfRounds > maxRounds) {
      onError(`Number of rounds cannot exceed ${maxRounds}`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/tournaments/swiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: setupData.name,
          participantIds: setupData.participants.map(p => p.id),
          numberOfRounds: setupData.numberOfRounds,
          pairByRating: setupData.pairByRating,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create tournament');
      }

      const tournament = await response.json();
      onComplete(tournament);
    } catch (error) {
      onError('Failed to create Swiss tournament');
    } finally {
      setLoading(false);
    }
  };

  const totalMatches = (setupData.participants.length / 2) * setupData.numberOfRounds;
  const maxRounds = Math.floor(setupData.participants.length / swissRules.maxRoundsDivisor);

  return (
    <div className="swiss-setup">
      <div className="swiss-setup__section">
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

        <div className="swiss-setup__options">
          <div className="form-group">
            <label htmlFor="number-of-rounds">Number of Rounds</label>
            <input
              id="number-of-rounds"
              type="number"
              min="3"
              max={maxRounds}
              value={setupData.numberOfRounds}
              onChange={(e) => handleRoundsChange(parseInt(e.target.value) || 3)}
            />
            <small className="form-help">
              Minimum: 3 rounds, maximum: {maxRounds} rounds
            </small>
          </div>

          <div className="form-group">
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={setupData.pairByRating}
                onChange={(e) => setSetupData(prev => ({ ...prev, pairByRating: e.target.checked }))}
              />
              Pair by Rating (within point groups)
            </label>
          </div>
        </div>
      </div>

      <div className="swiss-setup__section">
        <h4>Participants ({setupData.participants.length} - minimum {swissRules.minPlayers})</h4>
        <div className="swiss-setup__search">
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {setupData.participants.length < 6 && (
            <div className="warning-message">
              ⚠️ Minimum 6 participants required for meaningful Swiss pairings
            </div>
          )}
        </div>

        <div className="swiss-setup__players-grid">
          <div className="swiss-setup__available">
            <h5>Available Players</h5>
            <div className="player-list">
              {filteredPlayers.map(player => (
                <div
                  key={player.id}
                  className={`player-item ${setupData.participants.some(p => p.id === player.id) ? 'selected' : ''} ${setupData.participants.length >= 200 ? 'disabled' : ''}`}
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

          <div className="swiss-setup__selected">
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

      {setupData.participants.length >= 6 && (
        <div className="swiss-setup__summary">
          <div className="summary-stats">
            <p><strong>Tournament Type:</strong> Swiss System</p>
            <p><strong>Number of Rounds:</strong> {setupData.numberOfRounds}</p>
            <p><strong>Total Matches:</strong> {totalMatches}</p>
            <p><strong>Pairing Method:</strong> {setupData.pairByRating ? 'Swiss with rating tie-break' : 'Swiss only'}</p>
            <p><strong>Participants:</strong> {setupData.participants.length} (max 200)</p>
          </div>
        </div>
      )}

      <div className="swiss-setup__actions">
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
          disabled={loading || setupData.participants.length < 6}
          className="button-primary"
        >
          {loading ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </div>
  );
};
