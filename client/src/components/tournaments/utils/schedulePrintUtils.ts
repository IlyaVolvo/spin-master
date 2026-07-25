import { formatActiveTournamentRating } from '../../../utils/ratingFormatter';
import { tournamentPluginRegistry } from '../TournamentPluginRegistry';
import type { Tournament, TournamentType } from '../../../types/tournament';

const PRINT_STYLES = `
  @media print { @page { margin: 1cm; } body { margin: 0; padding: 0; } }
  body { font-family: Arial, sans-serif; padding: 20px; }
  h1 { margin: 0 0 10px 0; font-size: 24px; color: #2c3e50; }
  .tournament-info { margin-bottom: 20px; font-size: 14px; color: #666; }
  table { border-collapse: collapse; width: 100%; margin-top: 10px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  .separator-row { height: 3px; background-color: #333; }
  .separator-row td { padding: 0; border: none; height: 3px; }
  th, td { padding: 10px; border: 1px solid #333; text-align: left; }
  th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
  td:first-child { text-align: center; font-weight: bold; }
  .rating { font-size: 12px; color: #666; margin-left: 8px; }
  .played { text-decoration: line-through; opacity: 0.6; }
  .section { margin-bottom: 30px; page-break-inside: avoid; }
  .section h3 { margin: 0 0 5px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
`;

/** True when the parent plugin models a prelim+final structure (exposes final-phase helpers). */
export function isPreliminaryFinalParentType(type: TournamentType): boolean {
  const plugin = tournamentPluginRegistry.get(type);
  return typeof plugin?.isFinalPhaseChild === 'function';
}

export function isPreliminaryGroupChild(parent: Tournament, child: Tournament): boolean {
  const plugin = tournamentPluginRegistry.get(parent.type as TournamentType);
  if (plugin?.isPreliminaryGroupChild) {
    return plugin.isPreliminaryGroupChild(parent, child);
  }
  return true;
}

export function isFinalPhaseChild(parent: Tournament, child: Tournament): boolean {
  const plugin = tournamentPluginRegistry.get(parent.type as TournamentType);
  return Boolean(plugin?.isFinalPhaseChild?.(parent, child));
}

/** True when this child has participants and a non-empty generated schedule. */
export function childHasPrintableSchedule(child: Tournament): boolean {
  const plugin = tournamentPluginRegistry.get(child.type);
  if (!plugin?.generateSchedule) return false;
  if (!child.participants?.length) return false;
  return plugin.generateSchedule(child).length > 0;
}

/**
 * Sub-tournaments eligible for printing from a compound parent.
 * For preliminary+final types, only preliminary groups until the final exists with participants.
 */
export function getCompoundSchedulePrintChildren(parent: Tournament): Tournament[] {
  const children = (parent.childTournaments || [])
    .slice()
    .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999));

  return children.filter((child) => {
    if (!childHasPrintableSchedule(child)) return false;
    if (isPreliminaryFinalParentType(parent.type) && isFinalPhaseChild(parent, child)) {
      return true;
    }
    if (isPreliminaryFinalParentType(parent.type)) {
      return isPreliminaryGroupChild(parent, child);
    }
    return true;
  });
}

export function compoundSchedulePrintLabel(parent: Tournament): string {
  if (!isPreliminaryFinalParentType(parent.type)) {
    return 'Print all sub-tournament schedules';
  }
  const children = parent.childTournaments || [];
  const hasPrintableFinal = children.some(
    (c) => isFinalPhaseChild(parent, c) && childHasPrintableSchedule(c),
  );
  return hasPrintableFinal
    ? 'Print all sub-tournament schedules'
    : 'Print preliminary schedules only (final stage not yet created)';
}

export function compoundSchedulePrintButtonText(parent: Tournament): string {
  if (!isPreliminaryFinalParentType(parent.type)) {
    return 'Print Schedule';
  }
  const children = parent.childTournaments || [];
  const hasPrintableFinal = children.some(
    (c) => isFinalPhaseChild(parent, c) && childHasPrintableSchedule(c),
  );
  return hasPrintableFinal ? 'Print Schedule' : 'Print Preliminary Schedules';
}

