import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

interface SwissRound {
  roundNumber: number;
  matches: Array<{
    id: number;
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    completed: boolean;
  }>;
}

export const SwissSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'TBD';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  // Organize matches by rounds
  const rounds = React.useMemo(() => {
    const roundsMap = new Map<number, SwissRound>();
    
    tournament.matches.forEach(match => {
      const round = match.round || 1;
      if (!roundsMap.has(round)) {
        roundsMap.set(round, {
          roundNumber: round,
          matches: []
        });
      }
      
      roundsMap.get(round)!.matches.push({
        id: match.id,
        member1Id: match.member1Id,
        member2Id: match.member2Id || 0,
        player1Sets: match.player1Sets,
        player2Sets: match.player2Sets,
        player1Forfeit: match.player1Forfeit || false,
        player2Forfeit: match.player2Forfeit || false,
        completed: (match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit || (match.player2Forfeit || false))
      });
    });

    return Array.from(roundsMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [tournament.matches]);

  const totalRounds = rounds.length;
  const completedRounds = rounds.filter(round => 
    round.matches.length > 0 && round.matches.every(match => match.completed)
  ).length;

  if (!isExpanded) {
    return (
      <div className="swiss-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Swiss Schedule ({completedRounds}/{totalRounds} rounds complete)
        </button>
      </div>
    );
  }

  return (
    <div className="swiss-schedule expanded">
      <div className="schedule-header">
        <h4>Swiss Schedule</h4>
        <button onClick={onToggleExpand} className="schedule-toggle">
          ▼ Hide Schedule
        </button>
      </div>

      <div className="schedule-content">
        <div className="schedule-summary">
          <div className="summary-stats">
            <span className="stat-item">
              <strong>Total Rounds:</strong> {totalRounds}
            </span>
            <span className="stat-item">
              <strong>Completed:</strong> {completedRounds}
            </span>
            <span className="stat-item">
              <strong>Total Matches:</strong> {tournament.matches.length}
            </span>
          </div>
        </div>

        {rounds.map(round => (
          <div key={round.roundNumber} className="schedule-round">
            <div className="round-header">
              <h5>Round {round.roundNumber}</h5>
              {round.matches.length > 0 && round.matches.every(match => match.completed) && (
                <span className="round-complete">✓ Complete</span>
              )}
              {round.matches.length > 0 && !round.matches.every(match => match.completed) && (
                <span className="round-in-progress">In Progress</span>
              )}
              {round.matches.length === 0 && (
                <span className="round-pending">Not Generated</span>
              )}
            </div>

            {round.matches.length > 0 ? (
              <div className="round-matches">
                {round.matches.map(match => (
                  <div key={match.id} className={`schedule-match ${match.completed ? 'completed' : 'pending'}`}
                    style={match.completed ? { textDecoration: 'line-through', color: '#aaa' } : {}}
                  >
                    <div className="match-info">
                      <div className="match-players">
                        <span className="player-name">
                          {getPlayerName(match.member1Id)}
                        </span>
                        <span className="vs">vs</span>
                        <span className="player-name">
                          {getPlayerName(match.member2Id)}
                        </span>
                      </div>
                    </div>

                    {match.completed && (
                      <div className="match-result" style={{ textDecoration: 'none', color: '#999' }}>
                        <span className="score">
                          {match.player1Sets} - {match.player2Sets}
                        </span>
                        {match.player1Forfeit && <span className="forfeit">P1 Forfeit</span>}
                        {match.player2Forfeit && <span className="forfeit">P2 Forfeit</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-matches">
                <p>No matches generated for this round yet.</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
