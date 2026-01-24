import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

interface PlayoffResult {
  rank: number;
  memberId: number;
  memberName: string;
  eliminatedInRound: string;
  eliminatedBy: number | null;
}

export const PlayoffCompletedPanel: React.FC<TournamentCompletedProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  const getPlayerName = (memberId: number) => {
    const participant = tournament.participants.find(p => p.memberId === memberId);
    if (!participant) return 'Unknown';
    return formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
  };

  // Calculate final standings
  const finalStandings = React.useMemo(() => {
    const results: PlayoffResult[] = [];
    const totalRounds = Math.max(...(tournament.bracketMatches?.map(m => m.round) || [0]));

    // Find champion (winner of final round)
    const finalMatches = tournament.bracketMatches?.filter(m => m.round === totalRounds) || [];
    const championId = finalMatches
      .map(m => m.match)
      .filter(m => m && (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit))
      .map(m => {
        if (m!.player1Forfeit) return m!.member2Id;
        if (m!.player2Forfeit) return m!.member1Id;
        return (m!.player1Sets || 0) > (m!.player2Sets || 0) ? m!.member1Id : m!.member2Id;
      })[0];

    if (championId) {
      results.push({
        rank: 1,
        memberId: championId,
        memberName: getPlayerName(championId),
        eliminatedInRound: 'Champion',
        eliminatedBy: null
      });
    }

    // Find runner-up (loser of final round)
    const runnerUpId = finalMatches
      .map(m => m.match)
      .filter(m => m && (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit))
      .map(m => {
        if (m!.player1Forfeit) return m!.member1Id;
        if (m!.player2Forfeit) return m!.member2Id;
        return (m!.player1Sets || 0) > (m!.player2Sets || 0) ? m!.member2Id : m!.member1Id;
      })[0];

    if (runnerUpId) {
      results.push({
        rank: 2,
        memberId: runnerUpId,
        memberName: getPlayerName(runnerUpId),
        eliminatedInRound: 'Finals',
        eliminatedBy: championId
      });
    }

    // Find semifinalists (if they exist)
    if (totalRounds >= 2) {
      const semifinalMatches = tournament.bracketMatches?.filter(m => m.round === totalRounds - 1) || [];
      const semifinalLosers = semifinalMatches
        .map(m => m.match)
        .filter(m => m && (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit))
        .map(m => {
          if (m!.player1Forfeit) return m!.member1Id;
          if (m!.player2Forfeit) return m!.member2Id;
          return (m!.player1Sets || 0) > (m!.player2Sets || 0) ? m!.member2Id : m!.member1Id;
        })
        .filter(id => id !== championId && id !== runnerUpId);

      semifinalLosers.forEach((memberId, index) => {
        if (memberId) {
          results.push({
            rank: 3 + index,
            memberId,
            memberName: getPlayerName(memberId),
            eliminatedInRound: 'Semifinals',
            eliminatedBy: null
          });
        }
      });
    }

    // Add remaining participants
    const processedIds = new Set(results.map(r => r.memberId));
    tournament.participants.forEach(participant => {
      if (!processedIds.has(participant.memberId)) {
        results.push({
          rank: results.length + 1,
          memberId: participant.memberId,
          memberName: formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder()),
          eliminatedInRound: 'Early Rounds',
          eliminatedBy: null
        });
      }
    });

    return results;
  }, [tournament, getPlayerName]);

  if (!isExpanded) {
    return (
      <div className="playoff-completed collapsed">
        <button onClick={onToggleExpand} className="results-toggle">
          🏆 Show Final Results
        </button>
      </div>
    );
  }

  const champion = finalStandings.find(r => r.rank === 1);
  const runnerUp = finalStandings.find(r => r.rank === 2);
  const thirdPlace = finalStandings.find(r => r.rank === 3);

  return (
    <div className="playoff-completed expanded">
      <div className="results-header">
        <h4>Final Results</h4>
        <button onClick={onToggleExpand} className="results-toggle">
          ▼ Hide Results
        </button>
      </div>

      <div className="results-content">
        {/* Podium */}
        <div className="podium">
          {champion && (
            <div className="podium-place first">
              <div className="medal">🥇</div>
              <div className="place-info">
                <h5>Champion</h5>
                <p className="player-name">{champion.memberName}</p>
              </div>
            </div>
          )}
          
          {runnerUp && (
            <div className="podium-place second">
              <div className="medal">🥈</div>
              <div className="place-info">
                <h5>Runner-up</h5>
                <p className="player-name">{runnerUp.memberName}</p>
              </div>
            </div>
          )}
          
          {thirdPlace && (
            <div className="podium-place third">
              <div className="medal">🥉</div>
              <div className="place-info">
                <h5>Third Place</h5>
                <p className="player-name">{thirdPlace.memberName}</p>
              </div>
            </div>
          )}
        </div>

        {/* Final standings table */}
        <div className="final-standings">
          <h5>Final Standings</h5>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Eliminated In</th>
              </tr>
            </thead>
            <tbody>
              {finalStandings.map((result) => (
                <tr key={result.memberId} className={result.rank <= 3 ? `rank-${result.rank}` : ''}>
                  <td className="rank-cell">
                    {result.rank === 1 && '🥇'}
                    {result.rank === 2 && '🥈'}
                    {result.rank === 3 && '🥉'}
                    {result.rank > 3 && result.rank}
                  </td>
                  <td className="player-name">{result.memberName}</td>
                  <td className="elimination-round">{result.eliminatedInRound}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tournament summary */}
        <div className="tournament-summary">
          <h5>Tournament Summary</h5>
          <div className="summary-stats">
            <div className="stat-item">
              <span className="stat-label">Participants:</span>
              <span className="stat-value">{tournament.participants.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Bracket Size:</span>
              <span className="stat-value">{tournament.participants.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Matches:</span>
              <span className="stat-value">{tournament.matches.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Completed:</span>
              <span className="stat-value">
                {tournament.matches.filter(m => 
                  (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit)
                ).length}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Date:</span>
              <span className="stat-value">
                {tournament.recordedAt 
                  ? new Date(tournament.recordedAt).toLocaleDateString()
                  : new Date(tournament.createdAt).toLocaleDateString()
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
