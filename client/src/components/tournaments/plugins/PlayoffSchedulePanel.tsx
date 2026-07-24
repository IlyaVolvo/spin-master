import React from 'react';
import { TournamentScheduleProps } from '../../../types/tournament';
import { SchedulePanelHeaderActions } from '../SchedulePanelHeaderActions';
import { buildPlayoffVisibleSchedule } from './playoffScheduleUtils';

export const PlayoffSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
  onPrintSchedule,
}) => {
  const scheduleRows = React.useMemo(
    () => buildPlayoffVisibleSchedule(tournament),
    [tournament],
  );

  if (!isExpanded) {
    return (
      <div className="playoff-schedule collapsed">
        <button onClick={onToggleExpand} className="schedule-toggle" type="button">
          📅 Show Bracket Schedule ({scheduleRows.length} matches)
        </button>
      </div>
    );
  }

  const roundNumbers = [...new Set(scheduleRows.map((r) => r.roundNumber))];

  return (
    <div className="playoff-schedule expanded">
      <div className="schedule-header">
        <h4>Bracket Schedule</h4>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
          All bracket matches organized by round.
        </p>
        <SchedulePanelHeaderActions
          onToggleExpand={onToggleExpand}
          onPrintSchedule={onPrintSchedule}
        />
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
              const roundRows = scheduleRows.filter((r) => r.roundNumber === roundNum);
              return (
                <React.Fragment key={roundNum}>
                  {roundIndex > 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '0', border: 'none', height: '3px', backgroundColor: '#333' }}></td>
                    </tr>
                  )}
                  {roundRows.map((row) => (
                    <tr
                      key={`${roundNum}-${row.matchNumber}`}
                      style={row.isPlayed ? { textDecoration: 'line-through', color: '#aaa' } : {}}
                    >
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                        {row.matchNumber}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                        {row.player1Name}
                        {row.player1Rating && (
                          <span style={{ fontSize: '12px', color: row.isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                            ({row.player1Rating})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                        {row.player2Name}
                        {row.player2Rating && (
                          <span style={{ fontSize: '12px', color: row.isPlayed ? '#bbb' : '#666', marginLeft: '5px' }}>
                            ({row.player2Rating})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
