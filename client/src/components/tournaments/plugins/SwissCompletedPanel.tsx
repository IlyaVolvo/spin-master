import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { useScoreCorrectionModeActive } from '../../../contexts/ScoreCorrectionModeContext';
import { isOrganizer } from '../../../utils/auth';
import { ScoreCorrectionBanner } from '../../ScoreCorrectionBanner';
import { MatchEntryPopup, SCORE_CORRECTION_MODIFY_MESSAGE } from '../../MatchEntryPopup';
import { correctCompletedMatchScore } from '../../../utils/correctMatchScoreApi';
import {
  correctableCellOutlineStyle,
  correctionPencilStyle,
} from '../../scoreCorrectionStyles';
import {
  CORRECTION_CLICK_HINT,
  getCorrectionBannerText,
  isMatchCorrectable,
  shouldOpenCorrectionEditor,
  tournamentCorrectionEligibility,
} from '../../../utils/scoreCorrectionUtils';

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
  onTournamentUpdate,
  onError,
  onSuccess,
}) => {
  const organizer = isOrganizer();
  const eligibility = tournamentCorrectionEligibility(tournament);
  const correctionModeActive = useScoreCorrectionModeActive(tournament.status);
  const bannerText = getCorrectionBannerText(correctionModeActive, organizer, eligibility, tournament.status);
  const lastRound = tournament.swissData?.numberOfRounds;
  const [editingMatch, setEditingMatch] = React.useState<{
    matchId: number;
    member1Id: number;
    member2Id: number;
    player1Sets: string;
    player2Sets: string;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    expectedMatchUpdatedAt?: string;
  } | null>(null);

  const handleSaveCorrection = async () => {
    if (!editingMatch) return;
    try {
      const dbMatch = tournament.matches.find(m => m.id === editingMatch.matchId);
      await correctCompletedMatchScore(tournament.id, editingMatch.matchId, {
        player1Sets: parseInt(editingMatch.player1Sets, 10) || 0,
        player2Sets: parseInt(editingMatch.player2Sets, 10) || 0,
        player1Forfeit: editingMatch.player1Forfeit,
        player2Forfeit: editingMatch.player2Forfeit,
        expectedMatchUpdatedAt: dbMatch?.updatedAt,
      });
      setEditingMatch(null);
      onSuccess?.('Score corrected successfully');
      onTournamentUpdate?.(tournament);
    } catch (err: any) {
      onError?.(err?.response?.data?.error || err?.message || 'Failed to correct score');
    }
  };
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
        <ScoreCorrectionBanner
          message={bannerText}
          allowed={Boolean(eligibility?.allowed)}
        />
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

        {lastRound != null && (
          <div className="last-round-results" style={{ marginTop: '16px' }}>
            <h5>Final Round Results</h5>
            <table style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Player 1</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center' }}>Score</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Player 2</th>
                </tr>
              </thead>
              <tbody>
                {tournament.matches
                  .filter(m => m.round === lastRound)
                  .filter(m => (m.player1Sets || 0) > 0 || (m.player2Sets || 0) > 0 || m.player1Forfeit || m.player2Forfeit)
                  .map((match) => {
                    const correctable = correctionModeActive && isMatchCorrectable(match.id, eligibility);
                    const scoreLabel = match.player1Forfeit || match.player2Forfeit
                      ? 'FF'
                      : `${match.player1Sets} - ${match.player2Sets}`;
                    return (
                      <tr key={match.id}>
                        <td style={{ padding: '6px 10px' }}>{getPlayerName(match.member1Id)}</td>
                        <td
                          style={{
                            padding: '6px 10px',
                            textAlign: 'center',
                            fontWeight: 'bold',
                            position: 'relative',
                            ...(correctable ? correctableCellOutlineStyle : {}),
                          }}
                          onMouseDown={(event) => {
                            if (!shouldOpenCorrectionEditor(correctionModeActive, match.id, eligibility)) return;
                            event.preventDefault();
                            setEditingMatch({
                              matchId: match.id,
                              member1Id: match.member1Id,
                              member2Id: match.member2Id ?? 0,
                              player1Sets: String(match.player1Sets ?? 0),
                              player2Sets: String(match.player2Sets ?? 0),
                              player1Forfeit: match.player1Forfeit || false,
                              player2Forfeit: match.player2Forfeit || false,
                              expectedMatchUpdatedAt: match.updatedAt,
                            });
                          }}
                          onClick={(event) => {
                            if (!shouldOpenCorrectionEditor(correctionModeActive, match.id, eligibility)) return;
                            event.preventDefault();
                            setEditingMatch({
                              matchId: match.id,
                              member1Id: match.member1Id,
                              member2Id: match.member2Id ?? 0,
                              player1Sets: String(match.player1Sets ?? 0),
                              player2Sets: String(match.player2Sets ?? 0),
                              player1Forfeit: match.player1Forfeit || false,
                              player2Forfeit: match.player2Forfeit || false,
                              expectedMatchUpdatedAt: match.updatedAt,
                            });
                          }}
                          onContextMenu={(event) => {
                            if (correctable) {
                              event.preventDefault();
                            }
                          }}
                          title={correctable ? CORRECTION_CLICK_HINT : undefined}
                        >
                          {correctable && <span style={correctionPencilStyle} aria-hidden="true">✏️</span>}
                          {scoreLabel}
                        </td>
                        <td style={{ padding: '6px 10px' }}>{match.member2Id ? getPlayerName(match.member2Id) : 'BYE'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editingMatch && (() => {
        const p1 = tournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member;
        const p2 = tournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member;
        if (!p1 || !p2) return null;
        return (
          <MatchEntryPopup
            editingMatch={editingMatch}
            player1={p1}
            player2={p2}
            showForfeitOptions
            requireOpponentPassword={false}
            onSetEditingMatch={setEditingMatch}
            onSave={handleSaveCorrection}
            onCancel={() => setEditingMatch(null)}
            modifyConfirmationMessage={SCORE_CORRECTION_MODIFY_MESSAGE}
          />
        );
      })()}
    </div>
  );
};
