import React, { useState, useMemo } from 'react';
import { TournamentSetupProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { getSystemConfig } from '../../../utils/systemConfig';
import './PlayoffSetupPanel.css';

interface PlayoffSetupData {
  name: string;
  participants: Array<{
    id: number;
    name: string;
    rating: number | null;
  }>;
  isDoubleElimination: boolean;
  seedByRating: boolean;
}

export const PlayoffSetupPanel: React.FC<TournamentSetupProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const playoffRules = getSystemConfig().tournamentRules.playoff;
  const [setupData, setSetupData] = useState<PlayoffSetupData>({
    name: '',
    participants: [],
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

  const derivedBracketSize = useMemo(() => {
    const participantCount = setupData.participants.length;
    if (participantCount <= 1) return 2;
    return Math.pow(2, Math.ceil(Math.log2(participantCount)));
  }, [setupData.participants.length]);

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

    if (setupData.participants.length < playoffRules.minPlayers) {
      onError(`At least ${playoffRules.minPlayers} participants are required`);
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
    ? (derivedBracketSize * 2) - 1 
    : derivedBracketSize - 1;

  const totalRounds = Math.log2(derivedBracketSize);

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
            <label>Bracket Size</label>
            <div style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
              {derivedBracketSize} participants
            </div>
            <small className="form-help">
              Automatically set to the smallest power of 2 that fits the selected players.
            </small>
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
        <h4>Participants ({setupData.participants.length}/{derivedBracketSize})</h4>
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
            <p><strong>Byes:</strong> {derivedBracketSize - setupData.participants.length}</p>
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
          disabled={loading || setupData.participants.length < playoffRules.minPlayers}
          className="button-primary"
        >
          {loading ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </div>
  );
};
