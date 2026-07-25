import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import { formatCompletedTournamentRating, formatRrCompletedRatingLine } from '../../../utils/ratingFormatter';
import type { Tournament } from '../../../types/tournament';
import { buildResultsMatrix, calculateStandings } from './roundRobinUtils';
import type { ResultsPrintMode } from '../utils/resultsPrintModes';

function posBgColor(position: number): string {
  if (position === 1) return '#fff3cd';
  if (position === 2) return '#e9ecef';
  if (position === 3) return '#d4edda';
  return '#fff';
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
    <div class="results-table-block">
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
    </div>
  `;
  return html;
}

/**
 * Standard RR grid: abbreviated place-sorted matrix plus Wins / Losses / WG / LG (games = sets).
 */
export function buildStandardRoundRobinResultsHtml(tournament: Tournament): string {
  const standings = calculateStandings(tournament);
  const { participants, participantData, scoreMatrix } = buildScoreMatrix(tournament);
  const nameOrder = getNameDisplayOrder();
  const positionByMemberId = new Map(standings.map(({ member, position }) => [member.id, position]));
  const statsByMemberId = new Map(standings.map(({ member, stats }) => [member.id, stats]));

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

  const summaryHeader = (label: string) => `
          <th style="padding: 2px 4px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; font-weight: bold; white-space: nowrap;">${label}</th>
  `;

  let html = `
    <div class="results-table-block">
    <table class="standard-standings abbreviated-results-grid" style="border-collapse: collapse; width: auto; margin-bottom: 10px; font-size: 10px;">
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

  html += summaryHeader('W');
  html += summaryHeader('L');
  html += summaryHeader('WG');
  html += summaryHeader('LG');

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  ordered.forEach((p1) => {
    const { position, playerName } = labelFor(p1);
    const posBg = typeof position === 'number' ? posBgColor(position) : '#fff';
    const stats = statsByMemberId.get(p1.member.id);
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
          <td style="padding: 2px 4px; border: 1px solid #333; text-align: center; font-weight: bold;">${stats?.wins ?? 0}</td>
          <td style="padding: 2px 4px; border: 1px solid #333; text-align: center; font-weight: bold;">${stats?.losses ?? 0}</td>
          <td style="padding: 2px 4px; border: 1px solid #333; text-align: center; font-weight: bold;">${stats?.setsWon ?? 0}</td>
          <td style="padding: 2px 4px; border: 1px solid #333; text-align: center; font-weight: bold;">${stats?.setsLost ?? 0}</td>
        </tr>
    `;
  });

  html += `
      </tbody>
    </table>
    </div>
  `;
  return html;
}

/** Full / Detailed basic RR standings + results matrix. */
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


/** Section HTML for a basic or compound RR child. */
export function buildRoundRobinResultsSectionHtml(tournament: Tournament, mode: ResultsPrintMode): string {
  if (mode === 'abbreviated') return buildAbbreviatedStandingsTableHtml(tournament);
  if (mode === 'detailed') {
    // Compound children use compact detailed layout when parent requests detailed;
    // basic detailed uses full standings+matrix. Callers that need compound compact
    // use buildFullCompoundRoundRobinChildHtml directly or pass via mode handling.
    return buildFullRoundRobinResultsHtml(tournament);
  }
  return buildStandardRoundRobinResultsHtml(tournament);
}

export function buildRoundRobinChildResultsHtml(child: Tournament, mode: ResultsPrintMode): string {
  if (mode === 'abbreviated') return buildAbbreviatedStandingsTableHtml(child);
  if (mode === 'detailed') return buildFullCompoundRoundRobinChildHtml(child);
  return buildStandardRoundRobinResultsHtml(child);
}
