import React from 'react';
import { tournamentPluginRegistry } from './TournamentPluginRegistry';
import { Tournament, TournamentType } from '../../types/tournament';

interface TournamentRendererProps {
  tournament: Tournament;
  onTournamentUpdate?: (tournament: Tournament) => void;
  onMatchUpdate?: (match: any) => void;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  isUserOrganizer?: boolean;
}

export function TournamentActiveRenderer({ tournament, ...props }: TournamentRendererProps) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  
  if (!plugin) {
    return React.createElement('div', {}, `No plugin found for tournament type: ${tournament.type}`);
  }

  return plugin.createActivePanel({
    tournament,
    onTournamentUpdate: props.onTournamentUpdate || (() => {}),
    onMatchUpdate: props.onMatchUpdate || (() => {}),
    onError: props.onError || (() => {}),
    onSuccess: props.onSuccess || (() => {}),
  });
}

export function TournamentCompletedRenderer({ tournament, ...props }: TournamentRendererProps) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  
  if (!plugin) {
    return React.createElement('div', {}, `No plugin found for tournament type: ${tournament.type}`);
  }

  return plugin.createCompletedPanel({
    tournament,
    onTournamentUpdate: props.onTournamentUpdate || (() => {}),
    onError: props.onError || (() => {}),
    onSuccess: props.onSuccess || (() => {}),
    isExpanded: false,
    onToggleExpand: () => {},
  });
}

export function TournamentScheduleRenderer({ tournament, ...props }: TournamentRendererProps) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  
  if (!plugin) {
    return React.createElement('div', {}, `No plugin found for tournament type: ${tournament.type}`);
  }

  return plugin.createSchedulePanel({
    tournament,
    onTournamentUpdate: props.onTournamentUpdate || (() => {}),
    onError: props.onError || (() => {}),
    onSuccess: props.onSuccess || (() => {}),
    isExpanded: false,
    onToggleExpand: () => {},
  });
}

export function TournamentHeaderRenderer({ tournament, onEditClick }: { tournament: Tournament; onEditClick: () => void }) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  
  if (!plugin || !plugin.renderHeader) {
    return React.createElement('div', {}, 
      React.createElement('h3', {}, tournament.name || 'Tournament'),
      React.createElement('button', { onClick: onEditClick }, 'Edit')
    );
  }

  return plugin.renderHeader({ tournament, onEditClick });
}
