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

  const getPlayerRatingDisplay = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return '';
    const stored = participant.playerRatingAtTime;
    const current = participant.member.rating ?? null;
    if (stored === null || current === null) return '';
    if (stored === current) return current.toString();
    return `${stored}→${current}`;
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

  // Build flat list of matches with round info for table rendering
  const scheduleRows = React.useMemo(() => {
    const rows: Array<{
      roundNumber: number;
      roundName: string;
      bracketMatch: any;
      isPlayed: boolean;
      matchNumber: number;
    }> = [];
    let matchNum = 1;

    Object.entries(bracketByRound)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([round, matches]) => {
        const roundNum = parseInt(round);
        const roundName = getRoundName(roundNum);
        matches.forEach(bm => {
          // Skip BYE matches
          const isBye = !bm.member1Id || !bm.member2Id || bm.member1Id === 0 || bm.member2Id === 0;
          if (isBye) return;

          rows.push({
            roundNumber: roundNum,
            roundName,
            bracketMatch: bm,
            isPlayed: isMatchComplete(bm.match),
            matchNumber: matchNum++,
          });
        });
      });

    return rows;
  }, [bracketByRound]);

  if (!isExpanded) {
    return (
      <div className="playoff-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Bracket Schedule ({scheduleRows.length} matches)
        </button>
      </div>
    );
  }

  // Group rows by round for separator rendering
  const roundNumbers = [...new Set(scheduleRows.map(r => r.roundNumber))];

  return (
    <div className="playoff-schedule expanded">
      <div className="schedule-header">
        <h4>Bracket Schedule</h4>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
          All bracket matches organized by round.
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
            {roundNumbers.map((roundNum, roundIndex) => {
              const roundRows = scheduleRows.filter(r => r.roundNumber === roundNum);
              return (
                <React.Fragment key={roundNum}>
                  {roundIndex > 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '0', border: 'none', height: '3px', backgroundColor: '#333' }}></td>
                    </tr>
                  )}
                  {roundRows.map((row, matchIndex) => {
                    const bm = row.bracketMatch;
                    const p1Rating = getPlayerRatingDisplay(bm.member1Id);
                    const p2Rating = getPlayerRatingDisplay(bm.member2Id);

                    return (
                      <tr key={`${roundNum}-${matchIndex}`} style={row.isPlayed ? { textDecoration: 'line-through', color: '#aaa' } : {}}>
                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                          {row.matchNumber}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                          {getPlayerName(bm.member1Id)}
                          {p1Rating && (
                            <span style={{ fontSize: '12px', color: row.isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                              ({p1Rating})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                          {getPlayerName(bm.member2Id)}
                          {p2Rating && (
                            <span style={{ fontSize: '12px', color: row.isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                              ({p2Rating})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
