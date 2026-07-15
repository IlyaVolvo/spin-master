import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { formatCompletedTournamentRating, formatRrCompletedRatingLine } from '../../../utils/ratingFormatter';
import type { Tournament, TournamentType } from '../../../types/tournament';
import { buildResultsMatrix, calculateStandings } from '../plugins/roundRobinUtils';
import { tournamentPluginRegistry } from '../TournamentPluginRegistry';

const RESULTS_PRINT_STYLES = `
  @media print {
    @page { margin: 1cm; size: auto; }
    body { margin: 0; padding: 0; overflow: visible; }
    .bracket-container { page-break-inside: avoid; overflow: visible; width: max-content; }
    .bracket-round { page-break-inside: avoid; }
  }
  body { font-family: Arial, sans-serif; padding: 20px; }
  h1 { margin: 0 0 10px 0; font-size: 24px; color: #2c3e50; }
  h2 { margin: 20px 0 10px 0; font-size: 20px; color: #2c3e50; }
  h3 { margin: 15px 0 8px 0; font-size: 16px; color: #2c3e50; }
  .tournament-info { margin-bottom: 20px; font-size: 14px; color: #666; }
  table { border-collapse: collapse; width: 100%; margin-top: 10px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td { padding: 8px; border: 1px solid #333; text-align: left; }
  th { background-color: #f0f0f0; font-weight: bold; }
  .section { margin-bottom: 30px; page-break-inside: avoid; }
  .abbreviated-results-grid {
    font-size: 10px;
    width: auto !important;
    margin: 0 0 10px 0 !important;
  }
  .abbreviated-results-grid th,
  .abbreviated-results-grid td {
    padding: 2px 4px !important;
    min-width: 0 !important;
  }
  .abbreviated-results-grid .rating-line {
    font-size: 8px;
    font-weight: normal;
    color: #555;
    line-height: 1.1;
  }
  .abbreviated-doc h1 { font-size: 16px; margin-bottom: 6px; }
  .abbreviated-doc .tournament-info { font-size: 11px; margin-bottom: 10px; }
  .abbreviated-doc .section { margin-bottom: 12px; }
  .abbreviated-doc .section h3 { font-size: 12px; margin: 0 0 4px 0; }
  .abbreviated-sections {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    align-items: flex-start;
  }
  .abbreviated-section {
    flex: 0 1 auto;
    width: max-content;
    max-width: 100%;
    margin: 0;
    page-break-inside: avoid;
  }
  .abbreviated-section h3 {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: #2c3e50;
    padding-bottom: 3px;
  }
  .abbreviated-section.wide {
    flex: 1 1 100%;
    width: 100%;
    max-width: 100%;
  }
  /* Prelim+Final: keep Final on its own row below preliminary groups */
  .abbreviated-section.final-phase {
    flex: 1 1 100%;
    width: 100%;
    max-width: 100%;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #bbb;
  }
`;

function tournamentDisplayName(tournament: Tournament): string {
  return tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
}

function posBgColor(position: number): string {
  if (position === 1) return '#fff3cd';
  if (position === 2) return '#e9ecef';
  if (position === 3) return '#d4edda';
  return '#fff';
}

function getPlayoffRoundLabel(round: number, totalRounds: number): string {
  const totalMatches = Math.pow(2, totalRounds - round + 1);
  if (totalMatches >= 32) return 'Round of 32';
  if (totalMatches >= 16) return 'Round of 16';
  if (totalMatches >= 8) return 'Quarterfinals';
  if (totalMatches >= 4) return 'Semifinals';
  if (totalMatches >= 2) return 'Finals';
  return 'Championship';
}

