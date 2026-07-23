import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import api from '../utils/api';
import {
  saveScrollPosition,
  getScrollPosition,
  clearScrollPosition,
  saveUIState,
  getUIState,
  clearUIState,
  withWindowScrollPreserved,
} from '../utils/scrollPosition';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { isDateInRange } from '../utils/dateFormatter';
import { formatActiveTournamentRating } from '../utils/ratingFormatter';
import { PlayoffBracket } from './PlayoffBracket';
import { MatchEntryPopup } from './MatchEntryPopup';
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket';
import { EmptyState } from './EmptyState';
import { EmptyActiveIcon, EmptyCalendarIcon, EmptyCompletedIcon, EmptySearchIcon } from './emptyStateIcons';
import { ExpandCollapseButton } from './ExpandCollapseButton';
import { TournamentHeader } from './TournamentHeader';
import { TournamentInfo } from './TournamentInfo';
import { TournamentNameEditor } from './TournamentNameEditor';
import { getMember, setMember } from '../utils/auth';
import { updateMatchCountsCache, removeMatchFromCache } from './utils/matchCacheUtils';
import { isOrganizer } from '../utils/auth';
import {
  loadCancelledFilterMode,
  type CancelledFilterMode,
} from '../utils/cancelledFilterMode';
import { attachOpponentPasswordIfNeeded, canOpenTournamentMatchEditor, shouldShowOpponentPasswordForMatchEdit } from '../utils/matchScorePayload';
import {
  MATCH_RESULT_ALREADY_ENTERED_MESSAGE,
  isDuplicateScoreMessage,
  normalizeDuplicateScoreMessage,
} from '../utils/duplicateScoreError';
import { ScoreCorrectionModeProvider } from '../contexts/ScoreCorrectionModeContext';
import { tournamentPluginRegistry } from './tournaments/TournamentPluginRegistry';
import { Tournament, TournamentType } from '../types/tournament';
import './tournaments/plugins'; // This will auto-register all plugins
import { formatParticipantsWithRating } from './tournaments/utils/participantSort';
import {
  childHasPrintableSchedule,
  compoundSchedulePrintButtonText,
  compoundSchedulePrintLabel,
  getCompoundSchedulePrintChildren,
  printCompoundSchedules,
  printTournamentSchedule,
} from './tournaments/utils/schedulePrintUtils';
import {
  printBasicTournamentResults,
  printCompoundTournamentResults,
  type ResultsPrintMode,
} from './tournaments/utils/resultsPrintUtils';
import {
  getSupportedResultsPrintModes,
  isResultsPrintMode,
} from './tournaments/utils/resultsPrintModes';
import {
  sectionCorrectionToggleActiveStyle,
  sectionCorrectionToggleInactiveStyle,
  sectionCorrectionToggleStyle,
} from './scoreCorrectionStyles';
import { getSystemConfig, subscribeToSystemConfig } from '../utils/systemConfig';
import {
  saveLastTournamentId,
  saveLastStage,
  saveShouldRestoreDetail,
  stageFromTournamentStatus,
  type TournamentStageTab,
} from '../utils/tournamentNavState';
import {
  TournamentStageTabs,
  type StageCounts,
} from './tournaments/TournamentStageTabs';

// Shape returned by GET /matches for standalone matches
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

/** Collect a tournament's id and every nested child id (for auto-expanding compound structures). */
function collectTournamentAndChildIds(tournament: Tournament): number[] {
  const ids: number[] = [tournament.id];
  const children = tournament.childTournaments;
  if (children?.length) {
    for (const child of children) {
      ids.push(...collectTournamentAndChildIds(child));
    }
  }
  return ids;
}

function ScoreCorrectionModeToggle({
  active,
  onChange,
  title,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        ...sectionCorrectionToggleStyle,
        ...(active ? sectionCorrectionToggleActiveStyle : sectionCorrectionToggleInactiveStyle),
      }}
    >
      🔧
    </button>
  );
}

/** Plain Print, or Standard / Detailed / Abbreviated dropdown when extra modes are supported. */
function ResultsPrintControl({
  accentColor,
  title,
  supportedModes,
  onSelect,
}: {
  accentColor: string;
  title: string;
  supportedModes: ResultsPrintMode[];
  onSelect: (mode: ResultsPrintMode) => void;
}) {
  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    border: `1px solid ${accentColor}`,
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: accentColor,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  };

  const hasExtraModes = supportedModes.some((mode) => mode !== 'standard');
  if (!hasExtraModes) {
    return (
      <button type="button" onClick={() => onSelect('standard')} title={title} style={buttonStyle}>
        🖨️ Print
      </button>
    );
  }

  // Native <select> styled as the Print button — avoids card overflow clipping of custom menus.
  return (
    <select
      aria-label="Print results format"
      title="Print results — Standard or Abbreviated"
      defaultValue=""
      onChange={(event) => {
        const value = event.target.value;
        event.target.value = '';
        if (isResultsPrintMode(value) && supportedModes.includes(value)) {
          onSelect(value);
        }
      }}
      style={buttonStyle}
    >
      <option value="" disabled>
        🖨️ Print ▾
      </option>
      {supportedModes.includes('standard') && <option value="standard">Standard</option>}
      {supportedModes.includes('detailed') && <option value="detailed">Detailed</option>}
      {supportedModes.includes('abbreviated') && <option value="abbreviated">Abbreviated</option>}
    </select>
  );
}

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null;
}

interface Match {
  id: number;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  createdAt?: string;
  updatedAt?: string;
  round?: number | null;
  position?: number | null;
  nextMatchId?: number | null;
  player1RatingBefore?: number | null;
  player1RatingChange?: number | null;
  player2RatingBefore?: number | null;
  player2RatingChange?: number | null;
}

interface BracketMatch {
  id: number;
  round: number;
  position: number;
  player1Id: number | null;
  player2Id: number | null;
  winnerId: number | null;
  player1Sets: number;
  player2Sets: number;
}

interface TournamentParticipant {
  id: number;
  memberId: number;
  member: Member;
  playerRatingAtTime: number | null;
}

