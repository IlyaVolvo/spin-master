import React from 'react';
import { TournamentActiveProps } from '../../../../types/tournament';
import { createMatchUpdater, MatchData, MatchUpdateCallbacks } from '../../utils/matchUpdater';

/**
 * Base interface for tournament plugins that provides standard match update functionality
 */
export interface TournamentPluginBase {
  tournamentId: number;
  onTournamentUpdate?: (tournament: any) => void;
  onMatchUpdate?: (match: any) => void;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

/**
 * Base class for tournament plugins with standard match update functionality
 */
export abstract class TournamentPlugin {
  protected tournamentId: number;
  protected callbacks: MatchUpdateCallbacks;

  constructor(props: TournamentActiveProps) {
    this.tournamentId = props.tournament.id;
    this.callbacks = {
      onSuccess: props.onSuccess,
      onError: props.onError,
      onTournamentUpdate: props.onTournamentUpdate,
      onMatchUpdate: props.onMatchUpdate,
    };
  }

  /**
   * Get the match updater for this tournament
   */
  protected getMatchUpdater() {
    return createMatchUpdater(this.tournamentId);
  }

  /**
   * Standard match creation - available to all tournament types
   */
  async createMatch(matchData: MatchData): Promise<any> {
    const updater = this.getMatchUpdater();
    return updater.createMatch(matchData, this.callbacks);
  }

  /**
   * Standard match update - available to all tournament types
   */
  async updateMatch(matchId: number, matchData: MatchData): Promise<any> {
    const updater = this.getMatchUpdater();
    return updater.updateMatch(matchId, matchData, this.callbacks);
  }

  /**
   * Standard match deletion - available to all tournament types
   */
  async deleteMatch(matchId: number): Promise<void> {
    const updater = this.getMatchUpdater();
    return updater.deleteMatch(matchId, this.callbacks);
  }

  /**
   * Tournament-specific match handling - to be implemented by subclasses
   */
  abstract handleTournamentSpecificMatchUpdate?(matchData: any): Promise<void>;

  /**
   * Check if this tournament type supports match entry
   * Compound tournaments should override this to return false
   */
  supportsMatchEntry(): boolean {
    return true;
  }
}

/**
 * Higher-order component that adds standard match update functionality to tournament plugins
 */
export function withMatchUpdateSupport<P extends TournamentActiveProps>(
  Component: React.ComponentType<P>
) {
  return React.memo(function MatchUpdateSupportedComponent(props: P) {
    // The component can use the standard match update functionality
    // through the props or by creating its own MatchUpdater instance
    return <Component {...props} />;
  });
}