function buildScoreMatrix(tournament: Tournament): {
  participants: ReturnType<typeof buildResultsMatrix>['participants'];
  participantData: ReturnType<typeof buildResultsMatrix>['participantData'];
  scoreMatrix: { [key: number]: { [key: number]: string } };
} {
  const { participants, participantData, matrix } = buildResultsMatrix(tournament);
  const scoreMatrix: { [key: number]: { [key: number]: string } } = {};
  participants.forEach((p1, i) => {
    scoreMatrix[p1.member.id] = {};
    participants.forEach((p2, j) => {
      if (i === j) {
        scoreMatrix[p1.member.id][p2.member.id] = '-';
        return;
      }
      const match = matrix[i][j];
      if (match) {
        if (match.player1Forfeit) {
          scoreMatrix[p1.member.id][p2.member.id] = match.member1Id === p1.memberId ? 'L' : 'W';
        } else if (match.player2Forfeit) {
          scoreMatrix[p1.member.id][p2.member.id] = match.member1Id === p1.memberId ? 'W' : 'L';
        } else {
          const score1 = match.member1Id === p1.memberId ? match.player1Sets : match.player2Sets;
          const score2 = match.member1Id === p1.memberId ? match.player2Sets : match.player1Sets;
          scoreMatrix[p1.member.id][p2.member.id] = `${score1} - ${score2}`;
        }
      } else {
        scoreMatrix[p1.member.id][p2.member.id] = '';
      }
    });
  });
  return { participants, participantData, scoreMatrix };
}

/**
 * Abbreviated front grid: results matrix ordered by place, with place + rating changes
 * on the row labels (no separate standings / W-L table).
 */