function buildScheduleTableHtml(tournament: Tournament): string | null {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  if (!plugin?.generateSchedule) return null;

  const scheduleRounds = plugin.generateSchedule(tournament);
  if (scheduleRounds.length === 0) return null;

  const totalMatches = scheduleRounds.reduce((sum, round) => sum + round.matches.length, 0);
  const useMatchNumberColumn = plugin.schedulePrintUsesMatchNumberColumn === true;

  const playedMatches = new Set<string>();
  (tournament.matches || []).forEach((match) => {
    if (match.member2Id !== null && match.member2Id !== 0) {
      playedMatches.add(`${match.member1Id}-${match.member2Id}`);
      playedMatches.add(`${match.member2Id}-${match.member1Id}`);
    }
  });

  const roundsWithRatings = scheduleRounds.map((round) => ({
    ...round,
    matches: round.matches.map((match: any, matchIdx: number) => {
      if (useMatchNumberColumn) {
        const hasMemberIds =
          typeof match.member1Id === 'number' &&
          match.member1Id > 0 &&
          typeof match.member2Id === 'number' &&
          match.member2Id > 0;
        const isPlayedFromSchedule = typeof match.isPlayed === 'boolean' ? match.isPlayed : undefined;
        const isPlayed =
          isPlayedFromSchedule !== undefined
            ? isPlayedFromSchedule
            : hasMemberIds
              ? playedMatches.has(`${match.member1Id}-${match.member2Id}`)
              : false;
        return {
          ...match,
          p1Name: match.member1Name,
          p2Name: match.member2Name,
          p1Rating: match.player1Rating || '',
          p2Rating: match.player2Rating || '',
          isPlayed,
          matchNumber: match.matchNumber ?? matchIdx + 1,
        };
      }
      const p1Rating = formatActiveTournamentRating(match.member1StoredRating, match.member1CurrentRating);
      const p2Rating = formatActiveTournamentRating(match.member2StoredRating, match.member2CurrentRating);
      return {
        ...match,
        p1Name: match.member1Name,
        p2Name: match.member2Name,
        p1Rating,
        p2Rating,
        isPlayed: playedMatches.has(`${match.member1Id}-${match.member2Id}`),
        matchNumber: match.matchNumber,
      };
    }),
  }));

  return `
    <table>
      <thead>
        <tr>
          <th>${useMatchNumberColumn ? 'Match #' : 'Round'}</th>
          <th>Player 1</th>
          <th>Player 2</th>
        </tr>
      </thead>
      <tbody>
        ${roundsWithRatings
          .map(
            (round, roundIndex) => `
          ${roundIndex > 0 ? '<tr class="separator-row"><td colspan="3"></td></tr>' : ''}
          ${round.matches
            .map(
              (match: any) => `
            <tr class="${match.isPlayed ? 'played' : ''}">
              <td>${useMatchNumberColumn ? match.matchNumber : match.roundLabel || `Round ${match.round}`}</td>
              <td>${match.p1Name}${match.p1Rating ? `<span class="rating">(${match.p1Rating})</span>` : ''}</td>
              <td>${match.p2Name}${match.p2Rating ? `<span class="rating">(${match.p2Rating})</span>` : ''}</td>
            </tr>
          `,
            )
            .join('')}
        `,
          )
          .join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:#666;margin-top:8px;">${totalMatches} matches | ${tournament.participants?.length || 0} players</p>
  `;
}

function openPrintDocument(title: string, bodyHtml: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>${PRINT_STYLES}</style>
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

/** Print schedule for one basic sub-tournament. */
export function printTournamentSchedule(tournament: Tournament, parentName?: string | null): boolean {
  const tableHtml = buildScheduleTableHtml(tournament);
  if (!tableHtml) return false;

  const tournamentName = tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
  const title = `Schedule - ${tournamentName}`;
  const parentLine = parentName ? `<strong>Event:</strong> ${parentName}<br>` : '';

  openPrintDocument(
    title,
    `
      <h1>Match Schedule</h1>
      <div class="tournament-info">
        ${parentLine}
        <strong>Tournament:</strong> ${tournamentName}<br>
        <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
        <strong>Participants:</strong> ${tournament.participants?.length || 0}
      </div>
      ${tableHtml}
    `,
  );
  return true;
}

/** Print schedules for selected compound sub-tournaments (preliminary-only when final not ready). */
export function printCompoundSchedules(parent: Tournament): boolean {
  const children = getCompoundSchedulePrintChildren(parent);
  if (children.length === 0) return false;

  const tournamentName = parent.name || `Tournament ${new Date(parent.createdAt).toLocaleDateString()}`;
  const sections = children
    .map((child) => {
      const tableHtml = buildScheduleTableHtml(child);
      if (!tableHtml) return '';
      const childName = child.name || `Sub-tournament ${child.id}`;
      return `
        <div class="section">
          <h3>${childName}</h3>
          ${tableHtml}
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  if (!sections) return false;

  openPrintDocument(
    `Schedule - ${tournamentName}`,
    `
      <h1>Match Schedule</h1>
      <div class="tournament-info">
        <strong>Tournament:</strong> ${tournamentName}<br>
        <strong>Date:</strong> ${new Date(parent.createdAt).toLocaleDateString()}<br>
        <strong>Sub-tournaments:</strong> ${children.length}
      </div>
      ${sections}
    `,
  );
  return true;
}
