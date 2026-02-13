import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

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

  const getPlayerRatingDisplay = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return '';
    const stored = participant.playerRatingAtTime;
    const current = participant.member.rating ?? null;
    if (stored === null || current === null) return '';
    if (stored === current) return current.toString();
    return `${stored}→${current}`;
  };

  const isMatchComplete = (match: any) => {
    return (match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit || match.player2Forfeit);
  };

  // Build flat list of matches grouped by round for table rendering
  const scheduleRows = React.useMemo(() => {
    const roundsMap = new Map<number, any[]>();

    tournament.matches.forEach(match => {
      const round = (match as any).round || 1;
      if (!roundsMap.has(round)) {
        roundsMap.set(round, []);
      }
      roundsMap.get(round)!.push(match);
    });

    const rows: Array<{
      roundNumber: number;
      match: any;
      isPlayed: boolean;
      matchNumber: number;
    }> = [];
    let matchNum = 1;

    Array.from(roundsMap.keys())
      .sort((a, b) => a - b)
      .forEach(roundNum => {
        const matches = roundsMap.get(roundNum)!;
        matches.forEach(match => {
          rows.push({
            roundNumber: roundNum,
            match,
            isPlayed: isMatchComplete(match),
            matchNumber: matchNum++,
          });
        });
      });

    return rows;
  }, [tournament.matches]);

  const roundNumbers = [...new Set(scheduleRows.map(r => r.roundNumber))];
  const completedRounds = roundNumbers.filter(rn => {
    const roundRows = scheduleRows.filter(r => r.roundNumber === rn);
    return roundRows.length > 0 && roundRows.every(r => r.isPlayed);
  }).length;

  if (!isExpanded) {
    return (
      <div className="swiss-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle">
          📅 Show Swiss Schedule ({completedRounds}/{roundNumbers.length} rounds complete)
        </button>
      </div>
    );
  }

  return (
    <div className="swiss-schedule expanded">
      <div className="schedule-header">
        <h4>Swiss Schedule</h4>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
          All matches organized by round.
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
                    const m = row.match;
                    const p1Rating = getPlayerRatingDisplay(m.member1Id);
                    const p2Rating = m.member2Id ? getPlayerRatingDisplay(m.member2Id) : '';

                    return (
                      <tr key={`${roundNum}-${matchIndex}`} style={row.isPlayed ? { textDecoration: 'line-through', color: '#aaa' } : {}}>
                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                          {row.matchNumber}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                          {getPlayerName(m.member1Id)}
                          {p1Rating && (
                            <span style={{ fontSize: '12px', color: row.isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                              ({p1Rating})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                          {m.member2Id ? getPlayerName(m.member2Id) : 'BYE'}
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
