import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { generateRoundRobinSchedule } from './roundRobinUtils';

const formatActiveTournamentRating = (storedRating: number | null | undefined, currentRating: number | null | undefined) => {
  if (storedRating === null || storedRating === undefined || currentRating === null || currentRating === undefined) return '';
  if (storedRating === currentRating) return currentRating.toString();
  return `${storedRating}→${currentRating}`;
};

export const RoundRobinSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  const scheduleRounds = React.useMemo(() => {
    return generateRoundRobinSchedule(tournament);
  }, [tournament]);

  const playedMatches = React.useMemo(() => {
    const played = new Set<string>();
    tournament.matches.forEach(match => {
      if (match.member2Id !== null && match.member2Id !== 0) {
        const key1 = `${match.member1Id}-${match.member2Id}`;
        const key2 = `${match.member2Id}-${match.member1Id}`;
        played.add(key1);
        played.add(key2);
      }
    });
    return played;
  }, [tournament.matches]);

  if (!isExpanded) {
    return (
      <div className="round-robin-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Schedule ({scheduleRounds.length} rounds)
        </button>
      </div>
    );
  }

  return (
    <div className="round-robin-schedule expanded">
      <div className="schedule-header">
        <h4>Match Schedule</h4>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
          All pairs ready to play, organized by round.
        </p>
        <button onClick={onToggleExpand} className="schedule-toggle">
          ▼ Hide Schedule
        </button>
      </div>

      <div className="schedule-content">
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#e9ecef' }}>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', width: '80px' }}>Match #</th>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Player 1</th>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Player 2</th>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: '0', border: 'none', height: '2px', backgroundColor: '#333' }}></td>
            </tr>
          </thead>
          <tbody>
            {scheduleRounds.map((round, roundIndex) => (
              <React.Fragment key={round.round}>
                {roundIndex > 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '0', border: 'none', height: '3px', backgroundColor: '#333' }}></td>
                  </tr>
                )}
                {round.matches.map((match, matchIndex) => {
                  const matchKey = `${match.member1Id}-${match.member2Id}`;
                  const isPlayed = playedMatches.has(matchKey);
                  const player1RatingDisplay = formatActiveTournamentRating(
                    match.member1StoredRating,
                    match.member1CurrentRating,
                  );
                  const player2RatingDisplay = formatActiveTournamentRating(
                    match.member2StoredRating,
                    match.member2CurrentRating,
                  );

                  return (
                    <tr key={`${round.round}-${matchIndex}`} style={isPlayed ? { textDecoration: 'line-through', color: '#aaa' } : {}}>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                        {match.matchNumber}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                        {match.member1Name}
                        {player1RatingDisplay && (
                          <span style={{ fontSize: '12px', color: isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                            ({player1RatingDisplay})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                        {match.member2Name}
                        {player2RatingDisplay && (
                          <span style={{ fontSize: '12px', color: isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                            ({player2RatingDisplay})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
