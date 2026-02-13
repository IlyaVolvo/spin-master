import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TournamentActiveProps } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { MatchEntryPopup } from '../../MatchEntryPopup';
import { saveScrollPosition } from '../../../utils/scrollPosition';
import './SwissActivePanel.css';

interface EditingMatch {
  matchId: number;
  member1Id: number;
  member2Id: number;
  player1Sets: string;
  player2Sets: string;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}

interface RoundResult {
  opponentId: number;
  opponentName: string;
  playerSets: number;
  opponentSets: number;
  playerForfeit: boolean;
  opponentForfeit: boolean;
  won: boolean;
}

interface PlayerStandingRow {
  memberId: number;
  name: string;
  rating: number | null;
  ratingChange: number | null;
  totalPoints: number;
  roundResults: Map<number, RoundResult>;
}

export const SwissActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onTournamentUpdate,
  onMatchUpdate,
  onError,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const [editingMatch, setEditingMatch] = useState<EditingMatch | null>(null);

  const swissData = (tournament as any).swissData;
  const totalRounds = swissData?.numberOfRounds ?? 0;
  const currentRound = swissData?.currentRound ?? 1;

  // Get current round matches (the ones to display in the pairs table)
  const currentRoundMatches = useMemo(() => {
    return [...tournament.matches]
      .filter(m => (m.round || 1) === currentRound)
      .sort((a, b) => a.id - b.id)
      .map(m => ({
        id: m.id,
        member1Id: m.member1Id,
        member2Id: m.member2Id || 0,
        player1Sets: m.player1Sets,
        player2Sets: m.player2Sets,
        player1Forfeit: m.player1Forfeit || false,
        player2Forfeit: m.player2Forfeit || false,
        completed: (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || (m.player2Forfeit || false)),
      }));
  }, [tournament.matches, currentRound]);

  // Build standings with round-by-round results (only completed rounds)
  const standings: PlayerStandingRow[] = useMemo(() => {
    const rows = new Map<number, PlayerStandingRow>();

    // Initialize all participants
    tournament.participants.forEach(p => {
      rows.set(p.memberId, {
        memberId: p.memberId,
        name: formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder()),
        rating: p.playerRatingAtTime ?? p.member.rating ?? null,
        ratingChange: null, // TODO: could be computed from rating history
        totalPoints: 0,
        roundResults: new Map(),
      });
    });

    // Process all completed matches
    tournament.matches.forEach(match => {
      const hasScore = (match.player1Sets || 0) > 0 || (match.player2Sets || 0) > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      if (!hasScore && !hasForfeit) return;

      const round = match.round || 1;
      const row1 = rows.get(match.member1Id);
      const row2 = match.member2Id ? rows.get(match.member2Id) : null;

      let p1Won = false;
      if (match.player2Forfeit) p1Won = true;
      else if (match.player1Forfeit) p1Won = false;
      else p1Won = (match.player1Sets || 0) > (match.player2Sets || 0);

      if (row1 && row2) {
        if (p1Won) row1.totalPoints += 1;
        else row2.totalPoints += 1;

        row1.roundResults.set(round, {
          opponentId: match.member2Id || 0,
          opponentName: row2.name,
          playerSets: match.player1Sets,
          opponentSets: match.player2Sets,
          playerForfeit: match.player1Forfeit || false,
          opponentForfeit: match.player2Forfeit || false,
          won: p1Won,
        });

        row2.roundResults.set(round, {
          opponentId: match.member1Id,
          opponentName: row1.name,
          playerSets: match.player2Sets,
          opponentSets: match.player1Sets,
          playerForfeit: match.player2Forfeit || false,
          opponentForfeit: match.player1Forfeit || false,
          won: !p1Won,
        });
      }
    });

    // Sort by points desc, then within equal points by rating desc
    return Array.from(rows.values()).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (b.rating || 0) - (a.rating || 0);
    });
  }, [tournament.participants, tournament.matches]);

  // Determine which rounds have at least one played match (for the standings table columns)
  const roundsWithResults = useMemo(() => {
    const rounds: number[] = [];
    for (let r = 1; r <= currentRound; r++) {
      const roundMatches = tournament.matches.filter(m => (m.round || 1) === r);
      if (roundMatches.length === 0) continue;
      const hasAnyResult = roundMatches.some(m => {
        const hasScore = (m.player1Sets || 0) > 0 || (m.player2Sets || 0) > 0;
        const hasForfeit = m.player1Forfeit || m.player2Forfeit;
        return hasScore || hasForfeit;
      });
      if (hasAnyResult) rounds.push(r);
    }
    return rounds;
  }, [tournament.matches, currentRound]);

  const getPlayer = (memberId: number) => {
    const participant = tournament.participants.find((p: any) => p.member.id === memberId);
    return participant?.member;
  };

  const getRatingDisplay = (memberId: number) => {
    const participant = tournament.participants.find((p: any) => p.member.id === memberId);
    if (!participant) return '';
    return participant.playerRatingAtTime ?? participant.member.rating ?? '—';
  };

  const handleMatchClick = (member1Id: number, member2Id: number, matchId: number) => {
    const match = tournament.matches.find(m => m.id === matchId);
    if (match) {
      setEditingMatch({
        matchId: match.id,
        member1Id: match.member1Id,
        member2Id: match.member2Id || 0,
        player1Sets: match.player1Sets.toString(),
        player2Sets: match.player2Sets.toString(),
        player1Forfeit: match.player1Forfeit || false,
        player2Forfeit: match.player2Forfeit || false,
      });
    }
  };

  const handleMatchSave = async () => {
    if (!editingMatch) return;

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/matches/${editingMatch.matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1Sets: parseInt(editingMatch.player1Sets) || 0,
          player2Sets: parseInt(editingMatch.player2Sets) || 0,
          player1Forfeit: editingMatch.player1Forfeit,
          player2Forfeit: editingMatch.player2Forfeit,
        }),
      });

      if (!response.ok) throw new Error('Failed to update match');

      const updatedMatch = await response.json();
      onTournamentUpdate(updatedMatch);
      setEditingMatch(null);
      onSuccess?.('Match updated successfully');
    } catch (error) {
      onError?.('Failed to update match');
    }
  };

  const handleMatchCancel = () => {
    setEditingMatch(null);
  };

  const handleViewH2H = (member1Id: number, member2Id: number) => {
    saveScrollPosition('/tournaments', window.scrollY);
    navigate('/history', {
      state: { playerId: member1Id, opponentIds: [member2Id], from: 'tournaments' },
    });
  };

  const currentRoundPlayed = currentRoundMatches.filter(m => m.completed).length;
  const currentRoundTotal = currentRoundMatches.length;

  return (
    <div className="swiss-active">
      {/* Tournament Header */}
      <div className="swiss-active__header">
        <div className="tournament-info">
          <span className="info-badge">Round {currentRound} of {totalRounds}</span>
          <span className="info-badge">{tournament.participants.length} Players</span>
          <span className="info-badge">{currentRoundPlayed}/{currentRoundTotal} matches played</span>
        </div>
      </div>

      {/* Table 1: Current Round Match Pairs */}
      <div className="swiss-active__section">
        <h4>Round {currentRound} — Matches</h4>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {currentRoundMatches.length > 0 ? (
            currentRoundMatches.map((match) => {
              const isPlayed = match.completed;

              const p1Sets = match.player1Sets;
              const p2Sets = match.player2Sets;
              const p1Forfeit = match.player1Forfeit;
              const p2Forfeit = match.player2Forfeit;

              return (
                <div
                  key={match.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderBottom: '1px solid #eee',
                    backgroundColor: isPlayed ? '#f8f9fa' : '#fff',
                    gap: '6px',
                    fontSize: '14px',
                    overflow: 'hidden',
                  }}
                >
                  {/* H2H history icon — navigates to match history between these 2 players */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleViewH2H(match.member1Id, match.member2Id); }}
                    title="View match history between these players"
                    style={{
                      padding: '2px 4px', border: 'none', background: 'transparent',
                      cursor: 'pointer', fontSize: '14px', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', color: '#e67e22',
                      flexShrink: 0,
                    }}
                  >📜</button>

                  {/* Player 1 name + rating */}
                  <span style={{
                    fontWeight: isPlayed && p1Sets > p2Sets && !p1Forfeit ? 'bold' : 'normal',
                    color: p1Forfeit ? '#e74c3c' : '#2c3e50',
                    minWidth: 0, textAlign: 'right', flex: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {formatPlayerName(
                      getPlayer(match.member1Id)?.firstName || '',
                      getPlayer(match.member1Id)?.lastName || '',
                      getNameDisplayOrder()
                    )}
                    <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal', marginLeft: '3px' }}>
                      ({getRatingDisplay(match.member1Id)})
                    </span>
                  </span>

                  {/* Score / Enter score */}
                  <div
                    onClick={() => handleMatchClick(match.member1Id, match.member2Id, match.id)}
                    style={{
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', minWidth: '70px', flexShrink: 0,
                    }}
                    title={isPlayed ? 'Click to edit match' : 'Click to enter score'}
                  >
                    {isPlayed ? (
                      <span style={{
                        fontWeight: 'bold', fontSize: '14px', color: '#333',
                        whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: '4px',
                        backgroundColor: p1Forfeit || p2Forfeit ? '#f8d7da' : '#e8f5e9',
                      }}>
                        {p1Forfeit ? 'FF' : p2Forfeit ? 'W' : `${p1Sets} - ${p2Sets}`}
                        {p1Forfeit ? '' : p2Forfeit ? ' (FF)' : ''}
                      </span>
                    ) : (
                      <button
                        style={{
                          padding: '0', border: '1px solid #90EE90', borderRadius: '4px',
                          backgroundColor: 'transparent', cursor: 'pointer', display: 'flex',
                          alignItems: 'stretch', width: '45px', height: '18px', overflow: 'hidden',
                          opacity: 0.7,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMatchClick(match.member1Id, match.member2Id, match.id);
                        }}
                        title="Enter score"
                      >
                        <div style={{
                          flex: 1, backgroundColor: '#ADD8E6', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: '#228B22',
                          fontSize: '10px', fontWeight: 'bold', borderRight: '1px solid #90EE90',
                        }}>?</div>
                        <div style={{
                          flex: 1, backgroundColor: '#ADD8E6', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: '#228B22',
                          fontSize: '10px', fontWeight: 'bold',
                        }}>?</div>
                      </button>
                    )}
                  </div>

                  {/* Player 2 name + rating */}
                  <span style={{
                    fontWeight: isPlayed && p2Sets > p1Sets && !p2Forfeit ? 'bold' : 'normal',
                    color: p2Forfeit ? '#e74c3c' : '#2c3e50',
                    minWidth: 0, flex: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal', marginRight: '3px' }}>
                      ({getRatingDisplay(match.member2Id)})
                    </span>
                    {formatPlayerName(
                      getPlayer(match.member2Id)?.firstName || '',
                      getPlayer(match.member2Id)?.lastName || '',
                      getNameDisplayOrder()
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              No matches for this round yet.
            </div>
          )}
        </div>
      </div>

      {/* Table 2: Standings with round-by-round results */}
      <div className="swiss-active__section">
        <h4>Standings</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>Player</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap', borderLeft: '1px solid #ccc' }}>Pts</th>
                {roundsWithResults.map(r => (
                  <th key={r} style={{ padding: '6px 6px', textAlign: 'left', whiteSpace: 'nowrap', borderLeft: '1px solid #ccc' }}>R{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.memberId} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{
                    padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 500,
                    position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1,
                  }}>
                    {row.name}
                    <span style={{ fontSize: '11px', color: '#888', fontWeight: 400, marginLeft: '4px' }}>
                      {row.rating ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#27ae60', borderLeft: '1px solid #ccc' }}>
                    {row.totalPoints}
                  </td>
                  {roundsWithResults.map(r => {
                    const result = row.roundResults.get(r);
                    if (!result) {
                      return <td key={r} style={{ padding: '6px 6px', textAlign: 'left', color: '#ccc', borderLeft: '1px solid #ccc' }}>—</td>;
                    }
                    const scoreText = result.playerForfeit
                      ? 'FF'
                      : result.opponentForfeit
                        ? 'W (FF)'
                        : `${result.playerSets}:${result.opponentSets}`;
                    return (
                      <td key={r} style={{
                        padding: '6px 6px', textAlign: 'left', whiteSpace: 'nowrap',
                        borderLeft: '1px solid #ccc',
                      }}>
                        <span style={{ fontSize: '11px', color: '#888' }}>
                          {result.opponentName}
                        </span>
                        {' '}
                        <span style={{ color: result.won ? '#27ae60' : '#e74c3c', fontWeight: result.won ? 600 : 400 }}>
                          {scoreText}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Match Entry Popup */}
      {editingMatch && (
        <MatchEntryPopup
          editingMatch={editingMatch}
          player1={getPlayer(editingMatch.member1Id)!}
          player2={getPlayer(editingMatch.member2Id)!}
          showForfeitOptions={true}
          onSetEditingMatch={setEditingMatch}
          onSave={handleMatchSave}
          onCancel={handleMatchCancel}
        />
      )}
    </div>
  );
};
