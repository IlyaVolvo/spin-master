import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import {
  clearScrollPosition,
  getScrollPosition,
  getUIState,
  saveScrollPosition,
  saveUIState,
  withWindowScrollPreserved,
} from '../utils/scrollPosition';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { isDateInRange } from '../utils/dateFormatter';
import { EmptyState } from './EmptyState';
import { EmptyActiveIcon, EmptyCalendarIcon, EmptyCompletedIcon, EmptySearchIcon } from './emptyStateIcons';
import { TriStateCheckbox } from './TriStateCheckbox';
import {
  cancelledFilterToTriState,
  loadCancelledFilterMode,
  nextCancelledFilterMode,
  saveCancelledFilterMode,
  type CancelledFilterMode,
} from '../utils/cancelledFilterMode';
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket';
import {
  loadLastStage,
  saveLastStage,
  saveLastTournamentId,
  saveShouldRestoreDetail,
  stageTabLabel,
  type TournamentStageTab,
} from '../utils/tournamentNavState';
import {
  STAGE_TABS,
  TournamentStageTabs,
  countForStage,
  type StageCounts,
} from './tournaments/TournamentStageTabs';

/** Shared list columns so header labels align over Type / Date. */
const TOURNAMENT_LIST_GRID_COLUMNS = 'minmax(0, 1fr) 11rem 9.5rem';
const TOURNAMENT_LIST_ROW_HOVER_BG = '#bbdefb';

function applyTournamentListRowIdleStyle(el: HTMLElement, rowBg: string) {
  el.style.backgroundColor = rowBg;
  el.style.boxShadow = 'none';
  el.style.transform = 'none';
  el.style.borderLeft = '3px solid transparent';
  el.style.zIndex = '0';
}

function applyTournamentListRowActiveStyle(el: HTMLElement) {
  el.style.backgroundColor = TOURNAMENT_LIST_ROW_HOVER_BG;
  el.style.boxShadow = 'inset 0 0 0 1px #64b5f6, 0 2px 8px rgba(33, 150, 243, 0.35)';
  el.style.transform = 'scale(1.01)';
  el.style.borderLeft = '3px solid #1976d2';
  el.style.zIndex = '1';
}

interface TournamentIndexItem {
  id: number;
  name: string | null;
  type: string;
  status: string;
  cancelled: boolean;
  createdAt: string;
  recordedAt: string;
  tournamentDate: string | null;
  registrationDeadline: string | null;
  minRating: number | null;
  maxRating: number | null;
  maxParticipants: number | null;
  _count?: { participants: number; registrations: number };
}

interface StandaloneMatchFromAPI {
  id: number;
  tournamentId: null;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  createdAt: string;
  updatedAt: string;
  member1: { id: number; firstName: string; lastName: string; rating: number | null } | null;
  member2: { id: number; firstName: string; lastName: string; rating: number | null } | null;
  player1RatingBefore: number | null;
  player1RatingChange: number | null;
  player2RatingBefore: number | null;
  player2RatingChange: number | null;
}

