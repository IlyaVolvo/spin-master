import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';
import type { Tournament } from '../../../types/tournament';
import type { ResultsPrintMode } from '../utils/resultsPrintModes';

function getPlayoffRoundLabel(round: number, totalRounds: number): string {
  const totalMatches = Math.pow(2, totalRounds - round + 1);
  if (totalMatches >= 32) return 'Round of 32';
  if (totalMatches >= 16) return 'Round of 16';
  if (totalMatches >= 8) return 'Quarterfinals';
  if (totalMatches >= 4) return 'Semifinals';
  if (totalMatches >= 2) return 'Finals';
  return 'Championship';
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


export function buildPlayoffResultsSectionHtml(_tournament: Tournament, _mode: ResultsPrintMode): string {
  return buildBasicPlayoffBracketHtml(_tournament);
}

export function buildPlayoffChildResultsHtml(child: Tournament, _mode: ResultsPrintMode): string {
  return buildCompoundPlayoffChildHtml(child);
}
