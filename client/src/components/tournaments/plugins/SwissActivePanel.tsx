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
  opponentRating: number | null;
  playerSets: number;
  opponentSets: number;
  playerForfeit: boolean;
  opponentForfeit: boolean;
  won: boolean;
  playerRatingChange: number | null;
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
          opponentRating: row2.rating,
          playerSets: match.player1Sets,
          opponentSets: match.player2Sets,
          playerForfeit: match.player1Forfeit || false,
          opponentForfeit: match.player2Forfeit || false,
          won: p1Won,
          playerRatingChange: match.player1RatingChange ?? null,
        });

        row2.roundResults.set(round, {
          opponentId: match.member1Id,
          opponentName: row1.name,
          opponentRating: row1.rating,
          playerSets: match.player2Sets,
          opponentSets: match.player1Sets,
          playerForfeit: match.player2Forfeit || false,
          opponentForfeit: match.player1Forfeit || false,
          won: !p1Won,
          playerRatingChange: match.player2RatingChange ?? null,
        });
      }
    });

    // Sort by points desc, then within equal points by rating desc
    return Array.from(rows.values()).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (b.rating || 0) - (a.rating || 0);
    });
  }, [tournament.participants, tournament.matches]);

  // Points entering the current round (excludes current round results) — used for pairing display
  const priorRoundPoints: Map<number, number> = useMemo(() => {
    const pts = new Map<number, number>();
    tournament.participants.forEach(p => pts.set(p.memberId, 0));
    tournament.matches.forEach(match => {
      const round = match.round || 1;
      if (round >= currentRound) return; // only prior rounds
      const hasScore = (match.player1Sets || 0) > 0 || (match.player2Sets || 0) > 0;
      const hasForfeit = match.player1Forfeit || match.player2Forfeit;
      if (!hasScore && !hasForfeit) return;
      let p1Won = false;
      if (match.player2Forfeit) p1Won = true;
      else if (match.player1Forfeit) p1Won = false;
      else p1Won = (match.player1Sets || 0) > (match.player2Sets || 0);
      if (match.member2Id) {
        if (p1Won) pts.set(match.member1Id, (pts.get(match.member1Id) || 0) + 1);
        else pts.set(match.member2Id!, (pts.get(match.member2Id!) || 0) + 1);
      }
    });
    return pts;
  }, [tournament.participants, tournament.matches, currentRound]);

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
      const api = (await import('../../../utils/api')).default;
      const response = await api.patch(`/tournaments/${tournament.id}/matches/${editingMatch.matchId}`, {
        player1Sets: parseInt(editingMatch.player1Sets) || 0,
        player2Sets: parseInt(editingMatch.player2Sets) || 0,
        player1Forfeit: editingMatch.player1Forfeit,
        player2Forfeit: editingMatch.player2Forfeit,
      });

      onTournamentUpdate(response.data);
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

  const handlePrintCurrentRound = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tournamentName = tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
    const getPoints = (memberId: number) => priorRoundPoints.get(memberId) ?? 0;
    const getNumericRating = (memberId: number) => {
      const p = tournament.participants.find((pp: any) => pp.member.id === memberId);
      return p?.playerRatingAtTime ?? p?.member.rating ?? 0;
    };

    // Sort matches by points category: highest max-points first, then by P1 rating desc within group
    const sortedMatches = [...currentRoundMatches].sort((a, b) => {
      const aMax = Math.max(getPoints(a.member1Id), getPoints(a.member2Id));
      const bMax = Math.max(getPoints(b.member1Id), getPoints(b.member2Id));
      if (bMax !== aMax) return bMax - aMax;
      const aMin = Math.min(getPoints(a.member1Id), getPoints(a.member2Id));
      const bMin = Math.min(getPoints(b.member1Id), getPoints(b.member2Id));
      if (bMin !== aMin) return bMin - aMin;
      return getNumericRating(b.member1Id) - getNumericRating(a.member1Id);
    });

    let lastPointGroup = -1;
    const matchRows = sortedMatches.map((match, idx) => {
      const p1 = getPlayer(match.member1Id);
      const p2 = getPlayer(match.member2Id);
      const p1Name = p1 ? formatPlayerName(p1.firstName, p1.lastName, getNameDisplayOrder()) : 'TBD';
      const p2Name = p2 ? formatPlayerName(p2.firstName, p2.lastName, getNameDisplayOrder()) : 'TBD';
      const p1Rating = getRatingDisplay(match.member1Id);
      const p2Rating = getRatingDisplay(match.member2Id);
      const p1Pts = getPoints(match.member1Id);
      const p2Pts = getPoints(match.member2Id);
      const maxPts = Math.max(p1Pts, p2Pts);
      const isPlayed = match.completed;

      let sectionHeader = '';
      if (maxPts !== lastPointGroup) {
        lastPointGroup = maxPts;
        sectionHeader = `<tr class="section-header"><td colspan="4">${maxPts} point${maxPts !== 1 ? 's' : ''}</td></tr>`;
      }

      return `${sectionHeader}<tr class="${isPlayed ? 'played' : ''}">
        <td>${idx + 1}</td>
        <td>${p1Name}${p1Rating ? `<span class="rating">(${p1Rating})</span>` : ''}<span class="pts">[${p1Pts}]</span></td>
        <td><span class="pts">[${p2Pts}]</span>${p2Name}${p2Rating ? `<span class="rating">(${p2Rating})</span>` : ''}</td>
        <td class="score">${isPlayed ? (match.player1Forfeit ? 'FF' : match.player2Forfeit ? 'FF' : `${match.player1Sets}:${match.player2Sets}`) : ''}</td>
      </tr>`;
    }).join('');

    const printContent = `<!DOCTYPE html><html><head>
      <title>Round ${currentRound} - ${tournamentName}</title>
      <style>
        @media print { @page { margin: 1cm; } body { margin: 0; padding: 0; } }
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { margin: 0 0 5px 0; font-size: 22px; color: #2c3e50; }
        .info { margin-bottom: 15px; font-size: 14px; color: #666; }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 10px; border: 1px solid #333; text-align: left; }
        th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
        td:first-child { text-align: center; font-weight: bold; }
        .score { text-align: center; min-width: 60px; }
        .rating { font-size: 12px; color: #666; margin-left: 8px; }
        .pts { font-size: 12px; color: #27ae60; font-weight: bold; margin-left: 6px; margin-right: 6px; }
        .section-header td { background-color: #eaf2f8; font-weight: bold; font-size: 13px; color: #2c3e50; padding: 6px 10px; border-left: none; border-right: none; }
        .played { text-decoration: line-through; opacity: 0.6; }
      </style></head><body>
      <h1>${tournamentName}</h1>
      <div class="info">
        <strong>Round ${currentRound} of ${totalRounds}</strong> &nbsp;|&nbsp;
        ${currentRoundPlayed}/${currentRoundTotal} matches played &nbsp;|&nbsp;
        ${new Date().toLocaleDateString()}
      </div>
      <table>
        <thead><tr><th>#</th><th>Player 1</th><th>Player 2</th><th>Score</th></tr></thead>
        <tbody>${matchRows}</tbody>
      </table>
    </body></html>`;

    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <h4 style={{ margin: 0 }}>Round {currentRound} — Matches</h4>
          <button
            onClick={handlePrintCurrentRound}
            title="Print current round matches"
            style={{
              padding: '3px 8px',
              border: '1px solid #8e44ad',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#8e44ad',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            🖨️ Print
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {currentRoundMatches.length > 0 ? (
            (() => {
              const getPoints = (memberId: number) => priorRoundPoints.get(memberId) ?? 0;
              const getNumericRating = (memberId: number) => {
                const p = tournament.participants.find((pp: any) => pp.member.id === memberId);
                return p?.playerRatingAtTime ?? p?.member.rating ?? 0;
              };
              const sorted = [...currentRoundMatches].sort((a, b) => {
                const aMax = Math.max(getPoints(a.member1Id), getPoints(a.member2Id));
                const bMax = Math.max(getPoints(b.member1Id), getPoints(b.member2Id));
                if (bMax !== aMax) return bMax - aMax;
                const aMin = Math.min(getPoints(a.member1Id), getPoints(a.member2Id));
                const bMin = Math.min(getPoints(b.member1Id), getPoints(b.member2Id));
                if (bMin !== aMin) return bMin - aMin;
                return getNumericRating(b.member1Id) - getNumericRating(a.member1Id);
              });
              let lastPtGroup = -1;
              return sorted.map((match) => {
                const maxPts = Math.max(getPoints(match.member1Id), getPoints(match.member2Id));
                let header: React.ReactNode = null;
                if (maxPts !== lastPtGroup) {
                  lastPtGroup = maxPts;
                  header = (
                    <div key={`hdr-${maxPts}`} style={{
                      padding: '4px 10px', backgroundColor: '#eaf2f8', fontWeight: 'bold',
                      fontSize: '12px', color: '#2c3e50', borderBottom: '1px solid #ccc',
                    }}>
                      {maxPts} point{maxPts !== 1 ? 's' : ''}
                    </div>
                  );
                }

              const isPlayed = match.completed;
              const p1Sets = match.player1Sets;
              const p2Sets = match.player2Sets;
              const p1Forfeit = match.player1Forfeit;
              const p2Forfeit = match.player2Forfeit;

              return (
                <React.Fragment key={match.id}>
                {header}
                <div
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

                  {/* Player 1 name + rating + points */}
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
                    <span style={{ fontSize: '11px', color: '#27ae60', fontWeight: 'bold', marginLeft: '4px' }}>
                      [{priorRoundPoints.get(match.member1Id) ?? 0}]
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

                  {/* Player 2 name + rating + points */}
                  <span style={{
                    fontWeight: isPlayed && p2Sets > p1Sets && !p2Forfeit ? 'bold' : 'normal',
                    color: p2Forfeit ? '#e74c3c' : '#2c3e50',
                    minWidth: 0, flex: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <span style={{ fontSize: '11px', color: '#27ae60', fontWeight: 'bold', marginRight: '4px' }}>
                      [{priorRoundPoints.get(match.member2Id) ?? 0}]
                    </span>
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
                </React.Fragment>
              );
            });
            })()
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              No matches for this round yet.
            </div>
          )}
        </div>
      </div>

      {/* Table 2: Standings with round-by-round results */}
      <div className="swiss-active__section">
        
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
                          {result.opponentRating != null && ` (${result.opponentRating})`}
                        </span>
                        {' '}
                        <span style={{ color: result.won ? '#27ae60' : '#e74c3c', fontWeight: result.won ? 600 : 400 }}>
                          {scoreText}
                        </span>
                        {result.playerRatingChange != null && (
                          <span style={{
                            fontSize: '10px', marginLeft: '3px',
                            color: result.playerRatingChange > 0 ? '#27ae60' : result.playerRatingChange < 0 ? '#e74c3c' : '#888',
                            fontWeight: 500,
                          }}>
                            {result.playerRatingChange > 0 ? '+' : ''}{result.playerRatingChange}
                          </span>
                        )}
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
