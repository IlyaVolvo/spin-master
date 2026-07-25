import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';
import { loadPublicSystemConfig } from '../../utils/systemConfig';
import { Tournament, TournamentType } from '../../types/tournament';
import { tournamentPluginRegistry } from '../tournaments/TournamentPluginRegistry';
import '../tournaments/plugins';
import {
  printBasicTournamentResults,
  printCompoundTournamentResults,
} from '../tournaments/utils/resultsPrintUtils';
import { ScoreCorrectionModeProvider } from '../../contexts/ScoreCorrectionModeContext';
import {
  ResultsPrintControl,
  getSupportedResultsPrintModes,
  type ResultsPrintMode,
} from './ResultsPrintControl';
import { PublicResultsNotAvailable, PublicResultsShell } from './PublicResultsShell';
import { formatMatchDateRange } from './formatMatchDateRange';

type LoadState =
  | { status: 'loading' }
  | { status: 'not-available' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tournament: Tournament };

function getTournamentTypeName(tournament: Tournament): string {
  if (!tournament.type) return 'Tournament';
  try {
    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
    if (plugin.getTypeName) return plugin.getTypeName();
  } catch {
    // Unknown type — fall through
  }
  return tournament.type.replace(/_/g, ' ');
}

function childHeading(child: Tournament): string {
  if (child.name) return child.name;
  if (child.groupNumber != null) return `Group ${child.groupNumber}`;
  return getTournamentTypeName(child);
}

/**
 * Mirror authenticated completed "Show Results": basic → parent panel;
 * compound → each child's completed panel (full RR matrix / bracket / Swiss).
 */
function PublicCompletedResults({ tournament }: { tournament: Tournament }) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);

  if (!plugin.isBasic) {
    const children = [...(tournament.childTournaments || [])].sort(
      (a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999) || a.id - b.id,
    );

    if (children.length === 0) {
      return (
        <p style={{ margin: 0, color: '#666' }}>
          No sub-tournament results are available for this event.
        </p>
      );
    }

    return (
      <div>
        {children.map((child) => {
          const childPlugin = tournamentPluginRegistry.get(child.type as TournamentType);
          return (
            <div
              key={child.id}
              style={{
                marginBottom: '20px',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: '#fff',
              }}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#2c3e50' }}>
                {childHeading(child)}
              </h3>
              {childPlugin.createCompletedPanel({
                tournament: child as any,
                onTournamentUpdate: () => {},
                onError: () => {},
                onSuccess: () => {},
                isExpanded: true,
                onToggleExpand: () => {},
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {plugin.createCompletedPanel({
        tournament: tournament as any,
        onTournamentUpdate: () => {},
        onError: () => {},
        onSuccess: () => {},
        isExpanded: true,
        onToggleExpand: () => {},
      })}
    </>
  );
}

function PublicResultsView({ tournament }: { tournament: Tournament }) {
  const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
  // Compounds always support print via child builders (same as TournamentDetailPage).
  const canPrint = !plugin.isBasic || Boolean(plugin.canPrintResults);
  const supportedModes = getSupportedResultsPrintModes(tournament);

  const handlePrint = (mode: ResultsPrintMode) => {
    if (plugin.isBasic) {
      printBasicTournamentResults(tournament, {
        typeName: getTournamentTypeName(tournament),
        mode,
      });
    } else {
      printCompoundTournamentResults(tournament, { mode });
    }
  };

  return (
    <ScoreCorrectionModeProvider activeChecked={false} completedChecked={false}>
      <PublicResultsShell title={tournament.name || `Tournament ${tournament.id}`}>
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', color: '#666' }}>
              <div>{getTournamentTypeName(tournament)}</div>
              <div>
                Date:{' '}
                {formatMatchDateRange(
                  (tournament as any).matchDateFrom,
                  (tournament as any).matchDateTo,
                )}
              </div>
              {!plugin.isBasic && (
                <div>
                  {(tournament.childTournaments || []).length} sub-tournaments
                </div>
              )}
            </div>
            {canPrint && (
              <ResultsPrintControl
                accentColor="#8e44ad"
                title="Print Results"
                supportedModes={supportedModes}
                onSelect={handlePrint}
              />
            )}
          </div>
        </div>

        <div className="card" style={{ backgroundColor: '#f8f9fa' }}>
          <PublicCompletedResults tournament={tournament} />
        </div>
      </PublicResultsShell>
    </ScoreCorrectionModeProvider>
  );
}

async function fetchPublicResults(path: string): Promise<Tournament> {
  const response = await api.get(path);
  return response.data as Tournament;
}

const PublicResultsLatestPage: React.FC = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    void loadPublicSystemConfig();
    let cancelled = false;
    const load = async () => {
      try {
        const tournament = await fetchPublicResults('/public/results/latest');
        if (!cancelled) setState({ status: 'ready', tournament });
      } catch (err: any) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setState({ status: 'not-available' });
        } else {
          setState({
            status: 'error',
            message: err.response?.data?.error || 'Could not load tournament results.',
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <PublicResultsShell>
        <div className="card">Loading...</div>
      </PublicResultsShell>
    );
  }
  if (state.status === 'not-available') return <PublicResultsNotAvailable />;
  if (state.status === 'error') {
    return (
      <PublicResultsShell>
        <div className="card">
          <div className="error-message">{state.message}</div>
        </div>
      </PublicResultsShell>
    );
  }
  return <PublicResultsView tournament={state.tournament} />;
};

const PublicResultsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    void loadPublicSystemConfig();
    let cancelled = false;
    const load = async () => {
      const parsed = id != null ? parseInt(id, 10) : NaN;
      if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== id) {
        setState({ status: 'not-available' });
        return;
      }
      try {
        const tournament = await fetchPublicResults(`/public/results/${parsed}`);
        if (!cancelled) setState({ status: 'ready', tournament });
      } catch (err: any) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setState({ status: 'not-available' });
        } else {
          setState({
            status: 'error',
            message: err.response?.data?.error || 'Could not load tournament results.',
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <PublicResultsShell>
        <div className="card">Loading...</div>
      </PublicResultsShell>
    );
  }
  if (state.status === 'not-available') return <PublicResultsNotAvailable />;
  if (state.status === 'error') {
    return (
      <PublicResultsShell>
        <div className="card">
          <div className="error-message">{state.message}</div>
        </div>
      </PublicResultsShell>
    );
  }
  return <PublicResultsView tournament={state.tournament} />;
};

export { PublicResultsLatestPage, PublicResultsDetailPage };