export function buildAbbreviatedStandingsTableHtml(tournament: Tournament): string {
  const standings = calculateStandings(tournament);
  const { participants, participantData, scoreMatrix } = buildScoreMatrix(tournament);
  const nameOrder = getNameDisplayOrder();
  const positionByMemberId = new Map(standings.map(({ member, position }) => [member.id, position]));

  const ordered = [...participants].sort((a, b) => {
    const posA = positionByMemberId.get(a.member.id) ?? 999;
    const posB = positionByMemberId.get(b.member.id) ?? 999;
    if (posA !== posB) return posA - posB;
    return a.member.id - b.member.id;
  });

  const labelFor = (participant: (typeof participants)[number]) => {
    const position = positionByMemberId.get(participant.member.id) ?? '';
    const pdata = participantData.find((p) => p.memberId === participant.member.id);
    const playerName = formatPlayerName(participant.member.firstName, participant.member.lastName, nameOrder);
    const ratingLine = formatRrCompletedRatingLine(pdata as any);
    return { position, playerName, ratingLine };
  };

  let html = `
    <table class="abbreviated-standings abbreviated-results-grid" style="border-collapse: collapse; width: auto; margin-bottom: 10px; font-size: 10px;">
      <thead>
        <tr>
          <th style="padding: 2px 4px; border: 1px solid #333; background-color: #f0f0f0; text-align: left; white-space: nowrap;">Pos / Player</th>
  `;

  ordered.forEach((participant) => {
    const { playerName, ratingLine } = labelFor(participant);
    html += `
          <th style="padding: 2px 4px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; font-weight: bold; white-space: nowrap;">
            ${playerName}${ratingLine ? `<br><span class="rating-line">${ratingLine}</span>` : ''}
          </th>
    `;
  });

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  ordered.forEach((p1) => {
    const { position, playerName } = labelFor(p1);
    const posBg = typeof position === 'number' ? posBgColor(position) : '#fff';
    html += `
        <tr>
          <td style="padding: 2px 4px; border: 1px solid #333; background-color: ${posBg}; font-weight: bold; text-align: left; white-space: nowrap;">
            ${position}. ${playerName}
          </td>
    `;

    ordered.forEach((p2) => {
      const score = scoreMatrix[p1.member.id][p2.member.id];
      const isDiagonal = p1.member.id === p2.member.id;
      const hasScore = Boolean(score && score !== '');
      let cellBgColor = isDiagonal ? '#e9ecef' : hasScore ? '#fff' : '#f9f9f9';

      if (!isDiagonal && score) {
        if (score === 'W') cellBgColor = '#a5d6a7';
        else if (score === 'L') cellBgColor = '#ef9a9a';
        else if (score.includes(' - ')) {
          const [score1, score2] = score.split(' - ').map(Number);
          if (score1 > score2) cellBgColor = '#a5d6a7';
          else if (score2 > score1) cellBgColor = '#ef9a9a';
        }
      }

      html += `
          <td style="padding: 2px 4px; border: 1px solid #333; text-align: center; background-color: ${cellBgColor}; font-weight: ${isDiagonal ? 'normal' : 'bold'};">
            ${hasScore ? score : '-'}
          </td>
      `;
    });

    html += `
        </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;
  return html;
}

/** Full basic RR standings + results matrix (current print). */
export function buildFullRoundRobinResultsHtml(tournament: Tournament): string {
  const standings = calculateStandings(tournament);
  const { participants, participantData, scoreMatrix } = buildScoreMatrix(tournament);
  const nameOrder = getNameDisplayOrder();

  let standingsTable = `
    <h2>Final Standings</h2>
    <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
      <thead>
        <tr>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">Pos</th>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: left;">Player</th>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">W</th>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">L</th>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 80px;">Sets Won</th>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 80px;">Sets Lost</th>
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 100px;">Set Diff</th>
        </tr>
      </thead>
      <tbody>
  `;

  standings.forEach(({ member, stats, position }) => {
    const participant = participantData.find((p) => p.memberId === member.id);
    const ratingDisplay = formatCompletedTournamentRating(participant?.playerRatingAtTime, member.rating);
    const setDiff = stats.setsWon - stats.setsLost;
    const playerName = formatPlayerName(member.firstName, member.lastName, nameOrder);
    const diffColor = setDiff > 0 ? '#28a745' : setDiff < 0 ? '#dc3545' : '#666';

    standingsTable += `
      <tr>
        <td style="padding: 8px; border: 1px solid #333; text-align: center; font-weight: bold; background-color: ${posBgColor(position)};">${position}</td>
        <td style="padding: 8px; border: 1px solid #333; font-weight: bold;">
          ${playerName}${ratingDisplay ? ` <span style="font-size: 11px; color: #666; font-weight: normal;">(${position}, ${ratingDisplay})</span>` : ''}
        </td>
        <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.wins}</td>
        <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.losses}</td>
        <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.setsWon}</td>
        <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.setsLost}</td>
        <td style="padding: 8px; border: 1px solid #333; text-align: center; font-weight: bold; color: ${diffColor};">${setDiff > 0 ? '+' : ''}${setDiff}</td>
      </tr>
    `;
  });

  standingsTable += `</tbody></table>`;

  let matrixTable = `
    <h2>Results Matrix</h2>
    <table class="results-matrix" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
      <thead>
        <tr>
          <th style="padding: 6px 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: left; white-space: nowrap;">Player</th>
  `;

  participants.forEach((participant) => {
    const playerName = formatPlayerName(participant.member.firstName, participant.member.lastName, nameOrder);
    matrixTable += `
          <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; min-width: 80px; text-align: center; font-weight: normal;">
            ${playerName}
          </th>
    `;
  });

  matrixTable += `</tr></thead><tbody>`;

  participants.forEach((participant1) => {
    const participantData1 = participantData.find((p) => p.memberId === participant1.member.id);
    const ratingDisplay1 = formatCompletedTournamentRating(participantData1?.playerRatingAtTime, participant1.member.rating);
    const ranking1 = standings.find((s) => s.member.id === participant1.member.id)?.position;
    const player1Name = formatPlayerName(participant1.member.firstName, participant1.member.lastName, nameOrder);

    matrixTable += `
      <tr>
        <td style="padding: 6px 8px; border: 1px solid #333; background-color: #f0f0f0; font-weight: bold; white-space: nowrap;">
          ${player1Name}${ranking1 && ratingDisplay1 ? ` <span style="font-size: 11px; color: #666; font-weight: normal;">(${ranking1}, ${ratingDisplay1})</span>` : ''}
        </td>
    `;

    participants.forEach((participant2) => {
      const score = scoreMatrix[participant1.member.id][participant2.member.id];
      const isDiagonal = participant1.member.id === participant2.member.id;
      const hasScore = Boolean(score && score !== '');
      let cellBgColor = isDiagonal ? '#e9ecef' : hasScore ? '#fff' : '#f9f9f9';

      if (!isDiagonal && score) {
        const isForfeit = score === 'W' || score === 'L';
        if (isForfeit) {
          cellBgColor = score === 'W' ? '#a5d6a7' : '#ef9a9a';
        } else {
          const [score1, score2] = score.split(' - ').map(Number);
          if (score1 > score2) cellBgColor = '#a5d6a7';
          else if (score2 > score1) cellBgColor = '#ef9a9a';
        }
      }

      matrixTable += `
        <td style="padding: 8px; border: 1px solid #333; text-align: center; background-color: ${cellBgColor}; font-weight: ${isDiagonal ? 'normal' : 'bold'}; min-width: 80px; width: 80px;">
          ${hasScore ? score : '-'}
        </td>
      `;
    });

    matrixTable += `</tr>`;
  });

  matrixTable += `
      </tbody>
    </table>
    <p style="font-size: 12px; color: #666; margin-top: 10px; font-style: italic;">
      Green cells indicate wins for the row player, red cells indicate losses. Diagonal shows player names. W = Win (forfeit), L = Loss (forfeit).
    </p>
  `;

  return standingsTable + matrixTable;
}

/** Compound full RR child: compact standings + matrix. */
export function buildFullCompoundRoundRobinChildHtml(child: Tournament): string {
  const standings = calculateStandings(child);
  const { participants, participantData, scoreMatrix } = buildScoreMatrix(child);
  const nameOrder = getNameDisplayOrder();

  let html = `
    <table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">
      <thead>
        <tr>
          <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 40px;">Pos</th>
          <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: left;">Player</th>
          <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 40px;">W</th>
          <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 40px;">L</th>
          <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">Sets +/-</th>
        </tr>
      </thead>
      <tbody>
  `;

  standings.forEach(({ member, stats, position }) => {
    const participant = participantData.find((p) => p.memberId === member.id);
    const ratingDisplay = formatCompletedTournamentRating(participant?.playerRatingAtTime, member.rating);
    const setDiff = stats.setsWon - stats.setsLost;
    const playerName = formatPlayerName(member.firstName, member.lastName, nameOrder);
    const diffColor = setDiff > 0 ? '#28a745' : setDiff < 0 ? '#dc3545' : '#666';

    html += `
      <tr>
        <td style="padding: 6px; border: 1px solid #333; text-align: center; font-weight: bold; background-color: ${posBgColor(position)};">${position}</td>
        <td style="padding: 6px; border: 1px solid #333; font-weight: bold;">${playerName}${ratingDisplay ? ` <span style="font-size: 11px; color: #666; font-weight: normal;">(${ratingDisplay})</span>` : ''}</td>
        <td style="padding: 6px; border: 1px solid #333; text-align: center;">${stats.wins}</td>
        <td style="padding: 6px; border: 1px solid #333; text-align: center;">${stats.losses}</td>
        <td style="padding: 6px; border: 1px solid #333; text-align: center; font-weight: bold; color: ${diffColor};">${setDiff > 0 ? '+' : ''}${setDiff}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  html += `<table class="results-matrix" style="border-collapse: collapse; width: 100%;"><thead><tr><th style="padding: 5px; border: 1px solid #333; background-color: #f0f0f0; text-align: left; font-size: 12px;">Player</th>`;
  participants.forEach((p) => {
    html += `<th style="padding: 5px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; font-size: 11px; min-width: 60px;">${formatPlayerName(p.member.firstName, p.member.lastName, nameOrder)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  participants.forEach((p1) => {
    const playerName = formatPlayerName(p1.member.firstName, p1.member.lastName, nameOrder);
    html += `<tr><td style="padding: 5px; border: 1px solid #333; background-color: #f0f0f0; font-weight: bold; font-size: 12px; white-space: nowrap;">${playerName}</td>`;
    participants.forEach((p2) => {
      const score = scoreMatrix[p1.member.id][p2.member.id];
      const isDiagonal = p1.member.id === p2.member.id;
      let cellBg = isDiagonal ? '#e9ecef' : '#fff';
      if (!isDiagonal && score) {
        if (score === 'W') cellBg = '#a5d6a7';
        else if (score === 'L') cellBg = '#ef9a9a';
        else if (score !== '') {
          const [s1, s2] = score.split(' - ').map(Number);
          cellBg = s1 > s2 ? '#a5d6a7' : s2 > s1 ? '#ef9a9a' : '#fff';
        }
      }
      html += `<td style="padding: 5px; border: 1px solid #333; text-align: center; background-color: ${cellBg}; font-size: 12px; font-weight: ${isDiagonal ? 'normal' : 'bold'};">${score || '-'}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;

  return html;
}

/** Compound playoff child: per-round match tables. */
export function buildCompoundPlayoffChildHtml(child: Tournament): string {
  const bracketMatches = child.bracketMatches || [];
  const maxRound = Math.max(...bracketMatches.map((bm) => bm.round), 0);
  const nameOrder = getNameDisplayOrder();
  let html = '';

  for (let round = 1; round <= maxRound; round++) {
    const roundMatches = bracketMatches
      .filter((bm) => bm.round === round)
      .sort((a, b) => a.position - b.position);
    if (roundMatches.length === 0) continue;

    html += `<div class="playoff-round" style="margin-bottom: 10px;"><strong>${getPlayoffRoundLabel(round, maxRound)}</strong></div>`;
    html += `<table style="border-collapse: collapse; width: 100%; margin-bottom: 10px;">`;

    roundMatches.forEach((bm) => {
      const match = bm.match;
      const p1 = child.participants?.find((p) => p.memberId === bm.member1Id)?.member;
      const p2 = child.participants?.find((p) => p.memberId === bm.member2Id)?.member;
      const isBye = !bm.member1Id || bm.member1Id === 0 || !bm.member2Id || bm.member2Id === 0;
      if (isBye) return;

      const p1Name = p1 ? formatPlayerName(p1.firstName, p1.lastName, nameOrder) : 'TBD';
      const p2Name = p2 ? formatPlayerName(p2.firstName, p2.lastName, nameOrder) : 'TBD';
      let score = '-';
      let winnerStyle1 = '';
      let winnerStyle2 = '';
      if (match) {
        if (match.player1Forfeit) {
          score = 'Forfeit';
          winnerStyle2 = 'color: #27ae60; font-weight: bold;';
        } else if (match.player2Forfeit) {
          score = 'Forfeit';
          winnerStyle1 = 'color: #27ae60; font-weight: bold;';
        } else {
          score = `${match.player1Sets} - ${match.player2Sets}`;
          if (match.player1Sets > (match.player2Sets ?? 0)) winnerStyle1 = 'color: #27ae60; font-weight: bold;';
          else winnerStyle2 = 'color: #27ae60; font-weight: bold;';
        }
      }

      html += `<tr>
        <td style="padding: 6px; border: 1px solid #333; ${winnerStyle1}">${p1Name}</td>
        <td style="padding: 6px; border: 1px solid #333; text-align: center; font-weight: bold; width: 80px;">${score}</td>
        <td style="padding: 6px; border: 1px solid #333; ${winnerStyle2}">${p2Name}</td>
      </tr>`;
    });

    html += `</table>`;
  }

  return html;
}

/** Visual playoff bracket for basic playoff print. */
export function buildBasicPlayoffBracketHtml(tournament: Tournament): string {
  const bracketMatches = tournament.bracketMatches || [];
  const maxRound = Math.max(...bracketMatches.map((bm) => bm.round), 0);
  const nameOrder = getNameDisplayOrder();

  const matchesByRound: { [round: number]: typeof bracketMatches } = {};
  for (let round = 1; round <= maxRound; round++) {
    matchesByRound[round] = bracketMatches.filter((bm) => bm.round === round).sort((a, b) => a.position - b.position);
  }

  let resultsContent = '<h2>Playoff Bracket</h2>';
  resultsContent += '<div class="bracket-container" style="display: flex; gap: 40px; padding: 20px 0; width: max-content; min-width: 100%;">';

  let championName = '';
  if (tournament.cancelled) {
    championName = 'NOT COMPLETED';
  } else {
    const finalRoundMatches = matchesByRound[maxRound] || [];
    if (finalRoundMatches.length > 0) {
      const finalMatch = finalRoundMatches[0];
      if (finalMatch.match) {
        const match = finalMatch.match;
        const player1 = tournament.participants.find((p) => p.memberId === finalMatch.member1Id)?.member;
        const player2 = tournament.participants.find((p) => p.memberId === finalMatch.member2Id)?.member;
        if (match.player1Sets > (match.player2Sets ?? 0) || match.player2Forfeit) {
          championName = player1 ? formatPlayerName(player1.firstName, player1.lastName, nameOrder) : '';
        } else if ((match.player2Sets ?? 0) > match.player1Sets || match.player1Forfeit) {
          championName = player2 ? formatPlayerName(player2.firstName, player2.lastName, nameOrder) : '';
        }
      }
    }
  }

  for (let round = 1; round <= maxRound; round++) {
    const roundMatches = matchesByRound[round] || [];
    if (roundMatches.length === 0) continue;

    const roundLabel = getPlayoffRoundLabel(round, maxRound);
    const matchHeight = 80;
    const roundHeight = roundMatches.length * matchHeight;

    resultsContent += `
      <div class="bracket-round" style="display: flex; flex-direction: column; min-width: 200px; page-break-inside: avoid;">
        <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px; padding: 8px; background-color: #f0f0f0; border: 1px solid #333;">
          ${roundLabel}
        </div>
        <div style="position: relative; min-height: ${roundHeight}px; page-break-inside: avoid;">
    `;

    roundMatches.forEach((bm, idx) => {
      const match = bm.match;
      const player1 = tournament.participants.find((p) => p.memberId === bm.member1Id)?.member;
      const player2 = tournament.participants.find((p) => p.memberId === bm.member2Id)?.member;
      const topPosition = idx * matchHeight;
      const isBye = bm.member1Id === null || bm.member1Id === 0 || bm.member2Id === null || bm.member2Id === 0;

      if (isBye) {
        const player = player1 || player2;
        if (player) {
          const playerName = formatPlayerName(player.firstName, player.lastName, nameOrder);
          resultsContent += `
            <div style="position: absolute; top: ${topPosition}px; left: 0; right: 0; border: 1px solid #333; padding: 8px; background-color: #fff; min-height: ${matchHeight}px; display: flex; align-items: center; justify-content: center;">
              <div style="text-align: center;">
                <div style="font-weight: bold;">${playerName}</div>
                <div style="font-size: 12px; color: #666;">BYE</div>
              </div>
            </div>
          `;
        }
      } else {
        const player1Name = player1 ? formatPlayerName(player1.firstName, player1.lastName, nameOrder) : 'TBD';
        const player2Name = player2 ? formatPlayerName(player2.firstName, player2.lastName, nameOrder) : 'TBD';

        let score = '-';
        let winner = '';
        if (match) {
          if (match.player1Forfeit) {
            score = 'Forfeit';
            winner = player2Name;
          } else if (match.player2Forfeit) {
            score = 'Forfeit';
            winner = player1Name;
          } else {
            score = `${match.player1Sets} - ${match.player2Sets}`;
            winner = match.player1Sets > (match.player2Sets ?? 0) ? player1Name : player2Name;
          }
        }

        const player1Style = winner === player1Name && match ? 'font-weight: bold; color: #27ae60;' : '';
        const player2Style = winner === player2Name && match ? 'font-weight: bold; color: #27ae60;' : '';

        resultsContent += `
          <div style="position: absolute; top: ${topPosition}px; left: 0; right: 0; border: 1px solid #333; background-color: #fff; min-height: ${matchHeight}px;">
            <div style="padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: center; ${player1Style}">
              ${player1Name}
            </div>
            <div style="padding: 6px 8px; text-align: center; font-weight: bold; font-size: 12px; background-color: #f8f9fa;">
              ${score}
            </div>
            <div style="padding: 6px 8px; text-align: center; ${player2Style}">
              ${player2Name}
            </div>
          </div>
        `;
      }
    });

    resultsContent += `</div></div>`;
  }

  resultsContent += '</div>';

  if (championName) {
    const isCancelled = tournament.cancelled;
    resultsContent += `
      <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 20px;">
          ${isCancelled ? '<span style="color: #e74c3c; font-weight: bold;">Tournament has not been completed</span>' : `<span style="color: #000;">Champion: </span><span style="color: #27ae60; font-weight: bold;">${championName}</span>`}
        </h3>
      </div>
    `;
  }

  return resultsContent;
}

function openResultsPrintDocument(title: string, bodyHtml: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>${RESULTS_PRINT_STYLES}</style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

export function buildBasicResultsDocumentHtml(
  tournament: Tournament,
  { abbreviated, typeName }: { abbreviated: boolean; typeName: string },
): string {
  const tournamentName = tournamentDisplayName(tournament);
  const completionDate = tournament.recordedAt
    ? new Date(tournament.recordedAt).toLocaleDateString()
    : new Date(tournament.createdAt).toLocaleDateString();
  const hasBracketStructure = Boolean(tournament.bracketMatches && tournament.bracketMatches.length > 0);

  let resultsContent = '';
  if (!hasBracketStructure) {
    resultsContent = abbreviated
      ? buildAbbreviatedStandingsTableHtml(tournament)
      : buildFullRoundRobinResultsHtml(tournament);
  } else {
    // Playoff / bracket: abbreviated unavailable — always full bracket
    resultsContent = buildBasicPlayoffBracketHtml(tournament);
  }

  if (abbreviated && !hasBracketStructure) {
    return `
      <div class="abbreviated-doc">
        <h1>${tournamentName}</h1>
        <div class="tournament-info">
          <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}
        </div>
        ${resultsContent}
      </div>
    `;
  }

  return `
    <h1>Tournament Results</h1>
    <div class="tournament-info">
      <strong>Tournament:</strong> ${tournamentName}<br>
      <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
      <strong>Completed:</strong> ${completionDate}<br>
      <strong>Participants:</strong> ${tournament.participants.length}<br>
      <strong>Type:</strong> ${typeName}
    </div>
    ${resultsContent}
  `;
}

export function buildCompoundResultsDocumentHtml(
  tournament: Tournament,
  { abbreviated }: { abbreviated: boolean },
): string | null {
  const children = (tournament.childTournaments || [])
    .slice()
    .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999));

  if (children.length === 0) return null;

  const tournamentName = tournamentDisplayName(tournament);
  const completionDate = tournament.recordedAt
    ? new Date(tournament.recordedAt).toLocaleDateString()
    : new Date(tournament.createdAt).toLocaleDateString();

  let allResultsHtml = '';
  let abbreviatedSectionsHtml = '';

  for (const child of children) {
    const hasBracketStructure = Boolean(child.bracketMatches && child.bracketMatches.length > 0);
    const childName = child.name || `Sub-tournament ${child.id}`;

    if (abbreviated) {
      // Compact RR grids sit side-by-side when they fit.
      // Playoff tables, and plugin-marked final-phase children, take a full row.
      const parentPlugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
      const isFinal = Boolean(parentPlugin?.isFinalPhaseChild?.(tournament, child));
      const sectionClass = [
        'abbreviated-section',
        hasBracketStructure || isFinal ? 'wide' : '',
        isFinal ? 'final-phase' : '',
      ].filter(Boolean).join(' ');
      abbreviatedSectionsHtml += `<div class="${sectionClass}">`;
      abbreviatedSectionsHtml += `<h3 style="border-bottom: 1px solid ${hasBracketStructure || isFinal ? '#27ae60' : '#3498db'};">${childName}</h3>`;
      if (!hasBracketStructure) {
        abbreviatedSectionsHtml += buildAbbreviatedStandingsTableHtml(child);
      } else {
        abbreviatedSectionsHtml += buildCompoundPlayoffChildHtml(child);
      }
      abbreviatedSectionsHtml += `</div>`;
    } else {
      allResultsHtml += `<div class="section" style="margin-bottom: 30px; page-break-inside: avoid;">`;
      allResultsHtml += `<h3 style="margin: 0 0 10px 0; color: #2c3e50; border-bottom: 2px solid ${hasBracketStructure ? '#27ae60' : '#3498db'}; padding-bottom: 5px;">
        ${childName}
        <span style="font-size: 12px; color: #666; font-weight: normal; margin-left: 10px;">${child.participants?.length || 0} players</span>
      </h3>`;
      if (!hasBracketStructure) {
        allResultsHtml += buildFullCompoundRoundRobinChildHtml(child);
      } else {
        allResultsHtml += buildCompoundPlayoffChildHtml(child);
      }
      allResultsHtml += `</div>`;
    }
  }

  if (abbreviated) {
    if (!abbreviatedSectionsHtml) return null;
    return `
      <div class="abbreviated-doc">
        <h1>${tournamentName}</h1>
        <div class="tournament-info">
          <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}
        </div>
        <div class="abbreviated-sections">
          ${abbreviatedSectionsHtml}
        </div>
      </div>
    `;
  }

  if (!allResultsHtml) return null;

  return `
    <h1>Tournament Results</h1>
    <div class="tournament-info">
      <strong>Tournament:</strong> ${tournamentName}<br>
      <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
      <strong>Completed:</strong> ${completionDate}<br>
      <strong>Participants:</strong> ${tournament.participants.length}<br>
      <strong>Sub-tournaments:</strong> ${children.length}
    </div>
    ${allResultsHtml}
  `;
}

export type ResultsPrintMode = 'full' | 'abbreviated';

export function printBasicTournamentResults(
  tournament: Tournament,
  options: { typeName: string; mode?: ResultsPrintMode },
): boolean {
  if (tournament.status !== 'COMPLETED') return false;
  const tournamentName = tournamentDisplayName(tournament);
  const abbreviated = options.mode === 'abbreviated';
  const bodyHtml = buildBasicResultsDocumentHtml(tournament, {
    abbreviated,
    typeName: options.typeName,
  });
  openResultsPrintDocument(`Results - ${tournamentName}`, bodyHtml);
  return true;
}

export function printCompoundTournamentResults(
  tournament: Tournament,
  options: { mode?: ResultsPrintMode } = {},
): boolean {
  const tournamentName = tournamentDisplayName(tournament);
  const bodyHtml = buildCompoundResultsDocumentHtml(tournament, {
    abbreviated: options.mode === 'abbreviated',
  });
  if (!bodyHtml) return false;
  openResultsPrintDocument(`Results - ${tournamentName}`, bodyHtml);
  return true;
}
