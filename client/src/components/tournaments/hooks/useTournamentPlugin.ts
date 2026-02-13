import { tournamentPluginRegistry } from '../TournamentPluginRegistry';
import { Tournament, TournamentType } from '../../../types/tournament';

export function useTournamentPlugin(tournament: Tournament) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  
  if (!plugin) {
    throw new Error(`No plugin found for tournament type: ${tournament.type}`);
  }

  return plugin;
}

export function useTournamentPluginRenderer(tournament: Tournament) {
  const plugin = useTournamentPlugin(tournament);
  
  return {
    renderActivePanel: (props: any) => plugin.createActivePanel(props),
    renderCompletedPanel: (props: any) => plugin.createCompletedPanel(props),
    renderSchedulePanel: plugin.createSchedulePanel ? (props: any) => plugin.createSchedulePanel!(props) : undefined,
    renderHeader: (props: any) => plugin.renderHeader?.(props),
  };
}
