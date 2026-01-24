import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

export const RoundRobinSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  // Group matches by round for Round Robin
  const matchesByRound = React.useMemo(() => {
    const rounds: Array<{ round: number; matches: typeof tournament.matches }> = [];
    
    // For Round Robin, we can simulate rounds by organizing matches
    const sortedMatches = [...tournament.matches].sort((a, b) => {
      // Sort by match ID or creation time to get a logical order
      return (a.id || 0) - (b.id || 0);
    });

    // Calculate approximate rounds (for n participants, each plays n-1 matches)
    const numParticipants = tournament.participants.length;
    const numRounds = numParticipants > 0 ? numParticipants - 1 : 0;
    const matchesPerRound = Math.floor(sortedMatches.length / numRounds);

    for (let round = 1; round <= numRounds; round++) {
      const startIndex = (round - 1) * matchesPerRound;
      const endIndex = round === numRounds ? sortedMatches.length : startIndex + matchesPerRound;
      const roundMatches = sortedMatches.slice(startIndex, endIndex);
      
      if (roundMatches.length > 0) {
        rounds.push({
          round,
          matches: roundMatches
        });
      }
    }

    return rounds;
  }, [tournament.matches, tournament.participants]);

  if (!isExpanded) {
    return (
      <div className="round-robin-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Schedule ({tournament.matches.length} matches)
        </button>
      </div>
    );
  }

  return (
    <div className="round-robin-schedule expanded">
      <div className="schedule-header">
        <h4>Match Schedule</h4>
        <button onClick={onToggleExpand} className="schedule-toggle">
          ▼ Hide Schedule
        </button>
      </div>

      <div className="schedule-content">
        {matchesByRound.map(({ round, matches }) => (
          <div key={round} className="schedule-round">
            <h5>Round {round}</h5>
            <div className="round-matches">
              {matches.map(match => (
                <div key={match.id} className="schedule-match">
                  <div className="match-players">
                    <span className="player-name">{getPlayerName(match.member1Id)}</span>
                    <span className="vs">vs</span>
                    <span className="player-name">
                      {match.member2Id ? getPlayerName(match.member2Id) : 'BYE'}
                    </span>
                  </div>
                  <div className="match-status">
                    {(match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit || match.player2Forfeit) ? (
                      <span className="completed">Completed</span>
                    ) : (
                      <span className="pending">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