const STATUS_FOR_STAGE: Record<Exclude<TournamentStageTab, 'MATCHES'>, string> = {
  PRE_REGISTRATION: 'PRE_REGISTRATION',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
};

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [stage, setStage] = useState<TournamentStageTab>(() => loadLastStage());
  const [counts, setCounts] = useState<StageCounts | null>(null);
  const [tournaments, setTournaments] = useState<TournamentIndexItem[]>([]);
  const [standaloneMatches, setStandaloneMatches] = useState<StandaloneMatchFromAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dateFilterType, setDateFilterType] = useState<string>(() => localStorage.getItem('tournaments_dateFilterType') || 'all');
  const [dateFilterStart, setDateFilterStart] = useState(() => localStorage.getItem('tournaments_dateFilterStart') || '');
  const [dateFilterEnd, setDateFilterEnd] = useState(() => localStorage.getItem('tournaments_dateFilterEnd') || '');
  const [tournamentNameFilter, setTournamentNameFilter] = useState(() => localStorage.getItem('tournaments_nameFilter') || '');
  const [cancelledFilter, setCancelledFilter] = useState<CancelledFilterMode>(() => loadCancelledFilterMode());

  const effectiveDateRange = useMemo(() => {
    const now = new Date();
    const toDateStr = (d: Date) => d.toISOString().split('T')[0];
    if (dateFilterType === 'today') {
      const day = toDateStr(now);
      return { start: day, end: day };
    }
    if (dateFilterType === 'week') {
      const day = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: toDateStr(start), end: toDateStr(end) };
    }
    if (dateFilterType === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: toDateStr(start), end: toDateStr(end) };
    }
    if (dateFilterType === 'custom' && dateFilterStart && dateFilterEnd) {
      return { start: dateFilterStart, end: dateFilterEnd };
    }
    return null;
  }, [dateFilterType, dateFilterStart, dateFilterEnd]);

  const fetchCounts = useCallback(async () => {
    const res = await api.get('/tournaments/stage-counts');
    setCounts(res.data);
    return res.data as StageCounts;
  }, []);

  const fetchStageData = useCallback(async (selected: TournamentStageTab) => {
    if (selected === 'MATCHES') {
      const res = await api.get('/matches');
      setStandaloneMatches(res.data);
      setTournaments([]);
      return;
    }
    const res = await api.get('/tournaments/index', { params: { status: STATUS_FOR_STAGE[selected] } });
    setTournaments(res.data);
    setStandaloneMatches([]);
  }, []);

  const refresh = useCallback(async (selected: TournamentStageTab = stage, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      await Promise.all([fetchCounts(), fetchStageData(selected)]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tournaments');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchCounts, fetchStageData, stage]);

  useEffect(() => {
    const rawId = location.state?.tournamentId;
    const deepLinkId = typeof rawId === 'number' ? rawId : (typeof rawId === 'string' ? parseInt(rawId, 10) : NaN);
    if (Number.isFinite(deepLinkId) && deepLinkId > 0) {
      saveLastTournamentId(deepLinkId);
      saveShouldRestoreDetail(true);
      navigate(`/tournaments/${deepLinkId}`, { replace: true, state: location.state });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const nextCounts = await fetchCounts();
        if (cancelled) return;
        let selected = stage;
        if (countForStage(nextCounts, selected) === 0) {
          const fallback = STAGE_TABS.find((tab) => countForStage(nextCounts, tab) > 0);
          if (fallback) {
            selected = fallback;
            setStage(fallback);
            saveLastStage(fallback);
          }
        }
        await fetchStageData(selected);
      } catch (err: any) {
        if (!cancelled) {
          setCounts({ preRegistration: 0, active: 0, completed: 0, matches: 0 });
          setError(err.response?.data?.error || 'Failed to load tournaments');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const shouldRestore = location.state?.from === 'tournaments' || location.state?.restoreScroll;
    if (shouldRestore) {
      const saved = getScrollPosition('/tournaments');
      const ui = getUIState('/tournaments');
      if (ui?.stage && STAGE_TABS.includes(ui.stage)) {
        setStage(ui.stage);
        saveLastStage(ui.stage);
      }
      if (saved != null) {
        requestAnimationFrame(() => window.scrollTo(0, saved));
      }
    } else if (!location.state?.tournamentId) {
      clearScrollPosition('/tournaments');
    }
  }, [location.state]);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const silentRefresh = () => {
      void withWindowScrollPreserved(() => refresh(stage, true));
    };
    socket?.on('tournament:updated', silentRefresh);
    socket?.on('tournament:created', silentRefresh);
    socket?.on('tournament:stateChanged', silentRefresh);
    socket?.on('tournament:deleted', silentRefresh);
    socket?.on('match:created', silentRefresh);
    socket?.on('match:updated', silentRefresh);
    return () => {
      socket?.off('tournament:updated', silentRefresh);
      socket?.off('tournament:created', silentRefresh);
      socket?.off('tournament:stateChanged', silentRefresh);
      socket?.off('tournament:deleted', silentRefresh);
      socket?.off('match:created', silentRefresh);
      socket?.off('match:updated', silentRefresh);
      disconnectSocket();
    };
  }, [refresh, stage]);

  const selectStage = (next: TournamentStageTab) => {
    if (countForStage(counts, next) === 0) return;
    setStage(next);
    saveLastStage(next);
    saveShouldRestoreDetail(false);
    setLoading(true);
    void fetchStageData(next)
      .catch((err: any) => setError(err.response?.data?.error || 'Failed to load tournaments'))
      .finally(() => setLoading(false));
  };

  const openTournament = (id: number) => {
    saveScrollPosition('/tournaments', window.scrollY);
    saveUIState('/tournaments', { stage });
    saveLastTournamentId(id);
    saveLastStage(stage === 'MATCHES' ? 'ACTIVE' : stage);
    saveShouldRestoreDetail(true);
    navigate(`/tournaments/${id}`);
  };

  const filteredTournaments = useMemo(() => {
    let list = [...tournaments];
    if (stage === 'COMPLETED') {
      if (cancelledFilter === 'hidden') list = list.filter((t) => !t.cancelled);
      else if (cancelledFilter === 'only') list = list.filter((t) => t.cancelled);
    }
    if (tournamentNameFilter.trim()) {
      const q = tournamentNameFilter.trim().toLowerCase();
      list = list.filter((t) => (t.name || '').toLowerCase().includes(q));
    }
    if (effectiveDateRange) {
      list = list.filter((t) => {
        const dateStr = stage === 'COMPLETED' ? (t.recordedAt || t.createdAt) : (t.tournamentDate || t.createdAt);
        return isDateInRange(new Date(dateStr), effectiveDateRange.start, effectiveDateRange.end);
      });
    }
    return list;
  }, [tournaments, stage, cancelledFilter, tournamentNameFilter, effectiveDateRange]);

  const filteredMatches = useMemo(() => {
    let list = [...standaloneMatches];
    if (tournamentNameFilter.trim()) {
      const q = tournamentNameFilter.trim().toLowerCase();
      list = list.filter((m) => {
        const p1 = m.member1 ? `${m.member1.firstName} ${m.member1.lastName}`.toLowerCase() : '';
        const p2 = m.member2 ? `${m.member2.firstName} ${m.member2.lastName}`.toLowerCase() : '';
        return p1.includes(q) || p2.includes(q);
      });
    }
    if (effectiveDateRange) {
      list = list.filter((m) => isDateInRange(new Date(m.createdAt), effectiveDateRange.start, effectiveDateRange.end));
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [standaloneMatches, tournamentNameFilter, effectiveDateRange]);

  const clearFilters = () => {
    setDateFilterType('all');
    setDateFilterStart('');
    setDateFilterEnd('');
    setTournamentNameFilter('');
    localStorage.setItem('tournaments_dateFilterType', 'all');
    localStorage.removeItem('tournaments_dateFilterStart');
    localStorage.removeItem('tournaments_dateFilterEnd');
    localStorage.removeItem('tournaments_nameFilter');
  };

  const renderFilters = (includeCancelled: boolean) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600 }}>Name:</label>
        <input
          type="text"
          value={tournamentNameFilter}
          onChange={(e) => {
            const value = e.target.value;
            setTournamentNameFilter(value);
            if (value) localStorage.setItem('tournaments_nameFilter', value);
            else localStorage.removeItem('tournaments_nameFilter');
          }}
          placeholder="Filter by name"
          style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '160px' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600 }}>Date:</label>
        <select
          value={dateFilterType}
          onChange={(e) => {
            setDateFilterType(e.target.value);
            localStorage.setItem('tournaments_dateFilterType', e.target.value);
          }}
          style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}
        >
          <option value="all">All</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="custom">Custom</option>
        </select>
        {dateFilterType === 'custom' && (
          <>
            <input
              type="date"
              value={dateFilterStart}
              onChange={(e) => {
                setDateFilterStart(e.target.value);
                localStorage.setItem('tournaments_dateFilterStart', e.target.value);
              }}
              style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}
            />
            <span>–</span>
            <input
              type="date"
              value={dateFilterEnd}
              onChange={(e) => {
                setDateFilterEnd(e.target.value);
                localStorage.setItem('tournaments_dateFilterEnd', e.target.value);
              }}
              style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}
            />
          </>
        )}
      </div>
      {includeCancelled && (
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '14px' }}
          title={
            cancelledFilter === 'only'
              ? 'Showing only cancelled. Click to hide cancelled again.'
              : cancelledFilter === 'included'
                ? 'Showing cancelled with completed. Shift+click to show only cancelled; click to hide cancelled.'
                : 'Cancelled are hidden. Click to include them; Shift+click to show only cancelled.'
          }
          onClick={(e) => {
            e.preventDefault();
            const next = nextCancelledFilterMode(cancelledFilter, e.shiftKey);
            setCancelledFilter(next);
            saveCancelledFilterMode(next);
          }}
        >
          <TriStateCheckbox value={cancelledFilterToTriState(cancelledFilter)} accentColor="#1976d2" />
          <span>Cancelled</span>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              border: '1px solid #90a4ae',
              color: '#607d8b',
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ?
          </span>
        </label>
      )}
      {(tournamentNameFilter || dateFilterType !== 'all') && (
        <button type="button" className="button-filter" onClick={clearFilters}>
          Clear filters
        </button>
      )}
    </div>
  );

  if (loading && !counts) {
    return <div className="card">Loading...</div>;
  }

  return (
    <div>
      <div className="card">
        {error && <div className="error-message">{error}</div>}

        <TournamentStageTabs stage={stage} counts={counts} onSelect={selectStage} />

        {stage !== 'MATCHES' && renderFilters(stage === 'COMPLETED')}
        {stage === 'MATCHES' && renderFilters(false)}

        {loading ? (
          <div>Loading...</div>
        ) : stage === 'MATCHES' ? (
          filteredMatches.length === 0 ? (
            <EmptyState
              title={tournamentNameFilter || dateFilterType !== 'all' ? 'No matches match your filters' : 'No individual matches'}
              accentColor="#1976d2"
              backgroundTint="#eef6fc"
              borderColor="#c5dff0"
              icon={tournamentNameFilter || dateFilterType !== 'all' ? <EmptySearchIcon color="#1976d2" /> : <EmptyCompletedIcon color="#1976d2" />}
            />
          ) : (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
              {filteredMatches.map((m, index) => {
                const p1Name = m.member1 ? formatPlayerName(m.member1.firstName, m.member1.lastName, getNameDisplayOrder()) : 'Unknown';
                const p2Name = m.member2 ? formatPlayerName(m.member2.firstName, m.member2.lastName, getNameDisplayOrder()) : 'Unknown';
                const p1Sets = m.player1Sets ?? 0;
                const p2Sets = m.player2Sets ?? 0;
                const p1Won = m.player1Forfeit ? false : (m.player2Forfeit ? true : p1Sets > p2Sets);
                const p2Won = m.player2Forfeit ? false : (m.player1Forfeit ? true : p2Sets > p1Sets);
                const p1Change = m.player1RatingChange;
                const p2Change = m.player2RatingChange;
                const p1Post = (m.player1RatingBefore !== null && p1Change !== null) ? m.player1RatingBefore + p1Change : null;
                const p2Post = (m.player2RatingBefore !== null && p2Change !== null) ? m.player2RatingBefore + p2Change : null;

                return (
                  <div
                    key={m.id}
                    style={{
                      padding: '6px 10px',
                      borderTop: index === 0 ? 'none' : '1px solid #eee',
                      backgroundColor: index % 2 === 0 ? '#fff' : '#f7f9fb',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const playerIds = [m.member1Id, m.member2Id].filter((id): id is number => id !== null);
                        saveScrollPosition('/tournaments', window.scrollY);
                        saveUIState('/tournaments', { stage });
                        navigate('/statistics', { state: { playerIds, from: 'tournaments' } });
                      }}
                      title="View Statistics"
                      style={{ padding: '2px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#3498db' }}
                    >
                      📊
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: p1Won ? '#27ae60' : p2Won ? '#e74c3c' : '#333' }}>{p1Name}</span>
                    {p1Change !== null && p1Post !== null && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: p1Change >= 0 ? '#27ae60' : '#e74c3c' }}>
                        ({p1Post}/{p1Change >= 0 ? `+${p1Change}` : p1Change})
                      </span>
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#2c3e50' }}>{p1Sets} : {p2Sets}</span>
                    {p2Change !== null && p2Post !== null && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: p2Change >= 0 ? '#27ae60' : '#e74c3c' }}>
                        ({p2Post}/{p2Change >= 0 ? `+${p2Change}` : p2Change})
                      </span>
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: p2Won ? '#27ae60' : p1Won ? '#e74c3c' : '#333' }}>{p2Name}</span>
                    <span style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>
                      {new Date(m.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredTournaments.length === 0 ? (
          <EmptyState
            title={
              tournamentNameFilter || dateFilterType !== 'all' || (stage === 'COMPLETED' && cancelledFilter !== 'hidden')
                ? 'No tournaments match your filters'
                : `No ${stageTabLabel(stage).toLowerCase()} tournaments`
            }
            accentColor={stage === 'PRE_REGISTRATION' ? '#b26a00' : stage === 'ACTIVE' ? '#27ae60' : '#1976d2'}
            backgroundTint={stage === 'PRE_REGISTRATION' ? '#fff8f0' : stage === 'ACTIVE' ? '#f0faf4' : '#eef6fc'}
            borderColor={stage === 'PRE_REGISTRATION' ? '#f0dcc8' : stage === 'ACTIVE' ? '#c8e6d0' : '#c5dff0'}
            icon={
              tournamentNameFilter || dateFilterType !== 'all' ? (
                <EmptySearchIcon color="#666" />
              ) : stage === 'PRE_REGISTRATION' ? (
                <EmptyCalendarIcon color="#b26a00" />
              ) : stage === 'ACTIVE' ? (
                <EmptyActiveIcon color="#27ae60" />
              ) : (
                <EmptyCompletedIcon color="#1976d2" />
              )
            }
          />
        ) : (
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: TOURNAMENT_LIST_GRID_COLUMNS,
                gap: '8px',
                padding: '4px 10px',
                backgroundColor: '#eceff1',
                borderBottom: '1px solid #cfd8dc',
                fontSize: '11px',
                fontWeight: 700,
                color: '#455a64',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span>Tournament</span>
              <span>Type</span>
              <span>Date</span>
            </div>
            {filteredTournaments.map((tournament, index) => {
              const dateValue = stage === 'COMPLETED'
                ? (tournament.recordedAt || tournament.createdAt)
                : (tournament.tournamentDate || tournament.createdAt);
              const rowBg = index % 2 === 0 ? '#ffffff' : '#e0e0e0';
              return (
                <button
                  key={tournament.id}
                  type="button"
                  onClick={() => openTournament(tournament.id)}
                  title="Open tournament"
                  aria-label={`Open ${tournament.name || `Tournament ${tournament.id}`}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: TOURNAMENT_LIST_GRID_COLUMNS,
                    gap: '8px',
                    alignItems: 'center',
                    width: '100%',
                    padding: '5px 10px',
                    paddingLeft: '7px',
                    border: 'none',
                    borderTop: index === 0 ? 'none' : '1px solid #eee',
                    borderLeft: '3px solid transparent',
                    borderRadius: 0,
                    backgroundColor: rowBg,
                    textAlign: 'left',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                    boxShadow: 'none',
                    transform: 'none',
                    transformOrigin: 'center left',
                    transition: 'background-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, border-left-color 0.15s ease',
                    position: 'relative',
                    zIndex: 0,
                  }}
                  onMouseEnter={(e) => {
                    applyTournamentListRowActiveStyle(e.currentTarget);
                  }}
                  onMouseLeave={(e) => {
                    applyTournamentListRowIdleStyle(e.currentTarget, rowBg);
                  }}
                  onFocus={(e) => {
                    applyTournamentListRowActiveStyle(e.currentTarget);
                  }}
                  onBlur={(e) => {
                    applyTournamentListRowIdleStyle(e.currentTarget, rowBg);
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#000',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tournament.name || `Tournament ${tournament.id}`}
                    </span>
                    {tournament.cancelled && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#c0392b', backgroundColor: '#fdecea', padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>
                        Cancelled
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#455a64', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tournament.type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#455a64', whiteSpace: 'nowrap' }}>
                    {dateValue ? new Date(dateValue).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Tournaments;
