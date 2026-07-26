import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { loadPublicSystemConfig, hasAnyPublicAchievementEnabled } from '../../utils/systemConfig';
import { PublicAchievementsNotAvailable, PublicResultsShell } from './PublicResultsShell';
import { formatMatchDateRange } from './formatMatchDateRange';

type ScopeMode = 'period' | 'tournament';
type PeriodPreset = 'week' | 'month' | 'year' | 'forever' | 'custom';

interface AchievementEntry {
  rank: number;
  member: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    rating: number | null;
  };
  value: number;
  matchId?: number | null;
}

interface AchievementCategory {
  id: string;
  title: string;
  entries: AchievementEntry[];
}

interface PublicTournamentOption {
  id: number;
  name: string | null;
  type: string;
  matchDateFrom: string | null;
  matchDateTo: string | null;
}

function memberName(member: AchievementEntry['member']): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return name || `Player ${member.id}`;
}

function formatMetric(categoryId: string, value: number): string {
  if (categoryId === 'club_ladder_movers') {
    return value > 0 ? `+${value}` : String(value);
  }
  return String(value);
}

const TABLE_COLUMNS = ['rank', 'player', 'metric'] as const;

const PublicAchievementsPage: React.FC = () => {
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('period');
  const [period, setPeriod] = useState<PeriodPreset>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [tournaments, setTournaments] = useState<PublicTournamentOption[]>([]);
  const [categories, setCategories] = useState<AchievementCategory[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const config = await loadPublicSystemConfig();
        if (cancelled) return;
        setFeatureEnabled(hasAnyPublicAchievementEnabled(config));
      } catch {
        if (!cancelled) setFeatureEnabled(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!featureEnabled) return;
    let cancelled = false;
    const loadTournaments = async () => {
      try {
        const response = await api.get('/public/results/list');
        if (!cancelled) setTournaments(response.data?.tournaments ?? []);
      } catch {
        if (!cancelled) setTournaments([]);
      }
    };
    void loadTournaments();
    return () => {
      cancelled = true;
    };
  }, [featureEnabled]);

  useEffect(() => {
    if (!featureEnabled) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {};
        if (scopeMode === 'tournament') {
          if (!tournamentId) {
            setCategories([]);
            setEmptyMessage('Pick a completed tournament to see achievements.');
            setLoading(false);
            return;
          }
          params.tournamentId = tournamentId;
        } else if (period === 'custom') {
          if (from) params.from = from;
          if (to) params.to = to;
          if (!from && !to) {
            setCategories([]);
            setEmptyMessage('Choose a from and/or to date for a custom range.');
            setLoading(false);
            return;
          }
        } else {
          params.period = period;
        }

        const response = await api.get('/public/achievements', { params });
        if (cancelled) return;
        const next: AchievementCategory[] = response.data?.categories ?? [];
        setCategories(next);
        setEmptyMessage(response.data?.emptyMessage?.text ?? null);
        setSelectedForPrint((prev) => {
          const updated: Record<string, boolean> = {};
          for (const category of next) {
            updated[category.id] = prev[category.id] ?? true;
          }
          return updated;
        });
      } catch (err: any) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setFeatureEnabled(false);
        } else {
          setError(err.response?.data?.error || 'Could not load achievements.');
          setCategories([]);
          setEmptyMessage(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [featureEnabled, scopeMode, period, from, to, tournamentId]);

  const selectedCount = useMemo(
    () => categories.filter((c) => selectedForPrint[c.id]).length,
    [categories, selectedForPrint],
  );

  const togglePrint = (id: string) => {
    setSelectedForPrint((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrint = () => {
    window.print();
  };

  if (featureEnabled === false) return <PublicAchievementsNotAvailable />;
  if (featureEnabled === null) {
    return (
      <PublicResultsShell title="Achievements">
        <div className="card">Loading...</div>
      </PublicResultsShell>
    );
  }

  return (
    <PublicResultsShell title="Achievements">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .achievement-section:not(.print-selected) { display: none !important; }
          .achievement-section { break-inside: avoid; margin-bottom: 24px; }
          body { background: #fff; }
          .container { max-width: none !important; margin: 0 !important; }
          table.achievement-table {
            width: 100%;
            max-width: 300px;
            table-layout: fixed;
            border-collapse: collapse;
          }
          table.achievement-table th, table.achievement-table td {
            border: 1px solid #ccc;
            padding: 3px 6px;
            text-align: left;
          }
          table.achievement-table .col-metric { text-align: right; }
        }
        table.achievement-table {
          width: 100%;
          max-width: 300px;
          table-layout: fixed;
          border-collapse: collapse;
          font-size: 13px;
          line-height: 1.25;
        }
        table.achievement-table th, table.achievement-table td {
          border-bottom: 1px solid #e8e8e8;
          padding: 3px 6px;
          text-align: left;
          vertical-align: middle;
        }
        table.achievement-table .col-rank { width: 28px; color: #78909c; }
        table.achievement-table .col-player { width: auto; }
        table.achievement-table .col-metric { width: 52px; text-align: right; }
        table.achievement-table td.col-metric { font-variant-numeric: tabular-nums; }
      `}</style>

      <div className="card no-print" style={{ marginBottom: '16px', backgroundColor: '#f5f7fa', border: '1px solid #cfd8dc' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <button
            type="button"
            className={scopeMode === 'period' ? 'button-3d' : 'button-filter'}
            onClick={() => setScopeMode('period')}
          >
            Period
          </button>
          <button
            type="button"
            className={scopeMode === 'tournament' ? 'button-3d' : 'button-filter'}
            onClick={() => setScopeMode('tournament')}
          >
            Tournament
          </button>
        </div>

        {scopeMode === 'period' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>
            {(['week', 'month', 'year', 'forever', 'custom'] as PeriodPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                className={period === preset ? 'button-3d' : 'button-filter'}
                onClick={() => setPeriod(preset)}
                style={{ textTransform: 'capitalize' }}
              >
                {preset}
              </button>
            ))}
            {period === 'custom' && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 600 }}>
                  From
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 600 }}>
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              </>
            )}
          </div>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 600, maxWidth: '480px' }}>
            Tournament
            <select
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              style={{ padding: '10px', fontSize: '14px' }}
            >
              <option value="">Select…</option>
              {tournaments.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {(t.name || `Tournament ${t.id}`) +
                    ' — ' +
                    formatMatchDateRange(t.matchDateFrom, t.matchDateTo)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="card">
        {loading && <p>Loading...</p>}
        {error && <div className="error-message">{error}</div>}
        {!loading && !error && categories.length === 0 && (
          <p style={{ margin: 0, fontStyle: 'italic', color: '#555' }}>
            {emptyMessage || 'No achievements for this filter.'}
          </p>
        )}
        {!loading && categories.length > 0 && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button-3d"
                onClick={handlePrint}
                disabled={selectedCount === 0}
                title={selectedCount === 0 ? 'Select at least one achievement to print' : 'Print selected'}
              >
                Print selected ({selectedCount})
              </button>
            </div>
            {categories.map((category) => {
              const printSelected = Boolean(selectedForPrint[category.id]);
              return (
                <section
                  key={category.id}
                  className={`achievement-section${printSelected ? ' print-selected' : ''}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '6px',
                    }}
                  >
                    <label
                      className="no-print"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      title="Include when printing"
                    >
                      <input
                        type="checkbox"
                        checked={printSelected}
                        onChange={() => togglePrint(category.id)}
                        style={{ transform: 'scale(1.15)', accentColor: '#2d6f8f' }}
                      />
                      <span style={{ fontSize: '12px', color: '#666' }}>Print</span>
                    </label>
                    <h2 style={{ margin: 0, fontSize: '16px', color: '#2c3e50' }}>
                      {category.title}
                    </h2>
                  </div>
                  <table className="achievement-table">
                    <colgroup>
                      {TABLE_COLUMNS.map((col) => (
                        <col key={col} className={`col-${col}`} />
                      ))}
                    </colgroup>
                    <tbody>
                      {category.entries.map((entry) => (
                        <tr key={`${category.id}-${entry.rank}-${entry.member.id}-${entry.matchId ?? ''}`}>
                          <td className="col-rank">{entry.rank}</td>
                          <td className="col-player">{memberName(entry.member)}</td>
                          <td className="col-metric">{formatMetric(category.id, entry.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </PublicResultsShell>
  );
};

export default PublicAchievementsPage;