const TournamentDetailPage: React.FC = () => {
  // ALL HOOKS MUST BE CALLED AT THE TOP LEVEL, BEFORE ANY CONDITIONAL RETURNS
  // This ensures React can track hooks consistently across renders
  
  const navigate = useNavigate();
  const location = useLocation();
  const { id: idParam } = useParams<{ id: string }>();
  const tournamentId = parseInt(idParam || '', 10);
  const [isUserOrganizer, setIsUserOrganizer] = useState<boolean>(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [standaloneMatches, setStandaloneMatches] = useState<StandaloneMatchFromAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [editingTournamentName, setEditingTournamentName] = useState<number | null>(null);
  const [tournamentNameEdit, setTournamentNameEdit] = useState('');
  const tournamentRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  /** In-app confirmation instead of window.confirm for complete tournament */
  const [confirmCompleteTournamentId, setConfirmCompleteTournamentId] = useState<number | null>(null);
  /** In-app confirmation instead of window.confirm for deleting a match result */
  const [confirmDeleteMatchOpen, setConfirmDeleteMatchOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<{
    matchId: number; // 0 means new match, >0 means existing match
    member1Id: number;
    member2Id: number | null; // Can be null for BYE matches
    player1Sets: string;
    player2Sets: string;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    opponentPassword?: string;
    expectedHadResult?: boolean;
    expectedMatchUpdatedAt?: string;
  } | null>(null);
  // Load sticky filters from localStorage on mount
  const [dateFilterType, setDateFilterType] = useState<string>(() => {
    return localStorage.getItem('tournaments_dateFilterType') || '';
  });
  const [dateFilterStart, setDateFilterStart] = useState<string>(() => {
    return localStorage.getItem('tournaments_dateFilterStart') || '';
  });
  const [dateFilterEnd, setDateFilterEnd] = useState<string>(() => {
    return localStorage.getItem('tournaments_dateFilterEnd') || '';
  });
  const [tournamentNameFilter, setTournamentNameFilter] = useState<string>(() => {
    return localStorage.getItem('tournaments_nameFilter') || '';
  });
  // Detail page always shows the loaded tournament and never shows standalone matches,
  // regardless of any list-page filter preferences persisted in localStorage.
  const showCompletedTournaments = true;
  const showCompletedMatches = false;
  const [activeScoreCorrectionChecked, setActiveScoreCorrectionChecked] = useState(false);
  const [completedScoreCorrectionChecked, setCompletedScoreCorrectionChecked] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<CancelledFilterMode>(() => loadCancelledFilterMode());
  const [expandedSchedules, setExpandedSchedules] = useState<Set<number>>(new Set());
  const [expandedParticipants, setExpandedParticipants] = useState<Set<number>>(new Set());
  const [preregistrationSectionCollapsed, setPreregistrationSectionCollapsed] = useState<boolean>(false);
  const [cancelPreregistration, setCancelPreregistration] = useState<Tournament | null>(null);
  const [cancelPreregistrationReason, setCancelPreregistrationReason] = useState('Tournament cancelled by organizer');
  const [cancelPreregistrationCustomReason, setCancelPreregistrationCustomReason] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [activeSectionCollapsed, setActiveSectionCollapsed] = useState<boolean>(false);
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState<boolean>(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState<{ tournamentId: number; matchCount: number } | null>(null);
  const [cancelPassword, setCancelPassword] = useState<string>('');
  const [cancelPasswordErrorModal, setCancelPasswordErrorModal] = useState<string | null>(null);
  const [matchResultAlreadyEnteredModal, setMatchResultAlreadyEnteredModal] = useState<string | null>(null);
  const [systemConfig, setSystemConfig] = useState(() => getSystemConfig());
  const cancelPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const [hoveredIcon, setHoveredIcon] = useState<{ type: string; tournamentId: number; x: number; y: number } | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [stageCounts, setStageCounts] = useState<StageCounts | null>(null);
  const currentMember = getMember();
  const preregistrationCancelReasons = systemConfig.preregistration.cancelReasonPresets;

  useEffect(() => {
    let cancelled = false;
    api.get('/tournaments/stage-counts')
      .then((res) => {
        if (!cancelled) setStageCounts(res.data);
      })
      .catch(() => {
        if (!cancelled) setStageCounts({ preRegistration: 0, active: 0, completed: 0, matches: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  useEffect(() => subscribeToSystemConfig(setSystemConfig), []);

  // Calculate date range based on filter type
  const getDateRangeForType = (type: string): { start: string; end: string } => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const endDate = today.toISOString().split('T')[0];
    
    let startDate = '';
    
    switch (type) {
      case 'day':
        startDate = endDate;
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6); // 7 days including today
        weekAgo.setHours(0, 0, 0, 0);
        startDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 29); // 30 days including today
        monthAgo.setHours(0, 0, 0, 0);
        startDate = monthAgo.toISOString().split('T')[0];
        break;
      case 'year':
        const yearStart = new Date(today.getFullYear(), 0, 1); // January 1st of current year
        yearStart.setHours(0, 0, 0, 0);
        startDate = yearStart.toISOString().split('T')[0];
        break;
      case 'custom':
        // Use existing dateFilterStart and dateFilterEnd
        return { start: dateFilterStart, end: dateFilterEnd };
      default:
        return { start: '', end: '' };
    }
    
    return { start: startDate, end: endDate };
  };

  // Get effective date range based on filter type
  const effectiveDateRange = useMemo(() => {
    if (dateFilterType && dateFilterType !== 'custom') {
      return getDateRangeForType(dateFilterType);
    }
    return { start: dateFilterStart, end: dateFilterEnd };
  }, [dateFilterType, dateFilterStart, dateFilterEnd]);

  // Handle icon hover with 2-second delay
  const handleIconMouseEnter = (type: string, tournamentId: number, event: React.MouseEvent) => {
    // Clear any existing timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    
    // Set timeout to show tooltip after 2 seconds
    const timeout = setTimeout(() => {
      setHoveredIcon({
        type,
        tournamentId,
        x: event.clientX,
        y: event.clientY,
      });
    }, 2000);
    
    setHoverTimeout(timeout);
  };

  const handleIconMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setHoveredIcon(null);
  };

  const handleIconMouseMove = (event: React.MouseEvent) => {
    if (hoveredIcon) {
      setHoveredIcon({
        ...hoveredIcon,
        x: event.clientX,
        y: event.clientY,
      });
    }
  };

  // Get tooltip text based on icon type and tournament state
  // Uses plugin to get appropriate message
  const getTooltipText = (type: string, tournament: Tournament): string => {
    if (type === 'complete') {
      return 'Complete Tournament: Marks the tournament as completed. All matches must be finished. Rankings will be recalculated.';
    } else if (type === 'cancel') {
      return 'Cancel Tournament: Stops the tournament. If matches were played, they are preserved. If no matches were played, the tournament is removed.';
    }
    return '';
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  // Detail page shows the loaded tournament only — do not apply list filters.
  const filteredCompletedTournaments = useMemo(() => {
    return tournaments
      .filter(t => t.status === 'COMPLETED')
      .sort((a, b) => {
        const timeA = a.recordedAt ? new Date(a.recordedAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.recordedAt ? new Date(b.recordedAt).getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
  }, [tournaments]);

  const completedMatchingFilters = filteredCompletedTournaments;

  const filteredPreregistrationTournaments = useMemo(() => {
    return tournaments
      .filter(t => t.status === 'PRE_REGISTRATION')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tournaments]);

  useEffect(() => {
    const nextDeadline = filteredPreregistrationTournaments.reduce<number | null>((earliestDeadline, tournament) => {
      if (!tournament.registrationDeadline) return earliestDeadline;
      const deadline = new Date(tournament.registrationDeadline).getTime();
      if (!Number.isFinite(deadline) || deadline <= Date.now()) return earliestDeadline;
      return earliestDeadline === null || deadline < earliestDeadline ? deadline : earliestDeadline;
    }, null);

    if (nextDeadline === null) return;

    const timeout = window.setTimeout(() => {
      setCurrentTime(Date.now());
      window.dispatchEvent(new CustomEvent('tournament-preregistration-count-changed'));
    }, Math.max(0, nextDeadline - Date.now() + 1000));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [filteredPreregistrationTournaments, currentTime]);


  // Memoize combined active events (tournaments + matches) sorted by time
  // Note: Filters only apply to completed tournaments, not active ones
  const activeEvents = useMemo(() => {
    let events = [...activeTournaments];
    
    // Sort by createdAt (most recent first)
    events.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return events;
  }, [activeTournaments]);

  // Filter active events - always show all active events
  const filteredActiveEvents = useMemo(() => {
    return activeEvents; // No filtering needed - always show tournaments and matches
  }, [activeEvents]);

  // Memoize filtered standalone matches (apply same date and name filters as tournaments)
  const filteredStandaloneMatches = useMemo(() => {
    let filtered = [...standaloneMatches];

    // Filter by name (match player names against the name filter)
    if (tournamentNameFilter.trim()) {
      const nameFilterLower = tournamentNameFilter.trim().replace(/\s+/g, ' ').toLowerCase();
      filtered = filtered.filter(m => {
        const p1Name = m.member1 ? `${m.member1.firstName} ${m.member1.lastName}`.toLowerCase() : '';
        const p2Name = m.member2 ? `${m.member2.firstName} ${m.member2.lastName}`.toLowerCase() : '';
        const combined = `${p1Name} vs ${p2Name}`;
        return combined.includes(nameFilterLower) || p1Name.includes(nameFilterLower) || p2Name.includes(nameFilterLower);
      });
    }

    // Filter by date range
    if (effectiveDateRange.start || effectiveDateRange.end) {
      filtered = filtered.filter(m => {
        const createdDate = new Date(m.createdAt);
        return isDateInRange(createdDate, effectiveDateRange.start, effectiveDateRange.end);
      });
    }

    return filtered;
  }, [standaloneMatches, effectiveDateRange, tournamentNameFilter]);

  // Restore scroll position and UI state when component mounts (if returning from History/Statistics)
  useEffect(() => {
    const shouldRestore = location.state?.from === 'tournaments' || 
                          location.state?.restoreScroll === true ||
                          (!location.state && getScrollPosition('/tournaments') !== null);
    
    if (shouldRestore) {
      const savedPosition = getScrollPosition('/tournaments');
      if (savedPosition !== null) {
        setTimeout(() => {
          window.scrollTo(0, savedPosition);
        }, 100);
      }
      
      // Restore UI states
      const savedUIState = getUIState('/tournaments');
      if (savedUIState) {
        if (savedUIState.expandedDetails) {
          setExpandedDetails(new Set(savedUIState.expandedDetails));
        }
        if (savedUIState.expandedSchedules) {
          setExpandedSchedules(new Set(savedUIState.expandedSchedules));
        }
        if (savedUIState.expandedParticipants) {
          setExpandedParticipants(new Set(savedUIState.expandedParticipants));
        }
        if (typeof savedUIState.activeSectionCollapsed === 'boolean') {
          setActiveSectionCollapsed(savedUIState.activeSectionCollapsed);
        }
        if (typeof savedUIState.completedSectionCollapsed === 'boolean') {
          setCompletedSectionCollapsed(savedUIState.completedSectionCollapsed);
        }
      }
    } else if (!location.state) {
      // If navigating directly (no state), clear saved scroll and UI state, scroll to top
      clearScrollPosition('/tournaments');
      clearUIState('/tournaments');
      window.scrollTo(0, 0);
    }
  }, [location]);

  
  // Save UI state when it changes (debounced to avoid excessive saves)
  const saveUIStateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Only save if we're not in the process of restoring
    if (location.state?.restoreScroll || location.state?.from === 'tournaments') {
      return;
    }
    
    // Debounce saves to avoid excessive sessionStorage writes
    if (saveUIStateRef.current) {
      clearTimeout(saveUIStateRef.current);
    }
    
    saveUIStateRef.current = setTimeout(() => {
      const uiState = {
        expandedDetails: Array.from(expandedDetails),
        expandedSchedules: Array.from(expandedSchedules),
        expandedParticipants: Array.from(expandedParticipants),
        activeSectionCollapsed,
        completedSectionCollapsed,
      };
      saveUIState('/tournaments', uiState);
    }, 300);
    
    return () => {
      if (saveUIStateRef.current) {
        clearTimeout(saveUIStateRef.current);
      }
    };
  }, [expandedDetails, expandedSchedules, expandedParticipants, activeSectionCollapsed, completedSectionCollapsed, location.state]);
  
  // Save scroll position periodically while scrolling
  useEffect(() => {
    const handleScroll = () => {
      saveScrollPosition('/tournaments', window.scrollY);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Check organizer status on mount and when member data might change
  useEffect(() => {
    const checkOrganizerStatus = async () => {
      // First check localStorage (isOrganizer / hasMemberRole are case-insensitive like the server)
      const member = getMember();
      if (member && Array.isArray(member.roles) && member.roles.length > 0) {
        const hasOrganizerRole = isOrganizer();
        setIsUserOrganizer(hasOrganizerRole);
        console.log('Organizer status from localStorage:', { hasOrganizerRole, roles: member.roles });
      } else {
        // If no member in localStorage, try to fetch from API
        try {
          const response = await api.get('/auth/member/me');
          if (response.data.member && Array.isArray(response.data.member.roles)) {
            setMember(response.data.member);
            setIsUserOrganizer(isOrganizer());
            console.log('Organizer status from API:', { hasOrganizerRole: isOrganizer(), roles: response.data.member.roles });
          } else {
            setIsUserOrganizer(false);
            console.log('No member data from API, setting organizer to false');
          }
        } catch (err) {
          // If API call fails, use localStorage value
          const isOrg = isOrganizer();
          setIsUserOrganizer(isOrg);
          console.log('API call failed, using localStorage check:', { isOrg });
        }
      }
    };
    
    checkOrganizerStatus();
  }, []);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      saveShouldRestoreDetail(false);
      saveLastTournamentId(null);
      navigate('/tournaments', { replace: true });
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      const response = await api.get(`/tournaments/${tournamentId}`);
      const tournament: Tournament = response.data;

      if ((tournament as { parentTournamentId?: number | null }).parentTournamentId) {
        navigate(`/tournaments/${(tournament as { parentTournamentId?: number | null }).parentTournamentId}`, { replace: true });
        return;
      }

      if (tournament.status === 'ACTIVE') {
        setActiveTournaments([tournament]);
        setTournaments([]);
      } else {
        setTournaments([tournament]);
        setActiveTournaments([]);
      }
      setStandaloneMatches([]);
      window.dispatchEvent(new CustomEvent('tournament-preregistration-count-changed'));

      saveLastTournamentId(tournament.id);
      saveLastStage(stageFromTournamentStatus(tournament.status));
      saveShouldRestoreDetail(true);

      const idsToExpand = collectTournamentAndChildIds(tournament);
      setExpandedDetails(prev => {
        const next = new Set(prev);
        for (const id of idsToExpand) next.add(id);
        return next;
      });
      setSelectedTournament(tournament);
      setPreregistrationSectionCollapsed(false);
      setActiveSectionCollapsed(false);
      setCompletedSectionCollapsed(false);

      setError('');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response?.status;
      if (status === 400 || status === 404) {
        saveShouldRestoreDetail(false);
        saveLastTournamentId(null);
        navigate('/tournaments', { replace: true });
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const finalError = apiError || errorMessage;
      setError(finalError);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [tournamentId, navigate]);

  const fetchDataPreservingScroll = useCallback(
    () => withWindowScrollPreserved(() => fetchData({ silent: true })),
    [fetchData]
  );

  useEffect(() => {
    void fetchData();

    // Set up Socket.io connection for real-time updates
    const socket = connectSocket();
    const SOCKET_REFRESH_DEBOUNCE_MS = 300;
    let refreshTimeout: number | null = null;

    const eventTouchesOpenTournament = (data: { id?: number; tournamentId?: number | null }) => {
      const eventTournamentId = data.tournamentId ?? data.id;
      if (eventTournamentId == null || !Number.isFinite(eventTournamentId)) {
        return true;
      }
      return eventTournamentId === tournamentId;
    };

    // Coalesce paired emits (e.g. tournament:updated + cache:invalidate) into one silent refresh.
    const scheduleSocketRefresh = (logLabel: string, data: { id?: number; tournamentId?: number | null }) => {
      if (!eventTouchesOpenTournament(data)) {
        return;
      }
      console.log(logLabel, data);
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void withWindowScrollPreserved(() => fetchData({ silent: true })).catch((err) => {
          console.error(`Error refreshing data after ${logLabel}`, err);
        });
      }, SOCKET_REFRESH_DEBOUNCE_MS);
    };

    socket?.on('cache:invalidate', (data: { tournamentId?: number; timestamp: number }) => {
      scheduleSocketRefresh('Cache invalidated', data);
    });

    socket?.on('tournament:updated', (data: { id: number; name: string; status: string; type: string; timestamp: number }) => {
      scheduleSocketRefresh('Tournament updated', data);
    });

    socket?.on('tournament:created', (data: { id: number; name: string; status: string; type: string; timestamp: number }) => {
      scheduleSocketRefresh('Tournament created', data);
    });

    socket?.on('tournament:deleted', (data: { id: number; timestamp: number }) => {
      scheduleSocketRefresh('Tournament deleted', data);
    });

    socket?.on('tournament:stateChanged', (data: { id: number; previousStatus?: string | null; status: string; timestamp: number }) => {
      scheduleSocketRefresh('Tournament state changed', data);
    });

    socket?.on('match:updated', (data: { id: number; tournamentId: number; member1Id: number; member2Id: number; timestamp: number }) => {
      scheduleSocketRefresh('Match updated', data);
    });

    // Cleanup on unmount
    return () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      socket?.off('cache:invalidate');
      socket?.off('tournament:updated');
      socket?.off('tournament:created');
      socket?.off('tournament:deleted');
      socket?.off('tournament:stateChanged');
      socket?.off('match:updated');
      // Don't disconnect socket - it's shared across components
    };
  }, [fetchData, tournamentId]);

  // ============================================================================
  // PLUGIN-BASED HELPER FUNCTIONS
  // ============================================================================
  // These functions delegate to plugins, eliminating type-specific conditionals
  
  // Get expected number of matches for a tournament (delegates to plugin)
  const getExpectedMatches = (tournament: Tournament): number => {
    if (!tournament.type) return 0;
    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
    if (plugin.calculateExpectedMatches) {
      return plugin.calculateExpectedMatches(tournament as any);
    }
    // Fallback
    return tournament.participants.length * (tournament.participants.length - 1) / 2;
  };

  // Check if all matches are played (delegates to plugin)
  const areAllMatchesPlayed = (tournament: Tournament): boolean => {
    if (!tournament.type) return false;
    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
    if (plugin.areAllMatchesPlayed) {
      return plugin.areAllMatchesPlayed(tournament as any);
    }
    // Fallback
    return tournament.matches.length >= getExpectedMatches(tournament);
  };

  // Count non-forfeited matches (delegates to plugin)
  const countNonForfeitedMatches = (tournament: Tournament): number => {
    if (!tournament.type) return 0;
    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
    if (plugin.countNonForfeitedMatches) {
      return plugin.countNonForfeitedMatches(tournament as any);
    }
    // Fallback
    return tournament.matches.filter(m => !m.player1Forfeit && !m.player2Forfeit).length;
  };

  // Get tournament type name for display (delegates to plugin)
  const getTournamentTypeName = (tournament: Tournament): string => {
    if (!tournament.type) return 'Tournament';
    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
    if (plugin.getTypeName) {
      return plugin.getTypeName();
    }
    // Fallback - return the enum value
    return tournament.type.replace(/_/g, ' ');
  };

  // Helper function to save state before navigating
  const saveStateBeforeNavigate = () => {
    saveScrollPosition('/tournaments', window.scrollY);
    saveUIState('/tournaments', {
      expandedDetails: Array.from(expandedDetails),
      expandedSchedules: Array.from(expandedSchedules),
      expandedParticipants: Array.from(expandedParticipants),
      activeSectionCollapsed,
      completedSectionCollapsed,
    });
  };

  const handleQuickViewStats = (tournamentId?: number) => {
    if (tournamentId !== undefined) {
      // Show statistics for all players in this tournament
      const tournament = tournaments.find(t => t.id === tournamentId);
      if (tournament) {
        const allMemberIds = tournament.participants.map(p => p.memberId);
        saveStateBeforeNavigate();
        navigate('/statistics', { state: { playerIds: allMemberIds, from: 'tournaments' } });
      }
    } else {
      // Fallback: show statistics for all players from all tournaments
      const allMemberIds = tournaments.flatMap(t => t.participants.map(p => p.memberId));
      const uniqueMemberIds = Array.from(new Set(allMemberIds));
      saveStateBeforeNavigate();
      navigate('/statistics', { state: { playerIds: uniqueMemberIds, from: 'tournaments' } });
    }
  };


  const handleQuickViewHistory = (memberId: number, tournamentId?: number) => {
    let allOtherMemberIds: number[];
    
    if (tournamentId !== undefined) {
      // Get opponents from the specific tournament
      const tournament = tournaments.find(t => t.id === tournamentId);
      if (tournament) {
        // Get only participants from this specific tournament
        allOtherMemberIds = tournament.participants
          .map(p => p.memberId)
          .filter(id => id !== memberId);
      } else {
        // Fallback: get all players from all tournaments
        const allMembers = tournaments.flatMap(t => t.participants.map(p => p.memberId));
        allOtherMemberIds = allMembers
          .filter((id, index, self) => id !== memberId && self.indexOf(id) === index);
      }
    } else {
      // No tournament specified, get all players from all tournaments
      const allMembers = tournaments.flatMap(t => t.participants.map(p => p.memberId));
      allOtherMemberIds = allMembers
        .filter((id, index, self) => id !== memberId && self.indexOf(id) === index);
    }
    
    saveStateBeforeNavigate();
    navigate('/history', { 
      state: { 
      playerId: memberId, 
        opponentIds: allOtherMemberIds,
        from: 'tournaments'
      } 
    });
  };


  // Check if a tournament is compound (has child tournaments)
  const isCompoundTournament = (tournament: Tournament): boolean => {
    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
    return !plugin.isBasic;
  };

  // Helper component to render member name with icons
  const PlayerNameWithIcons = ({ member, tournament }: { member: Member; tournament?: Tournament }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleQuickViewHistory(member.id, tournament?.id);
        }}
        title="View Match History"
        style={{
          padding: '2px 4px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '14px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e67e22',
        }}
      >
        📜
      </button>
      <span>{formatPlayerName(member.firstName, member.lastName, getNameDisplayOrder())}</span>
    </div>
  );



  const handleCompleteTournament = (tournamentId: number) => {
    const tournament = activeTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    if (!areAllMatchesPlayed(tournament)) {
      const expected = getExpectedMatches(tournament);
      setError(`Cannot complete tournament. ${tournament.matches.length} / ${expected} matches have been played. All matches must be recorded before completing.`);
      return;
    }

    setConfirmCompleteTournamentId(tournamentId);
  };

  const handleRegisterForTournament = async (tournamentId: number) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/register`);
      if (response.data?.tournament) {
        setTournaments(prev => prev.map(t => t.id === tournamentId ? response.data.tournament : t));
      }
      setSuccess(response.data?.message || 'Registered successfully');
      window.dispatchEvent(new CustomEvent('tournament-preregistration-count-changed'));
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to register for tournament');
    }
  };

  const handleDeclineTournamentInvitation = async (tournamentId: number) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/decline`);
      if (response.data?.tournament) {
        setTournaments(prev => prev.map(t => t.id === tournamentId ? response.data.tournament : t));
      }
      setSuccess(response.data?.message || 'Invitation declined');
      window.dispatchEvent(new CustomEvent('tournament-preregistration-count-changed'));
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to decline invitation');
    }
  };

  const handleCancelPreregistration = async () => {
    if (!cancelPreregistration) return;
    try {
      await api.post(`/tournaments/${cancelPreregistration.id}/cancel-preregistration`, {
        reason: cancelPreregistrationReason,
        customReason: cancelPreregistrationCustomReason.trim() || undefined,
      });
      setCancelPreregistration(null);
      setCancelPreregistrationCustomReason('');
      window.dispatchEvent(new CustomEvent('tournament-preregistration-count-changed'));
      saveShouldRestoreDetail(false);
      navigate('/tournaments');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cancel tournament preregistration');
    }
  };

  const handleFinalizePreregistration = (tournament: Tournament) => {
    const participantIds = (tournament.registrations || [])
      .filter(registration => registration.status === 'REGISTERED')
      .map(registration => registration.memberId);

    saveStateBeforeNavigate();
    navigate('/players', {
      state: {
        finalizeRegistration: true,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentType: tournament.type,
        participantIds,
        from: 'tournaments',
      },
    });
  };

  const executeCompleteTournament = async () => {
    const tournamentId = confirmCompleteTournamentId;
    if (tournamentId == null) return;
    setConfirmCompleteTournamentId(null);
    setError('');
    setSuccess('');

    try {
      await api.patch(`/tournaments/${tournamentId}/complete`);
      setSelectedTournament(null);
      saveShouldRestoreDetail(false);
      navigate('/tournaments');
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(apiError || 'Failed to complete tournament');
    }
  };

  // Calculate player statistics for round-robin standings
  interface PlayerStats {
    memberId: number;
    wins: number;
    losses: number;
    setsWon: number;
    setsLost: number;
  }

  const calculatePlayerStats = (tournament: Tournament): Map<number, PlayerStats> => {
    const statsMap = new Map<number, PlayerStats>();
    
    // Initialize stats for all participants
    tournament.participants.forEach(p => {
      statsMap.set(p.memberId, {
        memberId: p.memberId,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
      });
    });

    // Calculate stats from matches
    tournament.matches.forEach(match => {
      const stats1 = statsMap.get(match.member1Id);
      const stats2 = match.member2Id ? statsMap.get(match.member2Id) : null;

      if (stats1 && stats2 && match.member2Id !== null) {
        // Handle forfeit matches
        if (match.player1Forfeit) {
          stats1.losses++;
          stats2.wins++;
          stats1.setsLost += 1;
          stats2.setsWon += 1;
        } else if (match.player2Forfeit) {
          stats1.wins++;
          stats2.losses++;
          stats1.setsWon += 1;
          stats2.setsLost += 1;
        } else {
          // Regular match - count sets
          stats1.setsWon += match.player1Sets;
          stats1.setsLost += match.player2Sets;
          stats2.setsWon += match.player2Sets;
          stats2.setsLost += match.player1Sets;

          // Determine winner
          if (match.player1Sets > match.player2Sets) {
            stats1.wins++;
            stats2.losses++;
          } else if (match.player2Sets > match.player1Sets) {
            stats2.wins++;
            stats1.losses++;
          }
        }
      }
    });

    return statsMap;
  };

  // Removed: calculateStandings - now imported from roundRobinUtils

  // Removed: buildResultsMatrix - now imported from roundRobinUtils

  // Handle double-click on match cell to add/edit
  const handleCellDoubleClick = (member1Id: number, member2Id: number, tournament: Tournament) => {
    if (!canOpenTournamentMatchEditor(member1Id, member2Id)) {
      setError('You can only enter scores for your own matches, or you must be an organizer.');
      return;
    }
    
    // Skip if trying to edit a BYE match (member2Id would be null)
    if (member1Id === member2Id) return; // Can't edit diagonal
    // Note: BYE matches have member2Id === null, so this check won't catch them
    
    // Set selected tournament so the popup can show
    setSelectedTournament(tournament);
    
      const match = tournament.matches.find(
        m => (m.member1Id === member1Id && m.member2Id === member2Id) ||
             (m.member1Id === member2Id && m.member2Id === member1Id)
      );
    
    if (match) {
      // Edit existing match
      setEditingMatch({
        matchId: match.id,
        member1Id: match.member1Id,
        member2Id: match.member2Id ?? null,
        player1Sets: match.player1Sets.toString(),
        player2Sets: match.player2Sets.toString(),
        player1Forfeit: match.player1Forfeit || false,
        player2Forfeit: match.player2Forfeit || false,
        opponentPassword: '',
        expectedHadResult: (match.player1Sets || 0) > 0 || (match.player2Sets || 0) > 0 || !!match.player1Forfeit || !!match.player2Forfeit,
        expectedMatchUpdatedAt: match.updatedAt,
      });
    } else {
      // Add new match - use the order from the cell (row player vs column player)
      setEditingMatch({
        matchId: 0, // 0 indicates new match
        member1Id: member1Id,
        member2Id: member2Id,
        player1Sets: '0',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
        opponentPassword: '',
        expectedHadResult: false,
      });
    }
  };

  // Handle saving edited/added match
  const handleSaveMatchEdit = async () => {
    if (!editingMatch || !selectedTournament) return;

    setError('');
    setSuccess('');

    // Validate forfeit: only one player can forfeit
    if (editingMatch.player1Forfeit && editingMatch.player2Forfeit) {
      setError('Only one player can forfeit');
      return;
    }

    // Validate scores: cannot be equal (including 0:0) unless it's a forfeit
    if (!editingMatch.player1Forfeit && !editingMatch.player2Forfeit) {
      const player1Sets = parseInt(editingMatch.player1Sets) || 0;
      const player2Sets = parseInt(editingMatch.player2Sets) || 0;
      // Disallow equal scores including 0:0
      if (player1Sets === player2Sets) {
        setError('Scores cannot be equal. One player must win.');
        return;
      }
    }

    try {
      const matchData: any = {
        member1Id: editingMatch.member1Id,
        member2Id: editingMatch.member2Id,
        expectedHadResult: editingMatch.expectedHadResult,
        expectedMatchUpdatedAt: editingMatch.expectedMatchUpdatedAt,
      };

      // If forfeit, send forfeit flags; otherwise send sets
      if (editingMatch.player1Forfeit || editingMatch.player2Forfeit) {
        matchData.player1Forfeit = editingMatch.player1Forfeit;
        matchData.player2Forfeit = editingMatch.player2Forfeit;
      } else {
        matchData.player1Sets = parseInt(editingMatch.player1Sets) || 0;
        matchData.player2Sets = parseInt(editingMatch.player2Sets) || 0;
        matchData.player1Forfeit = false;
        matchData.player2Forfeit = false;
      }

      attachOpponentPasswordIfNeeded(matchData, editingMatch.opponentPassword);

      let savedMatch: any;
      if (editingMatch.matchId === 0) {
        // New match - create it
        const response = await api.post(`/tournaments/${selectedTournament.id}/matches`, matchData);
        savedMatch = response.data;
        setSuccess('Match result added successfully');
      } else {
        // Existing match - update it
        const response = await api.patch(`/tournaments/${selectedTournament.id}/matches/${editingMatch.matchId}`, matchData);
        savedMatch = response.data;
        setSuccess('Match result updated successfully');
      }
      
      // Update match counts cache incrementally
      if (savedMatch) {
        updateMatchCountsCache({
          id: savedMatch.id,
          member1Id: savedMatch.member1Id,
          member2Id: savedMatch.member2Id,
          updatedAt: savedMatch.updatedAt || savedMatch.createdAt,
          createdAt: savedMatch.createdAt,
        }, editingMatch.matchId === 0);
      }
      
      await withWindowScrollPreserved(async () => {
        setEditingMatch(null);
        await fetchData({ silent: true });
        if (selectedTournament) {
          try {
            const updated = await api.get(`/tournaments/${selectedTournament.id}`);
            setSelectedTournament(updated.data);
          } catch {
            /* keep prior selection if refetch fails */
          }
        }
      });
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      handleTournamentError(apiError || 'Failed to save match result');
    }
  };

  // Handle clearing/deleting match (opens confirmation modal)
  const handleClearMatch = () => {
    if (!editingMatch || !selectedTournament || editingMatch.matchId === 0) return;
    setConfirmDeleteMatchOpen(true);
  };

  const executeClearMatch = async () => {
    if (!editingMatch || !selectedTournament || editingMatch.matchId === 0) return;
    setConfirmDeleteMatchOpen(false);

    // Store match info before deletion for cache update
    const matchToDelete = {
      id: editingMatch.matchId,
      member1Id: editingMatch.member1Id,
      member2Id: editingMatch.member2Id,
    };

    setError('');
    setSuccess('');

    try {
      await api.delete(`/tournaments/${selectedTournament.id}/matches/${editingMatch.matchId}`);
      
      // Update match counts cache - remove match and recalculate counts for participants
      removeMatchFromCache(matchToDelete.id, matchToDelete.member1Id, matchToDelete.member2Id ?? null);
      
      setSuccess('Match result deleted successfully');
      await withWindowScrollPreserved(async () => {
        setEditingMatch(null);
        await fetchData({ silent: true });
        if (selectedTournament) {
          try {
            const updated = await api.get(`/tournaments/${selectedTournament.id}`);
            setSelectedTournament(updated.data);
          } catch {
            /* keep prior selection if refetch fails */
          }
        }
      });
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(apiError || 'Failed to delete match result');
    }
  };

  // Handle starting tournament name edit
  const handleStartEditTournamentName = (tournament: Tournament) => {
    setEditingTournamentName(tournament.id);
    setTournamentNameEdit(tournament.name || '');
  };

  // Handle canceling tournament name edit
  const handleCancelEditTournamentName = () => {
    setEditingTournamentName(null);
    setTournamentNameEdit('');
  };

  // Handle saving tournament name
  const handleSaveTournamentName = async (tournamentId: number) => {
    setError('');
    setSuccess('');

    try {
      const updated = await api.patch(`/tournaments/${tournamentId}/name`, {
        name: tournamentNameEdit.trim() || null,
      });
      setSuccess('Tournament name updated successfully');
      setEditingTournamentName(null);
      setTournamentNameEdit('');
      fetchData();
      // Update selected tournament if it's the one being edited
      if (selectedTournament && selectedTournament.id === tournamentId) {
        setSelectedTournament(updated.data);
      }
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(apiError || 'Failed to update tournament name');
    }
  };

  const handleCancelTournament = async (tournamentId: number, password?: string) => {
    const tournament = activeTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    setError('');
    setSuccess('');

    try {
      await api.patch(`/tournaments/${tournamentId}/cancel`, {
        password,
      });

      setShowCancelConfirmation(null);
      setCancelPassword('');
      setSelectedTournament(null);
      saveShouldRestoreDetail(false);
      navigate('/tournaments');
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
      const apiError = response?.data?.error;
      const isInvalidPassword =
        response?.status === 401 && (apiError ?? '').toLowerCase().includes('invalid password');

      if (isInvalidPassword && showCancelConfirmation && showCancelConfirmation.matchCount > 0) {
        setCancelPasswordErrorModal('Invalid password. Please try again.');
        setCancelPassword('');
        return;
      }

      setError(apiError || 'Failed to cancel tournament');
    }
  };

  const handleShowCancelConfirmation = (tournamentId: number) => {
    const tournament = activeTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    const isPlayedMatch = (match: { player1Sets: number; player2Sets: number; player1Forfeit?: boolean; player2Forfeit?: boolean }) => {
      const hasScore = (match.player1Sets || 0) > 0 || (match.player2Sets || 0) > 0;
      const hasForfeit = !!match.player1Forfeit || !!match.player2Forfeit;
      return hasScore || hasForfeit;
    };

    // Count played matches (including children for compound tournaments)
    let matchCount = tournament.matches.filter(isPlayedMatch).length;
    if (tournament.childTournaments) {
      for (const child of tournament.childTournaments) {
        matchCount += (child.matches ?? []).filter(isPlayedMatch).length;
        const grandChildren = (child as any).childTournaments;
        if (grandChildren) {
          for (const grandchild of grandChildren) {
            matchCount += (grandchild.matches ?? []).filter(isPlayedMatch).length;
          }
        }
      }
    }

    setShowCancelConfirmation({ tournamentId, matchCount });
    setCancelPassword('');
    setCancelPasswordErrorModal(null);
  };

  const closeCancelConfirmation = () => {
    setShowCancelConfirmation(null);
    setCancelPassword('');
    setCancelPasswordErrorModal(null);
  };

  const closeCancelPasswordErrorModal = () => {
    setCancelPasswordErrorModal(null);
    requestAnimationFrame(() => {
      cancelPasswordInputRef.current?.focus();
    });
  };

  const handleTournamentError = (message: string) => {
    if (message === MATCH_RESULT_ALREADY_ENTERED_MESSAGE || isDuplicateScoreMessage(message)) {
      flushSync(() => {
        setEditingMatch(null);
        setMatchResultAlreadyEnteredModal(null);
      });
      setMatchResultAlreadyEnteredModal(normalizeDuplicateScoreMessage(message));
      void withWindowScrollPreserved(async () => {
        await fetchData({ silent: true });
        if (selectedTournament) {
          try {
            const updated = await api.get(`/tournaments/${selectedTournament.id}`);
            setSelectedTournament(updated.data);
          } catch {
            /* keep prior selection if refetch fails */
          }
        }
      });
      return;
    }
    setError(message);
  };

  const closeMatchResultAlreadyEnteredModal = () => {
    setEditingMatch(null);
    setMatchResultAlreadyEnteredModal(null);
  };

  // Generate schedule for Round Robin tournament
  interface ScheduleMatch {
    matchNumber: number;
    round: number;
    member1Id: number;
    member1Name: string;
    member1StoredRating: number | null | undefined;
    member1CurrentRating: number | null | undefined;
    member2Id: number;
    member2Name: string;
    member2StoredRating: number | null | undefined;
    member2CurrentRating: number | null | undefined;
  }

  interface ScheduleRound {
    round: number;
    matches: ScheduleMatch[];
  }

  // Removed: generateRoundRobinSchedule - now imported from roundRobinUtils

  const toggleSchedule = (tournamentId: number) => {
    setExpandedSchedules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tournamentId)) {
        newSet.delete(tournamentId);
      } else {
        newSet.add(tournamentId);
      }
      return newSet;
    });
  };

  const toggleParticipants = (tournamentId: number) => {
    setExpandedParticipants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tournamentId)) {
        newSet.delete(tournamentId);
      } else {
        newSet.add(tournamentId);
      }
      return newSet;
    });
  };

  const handlePrintSchedule = (tournament: Tournament, parentName?: string | null) => {
    printTournamentSchedule(tournament, parentName);
  };

  const handlePrintResults = (tournament: Tournament, mode: ResultsPrintMode = 'standard') => {
    printBasicTournamentResults(tournament, {
      typeName: getTournamentTypeName(tournament),
      mode,
    });
  };

  const handlePrintCompoundSchedule = (tournament: Tournament) => {
    printCompoundSchedules(tournament);
  };

  const handlePrintCompoundResults = (tournament: Tournament, mode: ResultsPrintMode = 'standard') => {
    printCompoundTournamentResults(tournament, { mode });
  };

  if (loading) {
    return <div className="card">Loading...</div>;
  }

  const loadedStatus = activeTournaments[0]?.status ?? tournaments[0]?.status;
  const activeStage: TournamentStageTab = stageFromTournamentStatus(loadedStatus);

  const handleBackToList = () => {
    saveShouldRestoreDetail(false);
    if (loadedStatus) saveLastStage(stageFromTournamentStatus(loadedStatus));
    navigate('/tournaments');
  };

  const handleStageTabSelect = (next: TournamentStageTab) => {
    saveShouldRestoreDetail(false);
    saveLastStage(next);
    navigate('/tournaments');
  };

  return (
    <ScoreCorrectionModeProvider
      activeChecked={activeScoreCorrectionChecked}
      completedChecked={completedScoreCorrectionChecked}
    >
    <div>
      <div className="card">
        <TournamentStageTabs
          stage={activeStage}
          counts={stageCounts}
          onSelect={handleStageTabSelect}
          trailing={
            <button
              type="button"
              onClick={handleBackToList}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                border: '1px solid #90a4ae',
                borderRadius: '4px',
                backgroundColor: '#fff',
                color: '#37474f',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              ← Back
            </button>
          }
        />

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {loadedStatus === 'PRE_REGISTRATION' && (
        <>
        {!preregistrationSectionCollapsed && (
          filteredPreregistrationTournaments.length === 0 ? (
            <EmptyState
              title="No pre-registration tournaments"
              accentColor="#b26a00"
              backgroundTint="#fff8f0"
              borderColor="#f0dcc8"
              icon={<EmptyCalendarIcon color="#b26a00" />}
            />
          ) : (
            filteredPreregistrationTournaments.map((tournament) => {
              const registered = (tournament.registrations || []).filter(r => r.status === 'REGISTERED');
              const invited = (tournament.registrations || []).filter(r => r.status === 'INVITED');
              const declined = (tournament.registrations || []).filter(r => r.status === 'DECLINED');
              const currentRegistration = currentMember
                ? (tournament.registrations || []).find(r => r.memberId === currentMember.id)
                : null;
              const deadlinePassed = tournament.registrationDeadline
                ? currentTime >= new Date(tournament.registrationDeadline).getTime()
                : false;
              const currentPlayerRating = currentRegistration?.member?.rating ?? currentMember?.rating ?? null;
              const hasRatingRestriction = tournament.minRating !== null && tournament.minRating !== undefined
                || tournament.maxRating !== null && tournament.maxRating !== undefined;
              const playerMeetsRating =
                !hasRatingRestriction ||
                (
                  currentPlayerRating !== null &&
                  currentPlayerRating !== undefined &&
                  (tournament.minRating === null || tournament.minRating === undefined || currentPlayerRating >= tournament.minRating) &&
                  (tournament.maxRating === null || tournament.maxRating === undefined || currentPlayerRating <= tournament.maxRating)
                );
              const registrationAtCapacity = tournament.maxParticipants != null && registered.length >= tournament.maxParticipants;
              const playerCanRespond = Boolean(currentMember?.roles?.includes('PLAYER') && playerMeetsRating);
              const registrationOpen = !deadlinePassed;
              const showRegisterAction =
                playerCanRespond &&
                registrationOpen &&
                !registrationAtCapacity &&
                currentRegistration?.status !== 'REGISTERED';
              const showDeclineAction =
                playerCanRespond &&
                registrationOpen &&
                currentRegistration?.status !== 'DECLINED' &&
                (
                  currentRegistration?.status === 'REGISTERED' ||
                  (!registrationAtCapacity && (
                    currentRegistration === null ||
                    currentRegistration === undefined ||
                    currentRegistration.status === 'INVITED'
                  ))
                );
              return (
                <div key={tournament.id} ref={(el) => { tournamentRefs.current[tournament.id] = el; }} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #f39c12', borderRadius: '4px', backgroundColor: '#fffdf5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <TournamentHeader tournament={tournament as any} onEditClick={() => handleStartEditTournamentName(tournament)} />
                        {(showRegisterAction || showDeclineAction) && (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {showRegisterAction && (
                              <button
                                onClick={() => handleRegisterForTournament(tournament.id)}
                                style={{ padding: '6px 10px', border: 'none', borderRadius: '4px', backgroundColor: '#27ae60', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                Register
                              </button>
                            )}
                            {showDeclineAction && (
                              <button
                                onClick={() => handleDeclineTournamentInvitation(tournament.id)}
                                style={{ padding: '6px 10px', border: 'none', borderRadius: '4px', backgroundColor: '#e67e22', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                Decline
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>
                        <strong>Date:</strong> {tournament.tournamentDate ? new Date(tournament.tournamentDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Not set'}
                        {' | '}<strong>Deadline:</strong> {tournament.registrationDeadline ? new Date(tournament.registrationDeadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Tournament date'}
                        {' | '}<strong>Ratings:</strong> {tournament.minRating ?? 'All'} - {tournament.maxRating ?? 'All'}
                        {' | '}<strong>Max:</strong> {tournament.maxParticipants ?? 'Unlimited'}
                      </div>
                      <div style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>
                        <strong>Registered ({registered.length}{tournament.maxParticipants ? `/${tournament.maxParticipants}` : ''}):</strong>{' '}
                        {registered.length > 0
                          ? registered.map(r => formatPlayerName(r.member.firstName, r.member.lastName, getNameDisplayOrder())).join(', ')
                          : 'No players registered yet'}
                      </div>
                      <div style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>
                        <strong>Declined ({declined.length}):</strong>{' '}
                        {declined.length > 0
                          ? declined.map(r => formatPlayerName(r.member.firstName, r.member.lastName, getNameDisplayOrder())).join(', ')
                          : 'No players declined'}
                      </div>
                      {(invited.length > 0 || declined.length > 0) && (
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                          Invited: {invited.length} | Declined: {declined.length}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexShrink: 0, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {isUserOrganizer && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                          <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Organizer Actions
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleFinalizePreregistration(tournament)}
                            title="Create tournament from registered players"
                            style={{ padding: '8px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#3498db', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Finalize
                          </button>
                          <button
                            onClick={() => {
                              setCancelPreregistration(tournament);
                              setCancelPreregistrationReason(preregistrationCancelReasons[0]);
                              setCancelPreregistrationCustomReason('');
                            }}
                            style={{ padding: '8px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#c0392b', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Cancel
                          </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}
        </>
        )}

        {cancelPreregistration && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 10002,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setCancelPreregistration(null);
            }}
          >
            <div className="card" style={{ maxWidth: '560px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Cancel Tournament Registration</h3>
              <p>
                Cancel preregistration for <strong>{cancelPreregistration.name}</strong>? This will remove the
                tournament and its registration records, then email invited/registered players who have an email.
              </p>
              <div className="form-group">
                <label>Reason</label>
                <select
                  value={cancelPreregistrationReason}
                  onChange={(e) => setCancelPreregistrationReason(e.target.value)}
                  style={{ width: '100%', padding: '8px' }}
                >
                  {preregistrationCancelReasons.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Additional details (optional)</label>
                <textarea
                  value={cancelPreregistrationCustomReason}
                  onChange={(e) => setCancelPreregistrationCustomReason(e.target.value)}
                  rows={3}
                  placeholder="Add custom details for the email"
                  style={{ width: '100%', padding: '8px', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button className="button-filter" type="button" onClick={() => setCancelPreregistration(null)}>
                  Keep Registration
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelPreregistration()}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: '4px', backgroundColor: '#c0392b', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Confirm Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loadedStatus === 'ACTIVE' && (
        <>
        {!activeSectionCollapsed ? (
          filteredActiveEvents.length === 0 ? (
            <EmptyState
              title="Nothing active"
              accentColor="#7b1fa2"
              backgroundTint="#faf5fc"
              borderColor="#e8d5f0"
              icon={<EmptyActiveIcon color="#7b1fa2" />}
            />
          ) : (
            <>
              {filteredActiveEvents.map((tournament) => {
                const isCompound = isCompoundTournament(tournament);
                const children = tournament.childTournaments || [];

                // ═══════════════════════════════════════════════════════════════
                // COMPOUND TOURNAMENT CARD
                // ═══════════════════════════════════════════════════════════════
                if (isCompound) {
                  return (
                    <div
                      key={tournament.id}
                      ref={(el) => { tournamentRefs.current[tournament.id] = el; }}
                      style={{ marginBottom: '20px', border: '2px solid #7b1fa2', borderRadius: '6px', overflow: 'hidden' }}
                    >
                      {/* Parent header */}
                      <div style={{ padding: '12px 15px', backgroundColor: '#f3e5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {editingTournamentName === tournament.id ? (
                            <>
                              {isUserOrganizer && (
                                <ScoreCorrectionModeToggle
                                  active={activeScoreCorrectionChecked}
                                  onChange={setActiveScoreCorrectionChecked}
                                  title="Correct scores"
                                />
                              )}
                              <TournamentNameEditor
                                value={tournamentNameEdit}
                                onChange={setTournamentNameEdit}
                                onSave={() => handleSaveTournamentName(tournament.id)}
                                onCancel={handleCancelEditTournamentName}
                              />
                            </>
                          ) : (
                            <>
                              {isUserOrganizer && (
                                <ScoreCorrectionModeToggle
                                  active={activeScoreCorrectionChecked}
                                  onChange={setActiveScoreCorrectionChecked}
                                  title="Correct scores"
                                />
                              )}
                              <TournamentHeader
                                tournament={tournament as any}
                                onEditClick={() => handleStartEditTournamentName(tournament)}
                              />
                            </>
                          )}
                          <span style={{ fontSize: '12px', color: '#7b1fa2', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#e1bee7', borderRadius: '4px' }}>
                            {children.length} sub-tournaments
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {!(tournament.childTournaments || []).some((child: any) => (child.matches || []).some((m: any) => (m.player1Sets || 0) > 0 || (m.player2Sets || 0) > 0 || m.player1Forfeit || m.player2Forfeit)) && isUserOrganizer && (
                            <button
                              onClick={() => {
                                saveStateBeforeNavigate();
                                navigate('/players', {
                                  state: {
                                    modifyTournament: true,
                                    tournamentId: tournament.id,
                                    tournamentName: tournament.name,
                                    tournamentType: tournament.type,
                                    participantIds: tournament.participants.map(p => p.memberId),
                                    from: 'tournaments'
                                  }
                                });
                              }}
                              title="Modify tournament (change players, groups, etc.)"
                              style={{
                                padding: '6px 12px',
                                border: '1px solid #3498db',
                                borderRadius: '4px',
                                backgroundColor: '#3498db',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              ✏️ Modify
                            </button>
                          )}
                          {getCompoundSchedulePrintChildren(tournament).length > 0 && (
                          <button
                            onClick={() => handlePrintCompoundSchedule(tournament)}
                            title={compoundSchedulePrintLabel(tournament)}
                            style={{ padding: '6px 12px', border: '1px solid #7b1fa2', borderRadius: '4px', backgroundColor: '#fff', color: '#7b1fa2', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            🖨️ {compoundSchedulePrintButtonText(tournament)}
                          </button>
                          )}
                          <button
                            onClick={() => handleShowCancelConfirmation(tournament.id)}
                            disabled={!isUserOrganizer}
                            title={!isUserOrganizer ? 'Only Organizers can cancel tournaments' : 'Cancel tournament'}
                            style={{
                              padding: '4px 8px', border: 'none', background: 'transparent',
                              cursor: !isUserOrganizer ? 'not-allowed' : 'pointer', fontSize: '14px',
                              color: '#e74c3c', opacity: !isUserOrganizer ? 0.5 : 1,
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Compound participants toggle */}
                      <div style={{ padding: '8px 15px', display: 'flex', gap: '10px', borderBottom: '1px solid #e0e0e0' }}>
                        <ExpandCollapseButton
                          isExpanded={expandedParticipants.has(tournament.id)}
                          onToggle={() => toggleParticipants(tournament.id)}
                          expandedText="▲ Hide All Participants"
                          collapsedText="▼ Show All Participants"
                        />
                      </div>

                      {/* Participants from parent (aggregated) */}
                      {expandedParticipants.has(tournament.id) && (
                        <div style={{ padding: '8px 15px', backgroundColor: '#fafafa', borderBottom: '1px solid #e0e0e0' }}>
                          <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                            <strong>All Participants ({tournament.participants.length}):</strong>{' '}
                            {formatParticipantsWithRating(tournament.participants as TournamentParticipant[])}
                          </p>
                        </div>
                      )}

                      {/* Child tournaments (always shown on detail page) */}
                      {children.length > 0 && (
                        <div style={{ padding: '10px 15px', backgroundColor: '#fafafa' }}>
                          {children
                            .slice()
                            .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999))
                            .map((child) => {
                              const childPlugin = tournamentPluginRegistry.get(child.type as TournamentType);
                              return (
                                <div
                                  key={child.id}
                                  ref={(el) => {
                                    tournamentRefs.current[child.id] = el;
                                  }}
                                  style={{
                                    marginBottom: '12px',
                                    marginLeft: '10px',
                                    padding: '12px',
                                    border: '1px solid #ccc',
                                    borderLeft: `4px solid ${child.status === 'COMPLETED' ? '#27ae60' : '#3498db'}`,
                                    borderRadius: '4px',
                                    backgroundColor: 'white',
                                  }}
                                >
                                  {/* Child header */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <strong style={{ fontSize: '15px' }}>{child.name || `Sub-tournament ${child.id}`}</strong>
                                      <span style={{
                                        fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px',
                                        backgroundColor: child.status === 'COMPLETED' ? '#d4edda' : '#cce5ff',
                                        color: child.status === 'COMPLETED' ? '#155724' : '#004085',
                                      }}>
                                        {child.status}
                                      </span>
                                      {child.groupNumber && (
                                        <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                                          Group {child.groupNumber}
                                        </span>
                                      )}
                                    </div>
                                    {child.status === 'ACTIVE' && (
                                      <span style={{ fontSize: '12px', color: '#e67e22', fontStyle: 'italic' }}>
                                        {child.matches?.filter((m: any) => !m.player1Forfeit && !m.player2Forfeit && (m.player1Sets > 0 || m.player2Sets > 0)).length || 0} / {child.participants.length * (child.participants.length - 1) / 2} matches
                                      </span>
                                    )}
                                  </div>

                                  {/* Child action buttons */}
                                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    <ExpandCollapseButton
                                      isExpanded={expandedDetails.has(child.id)}
                                      onToggle={() => {
                                        setExpandedDetails(prev => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(child.id)) {
                                            newSet.delete(child.id);
                                            if (selectedTournament?.id === child.id) setSelectedTournament(null);
                                          } else {
                                            newSet.add(child.id);
                                            setSelectedTournament(child);
                                          }
                                          return newSet;
                                        });
                                      }}
                                      expandedText={child.status === 'COMPLETED' ? '▲ Hide Results' : '▲ Hide Details'}
                                      collapsedText={child.status === 'COMPLETED' ? '▼ Show Results' : '▼ Show Details / Record Result'}
                                    />
                                    {childPlugin?.createSchedulePanel && (
                                      <ExpandCollapseButton
                                        isExpanded={expandedSchedules.has(child.id)}
                                        onToggle={() => toggleSchedule(child.id)}
                                        expandedText="▲ Hide Schedule"
                                        collapsedText="▼ Show Schedule"
                                      />
                                    )}
                                    <ExpandCollapseButton
                                      isExpanded={expandedParticipants.has(child.id)}
                                      onToggle={() => toggleParticipants(child.id)}
                                      expandedText="▲ Hide Participants"
                                      collapsedText="▼ Show Participants"
                                    />
                                  </div>

                                  {/* Child participants */}
                                  {expandedParticipants.has(child.id) && (
                                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                                      Participants: {formatParticipantsWithRating(child.participants as TournamentParticipant[])}
                                    </p>
                                  )}

                                  {/* Child details (active panel or completed panel) */}
                                  {expandedDetails.has(child.id) && childPlugin && (
                                    <div style={{ marginTop: '5px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                      {child.status === 'COMPLETED'
                                        ? childPlugin.createCompletedPanel({
                                            tournament: child as any,
                                            onTournamentUpdate: (updated) => { fetchData(); },
                                            onError: (err) => handleTournamentError(err),
                                            onSuccess: (msg) => { console.log(msg); },
                                            isExpanded: true,
                                            onToggleExpand: () => {},
                                          })
                                        : childPlugin.createActivePanel({
                                            tournament: child as any,
                                            onTournamentUpdate: (updated) => { fetchData(); },
                                            onMatchUpdate: () => {
                                              void fetchDataPreservingScroll();
                                            },
                                            onError: (err) => handleTournamentError(err),
                                            onSuccess: (msg) => { console.log(msg); },
                                            suppressScoreEntry: !!matchResultAlreadyEnteredModal,
                                          })
                                      }
                                    </div>
                                  )}

                                  {/* Child schedule */}
                                  {expandedSchedules.has(child.id) && childPlugin && childPlugin.createSchedulePanel && (
                                    <div style={{ marginTop: '5px' }}>
                                      {childPlugin.createSchedulePanel!({
                                        tournament: child as any,
                                        isExpanded: true,
                                        onToggleExpand: () => toggleSchedule(child.id),
                                        onPrintSchedule: childHasPrintableSchedule(child)
                                          ? () => handlePrintSchedule(child, tournament.name)
                                          : undefined,
                                        onTournamentUpdate: (updated) => { fetchData(); },
                                        onError: (err) => handleTournamentError(err),
                                        onSuccess: (msg) => { console.log(msg); },
                                      })}
                                    </div>
                                  )}

                                  {/* Match Entry Popup for child */}
                                  {!matchResultAlreadyEnteredModal && editingMatch && selectedTournament?.id === child.id && (() => {
                                    const player1 = selectedTournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member;
                                    const player2 = selectedTournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member;
                                    if (!player1 || !player2 || !editingMatch.member2Id) return null;
                                    return (
                                      <MatchEntryPopup
                                        editingMatch={{...editingMatch, member2Id: editingMatch.member2Id} as any}
                                        player1={player1}
                                        player2={player2}
                                        showForfeitOptions={true}
                                        requireOpponentPassword={shouldShowOpponentPasswordForMatchEdit({
                                          member1Id: editingMatch.member1Id,
                                          member2Id: editingMatch.member2Id ?? 0,
                                        })}
                                        onSetEditingMatch={setEditingMatch}
                                        onSave={handleSaveMatchEdit}
                                        onCancel={() => setEditingMatch(null)}
                                        onClear={handleClearMatch}
                                        showClearButton={editingMatch.matchId > 0}
                                      />
                                    );
                                  })()}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                }

                // ═══════════════════════════════════════════════════════════════
                // BASIC TOURNAMENT CARD (existing rendering)
                // ═══════════════════════════════════════════════════════════════
                return (
            <div 
              key={tournament.id} 
              ref={(el) => { tournamentRefs.current[tournament.id] = el; }}
              style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                {editingTournamentName === tournament.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {isUserOrganizer && (
                      <ScoreCorrectionModeToggle
                        active={activeScoreCorrectionChecked}
                        onChange={setActiveScoreCorrectionChecked}
                        title="Correct scores"
                      />
                    )}
                    <TournamentNameEditor
                      value={tournamentNameEdit}
                      onChange={setTournamentNameEdit}
                      onSave={() => handleSaveTournamentName(tournament.id)}
                      onCancel={handleCancelEditTournamentName}
                    />
                  </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {isUserOrganizer && (
                      <ScoreCorrectionModeToggle
                        active={activeScoreCorrectionChecked}
                        onChange={setActiveScoreCorrectionChecked}
                        title="Correct scores"
                      />
                    )}
                    <TournamentHeader
                      tournament={tournament as any}
                      onEditClick={() => handleStartEditTournamentName(tournament)}
                    />
                        </div>
                      )}
                <TournamentInfo
                  tournament={tournament as any}
                  countNonForfeitedMatches={countNonForfeitedMatches}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {!(tournament.bracketMatches && tournament.bracketMatches.length > 0) && !areAllMatchesPlayed(tournament) && (
                    <span style={{ fontSize: '12px', color: '#e67e22', fontStyle: 'italic' }}>
                      {countNonForfeitedMatches(tournament)} / {getExpectedMatches(tournament)} matches played
                    </span>
                  )}
                  {!(tournament.bracketMatches && tournament.bracketMatches.length > 0) && (
                    <button 
                      onClick={() => handleCompleteTournament(tournament.id)} 
                      disabled={!areAllMatchesPlayed(tournament)}
                      title={areAllMatchesPlayed(tournament) ? "Complete Tournament" : "Complete all matches first"}
                      onMouseEnter={(e) => {
                        if (areAllMatchesPlayed(tournament)) {
                          handleIconMouseEnter('complete', tournament.id, e);
                          e.currentTarget.style.backgroundColor = '#229954';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(39, 174, 96, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        handleIconMouseLeave();
                        if (areAllMatchesPlayed(tournament)) {
                          e.currentTarget.style.backgroundColor = '#27ae60';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(39, 174, 96, 0.3)';
                        }
                      }}
                      onMouseMove={handleIconMouseMove}
                      style={areAllMatchesPlayed(tournament) ? {
                        padding: '8px 16px',
                        border: '2px solid #27ae60',
                        borderRadius: '6px',
                        backgroundColor: '#27ae60',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(39, 174, 96, 0.3)',
                      } : {
                        padding: '8px 16px',
                        border: '2px solid #bdc3c7',
                        borderRadius: '6px',
                        backgroundColor: '#ecf0f1',
                        cursor: 'not-allowed',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#95a5a6',
                        opacity: 0.7,
                      }}
                    >
                      ✓
                    </button>
                  )}
                  {tournament.status === 'ACTIVE' && !tournament.matches.some((m: any) => (m.player1Sets || 0) > 0 || (m.player2Sets || 0) > 0 || m.player1Forfeit || m.player2Forfeit) && !(tournament.childTournaments || []).some((child: any) => (child.matches || []).some((m: any) => (m.player1Sets || 0) > 0 || (m.player2Sets || 0) > 0 || m.player1Forfeit || m.player2Forfeit)) && isUserOrganizer && (
                    <button
                      onClick={() => {
                        saveStateBeforeNavigate();
                        navigate('/players', {
                          state: {
                            modifyTournament: true,
                            tournamentId: tournament.id,
                            tournamentName: tournament.name,
                            tournamentType: tournament.type,
                            participantIds: tournament.participants.map(p => p.memberId),
                            from: 'tournaments'
                          }
                        });
                      }}
                      title="Modify tournament (change players, name, etc.)"
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #3498db',
                        borderRadius: '4px',
                        backgroundColor: '#3498db',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ✏️ Modify
                    </button>
                  )}
                  <button
                    onClick={() => handleShowCancelConfirmation(tournament.id)}
                    disabled={!isUserOrganizer}
                      title={
                        !isUserOrganizer 
                          ? 'Only Organizers can cancel tournaments' 
                          : 'Cancel tournament'
                      }
                      onMouseEnter={(e) => {
                        if (isUserOrganizer) {
                          handleIconMouseEnter('cancel', tournament.id, e);
                        }
                      }}
                      onMouseLeave={handleIconMouseLeave}
                      onMouseMove={handleIconMouseMove}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        background: 'transparent',
                        cursor: !isUserOrganizer ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#e74c3c',
                        opacity: !isUserOrganizer ? 0.5 : 1,
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e74c3c"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ display: 'block' }}
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                </div>
              </div>
              
              {/* Tournament details and matches */}
              <>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <ExpandCollapseButton
                      isExpanded={expandedDetails.has(tournament.id)}
                      onToggle={() => {
                        const isExpanded = expandedDetails.has(tournament.id);
                        setExpandedDetails(prev => {
                          const newSet = new Set(prev);
                          if (isExpanded) {
                            newSet.delete(tournament.id);
                            if (selectedTournament?.id === tournament.id) {
                              setSelectedTournament(null);
                            }
                          } else {
                            newSet.add(tournament.id);
                            setSelectedTournament(tournament);
                          }
                          return newSet;
                        });
                      }}
                      expandedText="▲ Hide Details"
                      collapsedText="▼ Show Details / Record Result"
                    />
                    {(() => {
                      const schedPlugin = tournament.type ? tournamentPluginRegistry.get(tournament.type as TournamentType) : null;
                      return schedPlugin?.createSchedulePanel ? (
                        <ExpandCollapseButton
                          isExpanded={expandedSchedules.has(tournament.id)}
                          onToggle={() => toggleSchedule(tournament.id)}
                          expandedText="▲ Hide Schedule"
                          collapsedText="▼ Show Schedule"
                        />
                      ) : null;
                    })()}
                    <ExpandCollapseButton
                      isExpanded={expandedParticipants.has(tournament.id)}
                      onToggle={() => toggleParticipants(tournament.id)}
                      expandedText="▲ Hide Participants"
                      collapsedText="▼ Show Participants"
                    />
                  </div>

                  {/* Participants section - independent of details */}
                  {expandedParticipants.has(tournament.id) && (
                  <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                    Participants: {formatParticipantsWithRating(tournament.participants as TournamentParticipant[])}
                  </p>
                  )}

                  {expandedDetails.has(tournament.id) && (
                    <div style={{ marginTop: '7.5px', padding: '0 15px 15px 15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                      {/* Use plugin system for tournament-specific active panels */}
                      {(() => {
                        console.group(`🔌 Plugin Call: Active Panel for Tournament ${tournament.id} (${tournament.name || 'Unnamed'})`);
                        console.log(`📋 Tournament Details:`, {
                          id: tournament.id,
                          name: tournament.name,
                          type: tournament.type,
                          status: tournament.status,
                          participantCount: tournament.participants?.length || 0,
                          matchCount: tournament.matches?.length || 0
                        });
                        
                        const plugin = tournament.type ? tournamentPluginRegistry.get(tournament.type as TournamentType) : null;
                        console.log(`🔍 Plugin Lookup:`, {
                          tournamentType: tournament.type,
                          pluginFound: !!plugin,
                          pluginName: plugin?.name || 'None',
                          isBasic: plugin?.isBasic || false
                        });
                        
                        if (plugin && tournament.status === 'COMPLETED') {
                          console.log(`✅ Rendering Completed Panel (active section):`, {
                            pluginName: plugin.name,
                            tournamentStatus: tournament.status,
                          });

                          const result = plugin.createCompletedPanel({
                            tournament: tournament as any,
                            onTournamentUpdate: (updatedTournament) => {
                              setTournaments(prev =>
                                prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                              );
                              if (updatedTournament.status === 'COMPLETED') {
                                setActiveTournaments(prev => prev.filter(t => t.id !== updatedTournament.id));
                                setTournaments(prev => {
                                  const without = prev.filter(t => t.id !== updatedTournament.id);
                                  return [updatedTournament as Tournament, ...without];
                                });
                              } else {
                                setActiveTournaments(prev =>
                                  prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                                );
                              }
                            },
                            onError: (error) => handleTournamentError(error),
                            onSuccess: (message) => console.log('Success:', message),
                            isExpanded: true,
                            onToggleExpand: () => {},
                          });

                          console.groupEnd();
                          return result;
                        }

                        if (plugin && tournament.status === 'ACTIVE') {
                          console.log(`✅ Rendering Active Panel:`, {
                            pluginName: plugin.name,
                            pluginType: plugin.type,
                            tournamentStatus: tournament.status
                          });
                          
                          const result = plugin.createActivePanel({
                            tournament: tournament as any,
                            onTournamentUpdate: (updatedTournament) => {
                              console.log(`🔄 Tournament Update from Plugin:`, {
                                tournamentId: updatedTournament.id,
                                pluginName: plugin.name,
                                changes: {
                                  status: updatedTournament.status !== tournament.status ? updatedTournament.status : 'unchanged',
                                  matchCount: updatedTournament.matches?.length || 0,
                                  participantCount: updatedTournament.participants?.length || 0
                                }
                              });
                              
                              if (updatedTournament.status === 'COMPLETED') {
                                setActiveTournaments(prev => prev.filter(t => t.id !== updatedTournament.id));
                                setTournaments(prev => {
                                  const without = prev.filter(t => t.id !== updatedTournament.id);
                                  return [updatedTournament as Tournament, ...without];
                                });
                              } else {
                                setTournaments(prev =>
                                  prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                                );
                                setActiveTournaments(prev =>
                                  prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                                );
                              }
                            },
                            onError: (error) => {
                              console.error(`❌ Plugin Error:`, {
                                tournamentId: tournament.id,
                                pluginName: plugin.name,
                                error: String(error)
                              });
                              handleTournamentError(error);
                            },
                            onSuccess: (message) => {
                              console.log(`✅ Plugin Success:`, {
                                tournamentId: tournament.id,
                                pluginName: plugin.name,
                                message
                              });
                            },
                            onMatchUpdate: (match) => {
                              console.log(`🏓 Match Update from Plugin:`, {
                                tournamentId: tournament.id,
                                pluginName: plugin.name,
                                matchId: match.id,
                                member1Id: match.member1Id,
                                member2Id: match.member2Id,
                                score: `${match.player1Sets} - ${match.player2Sets}`
                              });
                              void fetchDataPreservingScroll();
                            },
                            suppressScoreEntry: !!matchResultAlreadyEnteredModal,
                          });
                          
                          console.groupEnd();
                          return result;
                        }
                        
                        // If no plugin is found for an active tournament, show a message
                        if (tournament.status === 'ACTIVE') {
                          console.warn(`⚠️ No Plugin Found:`, {
                            tournamentId: tournament.id,
                            tournamentType: tournament.type,
                            tournamentStatus: tournament.status,
                            availablePlugins: tournamentPluginRegistry.getTypes()
                          });
                          
                          console.groupEnd();
                          return (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                              <p>No active panel available for tournament type: {tournament.type}</p>
                              <p>Please ensure a plugin is registered for this tournament type.</p>
                            </div>
                          );
                        }
                        
                        console.log(`ℹ️ Skipping Active Panel:`, {
                          reason: 'Tournament not active',
                          tournamentStatus: tournament.status,
                          pluginFound: !!plugin
                        });
                        console.groupEnd();
                        return null;
                      })()}
                    </div>
                  )}

                  {/* Schedule section - use plugin system */}
                  {expandedSchedules.has(tournament.id) && (() => {
                    console.group(`🔌 Plugin Call: Schedule Panel for Tournament ${tournament.id} (${tournament.name || 'Unnamed'})`);
                    console.log(`📋 Tournament Details:`, {
                      id: tournament.id,
                      name: tournament.name,
                      type: tournament.type,
                      status: tournament.status,
                      participantCount: tournament.participants?.length || 0,
                      matchCount: tournament.matches?.length || 0,
                      isExpanded: expandedSchedules.has(tournament.id)
                    });
                    
                    const plugin = tournament.type ? tournamentPluginRegistry.get(tournament.type as TournamentType) : null;
                    console.log(`🔍 Plugin Lookup:`, {
                      tournamentType: tournament.type,
                      pluginFound: !!plugin,
                      pluginName: plugin?.name || 'None',
                      isBasic: plugin?.isBasic || false
                    });
                    
                    if (plugin && plugin.createSchedulePanel) {
                      console.log(`✅ Rendering Schedule Panel:`, {
                        pluginName: plugin.name,
                        pluginType: plugin.type,
                        isExpanded: expandedSchedules.has(tournament.id)
                      });
                      
                      const result = plugin.createSchedulePanel({
                        tournament: tournament as any,
                        isExpanded: expandedSchedules.has(tournament.id),
                        onToggleExpand: () => {
                          console.log(`🔄 Schedule Toggle from Plugin:`, {
                            tournamentId: tournament.id,
                            pluginName: plugin.name,
                            wasExpanded: expandedSchedules.has(tournament.id),
                            willBeExpanded: !expandedSchedules.has(tournament.id)
                          });
                          toggleSchedule(tournament.id);
                        },
                        onPrintSchedule: childHasPrintableSchedule(tournament)
                          ? () => handlePrintSchedule(tournament)
                          : undefined,
                        onTournamentUpdate: (updatedTournament) => {
                          console.log(`🔄 Tournament Update from Schedule Plugin:`, {
                            tournamentId: updatedTournament.id,
                            pluginName: plugin.name,
                            changes: {
                              status: updatedTournament.status !== tournament.status ? updatedTournament.status : 'unchanged',
                              matchCount: updatedTournament.matches?.length || 0,
                              participantCount: updatedTournament.participants?.length || 0
                            }
                          });
                          setTournaments(prev => 
                            prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                          );
                          setActiveTournaments(prev => 
                            prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                          );
                        },
                        onError: (error) => {
                          console.error(`❌ Schedule Plugin Error:`, {
                            tournamentId: tournament.id,
                            pluginName: plugin.name,
                            error: String(error)
                          });
                          handleTournamentError(error);
                        },
                        onSuccess: (message) => {
                          console.log(`✅ Schedule Plugin Success:`, {
                            tournamentId: tournament.id,
                            pluginName: plugin.name,
                            message
                          });
                        }
                      });
                      
                      console.groupEnd();
                      return result;
                    }
                    
                    // If no plugin is found for schedule, show a message
                    console.warn(`⚠️ No Schedule Plugin Found:`, {
                      tournamentId: tournament.id,
                      tournamentType: tournament.type,
                      availablePlugins: tournamentPluginRegistry.getTypes()
                    });
                    
                    console.groupEnd();
                    return (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                        <p>No schedule panel available for tournament type: {tournament.type}</p>
                        <p>Please ensure a plugin is registered for this tournament type.</p>
                      </div>
                    );
                  })()}
                  {/* Unified Match Entry Popup */}
                  {!matchResultAlreadyEnteredModal && editingMatch && selectedTournament && (() => {
                    const player1 = selectedTournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member;
                    const player2 = selectedTournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member;
                    if (!player1 || !player2 || !editingMatch.member2Id) return null;
                    
                    return (
                      <MatchEntryPopup
                        editingMatch={{...editingMatch, member2Id: editingMatch.member2Id} as any}
                        player1={player1}
                        player2={player2}
                        showForfeitOptions={true}
                        requireOpponentPassword={shouldShowOpponentPasswordForMatchEdit({
                          member1Id: editingMatch.member1Id,
                          member2Id: editingMatch.member2Id ?? 0,
                        })}
                        onSetEditingMatch={setEditingMatch}
                        onSave={handleSaveMatchEdit}
                        onCancel={() => setEditingMatch(null)}
                        onClear={handleClearMatch}
                        showClearButton={editingMatch.matchId > 0}
                      />
                    );
                  })()}
              </>
            </div>
                );
              })}
            </>
          )
        ) : null}
        </>
        )}

        {loadedStatus === 'COMPLETED' && (
        <>
        {!completedSectionCollapsed ? (
          <>

            {(() => {
              // Detail page: always show the single loaded tournament, regardless of any
              // name/date/cancelled filters or Tournaments/Matches toggles used on the list page.
              type CompletedEvent =
                | { kind: 'tournament'; data: Tournament; time: number }
                | { kind: 'match'; data: StandaloneMatchFromAPI; time: number };

              const events: CompletedEvent[] = [];

              tournaments.forEach(t => {
                const time = t.recordedAt ? new Date(t.recordedAt).getTime() : new Date(t.createdAt).getTime();
                events.push({ kind: 'tournament', data: t, time });
              });

              // Sort most recent first
              events.sort((a, b) => b.time - a.time);

              if (events.length === 0) {
                const hasFilters = Boolean(tournamentNameFilter.trim() || dateFilterType);
                const cancelledHidden =
                  showCompletedTournaments &&
                  cancelledFilter === 'hidden' &&
                  completedMatchingFilters.length > 0 &&
                  filteredCompletedTournaments.length === 0;

                if (hasFilters) {
                  return (
                    <EmptyState
                      title="No matching results"
                      accentColor="#1976d2"
                      backgroundTint="#f0f6fc"
                      borderColor="#c5daf0"
                      icon={<EmptySearchIcon color="#1976d2" />}
                    />
                  );
                }

                if (cancelledHidden) {
                  return (
                    <EmptyState
                      title="No completed tournaments"
                      accentColor="#1976d2"
                      backgroundTint="#f0f6fc"
                      borderColor="#c5daf0"
                      icon={<EmptyCompletedIcon color="#1976d2" />}
                    />
                  );
                }

                const matchesOnly = !showCompletedTournaments && showCompletedMatches;
                return (
                  <EmptyState
                    title={matchesOnly ? 'No completed matches' : 'No completed events'}
                    accentColor="#1976d2"
                    backgroundTint="#f0f6fc"
                    borderColor="#c5daf0"
                    icon={<EmptyCompletedIcon color="#1976d2" />}
                  />
                );
              }

              // Compute max first-player name length across all standalone matches for alignment
              const maxP1NameLength = (() => {
                let maxLen = 0;
                events.forEach(e => {
                  if (e.kind === 'match' && e.data.member1) {
                    const name = formatPlayerName(e.data.member1.firstName, e.data.member1.lastName, getNameDisplayOrder());
                    if (name.length > maxLen) maxLen = name.length;
                  }
                });
                return maxLen;
              })();
              // Approximate ch-based width for alignment (each char ~9px at 15px font)
              const p1NameMinWidth = `${Math.max(100, maxP1NameLength * 9)}px`;

              return (
                <>
                  {events.map((event) => {
                    // ═══════════════════════════════════════════════════════════════
                    // STANDALONE MATCH ROW
                    // ═══════════════════════════════════════════════════════════════
                    if (event.kind === 'match') {
                      const m = event.data;
                      const p1Name = m.member1 ? formatPlayerName(m.member1.firstName, m.member1.lastName, getNameDisplayOrder()) : 'Unknown';
                      const p2Name = m.member2 ? formatPlayerName(m.member2.firstName, m.member2.lastName, getNameDisplayOrder()) : 'Unknown';
                      const p1Sets = m.player1Sets ?? 0;
                      const p2Sets = m.player2Sets ?? 0;
                      const p1Won = m.player1Forfeit ? false : (m.player2Forfeit ? true : p1Sets > p2Sets);
                      const p2Won = m.player2Forfeit ? false : (m.player1Forfeit ? true : p2Sets > p1Sets);

                      // Rating data from standalone match API
                      const p1Pre = m.player1RatingBefore;
                      const p1Change = m.player1RatingChange;
                      const p1Post = (p1Pre !== null && p1Change !== null) ? p1Pre + p1Change : null;
                      const p2Pre = m.player2RatingBefore;
                      const p2Change = m.player2RatingChange;
                      const p2Post = (p2Pre !== null && p2Change !== null) ? p2Pre + p2Change : null;

                      return (
                        <div
                          key={`match-${m.id}`}
                          style={{ marginBottom: '4px', padding: '6px 12px', border: '1px solid #eee', borderRadius: '4px', backgroundColor: '#f9f9f9' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Stats button */}
                            <button
                              onClick={() => {
                                const playerIds = [m.member1Id, m.member2Id].filter((id): id is number => id !== null);
                                saveStateBeforeNavigate();
                                navigate('/statistics', { state: { playerIds, from: 'tournaments' } });
                              }}
                              title="View Statistics"
                              style={{
                                padding: '2px 4px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: '#3498db',
                                flexShrink: 0,
                              }}
                            >
                              📊
                            </button>

                            {/* Player 1 name + rating */}
                            <div style={{ textAlign: 'right', minWidth: p1NameMinWidth, flexShrink: 0 }}>
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: p1Won ? '#27ae60' : p2Won ? '#e74c3c' : '#333' }}>
                                {p1Name}
                              </span>
                              {p1Change !== null && p1Post !== null && (
                                <span style={{ fontSize: '11px', fontWeight: 'bold', marginLeft: '4px', color: p1Change >= 0 ? '#27ae60' : '#e74c3c' }}>
                                  ({p1Post}/{p1Change >= 0 ? `+${p1Change}` : p1Change})
                                </span>
                              )}
                            </div>

                            {/* Score */}
                            <div style={{ textAlign: 'center', minWidth: '45px', flexShrink: 0 }}>
                              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c3e50' }}>
                                {p1Sets} : {p2Sets}
                              </span>
                            </div>

                            {/* Player 2 name + rating */}
                            <div style={{ textAlign: 'left' }}>
                              {p2Change !== null && p2Post !== null && (
                                <span style={{ fontSize: '11px', fontWeight: 'bold', marginRight: '4px', color: p2Change >= 0 ? '#27ae60' : '#e74c3c' }}>
                                  ({p2Post}/{p2Change >= 0 ? `+${p2Change}` : p2Change})
                                </span>
                              )}
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: p2Won ? '#27ae60' : p1Won ? '#e74c3c' : '#333' }}>
                                {p2Name}
                              </span>
                            </div>

                            {/* Date - pushed to right */}
                            <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#999', flexShrink: 0 }}>
                              {new Date(m.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // ═══════════════════════════════════════════════════════════════
                    // TOURNAMENT CARDS (below)
                    // ═══════════════════════════════════════════════════════════════
                    const tournament = event.data;
                    const plugin = tournamentPluginRegistry.get(tournament.type as TournamentType);
                    const isResultsExpanded = expandedDetails.has(tournament.id);

                    // ═══════════════════════════════════════════════════════════════
                    // COMPOUND COMPLETED TOURNAMENT CARD
                    // ═══════════════════════════════════════════════════════════════
                    if (isCompoundTournament(tournament)) {
                      const children = tournament.childTournaments || [];
                      return (
                        <div
                          key={tournament.id}
                          ref={(el) => { tournamentRefs.current[tournament.id] = el; }}
                          style={{ marginBottom: '20px', border: '2px solid #1976d2', borderRadius: '6px', overflow: 'hidden' }}
                        >
                          {/* Parent header */}
                          <div style={{ padding: '12px 15px', backgroundColor: '#e3f2fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {editingTournamentName === tournament.id ? (
                                <>
                                  {isUserOrganizer && (
                                    <ScoreCorrectionModeToggle
                                      active={completedScoreCorrectionChecked}
                                      onChange={setCompletedScoreCorrectionChecked}
                                      title="Correct scores"
                                    />
                                  )}
                                  <TournamentNameEditor
                                    value={tournamentNameEdit}
                                    onChange={setTournamentNameEdit}
                                    onSave={() => handleSaveTournamentName(tournament.id)}
                                    onCancel={handleCancelEditTournamentName}
                                  />
                                </>
                              ) : (
                                <>
                                  {isUserOrganizer && (
                                    <ScoreCorrectionModeToggle
                                      active={completedScoreCorrectionChecked}
                                      onChange={setCompletedScoreCorrectionChecked}
                                      title="Correct scores"
                                    />
                                  )}
                                  <TournamentHeader
                                    tournament={tournament as any}
                                    onEditClick={() => handleStartEditTournamentName(tournament)}
                                  />
                                </>
                              )}
                              <span style={{ fontSize: '12px', color: '#1976d2', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#bbdefb', borderRadius: '4px' }}>
                                {children.length} sub-tournaments
                              </span>
                              {tournament.cancelled && (
                                <span style={{ fontSize: '11px', color: '#e74c3c', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#fdecea', borderRadius: '4px', border: '1px solid #f5c6cb' }}>
                                  CANCELLED
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {isUserOrganizer && (
                                <button
                                  onClick={() => {
                                    saveStateBeforeNavigate();
                                    navigate('/players', {
                                      state: {
                                        repeatTournament: true,
                                        tournamentName: tournament.name,
                                        tournamentType: tournament.type,
                                        participantIds: tournament.participants.map(p => p.memberId),
                                        from: 'tournaments'
                                      }
                                    });
                                  }}
                                  title="Create a new tournament with the same settings"
                                  style={{ padding: '6px 12px', border: '1px solid #27ae60', borderRadius: '4px', backgroundColor: '#fff', color: '#27ae60', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  🔄 Repeat
                                </button>
                              )}
                              <button
                                onClick={() => handleQuickViewStats(tournament.id)}
                                title="View Statistics"
                                style={{ padding: '6px 12px', border: '1px solid #2980b9', borderRadius: '4px', backgroundColor: '#fff', color: '#2980b9', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                📊 Stats
                              </button>
                              <ResultsPrintControl
                                accentColor="#1976d2"
                                title="Print all sub-tournament results"
                                supportedModes={getSupportedResultsPrintModes(tournament)}
                                onSelect={(mode) => handlePrintCompoundResults(tournament, mode)}
                              />
                            </div>
                          </div>

                          {/* Compound participants toggle */}
                          <div style={{ padding: '8px 15px', display: 'flex', gap: '10px', borderBottom: '1px solid #e0e0e0' }}>
                            <ExpandCollapseButton
                              isExpanded={expandedParticipants.has(tournament.id)}
                              onToggle={() => toggleParticipants(tournament.id)}
                              expandedText="▲ Hide All Participants"
                              collapsedText="▼ Show All Participants"
                            />
                          </div>

                          {/* Participants from parent (aggregated) */}
                          {expandedParticipants.has(tournament.id) && (
                            <div style={{ padding: '8px 15px', backgroundColor: '#fafafa', borderBottom: '1px solid #e0e0e0' }}>
                              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                                <strong>All Participants ({tournament.participants.length}):</strong>{' '}
                                {formatParticipantsWithRating(tournament.participants as TournamentParticipant[])}
                              </p>
                            </div>
                          )}

                          {/* Child tournaments (always shown on detail page) */}
                          {children.length > 0 && (
                            <div style={{ padding: '10px 15px', backgroundColor: '#fafafa' }}>
                              {children
                                .slice()
                                .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999))
                                .map((child) => {
                                  const childPlugin = tournamentPluginRegistry.get(child.type as TournamentType);
                                  return (
                                    <div
                                      key={child.id}
                                      ref={(el) => {
                                        tournamentRefs.current[child.id] = el;
                                      }}
                                      style={{
                                        marginBottom: '12px',
                                        marginLeft: '10px',
                                        padding: '12px',
                                        border: '1px solid #ccc',
                                        borderLeft: `4px solid ${child.status === 'COMPLETED' ? '#27ae60' : '#3498db'}`,
                                        borderRadius: '4px',
                                        backgroundColor: 'white',
                                      }}
                                    >
                                      {/* Child header */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <strong style={{ fontSize: '15px' }}>{child.name || `Sub-tournament ${child.id}`}</strong>
                                          <span style={{
                                            fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px',
                                            backgroundColor: child.status === 'COMPLETED' ? '#d4edda' : '#cce5ff',
                                            color: child.status === 'COMPLETED' ? '#155724' : '#004085',
                                          }}>
                                            {child.status}
                                          </span>
                                          {child.groupNumber && (
                                            <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                                              Group {child.groupNumber}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Child action buttons */}
                                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <ExpandCollapseButton
                                          isExpanded={expandedDetails.has(child.id)}
                                          onToggle={() => {
                                            setExpandedDetails(prev => {
                                              const newSet = new Set(prev);
                                              if (newSet.has(child.id)) {
                                                newSet.delete(child.id);
                                              } else {
                                                newSet.add(child.id);
                                              }
                                              return newSet;
                                            });
                                          }}
                                          expandedText="▲ Hide Results"
                                          collapsedText="▼ Show Results"
                                        />
                                        <ExpandCollapseButton
                                          isExpanded={expandedParticipants.has(child.id)}
                                          onToggle={() => toggleParticipants(child.id)}
                                          expandedText="▲ Hide Participants"
                                          collapsedText="▼ Show Participants"
                                        />
                                      </div>

                                      {/* Child participants */}
                                      {expandedParticipants.has(child.id) && (
                                        <p style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                                          Participants: {formatParticipantsWithRating(child.participants as TournamentParticipant[])}
                                        </p>
                                      )}

                                      {/* Child results */}
                                      {expandedDetails.has(child.id) && childPlugin && (
                                        <div style={{ marginTop: '5px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                          {childPlugin.createCompletedPanel({
                                            tournament: child as any,
                                            onTournamentUpdate: (updated) => { fetchData(); },
                                            onError: (err) => handleTournamentError(err),
                                            onSuccess: (msg) => { console.log(msg); },
                                            isExpanded: true,
                                            onToggleExpand: () => {},
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // ═══════════════════════════════════════════════════════════════
                    // BASIC COMPLETED TOURNAMENT CARD (existing rendering)
                    // ═══════════════════════════════════════════════════════════════
                    return (
                      <div 
                        key={tournament.id}
                        ref={(el) => { tournamentRefs.current[tournament.id] = el; }}
                        style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          {editingTournamentName === tournament.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {isUserOrganizer && (
                                <ScoreCorrectionModeToggle
                                  active={completedScoreCorrectionChecked}
                                  onChange={setCompletedScoreCorrectionChecked}
                                  title="Correct scores"
                                />
                              )}
                              <TournamentNameEditor
                                value={tournamentNameEdit}
                                onChange={setTournamentNameEdit}
                                onSave={() => handleSaveTournamentName(tournament.id)}
                                onCancel={handleCancelEditTournamentName}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {isUserOrganizer && (
                                <ScoreCorrectionModeToggle
                                  active={completedScoreCorrectionChecked}
                                  onChange={setCompletedScoreCorrectionChecked}
                                  title="Correct scores"
                                />
                              )}
                              <TournamentHeader
                                tournament={tournament as any}
                                onEditClick={() => handleStartEditTournamentName(tournament)}
                              />
                              {tournament.cancelled && (
                                <span style={{ 
                                  fontSize: '11px', 
                                  color: '#e74c3c', 
                                  fontWeight: 'bold',
                                  padding: '2px 8px',
                                  backgroundColor: '#fdecea',
                                  borderRadius: '4px',
                                  border: '1px solid #f5c6cb'
                                }}>
                                  CANCELLED
                                </span>
                              )}
                            </div>
                          )}
                          <TournamentInfo
                            tournament={tournament as any}
                            countNonForfeitedMatches={countNonForfeitedMatches}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isUserOrganizer && (
                              <button
                                onClick={() => {
                                  saveStateBeforeNavigate();
                                  navigate('/players', {
                                    state: {
                                      repeatTournament: true,
                                      tournamentName: tournament.name,
                                      tournamentType: tournament.type,
                                      participantIds: tournament.participants.map(p => p.memberId),
                                      from: 'tournaments'
                                    }
                                  });
                                }}
                                title="Create a new tournament with the same settings"
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #27ae60',
                                  borderRadius: '4px',
                                  backgroundColor: '#fff',
                                  color: '#27ae60',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 'bold',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                🔄 Repeat
                              </button>
                            )}
                            <button
                              onClick={() => handleQuickViewStats(tournament.id)}
                              title="View Statistics for tournament participants"
                              style={{
                                padding: '6px 12px',
                                border: '1px solid #2980b9',
                                borderRadius: '4px',
                                backgroundColor: '#fff',
                                color: '#2980b9',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              📊 Stats
                            </button>
                            {plugin.canPrintResults && (
                              <ResultsPrintControl
                                accentColor="#8e44ad"
                                title="Print Results"
                                supportedModes={getSupportedResultsPrintModes(tournament)}
                                onSelect={(mode) => handlePrintResults(tournament, mode)}
                              />
                            )}
                          </div>
                        </div>

                        {/* Expand/Collapse buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                          <ExpandCollapseButton
                            isExpanded={isResultsExpanded}
                            onToggle={() => {
                              setExpandedDetails(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(tournament.id)) {
                                  newSet.delete(tournament.id);
                                } else {
                                  newSet.add(tournament.id);
                                }
                                return newSet;
                              });
                            }}
                            expandedText="▲ Hide Final Results"
                            collapsedText={tournament.cancelled ? "▼ Show Results (Incomplete)" : "▼ Show Final Results"}
                          />
                          <ExpandCollapseButton
                            isExpanded={expandedParticipants.has(tournament.id)}
                            onToggle={() => toggleParticipants(tournament.id)}
                            expandedText="▲ Hide Participants"
                            collapsedText="▼ Show Participants"
                          />
                        </div>

                        {/* Participants section */}
                        {expandedParticipants.has(tournament.id) && (
                          <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                            Participants: {formatParticipantsWithRating(tournament.participants as TournamentParticipant[])}
                          </p>
                        )}

                        {/* Final Results section - plugin's completed panel */}
                        {isResultsExpanded && (
                          <div style={{ marginTop: '7.5px', padding: '0 15px 15px 15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                            {plugin.createCompletedPanel({
                              tournament: tournament as any,
                              onTournamentUpdate: (updatedTournament) => {
                                setTournaments(prev => 
                                  prev.map(t => t.id === updatedTournament.id ? updatedTournament as any : t)
                                );
                              },
                              onError: (error) => handleTournamentError(error),
                              onSuccess: (message) => {
                                console.log('Success:', message);
                              },
                              isExpanded: true,
                              onToggleExpand: () => {
                                // Handled by outer ExpandCollapseButton
                              }
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </>
        ) : null}
        </>
        )}
      </div>

      {/* Tooltip for tournament state change icons */}
      {hoveredIcon && (() => {
        const tournament = [...activeTournaments, ...tournaments].find(t => t.id === hoveredIcon.tournamentId);
        if (!tournament) return null;
        const tooltipText = getTooltipText(hoveredIcon.type, tournament);
        // Adjust position to keep tooltip on screen
        const tooltipX = Math.min(hoveredIcon.x + 10, window.innerWidth - 370);
        const tooltipY = Math.min(hoveredIcon.y + 10, window.innerHeight - 150);
        return (
          <div
            style={{
              position: 'fixed',
              left: `${tooltipX}px`,
              top: `${tooltipY}px`,
              backgroundColor: '#2c3e50',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              maxWidth: '350px',
              zIndex: 10001,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'none',
              lineHeight: '1.5',
            }}
          >
            {tooltipText}
          </div>
        );
      })()}

      {/* Cancel Tournament Confirmation Modal */}
      {showCancelConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#e74c3c' }}>
              Dangerous Operation: Cancel Tournament
            </h3>
            {showCancelConfirmation.matchCount > 0 ? (
              <>
                <p style={{ marginBottom: '10px', fontWeight: 'bold', color: '#c0392b' }}>
                  This action is destructive and cannot be undone.
                </p>
                <p style={{ marginBottom: '10px' }}>
                  This tournament has <strong>{showCancelConfirmation.matchCount}</strong> completed {showCancelConfirmation.matchCount === 1 ? 'match' : 'matches'}.
                </p>
                <p style={{ marginBottom: '20px' }}>
                  Cancelling will move the tournament to completed status and preserve all match results and rating changes.
                </p>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#444', fontWeight: 'bold' }}>
                  Enter your password to confirm cancellation:
                </label>
                <input
                  ref={cancelPasswordInputRef}
                  type="password"
                  value={cancelPassword}
                  onChange={(e) => setCancelPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    border: '1px solid #d0d7de',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    fontSize: '14px',
                  }}
                />
              </>
            ) : (
              <p style={{ marginBottom: '20px' }}>
                This tournament has no matches played. It will be permanently removed.
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={closeCancelConfirmation}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #27ae60',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  color: '#27ae60',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Keep Tournament Active
              </button>
              <button
                onClick={async () => {
                  if (showCancelConfirmation) {
                    await handleCancelTournament(
                      showCancelConfirmation.tournamentId,
                      showCancelConfirmation.matchCount > 0 ? cancelPassword : undefined,
                    );
                  }
                }}
                disabled={showCancelConfirmation.matchCount > 0 && cancelPassword.trim() === ''}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: showCancelConfirmation.matchCount > 0 && cancelPassword.trim() === '' ? '#f1a9a0' : '#e74c3c',
                  color: 'white',
                  cursor: showCancelConfirmation.matchCount > 0 && cancelPassword.trim() === '' ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Cancel Tournament
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete tournament confirmation */}
      {confirmCompleteTournamentId !== null && (() => {
        const t = activeTournaments.find((x) => x.id === confirmCompleteTournamentId);
        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001,
            }}
          >
            <div className="card" style={{ maxWidth: '440px', width: '90%', position: 'relative' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#2c3e50' }}>Complete tournament?</h3>
              <p style={{ marginBottom: '16px', color: '#555', lineHeight: 1.5 }}>
                Complete <strong>{t?.name ?? 'this tournament'}</strong>? Final rankings will be calculated and the tournament will be marked completed.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="button-filter"
                  style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                  onClick={() => setConfirmCompleteTournamentId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-3d success"
                  style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                  onClick={() => void executeCompleteTournament()}
                >
                  Complete tournament
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete match result confirmation */}
      {confirmDeleteMatchOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
        >
          <div className="card" style={{ maxWidth: '440px', width: '90%', position: 'relative' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#c0392b' }}>Delete match result?</h3>
            <p style={{ marginBottom: '16px', color: '#555', lineHeight: 1.5 }}>
              This removes the recorded score for this pairing. Ratings and standings may change. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button-filter"
                style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => setConfirmDeleteMatchOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-3d danger"
                style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => void executeClearMatch()}
              >
                Delete result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invalid Password Error Popup */}
      {cancelPasswordErrorModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#c0392b' }}>
              Authentication failed
            </h3>
            <p style={{ marginBottom: '18px', color: '#333' }}>
              {cancelPasswordErrorModal}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={closeCancelPasswordErrorModal}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate match result popup */}
      {matchResultAlreadyEnteredModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#c0392b' }}>
              Score already entered
            </h3>
            <p style={{ marginBottom: '18px', color: '#333', lineHeight: 1.5 }}>
              {matchResultAlreadyEnteredModal}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={closeMatchResultAlreadyEnteredModal}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ScoreCorrectionModeProvider>
  );
};

export default TournamentDetailPage;