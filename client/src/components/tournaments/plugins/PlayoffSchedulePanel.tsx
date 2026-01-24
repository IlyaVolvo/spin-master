import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

export const PlayoffSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'TBD';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  // Organize bracket matches by round
  const bracketByRound = React.useMemo(() => {
    if (!tournament.bracketMatches) return {};

    const rounds: { [round: number]: typeof tournament.bracketMatches } = {};
    
    tournament.bracketMatches.forEach(bracketMatch => {
      if (!rounds[bracketMatch.round]) {
        rounds[bracketMatch.round] = [];
      }
      rounds[bracketMatch.round].push(bracketMatch);
    });

    // Sort matches within each round by position
    Object.keys(rounds).forEach(round => {
      rounds[parseInt(round)].sort((a, b) => a.position - b.position);
    });

    return rounds;
  }, [tournament.bracketMatches]);

  const getRoundName = (round: number) => {
    const totalRounds = Object.keys(bracketByRound).length;
    if (round === totalRounds) return 'Finals';
    if (round === totalRounds - 1) return 'Semifinals';
    if (round === totalRounds - 2) return 'Quarterfinals';
    return `Round ${round}`;
  };

  const isMatchComplete = (match: any) => {
    return match && (
      (match.player1Sets > 0 || match.player2Sets > 0) || 
      match.player1Forfeit || 
      match.player2Forfeit
    );
  };

  if (!isExpanded) {
    return (
      <div className="playoff-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Bracket Schedule ({tournament.bracketMatches?.length || 0} matches)
        </button>
      </div>
    );
  }

  return (
    <div className="playoff-schedule expanded">
      <div className="schedule-header">
        <h4>Bracket Schedule</h4>
        <button onClick={onToggleExpand} className="schedule-toggle">
          ▼ Hide Schedule
        </button>
      </div>

      <div className="schedule-content">
        {Object.entries(bracketByRound)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([round, matches]) => (
            <div key={round} className="schedule-round">
              <h5>{getRoundName(parseInt(round))}</h5>
              <div className="round-schedule">
                {matches.map(bracketMatch => {
                  const match = bracketMatch.match;
                  const isComplete = match && isMatchComplete(match);

                  return (
                    <div key={bracketMatch.id} className="schedule-match">
                      <div className="match-info">
                        <div className="match-players">
                          <span className="player-name">
                            {getPlayerName(bracketMatch.member1Id)}
                          </span>
                          <span className="vs">vs</span>
                          <span className="player-name">
                            {getPlayerName(bracketMatch.member2Id)}
                          </span>
                        </div>
                        
                        <div className="match-status">
                          {isComplete ? (
                            <span className="completed">Completed</span>
                          ) : (
                            <span className="pending">Scheduled</span>
                          )}
                        </div>
                      </div>

                      {match && isComplete && (
                        <div className="match-result">
                          <span className="score">
                            {match.player1Sets || 0} - {match.player2Sets || 0}
                          </span>
                          {match.player1Forfeit && <span className="forfeit">P1 Forfeit</span>}
                          {match.player2Forfeit && <span className="forfeit">P2 Forfeit</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
