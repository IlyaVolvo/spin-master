import React, { useState, useMemo } from 'react';
import { TournamentSetupProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import './RoundRobinSetupPanel.css';

interface RoundRobinSetupData {
  name: string;
  participants: Array<{
    id: number;
    name: string;
    rating: number | null;
  }>;
}

export const RoundRobinSetupPanel: React.FC<TournamentSetupProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const [setupData, setSetupData] = useState<RoundRobinSetupData>({
    name: '',
    participants: []
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

    if (setupData.participants.length > 100) {
      onError('Round Robin tournament cannot have more than 100 participants');
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
          type: 'ROUND_ROBIN',
          participantIds: setupData.participants.map(p => p.id),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create tournament');
      }

      const tournament = await response.json();
      onComplete(tournament);
    } catch (error) {
      onError('Failed to create Round Robin tournament');
    } finally {
      setLoading(false);
    }
  };

  const totalMatches = (setupData.participants.length * (setupData.participants.length - 1)) / 2;

  return (
    <div className="round-robin-setup">
      <div className="round-robin-setup__section">
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
      </div>

      <div className="round-robin-setup__section">
        <h4>Participants ({setupData.participants.length} selected)</h4>
        <div className="round-robin-setup__search">
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="round-robin-setup__players-grid">
          <div className="round-robin-setup__available">
            <h5>Available Players</h5>
            <div className="player-list">
              {filteredPlayers.map(player => (
                <div
                  key={player.id}
                  className={`player-item ${setupData.participants.some(p => p.id === player.id) ? 'selected' : ''}`}
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

          <div className="round-robin-setup__selected">
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
        <div className="round-robin-setup__summary">
          <p><strong>Total matches:</strong> {totalMatches}</p>
        </div>
      )}

      <div className="round-robin-setup__actions">
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
