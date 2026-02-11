import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

interface SwissPlayerResult {
  rank: number;
  memberId: number;
  memberName: string;
  points: number;
  roundsPlayed: number;
  wins: number;
  losses: number;
  rating: number | null;
  opponents: string[];
}

export const SwissCompletedPanel: React.FC<TournamentCompletedProps> = ({
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
    const results: SwissPlayerResult[] = [];
    
    // Initialize results for all participants
    tournament.participants.forEach(p => {
      results.push({
        rank: 0,
        memberId: p.memberId,
        memberName: formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder()),
        points: 0,
        roundsPlayed: 0,
        wins: 0,
        losses: 0,
        rating: p.postRatingAtTime || p.playerRatingAtTime,
        opponents: []
      });
    });

    // Calculate statistics from matches
    tournament.matches.forEach(match => {
      const player1Result = results.find(r => r.memberId === match.member1Id);
      const player2Result = match.member2Id ? results.find(r => r.memberId === match.member2Id) : null;

      if (player1Result && player2Result) {
        // Track opponents
        player1Result.opponents.push(getPlayerName(match.member2Id || 0));
        player2Result.opponents.push(getPlayerName(match.member1Id || 0));
      }

      // Determine winner and update points
      const player1Won = (match.player1Sets || 0) > (match.player2Sets || 0);
      const player2Won = (match.player2Sets || 0) > (match.player1Sets || 0);

      if (player1Won && player1Result) {
        player1Result.wins += 1;
        player1Result.points += 1;
        player1Result.roundsPlayed += 1;
      } else if (player2Won && player2Result) {
        player2Result.wins += 1;
        player2Result.points += 1;
        player2Result.roundsPlayed += 1;
      }

      // Handle forfeits
      if (match.player1Forfeit && player2Result) {
        player2Result.wins += 1;
        player2Result.points += 1;
        player2Result.roundsPlayed += 1;
        if (player1Result) {
          player1Result.losses += 1;
          player1Result.roundsPlayed += 1;
        }
      } else if (match.player2Forfeit && player1Result) {
        player1Result.wins += 1;
        player1Result.points += 1;
        player1Result.roundsPlayed += 1;
        if (player2Result) {
          player2Result.losses += 1;
          player2Result.roundsPlayed += 1;
        }
      }
    });

    // Sort by points (descending), then rating (descending)
    results.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.rating !== a.rating) return (b.rating || 0) - (a.rating || 0);
      return a.memberName.localeCompare(b.memberName);
    });

    // Assign ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results;
  }, [tournament.participants, tournament.matches]);

  // Calculate tournament statistics
  const tournamentStats = React.useMemo(() => {
    const totalRounds = Math.max(...tournament.matches.map(m => m.round || 1));
    const totalMatches = tournament.matches.length;
    const completedMatches = tournament.matches.filter(m => 
      (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit)
    ).length;

    return {
      totalRounds,
      totalMatches,
      completedMatches,
      averageRoundsPlayed: finalStandings.reduce((sum, player) => sum + player.roundsPlayed, 0) / finalStandings.length
    };
  }, [tournament.matches, finalStandings]);

  if (!isExpanded) {
    return null;
  }

  const champion = finalStandings[0];
  const runnerUp = finalStandings[1];
  const thirdPlace = finalStandings[2];

  return (
    <div className="swiss-completed expanded">
      <div className="results-content">
        {/* Podium */}
        <div className="podium">
          {champion && (
            <div className="podium-place first">
              <div className="medal">🥇</div>
              <div className="place-info">
                <h5>Champion</h5>
                <p className="player-name">{champion.memberName}</p>
                <p className="player-stats">{champion.points} points ({champion.wins}-{champion.losses})</p>
              </div>
            </div>
          )}
          
          {runnerUp && (
            <div className="podium-place second">
              <div className="medal">🥈</div>
              <div className="place-info">
                <h5>Runner-up</h5>
                <p className="player-name">{runnerUp.memberName}</p>
                <p className="player-stats">{runnerUp.points} points ({runnerUp.wins}-{runnerUp.losses})</p>
              </div>
            </div>
          )}
          
          {thirdPlace && (
            <div className="podium-place third">
              <div className="medal">🥉</div>
              <div className="place-info">
                <h5>Third Place</h5>
                <p className="player-name">{thirdPlace.memberName}</p>
                <p className="player-stats">{thirdPlace.points} points ({thirdPlace.wins}-{thirdPlace.losses})</p>
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
                <th>Points</th>
                <th>W-L</th>
                <th>Rounds</th>
                <th>Rating</th>
                <th>Opponents</th>
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
                  <td className="points-cell"><strong>{result.points}</strong></td>
                  <td>{result.wins}-{result.losses}</td>
                  <td>{result.roundsPlayed}</td>
                  <td>{result.rating || '-'}</td>
                  <td className="opponents-cell">
                    <div className="opponents-list">
                      {result.opponents.slice(0, 3).map((opponent, index) => (
                        <span key={index} className="opponent-name">{opponent}</span>
                      ))}
                      {result.opponents.length > 3 && (
                        <span className="opponent-more">+{result.opponents.length - 3} more</span>
                      )}
                    </div>
                  </td>
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
              <span className="stat-label">Total Rounds:</span>
              <span className="stat-value">{tournamentStats.totalRounds}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Matches:</span>
              <span className="stat-value">{tournamentStats.totalMatches}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Completed:</span>
              <span className="stat-value">{tournamentStats.completedMatches}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg Rounds/Player:</span>
              <span className="stat-value">{tournamentStats.averageRoundsPlayed.toFixed(1)}</span>
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
