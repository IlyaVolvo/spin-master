import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { saveScrollPosition, getScrollPosition, clearScrollPosition, saveUIState, getUIState, clearUIState } from '../utils/scrollPosition';
import { formatPlayerName, getNameDisplayOrder } from '../utils/nameFormatter';
import { isDateInRange } from '../utils/dateFormatter';
import { formatActiveTournamentRating, formatCompletedTournamentRating } from '../utils/ratingFormatter';
import { PlayoffBracket } from './PlayoffBracket';
import { MatchEntryPopup } from './MatchEntryPopup';
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket';
import { ExpandCollapseButton } from './ExpandCollapseButton';
import { TournamentHeader } from './TournamentHeader';
import { TournamentInfo } from './TournamentInfo';
import { TournamentNameEditor } from './TournamentNameEditor';
import { getMember, setMember } from '../utils/auth';
import { updateMatchCountsCache, removeMatchFromCache } from './Players';
import { isOrganizer } from '../utils/auth';
import { tournamentPluginRegistry } from './tournaments/TournamentPluginRegistry';
import { Tournament, TournamentType } from '../types/tournament';
import './tournaments/plugins'; // This will auto-register all plugins
import { calculateStandings, buildResultsMatrix, generateRoundRobinSchedule } from './tournaments/plugins/roundRobinUtils';

// Module-level cache to persist across component mounts/unmounts
const tournamentsCache: {
  data: Tournament[] | null;
  activeData: Tournament[] | null;
  standaloneMatches: StandaloneMatchFromAPI[] | null;
  lastFetch: number;
} = {
  data: null,
  activeData: null,
  standaloneMatches: null,
  lastFetch: 0,
};

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

