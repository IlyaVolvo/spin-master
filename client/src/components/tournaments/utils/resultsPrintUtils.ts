import type { Tournament, TournamentType } from '../../../types/tournament';
import { tournamentPluginRegistry } from '../TournamentPluginRegistry';
import {
  getSupportedResultsPrintModes,
  resolveChildResultsPrintMode,
  type ResultsPrintMode,
} from './resultsPrintModes';
import {
  buildRoundRobinChildResultsHtml,
  buildRoundRobinResultsSectionHtml,
  buildAbbreviatedStandingsTableHtml,
  buildStandardRoundRobinResultsHtml,
  buildFullRoundRobinResultsHtml,
  buildFullCompoundRoundRobinChildHtml,
} from '../plugins/roundRobinResultsPrint';
import {
  buildPlayoffChildResultsHtml,
  buildPlayoffResultsSectionHtml,
  buildBasicPlayoffBracketHtml,
  buildCompoundPlayoffChildHtml,
} from '../plugins/playoffResultsPrint';

export type { ResultsPrintMode } from './resultsPrintModes';

// Re-export type-specific builders for tests / callers that import from this module.
export {
  buildAbbreviatedStandingsTableHtml,
  buildStandardRoundRobinResultsHtml,
  buildFullRoundRobinResultsHtml,
  buildFullCompoundRoundRobinChildHtml,
} from '../plugins/roundRobinResultsPrint';
export {
  buildBasicPlayoffBracketHtml,
  buildCompoundPlayoffChildHtml,
} from '../plugins/playoffResultsPrint';

const RESULTS_PRINT_STYLES = `
  @media print {
    @page { margin: 1cm; size: auto; }
    body { margin: 0; padding: 0; overflow: visible; }
    .bracket-container { page-break-inside: avoid; overflow: visible; width: max-content; }
    .bracket-round { page-break-inside: avoid; }
    .results-table-block { page-break-inside: avoid; }
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
  .results-table-block { page-break-inside: avoid; margin-bottom: 16px; }
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
  .compound-results-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  .compound-results-section {
    width: 100%;
    max-width: 100%;
    margin: 0;
    page-break-inside: avoid;
  }
  .compound-results-section h3 {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: #2c3e50;
    padding-bottom: 3px;
  }
  .compound-results-section.final-phase {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #bbb;
  }
`;

function tournamentDisplayName(tournament: Tournament): string {
  return tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
}

function resolveBasicResultsSectionHtml(tournament: Tournament, mode: ResultsPrintMode): string {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  if (plugin?.buildResultsSectionHtml) {
    return plugin.buildResultsSectionHtml(tournament, mode);
  }
  // Fallback by structure for types without the hook yet (e.g. Swiss).
  if (tournament.bracketMatches && tournament.bracketMatches.length > 0) {
    return buildPlayoffResultsSectionHtml(tournament, mode);
  }
  return buildRoundRobinResultsSectionHtml(tournament, mode);
}

function resolveChildResultsSectionHtml(child: Tournament, mode: ResultsPrintMode): string {
  const plugin = tournamentPluginRegistry.get(child.type as TournamentType);
  if (plugin?.buildChildResultsSectionHtml) {
    return plugin.buildChildResultsSectionHtml(child, mode);
  }
  if (child.bracketMatches && child.bracketMatches.length > 0) {
    return buildPlayoffChildResultsHtml(child, mode);
  }
  return buildRoundRobinChildResultsHtml(child, mode);
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
  { mode, typeName }: { mode: ResultsPrintMode; typeName: string },
): string {
  const tournamentName = tournamentDisplayName(tournament);
  const completionDate = tournament.recordedAt
    ? new Date(tournament.recordedAt).toLocaleDateString()
    : new Date(tournament.createdAt).toLocaleDateString();
  const hasBracketStructure = Boolean(tournament.bracketMatches && tournament.bracketMatches.length > 0);
  const resultsContent = resolveBasicResultsSectionHtml(tournament, mode);

  const compactHeader = !hasBracketStructure && (mode === 'abbreviated' || mode === 'standard');
  if (compactHeader) {
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
  { mode }: { mode: ResultsPrintMode },
): string | null {
  const children = (tournament.childTournaments || [])
    .slice()
    .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999));

  if (children.length === 0) return null;

  const tournamentName = tournamentDisplayName(tournament);
  const completionDate = tournament.recordedAt
    ? new Date(tournament.recordedAt).toLocaleDateString()
    : new Date(tournament.createdAt).toLocaleDateString();

  const parentPlugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  let sectionsHtml = '';
  const useCompactHeader = mode === 'abbreviated' || mode === 'standard';

  for (const child of children) {
    const childMode = resolveChildResultsPrintMode(child, mode);
    const hasBracketStructure = Boolean(child.bracketMatches && child.bracketMatches.length > 0);
    const childName = child.name || `Sub-tournament ${child.id}`;
    const isFinal = Boolean(parentPlugin?.isFinalPhaseChild?.(tournament, child));
    const sectionClass = [
      'compound-results-section',
      'results-table-block',
      isFinal ? 'final-phase' : '',
    ].filter(Boolean).join(' ');

    const borderColor = hasBracketStructure || isFinal ? '#27ae60' : '#3498db';

    if (useCompactHeader) {
      sectionsHtml += `<div class="${sectionClass}">`;
      sectionsHtml += `<h3 style="border-bottom: 1px solid ${borderColor};">${childName}</h3>`;
      sectionsHtml += resolveChildResultsSectionHtml(child, childMode);
      sectionsHtml += `</div>`;
    } else {
      sectionsHtml += `<div class="section ${sectionClass}" style="margin-bottom: 30px; page-break-inside: avoid;">`;
      sectionsHtml += `<h3 style="margin: 0 0 10px 0; color: #2c3e50; border-bottom: 2px solid ${borderColor}; padding-bottom: 5px;">
        ${childName}
        <span style="font-size: 12px; color: #666; font-weight: normal; margin-left: 10px;">${child.participants?.length || 0} players</span>
      </h3>`;
      sectionsHtml += resolveChildResultsSectionHtml(child, childMode);
      sectionsHtml += `</div>`;
    }
  }

  if (!sectionsHtml) return null;

  if (useCompactHeader) {
    return `
      <div class="abbreviated-doc">
        <h1>${tournamentName}</h1>
        <div class="tournament-info">
          <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}
        </div>
        <div class="compound-results-sections">
          ${sectionsHtml}
        </div>
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
      <strong>Sub-tournaments:</strong> ${children.length}
    </div>
    <div class="compound-results-sections">
      ${sectionsHtml}
    </div>
  `;
}

export function printBasicTournamentResults(
  tournament: Tournament,
  options: { typeName: string; mode?: ResultsPrintMode },
): boolean {
  if (tournament.status !== 'COMPLETED') return false;
  const tournamentName = tournamentDisplayName(tournament);
  const requested = options.mode ?? 'standard';
  const supported = getSupportedResultsPrintModes(tournament);
  const mode = supported.includes(requested) ? requested : 'standard';
  const bodyHtml = buildBasicResultsDocumentHtml(tournament, {
    mode,
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
  const requested = options.mode ?? 'standard';
  const supported = getSupportedResultsPrintModes(tournament);
  const mode = supported.includes(requested) ? requested : 'standard';
  const bodyHtml = buildCompoundResultsDocumentHtml(tournament, { mode });
  if (!bodyHtml) return false;
  openResultsPrintDocument(`Results - ${tournamentName}`, bodyHtml);
  return true;
}