const Tournaments: React.FC = () => {
  // ALL HOOKS MUST BE CALLED AT THE TOP LEVEL, BEFORE ANY CONDITIONAL RETURNS
  // This ensures React can track hooks consistently across renders
  
  const navigate = useNavigate();
  const location = useLocation();
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
  const [editingMatch, setEditingMatch] = useState<{
    matchId: number; // 0 means new match, >0 means existing match
    member1Id: number;
    member2Id: number | null; // Can be null for BYE matches
    player1Sets: string;
    player2Sets: string;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
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
  // Load sticky filter states from localStorage on mount
  const [showCompletedTournaments, setShowCompletedTournaments] = useState<boolean>(() => {
    const stored = localStorage.getItem('tournaments_showCompletedTournaments');
    return stored !== null ? stored === 'true' : true;
  });
  const [showCompletedMatches, setShowCompletedMatches] = useState<boolean>(() => {
    const stored = localStorage.getItem('tournaments_showCompletedMatches');
    return stored !== null ? stored === 'true' : true;
  });
  const [expandedSchedules, setExpandedSchedules] = useState<Set<number>>(new Set());
  const [expandedParticipants, setExpandedParticipants] = useState<Set<number>>(new Set());
  const [expandedCompound, setExpandedCompound] = useState<Set<number>>(new Set());
  const [activeSectionCollapsed, setActiveSectionCollapsed] = useState<boolean>(false);
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState<boolean>(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState<{ tournamentId: number; matchCount: number } | null>(null);
  const [hoveredIcon, setHoveredIcon] = useState<{ type: string; tournamentId: number; x: number; y: number } | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<number | null>(null);

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

  // Memoize filtered completed tournaments (all types, with filters applied)
  // No type-based filtering - plugins handle type-specific display
  const filteredCompletedTournaments = useMemo(() => {
    let filtered = tournaments.filter(t => t.status === 'COMPLETED');
    
    // Filter by tournament name
    if (tournamentNameFilter.trim()) {
      // Normalize spaces: replace multiple spaces with single space, trim
      const nameFilterLower = tournamentNameFilter.trim().replace(/\s+/g, ' ').toLowerCase();
      filtered = filtered.filter(tournament => {
        const tournamentName = (tournament.name || '').trim().replace(/\s+/g, ' ');
        return tournamentName.toLowerCase().includes(nameFilterLower);
      });
    }
    
    // Filter by date range
    if (effectiveDateRange.start || effectiveDateRange.end) {
      filtered = filtered.filter(tournament => {
        // Check both createdAt and recordedAt - match if at least one satisfies the criteria
        const createdDate = new Date(tournament.createdAt);
        const createdAtMatches = isDateInRange(createdDate, effectiveDateRange.start, effectiveDateRange.end);
        
        let recordedAtMatches = false;
        if (tournament.recordedAt) {
          const recordedDate = new Date(tournament.recordedAt);
          recordedAtMatches = isDateInRange(recordedDate, effectiveDateRange.start, effectiveDateRange.end);
        }
        
        // Match if at least one date satisfies the criteria
        return createdAtMatches || recordedAtMatches;
      });
    }
    
    // Sort by time: use recordedAt if available, otherwise createdAt (most recent first)
    filtered.sort((a, b) => {
      const timeA = a.recordedAt ? new Date(a.recordedAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.recordedAt ? new Date(b.recordedAt).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA; // Most recent first
    });
    
    return filtered;
  }, [tournaments, effectiveDateRange, tournamentNameFilter]);


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

  // Handle navigation to a specific tournament (from History)
  useEffect(() => {
    const tournamentId = location.state?.tournamentId as number | undefined;
    if (tournamentId && !loading) {
      // Find the tournament to determine if it's active or completed
      const tournament = [...tournaments, ...activeTournaments].find(t => t.id === tournamentId);
      
      if (tournament) {
        // Expand the section if it's collapsed
        if (tournament.status === 'ACTIVE' && activeSectionCollapsed) {
          setActiveSectionCollapsed(false);
        } else if (tournament.status === 'COMPLETED' && completedSectionCollapsed) {
          setCompletedSectionCollapsed(false);
        }
        
        // Expand the tournament
        setExpandedDetails(prev => {
          const newSet = new Set(prev);
          newSet.add(tournamentId);
          return newSet;
        });
        
        // Scroll to the tournament after a delay to ensure it's rendered
        setTimeout(() => {
          const tournamentElement = tournamentRefs.current[tournamentId];
          if (tournamentElement) {
            tournamentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      }
    }
  }, [location.state?.tournamentId, loading, tournaments, activeTournaments, activeSectionCollapsed, completedSectionCollapsed]);
  
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
      // First check localStorage
      const member = getMember();
      if (member && Array.isArray(member.roles) && member.roles.length > 0) {
        const hasOrganizerRole = member.roles.includes('ORGANIZER');
        setIsUserOrganizer(hasOrganizerRole);
        console.log('Organizer status from localStorage:', { hasOrganizerRole, roles: member.roles });
      } else {
        // If no member in localStorage, try to fetch from API
        try {
          const response = await api.get('/auth/member/me');
          if (response.data.member && Array.isArray(response.data.member.roles)) {
            setMember(response.data.member);
            const hasOrganizerRole = response.data.member.roles.includes('ORGANIZER');
            setIsUserOrganizer(hasOrganizerRole);
            console.log('Organizer status from API:', { hasOrganizerRole, roles: response.data.member.roles });
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

  useEffect(() => {
    // Always use cache immediately if available for fast UI response
    const now = Date.now();
    const cacheAge = now - tournamentsCache.lastFetch;
    const hasCache = tournamentsCache.data !== null && tournamentsCache.activeData !== null;
    const isCacheFresh = cacheAge < 30000; // 30 seconds
    
    if (hasCache) {
      // Use cached data immediately for fast UI
      setTournaments(tournamentsCache.data!);
      setActiveTournaments(tournamentsCache.activeData!);
      if (tournamentsCache.standaloneMatches) {
        setStandaloneMatches(tournamentsCache.standaloneMatches);
      }
      setLoading(false);
      
      // Fetch fresh data in background if cache is stale (older than 30 seconds)
      if (!isCacheFresh) {
        // Fetch in background without blocking UI
        fetchData().catch(() => {
          // Silently fail - we already have cached data to show
        });
      }
    } else {
      // No cache available, must fetch
      fetchData();
    }

    // Set up Socket.io connection for real-time updates
    const socket = connectSocket();

    // Listen for cache invalidation events
    socket?.on('cache:invalidate', (data: { tournamentId?: number; timestamp: number }) => {
      console.log('Cache invalidated', data);
      // Refresh data when cache is invalidated
      fetchData().catch((err) => {
        console.error('Error refreshing data after cache invalidation', err);
      });
    });

    // Listen for tournament update events
    socket?.on('tournament:updated', (data: { id: number; name: string; status: string; type: string; timestamp: number }) => {
      console.log('Tournament updated', data);
      // Refresh data to get updated tournament
      fetchData().catch((err) => {
        console.error('Error refreshing data after tournament update', err);
      });
    });

    // Listen for match update events
    socket?.on('match:updated', (data: { id: number; tournamentId: number; member1Id: number; member2Id: number; timestamp: number }) => {
      console.log('Match updated', data);
      // Refresh data to get updated match
      fetchData().catch((err) => {
        console.error('Error refreshing data after match update', err);
      });
    });

    // Cleanup on unmount
    return () => {
      socket?.off('cache:invalidate');
      socket?.off('tournament:updated');
      socket?.off('match:updated');
      // Don't disconnect socket - it's shared across components
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tournamentsRes, activeRes, matchesRes] = await Promise.all([
        api.get('/tournaments'),
        api.get('/tournaments/active'),
        api.get('/matches'),
      ]);
      
      // Set tournaments, active tournaments, and standalone matches
      setTournaments(tournamentsRes.data);
      setActiveTournaments(activeRes.data);
      setStandaloneMatches(matchesRes.data);
      
      // Update cache
      tournamentsCache.data = tournamentsRes.data;
      tournamentsCache.activeData = activeRes.data;
      tournamentsCache.standaloneMatches = matchesRes.data;
      tournamentsCache.lastFetch = Date.now();
      setError(''); // Clear any previous errors on success
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const finalError = apiError || errorMessage;
      
      setError(finalError);
    } finally {
      setLoading(false);
    }
  };

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


  // Toggle compound tournament expansion
  const toggleCompound = (tournamentId: number) => {
    setExpandedCompound(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tournamentId)) {
        newSet.delete(tournamentId);
      } else {
        newSet.add(tournamentId);
      }
      return newSet;
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



  const handleCompleteTournament = async (tournamentId: number) => {
    const tournament = activeTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    if (!areAllMatchesPlayed(tournament)) {
      const expected = getExpectedMatches(tournament);
      setError(`Cannot complete tournament. ${tournament.matches.length} / ${expected} matches have been played. All matches must be recorded before completing.`);
      return;
    }

    if (!window.confirm('Complete this tournament? Rankings will be recalculated.')) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await api.patch(`/tournaments/${tournamentId}/complete`);
      setSuccess('Tournament completed and rankings updated');
      fetchData();
      setSelectedTournament(null);
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
    // Only organizers can enter/edit matches
    if (!isUserOrganizer) {
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
      
      setEditingMatch(null);
      fetchData();
      if (selectedTournament) {
        const updated = await api.get(`/tournaments/${selectedTournament.id}`);
        setSelectedTournament(updated.data);
      }
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(apiError || 'Failed to save match result');
    }
  };

  // Handle clearing/deleting match
  const handleClearMatch = async () => {
    if (!editingMatch || !selectedTournament || editingMatch.matchId === 0) return;

    if (!window.confirm('Are you sure you want to delete this match result? This action cannot be undone.')) {
      return;
    }

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
      setEditingMatch(null);
      fetchData();
      if (selectedTournament) {
        const updated = await api.get(`/tournaments/${selectedTournament.id}`);
        setSelectedTournament(updated.data);
      }
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

  const handleCancelTournament = async (tournamentId: number) => {
    const tournament = activeTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    setError('');
    setSuccess('');

    try {
      const response = await api.patch(`/tournaments/${tournamentId}/cancel`);
      const data = response.data;
      if (data.deleted) {
        setSuccess('Tournament removed (no matches were played).');
      } else {
        setSuccess('Tournament cancelled. All completed matches have been preserved.');
      }
      
      setShowCancelConfirmation(null);
      fetchData();
      if (selectedTournament?.id === tournamentId) {
        setSelectedTournament(null);
      }
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(apiError || 'Failed to cancel tournament');
    }
  };

  const handleShowCancelConfirmation = (tournamentId: number) => {
    const tournament = activeTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    // Count matches (including children for compound tournaments)
    let matchCount = tournament.matches.length;
    if (tournament.childTournaments) {
      for (const child of tournament.childTournaments) {
        matchCount += child.matches?.length ?? 0;
      }
    }

    setShowCancelConfirmation({ tournamentId, matchCount });
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

  const handlePrintSchedule = (tournament: Tournament) => {
    // Use plugin to generate schedule
    const plugin = tournamentPluginRegistry.get(tournament.type);
    if (!plugin || !plugin.generateSchedule) {
      console.error('No schedule generation available for tournament type:', tournament.type);
      return;
    }
    
    const scheduleRounds = plugin.generateSchedule(tournament);
    
    if (scheduleRounds.length === 0) return;

    // Calculate total matches
    const totalMatches = scheduleRounds.reduce((sum, round) => sum + round.matches.length, 0);

    // Create a set of played matches for quick lookup
    const playedMatches = new Set<string>();
    const hasBracketStructure = tournament.bracketMatches && tournament.bracketMatches.length > 0;
    
    if (!hasBracketStructure) {
      // For non-bracket tournaments, track played matches
      tournament.matches.forEach(match => {
        if (match.member2Id !== null && match.member2Id !== 0) {
          const key1 = `${match.member1Id}-${match.member2Id}`;
          const key2 = `${match.member2Id}-${match.member1Id}`;
          playedMatches.add(key1);
          playedMatches.add(key2);
        }
      });
    }

    // Format ratings for each match in each round before generating HTML
    // hasBracketStructure already declared above
    const roundsWithRatings = scheduleRounds.map((round) => ({
      ...round,
      matches: round.matches.map((match: any, matchIdx: number) => {
        if (hasBracketStructure) {
          // Bracket-based tournament (playoff style)
          return {
            ...match,
            player1Name: match.player1Name,
            player2Name: match.player2Name,
            player1RatingDisplay: match.player1Rating,
            player2RatingDisplay: match.player2Rating,
            isPlayed: false, // Bracket schedule only shows ready matches
            matchNumber: matchIdx + 1,
            roundLabel: match.roundLabel,
          };
        } else {
          // Round-robin style tournament
          const p1Rating = formatActiveTournamentRating(match.member1StoredRating, match.member1CurrentRating);
          const p2Rating = formatActiveTournamentRating(match.member2StoredRating, match.member2CurrentRating);
          const matchKey = `${match.member1Id}-${match.member2Id}`;
          const isPlayed = playedMatches.has(matchKey);
          return {
            ...match,
            player1Name: match.member1Name,
            player2Name: match.member2Name,
            player1RatingDisplay: p1Rating,
            player2RatingDisplay: p2Rating,
            isPlayed,
            matchNumber: match.matchNumber,
          };
        }
      }),
    }));

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tournamentName = tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Schedule - ${tournamentName}</title>
          <style>
            @media print {
              @page {
                margin: 1cm;
              }
              body {
                margin: 0;
                padding: 0;
              }
              .no-print {
                display: none !important;
              }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            h1 {
              margin: 0 0 10px 0;
              font-size: 24px;
              color: #2c3e50;
            }
            .tournament-info {
              margin-bottom: 20px;
              font-size: 14px;
              color: #666;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin-top: 10px;
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            tbody {
              display: table-row-group;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            .separator-row {
              height: 3px;
              background-color: #333;
            }
            .separator-row td {
              padding: 0;
              border: none;
              height: 3px;
            }
            th, td {
              padding: 10px;
              border: 1px solid #333;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
              text-align: center;
            }
            td:first-child {
              text-align: center;
              font-weight: bold;
            }
            .rating {
              font-size: 12px;
              color: #666;
              margin-left: 8px;
            }
            .played {
              text-decoration: line-through;
              opacity: 0.6;
            }
          </style>
        </head>
        <body>
          <h1>Match Schedule</h1>
          <div class="tournament-info">
            <strong>Tournament:</strong> ${tournamentName}<br>
            <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
            <strong>Participants:</strong> ${tournament.participants.length}<br>
            <strong>Total Matches:</strong> ${totalMatches}
          </div>
          <table>
            <thead>
              <tr>
                ${hasBracketStructure ? '<th>Round</th>' : '<th>Match #</th>'}
                <th>Player 1</th>
                <th>Player 2</th>
              </tr>
            </thead>
            <tbody>
              ${roundsWithRatings.map((round, roundIndex) => `
                ${roundIndex > 0 ? `<tr class="separator-row"><td colspan="3"></td></tr>` : ''}
                ${round.matches.map((match: any) => `
                  <tr class="${match.isPlayed ? 'played' : ''}">
                    <td>${hasBracketStructure ? (match.roundLabel || `Round ${match.round}`) : match.matchNumber}</td>
                    <td>${match.player1Name}${match.player1RatingDisplay ? `<span class="rating">(${match.player1RatingDisplay})</span>` : ''}</td>
                    <td>${match.player2Name}${match.player2RatingDisplay ? `<span class="rating">(${match.player2RatingDisplay})</span>` : ''}</td>
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handlePrintResults = (tournament: Tournament) => {
    if (tournament.status !== 'COMPLETED') return;
    
    const tournamentName = tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
    const completionDate = tournament.recordedAt ? new Date(tournament.recordedAt).toLocaleDateString() : new Date(tournament.createdAt).toLocaleDateString();
    
    let resultsContent = '';
    const hasBracketStructure = tournament.bracketMatches && tournament.bracketMatches.length > 0;
    
    if (!hasBracketStructure) {
      // Print Final Standings and Results Matrix for Round Robin
      const standings = calculateStandings(tournament);
      const { participants, participantData, matrix } = buildResultsMatrix(tournament);
      
      // Convert matrix from Match objects to score strings for printing
      const scoreMatrix: { [key: number]: { [key: number]: string } } = {};
      participants.forEach((p1, i) => {
        scoreMatrix[p1.member.id] = {};
        participants.forEach((p2, j) => {
          if (i === j) {
            scoreMatrix[p1.member.id][p2.member.id] = '-';
          } else {
            const match = matrix[i][j];
            if (match) {
              if (match.player1Forfeit) {
                scoreMatrix[p1.member.id][p2.member.id] = match.member1Id === p1.memberId ? 'L' : 'W';
              } else if (match.player2Forfeit) {
                scoreMatrix[p1.member.id][p2.member.id] = match.member1Id === p1.memberId ? 'W' : 'L';
              } else {
                const score1 = match.member1Id === p1.memberId ? match.player1Sets : match.player2Sets;
                const score2 = match.member1Id === p1.memberId ? match.player2Sets : match.player1Sets;
                scoreMatrix[p1.member.id][p2.member.id] = `${score1} - ${score2}`;
              }
            } else {
              scoreMatrix[p1.member.id][p2.member.id] = '';
            }
          }
        });
      });
      
      // Build standings table HTML
      let standingsTable = `
        <h2>Final Standings</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">Pos</th>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: left;">Player</th>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">W</th>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">L</th>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 80px;">Sets Won</th>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 80px;">Sets Lost</th>
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 100px;">Set Diff</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      standings.forEach(({ member, stats, position }) => {
        const participant = participantData.find(p => p.memberId === member.id);
        const ratingDisplay = formatCompletedTournamentRating(participant?.playerRatingAtTime, member.rating);
        const setDiff = stats.setsWon - stats.setsLost;
        const playerName = formatPlayerName(member.firstName, member.lastName, getNameDisplayOrder());
        const posBgColor = position === 1 ? '#fff3cd' : position === 2 ? '#e9ecef' : position === 3 ? '#d4edda' : '#fff';
        const diffColor = setDiff > 0 ? '#28a745' : setDiff < 0 ? '#dc3545' : '#666';
        
        standingsTable += `
          <tr>
            <td style="padding: 8px; border: 1px solid #333; text-align: center; font-weight: bold; background-color: ${posBgColor};">${position}</td>
            <td style="padding: 8px; border: 1px solid #333; font-weight: bold;">
              ${playerName}${ratingDisplay ? ` <span style="font-size: 11px; color: #666; font-weight: normal;">(${position}, ${ratingDisplay})</span>` : ''}
            </td>
            <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.wins}</td>
            <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.losses}</td>
            <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.setsWon}</td>
            <td style="padding: 8px; border: 1px solid #333; text-align: center;">${stats.setsLost}</td>
            <td style="padding: 8px; border: 1px solid #333; text-align: center; font-weight: bold; color: ${diffColor};">${setDiff > 0 ? '+' : ''}${setDiff}</td>
          </tr>
        `;
      });
      
      standingsTable += `
          </tbody>
        </table>
      `;
      
      // Build results matrix table HTML
      let matrixTable = `
        <h2>Results Matrix</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 6px 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: left; white-space: nowrap;">Player</th>
      `;
      
      participants.forEach((participant) => {
        const playerName = formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder());
        matrixTable += `
              <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; min-width: 80px; text-align: center; font-weight: normal;">
                ${playerName}
              </th>
        `;
      });
      
      matrixTable += `
            </tr>
          </thead>
          <tbody>
      `;
      
      participants.forEach((participant1) => {
        const participantData1 = participantData.find(p => p.memberId === participant1.member.id);
        const ratingDisplay1 = formatCompletedTournamentRating(participantData1?.playerRatingAtTime, participant1.member.rating);
        const ranking1 = standings.find(s => s.member.id === participant1.member.id)?.position;
        const player1Name = formatPlayerName(participant1.member.firstName, participant1.member.lastName, getNameDisplayOrder());
        
        matrixTable += `
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #333; background-color: #f0f0f0; font-weight: bold; white-space: nowrap;">
                ${player1Name}${ranking1 && ratingDisplay1 ? ` <span style="font-size: 11px; color: #666; font-weight: normal;">(${ranking1}, ${ratingDisplay1})</span>` : ''}
              </td>
        `;
        
        participants.forEach((participant2) => {
          const score = scoreMatrix[participant1.member.id][participant2.member.id];
          const isDiagonal = participant1.member.id === participant2.member.id;
          const hasScore = score && score !== '';
          
          let cellBgColor = isDiagonal ? '#e9ecef' : hasScore ? '#fff' : '#f9f9f9';
          let cellTextColor = '#000';
          
          // Highlight winner
          if (!isDiagonal && score) {
            const isForfeit = score === 'W' || score === 'L';
            if (isForfeit) {
              cellBgColor = score === 'W' ? '#d4edda' : '#f8d7da';
            } else {
              const [score1, score2] = score.split(' - ').map(Number);
              if (score1 > score2) {
                cellBgColor = '#d4edda';
              } else if (score2 > score1) {
                cellBgColor = '#f8d7da';
              }
            }
          }
          
          matrixTable += `
              <td style="padding: 8px; border: 1px solid #333; text-align: center; background-color: ${cellBgColor}; color: ${cellTextColor}; font-weight: ${isDiagonal ? 'normal' : 'bold'}; min-width: 80px; width: 80px;">
                ${hasScore ? score : '-'}
              </td>
          `;
        });
        
        matrixTable += `
            </tr>
        `;
      });
      
      matrixTable += `
          </tbody>
        </table>
        <p style="font-size: 12px; color: #666; margin-top: 10px; font-style: italic;">
          Green cells indicate wins for the row player, red cells indicate losses. Diagonal shows player names. W = Win (forfeit), L = Loss (forfeit).
        </p>
      `;
      
      resultsContent = standingsTable + matrixTable;
      
    } else {
      // Print visual bracket for bracket-based tournaments
      const bracketMatches = tournament.bracketMatches || [];
      const maxRound = Math.max(...bracketMatches.map(bm => bm.round), 0);
      
      // Group matches by round
      const matchesByRound: { [round: number]: typeof bracketMatches } = {};
      for (let round = 1; round <= maxRound; round++) {
        matchesByRound[round] = bracketMatches.filter(bm => bm.round === round).sort((a, b) => a.position - b.position);
      }
      
      // Calculate round labels
      const getRoundLabel = (round: number, totalRounds: number) => {
        const totalMatches = Math.pow(2, totalRounds - round + 1);
        if (totalMatches >= 32) return 'Round of 32';
        if (totalMatches >= 16) return 'Round of 16';
        if (totalMatches >= 8) return 'Quarterfinals';
        if (totalMatches >= 4) return 'Semifinals';
        if (totalMatches >= 2) return 'Finals';
        return 'Championship';
      };
      
      // Build bracket structure
      resultsContent = '<h2>Playoff Bracket</h2>';
      resultsContent += '<div style="display: flex; gap: 40px; padding: 20px 0; width: max-content; min-width: 100%;">';
      
      // Find champion (or check if cancelled)
      let championName = '';
      if (tournament.cancelled) {
        championName = 'NOT COMPLETED';
      } else {
        const finalRoundMatches = matchesByRound[maxRound] || [];
        if (finalRoundMatches.length > 0) {
          const finalMatch = finalRoundMatches[0];
          if (finalMatch.match) {
            const match = finalMatch.match;
            const player1 = tournament.participants.find(p => p.memberId === finalMatch.member1Id)?.member;
            const player2 = tournament.participants.find(p => p.memberId === finalMatch.member2Id)?.member;
            if (match.player1Sets > (match.player2Sets ?? 0) || match.player2Forfeit) {
              championName = player1 ? formatPlayerName(player1.firstName, player1.lastName, getNameDisplayOrder()) : '';
            } else if ((match.player2Sets ?? 0) > match.player1Sets || match.player1Forfeit) {
              championName = player2 ? formatPlayerName(player2.firstName, player2.lastName, getNameDisplayOrder()) : '';
            }
          }
        }
      }
      
      // Render each round
      for (let round = 1; round <= maxRound; round++) {
        const roundMatches = matchesByRound[round] || [];
        if (roundMatches.length === 0) continue;
        
        const roundLabel = getRoundLabel(round, maxRound);
        const matchHeight = 80; // Height per match box
        const roundHeight = roundMatches.length * matchHeight;
        
        resultsContent += `
          <div style="display: flex; flex-direction: column; min-width: 200px; page-break-inside: avoid;">
            <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px; padding: 8px; background-color: #f0f0f0; border: 1px solid #333;">
              ${roundLabel}
            </div>
            <div style="position: relative; min-height: ${roundHeight}px; page-break-inside: avoid;">
        `;
        
        roundMatches.forEach((bm, idx) => {
          const match = bm.match;
          const player1 = tournament.participants.find(p => p.memberId === bm.member1Id)?.member;
          const player2 = tournament.participants.find(p => p.memberId === bm.member2Id)?.member;
          
          const topPosition = idx * matchHeight;
          const isBye = bm.member1Id === null || bm.member1Id === 0 || bm.member2Id === null || bm.member2Id === 0;
          
          if (isBye) {
            const player = player1 || player2;
            if (player) {
              const playerName = formatPlayerName(player.firstName, player.lastName, getNameDisplayOrder());
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
            const player1Name = player1 ? formatPlayerName(player1.firstName, player1.lastName, getNameDisplayOrder()) : 'TBD';
            const player2Name = player2 ? formatPlayerName(player2.firstName, player2.lastName, getNameDisplayOrder()) : 'TBD';
            
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
        
        resultsContent += `
            </div>
          </div>
        `;
      }
      
      resultsContent += '</div>';
      
      // Add champion display
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
    }
    
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Results - ${tournamentName}</title>
          <style>
            @media print {
              @page {
                margin: 1cm;
                size: auto;
              }
              body {
                margin: 0;
                padding: 0;
                overflow: visible;
              }
              .bracket-container {
                page-break-inside: avoid;
                overflow: visible;
                width: max-content;
              }
              .bracket-round {
                page-break-inside: avoid;
              }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            h1 {
              margin: 0 0 10px 0;
              font-size: 24px;
              color: #2c3e50;
            }
            h2 {
              margin: 20px 0 10px 0;
              font-size: 20px;
              color: #2c3e50;
            }
            h3 {
              margin: 15px 0 8px 0;
              font-size: 16px;
              color: #2c3e50;
            }
            .tournament-info {
              margin-bottom: 20px;
              font-size: 14px;
              color: #666;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin-top: 10px;
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            tbody {
              display: table-row-group;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            th, td {
              padding: 8px;
              border: 1px solid #333;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
            }
            .bracket-container {
              display: flex;
              gap: 40px;
              padding: 20px 0;
              width: max-content;
              min-width: 100%;
            }
            .bracket-round {
              display: flex;
              flex-direction: column;
              min-width: 200px;
              page-break-inside: avoid;
            }
            .bracket-match {
              border: 1px solid #333;
              background-color: #fff;
              margin-bottom: 10px;
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <h1>Tournament Results</h1>
          <div class="tournament-info">
            <strong>Tournament:</strong> ${tournamentName}<br>
            <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
            <strong>Completed:</strong> ${completionDate}<br>
            <strong>Participants:</strong> ${tournament.participants.length}<br>
            <strong>Type:</strong> ${getTournamentTypeName(tournament)}
          </div>
          ${resultsContent}
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handlePrintCompoundSchedule = (tournament: Tournament) => {
    const children = (tournament.childTournaments || [])
      .slice()
      .sort((a: any, b: any) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999));

    if (children.length === 0) return;

    const tournamentName = tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;

    let allSchedulesHtml = '';
    for (const child of children) {
      const childPlugin = tournamentPluginRegistry.get(child.type as TournamentType);
      if (!childPlugin || !childPlugin.generateSchedule) continue;

      const scheduleRounds = childPlugin.generateSchedule(child as any);
      if (scheduleRounds.length === 0) continue;

      const totalMatches = scheduleRounds.reduce((sum: number, round: any) => sum + round.matches.length, 0);
      const hasBracketStructure = child.bracketMatches && child.bracketMatches.length > 0;

      const playedMatches = new Set<string>();
      if (!hasBracketStructure) {
        (child.matches || []).forEach((match: any) => {
          if (match.member2Id !== null && match.member2Id !== 0) {
            playedMatches.add(`${match.member1Id}-${match.member2Id}`);
            playedMatches.add(`${match.member2Id}-${match.member1Id}`);
          }
        });
      }

      const roundsWithRatings = scheduleRounds.map((round: any) => ({
        ...round,
        matches: round.matches.map((match: any, matchIdx: number) => {
          if (hasBracketStructure) {
            return { ...match, p1Name: match.player1Name, p2Name: match.player2Name, p1Rating: match.player1Rating, p2Rating: match.player2Rating, isPlayed: false, matchNumber: matchIdx + 1, roundLabel: match.roundLabel };
          } else {
            const p1Rating = formatActiveTournamentRating(match.member1StoredRating, match.member1CurrentRating);
            const p2Rating = formatActiveTournamentRating(match.member2StoredRating, match.member2CurrentRating);
            return { ...match, p1Name: match.member1Name, p2Name: match.member2Name, p1Rating, p2Rating, isPlayed: playedMatches.has(`${match.member1Id}-${match.member2Id}`), matchNumber: match.matchNumber };
          }
        }),
      }));

      allSchedulesHtml += `
        <div style="margin-bottom: 30px; page-break-inside: avoid;">
          <h3 style="margin: 0 0 5px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px;">
            ${child.name || `Sub-tournament ${child.id}`}
            <span style="font-size: 12px; color: #666; font-weight: normal; margin-left: 10px;">${totalMatches} matches | ${child.participants?.length || 0} players</span>
          </h3>
          <table style="border-collapse: collapse; width: 100%; margin-top: 5px;">
            <thead>
              <tr>
                ${hasBracketStructure ? '<th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center;">Round</th>' : '<th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: center;">Match #</th>'}
                <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: left;">Player 1</th>
                <th style="padding: 8px; border: 1px solid #333; background-color: #f0f0f0; text-align: left;">Player 2</th>
              </tr>
            </thead>
            <tbody>
              ${roundsWithRatings.map((round: any, roundIndex: number) => `
                ${roundIndex > 0 ? '<tr style="height: 3px; background-color: #333;"><td colspan="3" style="padding: 0; border: none; height: 3px;"></td></tr>' : ''}
                ${round.matches.map((match: any) => `
                  <tr style="${match.isPlayed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                    <td style="padding: 8px; border: 1px solid #333; text-align: center; font-weight: bold;">${hasBracketStructure ? (match.roundLabel || `Round ${match.round}`) : match.matchNumber}</td>
                    <td style="padding: 8px; border: 1px solid #333;">${match.p1Name}${match.p1Rating ? ` <span style="font-size: 12px; color: #666;">(${match.p1Rating})</span>` : ''}</td>
                    <td style="padding: 8px; border: 1px solid #333;">${match.p2Name}${match.p2Rating ? ` <span style="font-size: 12px; color: #666;">(${match.p2Rating})</span>` : ''}</td>
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (!allSchedulesHtml) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Schedule - ${tournamentName}</title>
          <style>
            @media print { @page { margin: 1cm; } body { margin: 0; padding: 0; } }
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { margin: 0 0 10px 0; font-size: 24px; color: #2c3e50; }
            .tournament-info { margin-bottom: 20px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <h1>Match Schedule</h1>
          <div class="tournament-info">
            <strong>Tournament:</strong> ${tournamentName}<br>
            <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
            <strong>Sub-tournaments:</strong> ${children.length}
          </div>
          ${allSchedulesHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handlePrintCompoundResults = (tournament: Tournament) => {
    const children = (tournament.childTournaments || [])
      .slice()
      .sort((a: any, b: any) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999));

    if (children.length === 0) return;

    const tournamentName = tournament.name || `Tournament ${new Date(tournament.createdAt).toLocaleDateString()}`;
    const completionDate = tournament.recordedAt ? new Date(tournament.recordedAt).toLocaleDateString() : new Date(tournament.createdAt).toLocaleDateString();

    let allResultsHtml = '';
    for (const child of children) {
      const hasBracketStructure = child.bracketMatches && child.bracketMatches.length > 0;

      allResultsHtml += `<div style="margin-bottom: 30px; page-break-inside: avoid;">`;
      allResultsHtml += `<h3 style="margin: 0 0 10px 0; color: #2c3e50; border-bottom: 2px solid ${hasBracketStructure ? '#27ae60' : '#3498db'}; padding-bottom: 5px;">
        ${child.name || `Sub-tournament ${child.id}`}
        <span style="font-size: 12px; color: #666; font-weight: normal; margin-left: 10px;">${child.participants?.length || 0} players</span>
      </h3>`;

      if (!hasBracketStructure) {
        // Round Robin results: standings + matrix
        const standings = calculateStandings(child as any);
        const { participants, participantData, matrix } = buildResultsMatrix(child as any);

        // Standings table
        allResultsHtml += `
          <table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">
            <thead>
              <tr>
                <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 40px;">Pos</th>
                <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: left;">Player</th>
                <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 40px;">W</th>
                <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 40px;">L</th>
                <th style="padding: 6px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; width: 60px;">Sets +/-</th>
              </tr>
            </thead>
            <tbody>
        `;

        standings.forEach(({ member, stats, position }: any) => {
          const participant = participantData.find((p: any) => p.memberId === member.id);
          const ratingDisplay = formatCompletedTournamentRating(participant?.playerRatingAtTime, member.rating);
          const setDiff = stats.setsWon - stats.setsLost;
          const playerName = formatPlayerName(member.firstName, member.lastName, getNameDisplayOrder());
          const posBgColor = position === 1 ? '#fff3cd' : position === 2 ? '#e9ecef' : position === 3 ? '#d4edda' : '#fff';
          const diffColor = setDiff > 0 ? '#28a745' : setDiff < 0 ? '#dc3545' : '#666';

          allResultsHtml += `
            <tr>
              <td style="padding: 6px; border: 1px solid #333; text-align: center; font-weight: bold; background-color: ${posBgColor};">${position}</td>
              <td style="padding: 6px; border: 1px solid #333; font-weight: bold;">${playerName}${ratingDisplay ? ` <span style="font-size: 11px; color: #666; font-weight: normal;">(${ratingDisplay})</span>` : ''}</td>
              <td style="padding: 6px; border: 1px solid #333; text-align: center;">${stats.wins}</td>
              <td style="padding: 6px; border: 1px solid #333; text-align: center;">${stats.losses}</td>
              <td style="padding: 6px; border: 1px solid #333; text-align: center; font-weight: bold; color: ${diffColor};">${setDiff > 0 ? '+' : ''}${setDiff}</td>
            </tr>
          `;
        });

        allResultsHtml += `</tbody></table>`;

        // Results matrix
        const scoreMatrix: { [key: number]: { [key: number]: string } } = {};
        participants.forEach((p1: any, i: number) => {
          scoreMatrix[p1.member.id] = {};
          participants.forEach((p2: any, j: number) => {
            if (i === j) { scoreMatrix[p1.member.id][p2.member.id] = '-'; return; }
            const match = matrix[i][j];
            if (match) {
              if (match.player1Forfeit) scoreMatrix[p1.member.id][p2.member.id] = match.member1Id === p1.memberId ? 'L' : 'W';
              else if (match.player2Forfeit) scoreMatrix[p1.member.id][p2.member.id] = match.member1Id === p1.memberId ? 'W' : 'L';
              else {
                const s1 = match.member1Id === p1.memberId ? match.player1Sets : match.player2Sets;
                const s2 = match.member1Id === p1.memberId ? match.player2Sets : match.player1Sets;
                scoreMatrix[p1.member.id][p2.member.id] = `${s1} - ${s2}`;
              }
            } else { scoreMatrix[p1.member.id][p2.member.id] = ''; }
          });
        });

        allResultsHtml += `<table style="border-collapse: collapse; width: 100%;"><thead><tr><th style="padding: 5px; border: 1px solid #333; background-color: #f0f0f0; text-align: left; font-size: 12px;">Player</th>`;
        participants.forEach((p: any) => {
          allResultsHtml += `<th style="padding: 5px; border: 1px solid #333; background-color: #f0f0f0; text-align: center; font-size: 11px; min-width: 60px;">${formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())}</th>`;
        });
        allResultsHtml += `</tr></thead><tbody>`;

        participants.forEach((p1: any) => {
          const playerName = formatPlayerName(p1.member.firstName, p1.member.lastName, getNameDisplayOrder());
          allResultsHtml += `<tr><td style="padding: 5px; border: 1px solid #333; background-color: #f0f0f0; font-weight: bold; font-size: 12px; white-space: nowrap;">${playerName}</td>`;
          participants.forEach((p2: any) => {
            const score = scoreMatrix[p1.member.id][p2.member.id];
            const isDiagonal = p1.member.id === p2.member.id;
            let cellBg = isDiagonal ? '#e9ecef' : '#fff';
            if (!isDiagonal && score) {
              if (score === 'W') cellBg = '#d4edda';
              else if (score === 'L') cellBg = '#f8d7da';
              else if (score !== '') {
                const [s1, s2] = score.split(' - ').map(Number);
                cellBg = s1 > s2 ? '#d4edda' : s2 > s1 ? '#f8d7da' : '#fff';
              }
            }
            allResultsHtml += `<td style="padding: 5px; border: 1px solid #333; text-align: center; background-color: ${cellBg}; font-size: 12px; font-weight: ${isDiagonal ? 'normal' : 'bold'};">${score || '-'}</td>`;
          });
          allResultsHtml += `</tr>`;
        });
        allResultsHtml += `</tbody></table>`;

      } else {
        // Bracket-based tournament results
        const bracketMatches = child.bracketMatches || [];
        const maxRound = Math.max(...bracketMatches.map((bm: any) => bm.round), 0);

        const getRoundLabel = (round: number, totalRounds: number) => {
          const totalMatches = Math.pow(2, totalRounds - round + 1);
          if (totalMatches >= 32) return 'Round of 32';
          if (totalMatches >= 16) return 'Round of 16';
          if (totalMatches >= 8) return 'Quarterfinals';
          if (totalMatches >= 4) return 'Semifinals';
          if (totalMatches >= 2) return 'Finals';
          return 'Championship';
        };

        for (let round = 1; round <= maxRound; round++) {
          const roundMatches = bracketMatches.filter((bm: any) => bm.round === round).sort((a: any, b: any) => a.position - b.position);
          if (roundMatches.length === 0) continue;

          allResultsHtml += `<div style="margin-bottom: 10px;"><strong>${getRoundLabel(round, maxRound)}</strong></div>`;
          allResultsHtml += `<table style="border-collapse: collapse; width: 100%; margin-bottom: 10px;">`;

          roundMatches.forEach((bm: any) => {
            const match = bm.match;
            const p1 = child.participants?.find((p: any) => p.memberId === bm.member1Id)?.member;
            const p2 = child.participants?.find((p: any) => p.memberId === bm.member2Id)?.member;
            const isBye = !bm.member1Id || bm.member1Id === 0 || !bm.member2Id || bm.member2Id === 0;

            if (isBye) return;

            const p1Name = p1 ? formatPlayerName(p1.firstName, p1.lastName, getNameDisplayOrder()) : 'TBD';
            const p2Name = p2 ? formatPlayerName(p2.firstName, p2.lastName, getNameDisplayOrder()) : 'TBD';
            let score = '-';
            let winnerStyle1 = '', winnerStyle2 = '';
            if (match) {
              if (match.player1Forfeit) { score = 'Forfeit'; winnerStyle2 = 'color: #27ae60; font-weight: bold;'; }
              else if (match.player2Forfeit) { score = 'Forfeit'; winnerStyle1 = 'color: #27ae60; font-weight: bold;'; }
              else { score = `${match.player1Sets} - ${match.player2Sets}`; if (match.player1Sets > (match.player2Sets ?? 0)) winnerStyle1 = 'color: #27ae60; font-weight: bold;'; else winnerStyle2 = 'color: #27ae60; font-weight: bold;'; }
            }

            allResultsHtml += `<tr>
              <td style="padding: 6px; border: 1px solid #333; ${winnerStyle1}">${p1Name}</td>
              <td style="padding: 6px; border: 1px solid #333; text-align: center; font-weight: bold; width: 80px;">${score}</td>
              <td style="padding: 6px; border: 1px solid #333; ${winnerStyle2}">${p2Name}</td>
            </tr>`;
          });

          allResultsHtml += `</table>`;
        }
      }

      allResultsHtml += `</div>`;
    }

    if (!allResultsHtml) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Results - ${tournamentName}</title>
          <style>
            @media print { @page { margin: 1cm; } body { margin: 0; padding: 0; } }
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { margin: 0 0 10px 0; font-size: 24px; color: #2c3e50; }
            h2 { margin: 20px 0 10px 0; font-size: 20px; color: #2c3e50; }
            .tournament-info { margin-bottom: 20px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <h1>Tournament Results</h1>
          <div class="tournament-info">
            <strong>Tournament:</strong> ${tournamentName}<br>
            <strong>Date:</strong> ${new Date(tournament.createdAt).toLocaleDateString()}<br>
            <strong>Completed:</strong> ${completionDate}<br>
            <strong>Participants:</strong> ${tournament.participants.length}<br>
            <strong>Sub-tournaments:</strong> ${children.length}
          </div>
          ${allResultsHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  if (loading) {
    return <div className="card">Loading...</div>;
  }

  return (
    <div>
      <div className="card">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px', 
          marginTop: '0', 
          marginBottom: '20px',
          padding: '16px 20px',
          backgroundColor: '#f3e5f5',
          borderRadius: '8px',
          border: '2px solid #9c27b0',
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}>
          <button
            onClick={() => setActiveSectionCollapsed(!activeSectionCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#7b1fa2',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={activeSectionCollapsed ? 'Expand Active section' : 'Collapse Active section'}
          >
            {activeSectionCollapsed ? '▼' : '▲'}
          </button>
          <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#7b1fa2' }}>Active</h2>
        </div>
        {!activeSectionCollapsed ? (
          filteredActiveEvents.length === 0 ? (
            <p>No active events</p>
          ) : (
            <>
              {filteredActiveEvents.map((tournament) => {
                const isCompound = isCompoundTournament(tournament);
                const children = tournament.childTournaments || [];
                const isExpanded = expandedCompound.has(tournament.id);

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
                          <button
                            onClick={() => toggleCompound(tournament.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', color: '#7b1fa2' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          {editingTournamentName === tournament.id ? (
                            <TournamentNameEditor
                              value={tournamentNameEdit}
                              onChange={setTournamentNameEdit}
                              onSave={() => handleSaveTournamentName(tournament.id)}
                              onCancel={handleCancelEditTournamentName}
                            />
                          ) : (
                            <TournamentHeader
                              tournament={tournament as any}
                              onEditClick={() => handleStartEditTournamentName(tournament)}
                            />
                          )}
                          <span style={{ fontSize: '12px', color: '#7b1fa2', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#e1bee7', borderRadius: '4px' }}>
                            {children.length} sub-tournaments
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            onClick={() => handlePrintCompoundSchedule(tournament)}
                            title="Print all sub-tournament schedules"
                            style={{ padding: '6px 12px', border: '1px solid #7b1fa2', borderRadius: '4px', backgroundColor: '#fff', color: '#7b1fa2', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            🖨️ Print Schedule
                          </button>
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

                      {/* Compound expand/collapse buttons (always visible) */}
                      <div style={{ padding: '8px 15px', display: 'flex', gap: '10px', borderBottom: isExpanded ? '1px solid #e0e0e0' : 'none' }}>
                        <ExpandCollapseButton
                          isExpanded={isExpanded}
                          onToggle={() => toggleCompound(tournament.id)}
                          expandedText="▲ Hide Sub-Tournaments"
                          collapsedText="▼ Show Sub-Tournaments / Record Results"
                        />
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
                            {tournament.participants.map(p => formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())).join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Expanded: child tournaments */}
                      {isExpanded && children.length > 0 && (
                        <div style={{ padding: '10px 15px', backgroundColor: '#fafafa' }}>
                          {children
                            .slice()
                            .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999))
                            .map((child) => {
                              const childPlugin = tournamentPluginRegistry.get(child.type as TournamentType);
                              return (
                                <div
                                  key={child.id}
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
                                      Participants: {child.participants.map((p: any) => formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())).join(', ')}
                                    </p>
                                  )}

                                  {/* Child details (active panel or completed panel) */}
                                  {expandedDetails.has(child.id) && childPlugin && (
                                    <div style={{ marginTop: '5px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                      {child.status === 'COMPLETED'
                                        ? childPlugin.createCompletedPanel({
                                            tournament: child as any,
                                            onTournamentUpdate: (updated) => { fetchData(); },
                                            onError: (err) => setError(err),
                                            onSuccess: (msg) => { console.log(msg); },
                                            isExpanded: true,
                                            onToggleExpand: () => {},
                                          })
                                        : childPlugin.createActivePanel({
                                            tournament: child as any,
                                            onTournamentUpdate: (updated) => { fetchData(); },
                                            onMatchUpdate: (match) => { fetchData(); },
                                            onError: (err) => setError(err),
                                            onSuccess: (msg) => { console.log(msg); },
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
                                        onTournamentUpdate: (updated) => { fetchData(); },
                                        onError: (err) => setError(err),
                                        onSuccess: (msg) => { console.log(msg); },
                                      })}
                                    </div>
                                  )}

                                  {/* Match Entry Popup for child */}
                                  {editingMatch && selectedTournament?.id === child.id && (() => {
                                    const player1 = selectedTournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member;
                                    const player2 = selectedTournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member;
                                    if (!player1 || !player2 || !editingMatch.member2Id) return null;
                                    return (
                                      <MatchEntryPopup
                                        editingMatch={{...editingMatch, member2Id: editingMatch.member2Id} as any}
                                        player1={player1}
                                        player2={player2}
                                        showForfeitOptions={true}
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
                  <TournamentNameEditor
                      value={tournamentNameEdit}
                    onChange={setTournamentNameEdit}
                    onSave={() => handleSaveTournamentName(tournament.id)}
                    onCancel={handleCancelEditTournamentName}
                  />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                  {tournament.status === 'ACTIVE' && tournament.matches.length === 0 && isUserOrganizer && (
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
                    Participants: {tournament.participants.map(p => formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())).join(', ')}
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
                              
                              // Update tournament in state
                              setTournaments(prev => 
                                prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                              );
                              setActiveTournaments(prev => 
                                prev.map(t => t.id === updatedTournament.id ? updatedTournament as Tournament : t)
                              );
                            },
                            onError: (error) => {
                              console.error(`❌ Plugin Error:`, {
                                tournamentId: tournament.id,
                                pluginName: plugin.name,
                                error: String(error)
                              });
                              setError(error);
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
                              // Handle match updates
                              fetchData();
                            }
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
                          setError(error);
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
                  {editingMatch && selectedTournament && (() => {
                    const player1 = selectedTournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member;
                    const player2 = selectedTournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member;
                    if (!player1 || !player2 || !editingMatch.member2Id) return null;
                    
                    return (
                      <MatchEntryPopup
                        editingMatch={{...editingMatch, member2Id: editingMatch.member2Id} as any}
                        player1={player1}
                        player2={player2}
                        showForfeitOptions={true}
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

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px', 
          marginTop: '40px', 
          marginBottom: '20px',
          padding: '16px 20px',
          backgroundColor: '#e3f2fd',
          borderRadius: '8px',
          border: '2px solid #2196f3',
          position: 'sticky',
          top: activeSectionCollapsed ? 0 : 80,
          zIndex: 9999,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}>
          <button
            onClick={() => setCompletedSectionCollapsed(!completedSectionCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#1976d2',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={completedSectionCollapsed ? 'Expand Completed section' : 'Collapse Completed section'}
          >
            {completedSectionCollapsed ? '▼' : '▲'}
          </button>
          <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#1976d2' }}>Completed</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '14px', fontWeight: 'normal' }}>
            <input
              type="checkbox"
              checked={showCompletedTournaments}
              onChange={(e) => {
                const value = e.target.checked;
                setShowCompletedTournaments(value);
                // Save to localStorage to make filter sticky
                localStorage.setItem('tournaments_showCompletedTournaments', String(value));
              }}
              style={{ cursor: 'pointer' }}
            />
            <span>Tournaments</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '14px', fontWeight: 'normal' }}>
            <input
              type="checkbox"
              checked={showCompletedMatches}
              onChange={(e) => {
                const value = e.target.checked;
                setShowCompletedMatches(value);
                localStorage.setItem('tournaments_showCompletedMatches', String(value));
              }}
              style={{ cursor: 'pointer' }}
            />
            <span>Matches</span>
          </label>
        </div>
        
        {/* Filters - always visible */}
        {!completedSectionCollapsed && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Filters:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            {/* Tournament Name Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Name:</label>
              <input
                type="text"
                value={tournamentNameFilter}
                onChange={(e) => {
                  const value = e.target.value;
                  setTournamentNameFilter(value);
                  // Save to localStorage to make filter sticky
                  if (value) {
                    localStorage.setItem('tournaments_nameFilter', value);
                  } else {
                    localStorage.removeItem('tournaments_nameFilter');
                  }
                }}
                placeholder="Search tournament/match name..."
                style={{
                  padding: '6px 10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  minWidth: '200px',
                }}
              />
            </div>
            {/* Date Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Date:</label>
              <select
                value={dateFilterType}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateFilterType(value);
                  // Save to localStorage
                  if (value) {
                    localStorage.setItem('tournaments_dateFilterType', value);
                  } else {
                    localStorage.removeItem('tournaments_dateFilterType');
                  }
                  // Clear custom dates when switching to preset
                  if (value !== 'custom') {
                    setDateFilterStart('');
                    setDateFilterEnd('');
                    localStorage.removeItem('tournaments_dateFilterStart');
                    localStorage.removeItem('tournaments_dateFilterEnd');
                  }
                }}
                style={{
                  padding: '6px 10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  minWidth: '120px',
                }}
              >
                <option value="">All</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Calendar Year</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {/* Custom Date Range - only show when "custom" is selected */}
            {dateFilterType === 'custom' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <label style={{ fontSize: '12px', color: '#666' }}>From:</label>
                  <input
                    type="date"
                    value={dateFilterStart}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDateFilterStart(value);
                      // Save to localStorage to make filter sticky
                      if (value) {
                        localStorage.setItem('tournaments_dateFilterStart', value);
                      } else {
                        localStorage.removeItem('tournaments_dateFilterStart');
                      }
                    }}
                    style={{
                      padding: '6px 10px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <label style={{ fontSize: '12px', color: '#666' }}>To:</label>
                  <input
                    type="date"
                    value={dateFilterEnd}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDateFilterEnd(value);
                      // Save to localStorage to make filter sticky
                      if (value) {
                        localStorage.setItem('tournaments_dateFilterEnd', value);
                      } else {
                        localStorage.removeItem('tournaments_dateFilterEnd');
                      }
                    }}
                    style={{
                      padding: '6px 10px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    }}
                  />
                </div>
              </>
            )}
            {(tournamentNameFilter.trim() || dateFilterType) && (
              <button
                onClick={() => {
                  setTournamentNameFilter('');
                  setDateFilterType('');
                  setDateFilterStart('');
                  setDateFilterEnd('');
                  // Clear sticky filters from localStorage
                  localStorage.removeItem('tournaments_nameFilter');
                  localStorage.removeItem('tournaments_dateFilterType');
                  localStorage.removeItem('tournaments_dateFilterStart');
                  localStorage.removeItem('tournaments_dateFilterEnd');
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
        )}

        {!completedSectionCollapsed && (showCompletedTournaments || showCompletedMatches) ? (
          <>

            {(() => {
              // Build unified list of completed events: tournaments + standalone matches
              type CompletedEvent =
                | { kind: 'tournament'; data: Tournament; time: number }
                | { kind: 'match'; data: StandaloneMatchFromAPI; time: number };

              const events: CompletedEvent[] = [];

              if (showCompletedTournaments) {
                filteredCompletedTournaments.forEach(t => {
                  const time = t.recordedAt ? new Date(t.recordedAt).getTime() : new Date(t.createdAt).getTime();
                  events.push({ kind: 'tournament', data: t, time });
                });
              }

              if (showCompletedMatches) {
                filteredStandaloneMatches.forEach(m => {
                  events.push({ kind: 'match', data: m, time: new Date(m.createdAt).getTime() });
                });
              }

              // Sort most recent first
              events.sort((a, b) => b.time - a.time);

              if (events.length === 0) {
                const hasFilters = tournamentNameFilter.trim() || dateFilterType;
                return <p>No completed tournaments{hasFilters ? ' found matching the filters' : ''}</p>;
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
                      const isCompoundExpanded = expandedCompound.has(tournament.id);
                      return (
                        <div
                          key={tournament.id}
                          ref={(el) => { tournamentRefs.current[tournament.id] = el; }}
                          style={{ marginBottom: '20px', border: '2px solid #1976d2', borderRadius: '6px', overflow: 'hidden' }}
                        >
                          {/* Parent header */}
                          <div style={{ padding: '12px 15px', backgroundColor: '#e3f2fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <button
                                onClick={() => toggleCompound(tournament.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', color: '#1976d2' }}
                              >
                                {isCompoundExpanded ? '▼' : '▶'}
                              </button>
                              {editingTournamentName === tournament.id ? (
                                <TournamentNameEditor
                                  value={tournamentNameEdit}
                                  onChange={setTournamentNameEdit}
                                  onSave={() => handleSaveTournamentName(tournament.id)}
                                  onCancel={handleCancelEditTournamentName}
                                />
                              ) : (
                                <TournamentHeader
                                  tournament={tournament as any}
                                  onEditClick={() => handleStartEditTournamentName(tournament)}
                                />
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
                              <button
                                onClick={() => handlePrintCompoundResults(tournament)}
                                title="Print all sub-tournament results"
                                style={{ padding: '6px 12px', border: '1px solid #1976d2', borderRadius: '4px', backgroundColor: '#fff', color: '#1976d2', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                🖨️ Print
                              </button>
                              <button
                                onClick={() => handleQuickViewStats(tournament.id)}
                                title="View Statistics"
                                style={{ padding: '6px 12px', border: '1px solid #2980b9', borderRadius: '4px', backgroundColor: '#fff', color: '#2980b9', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                📊 Stats
                              </button>
                            </div>
                          </div>

                          {/* Compound expand/collapse buttons */}
                          <div style={{ padding: '8px 15px', display: 'flex', gap: '10px', borderBottom: isCompoundExpanded ? '1px solid #e0e0e0' : 'none' }}>
                            <ExpandCollapseButton
                              isExpanded={isCompoundExpanded}
                              onToggle={() => toggleCompound(tournament.id)}
                              expandedText="▲ Hide Sub-Tournaments"
                              collapsedText="▼ Show Sub-Tournament Results"
                            />
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
                                {tournament.participants.map(p => formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())).join(', ')}
                              </p>
                            </div>
                          )}

                          {/* Expanded: child tournaments */}
                          {isCompoundExpanded && children.length > 0 && (
                            <div style={{ padding: '10px 15px', backgroundColor: '#fafafa' }}>
                              {children
                                .slice()
                                .sort((a, b) => (a.groupNumber ?? 999) - (b.groupNumber ?? 999))
                                .map((child) => {
                                  const childPlugin = tournamentPluginRegistry.get(child.type as TournamentType);
                                  return (
                                    <div
                                      key={child.id}
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
                                          Participants: {child.participants.map((p: any) => formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())).join(', ')}
                                        </p>
                                      )}

                                      {/* Child results */}
                                      {expandedDetails.has(child.id) && childPlugin && (
                                        <div style={{ marginTop: '5px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                          {childPlugin.createCompletedPanel({
                                            tournament: child as any,
                                            onTournamentUpdate: (updated) => { fetchData(); },
                                            onError: (err) => setError(err),
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
                            <TournamentNameEditor
                              value={tournamentNameEdit}
                              onChange={setTournamentNameEdit}
                              onSave={() => handleSaveTournamentName(tournament.id)}
                              onCancel={handleCancelEditTournamentName}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                            {plugin.canPrintResults && (
                              <button
                                onClick={() => handlePrintResults(tournament)}
                                title="Print Results"
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #8e44ad',
                                  borderRadius: '4px',
                                  backgroundColor: '#fff',
                                  color: '#8e44ad',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 'bold',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                🖨️ Print
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
                            Participants: {tournament.participants.map(p => formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())).join(', ')}
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
                              onError: (error) => setError(error),
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
              Cancel Tournament?
            </h3>
            {showCancelConfirmation.matchCount > 0 ? (
              <>
                <p style={{ marginBottom: '10px' }}>
                  This tournament has <strong>{showCancelConfirmation.matchCount}</strong> completed {showCancelConfirmation.matchCount === 1 ? 'match' : 'matches'}.
                </p>
                <p style={{ marginBottom: '20px' }}>
                  Cancelling will move the tournament to completed status and preserve all match results and rating changes.
                </p>
              </>
            ) : (
              <p style={{ marginBottom: '20px' }}>
                This tournament has no matches played. It will be permanently removed.
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelConfirmation(null)}
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
                    await handleCancelTournament(showCancelConfirmation.tournamentId);
                    setShowCancelConfirmation(null);
                  }
                }}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  cursor: 'pointer',
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
    </div>
  );
};

export default Tournaments;