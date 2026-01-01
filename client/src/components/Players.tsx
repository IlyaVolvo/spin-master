import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import api from '../utils/api';
import { formatPlayerName, getNameDisplayOrder, setNameDisplayOrder, NameDisplayOrder } from '../utils/nameFormatter';
import { BracketPreview } from './BracketPreview';
import { saveScrollPosition, getScrollPosition, clearScrollPosition } from '../utils/scrollPosition';
import { getMember, isOrganizer, isAdmin } from '../utils/auth';
import { connectSocket } from '../utils/socket';

// Module-level cache to persist across component mounts/unmounts
const membersCache: {
  data: Member[] | null;
  lastFetch: number;
} = {
  data: null,
  lastFetch: 0,
};

const matchesCache: {
  data: Array<{
    id: number;
    member1Id: number;
    member2Id: number | null;
    updatedAt: string;
    createdAt: string;
  }> | null;
  lastFetch: number;
} = {
  data: null,
  lastFetch: 0,
};

// Cache for match counts - stores counts for each time period configuration
const matchCountsCache: Map<string, Map<number, number>> = new Map();

// Helper function to get cache key for a time period configuration
const getMatchCountsCacheKey = (
  timePeriod: string,
  customStartDate: string | null,
  customEndDate: string | null
): string => {
  return `${timePeriod}_${customStartDate || ''}_${customEndDate || ''}`;
};

// Function to update match counts cache incrementally when a match is added/updated
export const updateMatchCountsCache = (
  match: {
    id: number;
    member1Id: number;
    member2Id: number | null;
    updatedAt: string;
    createdAt: string;
  },
  isNewMatch: boolean
) => {
  if (!matchesCache.data) {
    // Initialize matches cache if it doesn't exist
    matchesCache.data = [];
  }

  // Update matches cache
  if (isNewMatch) {
    matchesCache.data.push(match);
  } else {
    const index = matchesCache.data.findIndex(m => m.id === match.id);
    if (index !== -1) {
      matchesCache.data[index] = match;
    } else {
      // Match not found, add it as new
      matchesCache.data.push(match);
    }
  }
  matchesCache.lastFetch = Date.now();

  // Recalculate counts for the two players involved in this match
  // This ensures accuracy for both new and updated matches
  const playerIds = [match.member1Id, match.member2Id].filter(id => id !== null) as number[];
  
  matchCountsCache.forEach((counts, cacheKey) => {
    // Parse cache key to get time period info
    const parts = cacheKey.split('_');
    const timePeriod = parts[0];
    const customStartStr = parts.slice(1, -1).join('_') || null;
    const customEndStr = parts[parts.length - 1] || null;
    const customStartDate = customStartStr && customStartStr !== '' ? customStartStr : null;
    const customEndDate = customEndStr && customEndStr !== '' ? customEndStr : null;

    // Calculate date range for this cache entry
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (timePeriod === 'today') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (timePeriod === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (timePeriod === 'month') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (timePeriod === 'custom' && customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (timePeriod === 'all') {
      // For 'all', count all matches regardless of date
      playerIds.forEach(playerId => {
        let count = 0;
        matchesCache.data!.forEach(m => {
          if (m.member1Id === playerId || m.member2Id === playerId) {
            count++;
          }
        });
        counts.set(playerId, count);
      });
      return; // Early return for 'all' since we've already processed it
    } else {
      return; // Skip invalid cache entries
    }

    // Recalculate counts for both players from all matches in cache
    playerIds.forEach(playerId => {
      let count = 0;
      matchesCache.data!.forEach(m => {
        const mDate = new Date(m.updatedAt || m.createdAt);
        if (mDate >= startDate && mDate <= endDate) {
          if (m.member1Id === playerId || m.member2Id === playerId) {
            count++;
          }
        }
      });
      counts.set(playerId, count);
    });
  });
};

// Function to remove a match from cache and update counts
export const removeMatchFromCache = (matchId: number, member1Id: number, member2Id: number | null) => {
  if (!matchesCache.data) return;

  // Remove match from cache
  const index = matchesCache.data.findIndex(m => m.id === matchId);
  if (index !== -1) {
    matchesCache.data.splice(index, 1);
    matchesCache.lastFetch = Date.now();

    // Recalculate counts for both players from remaining matches
    const playerIds = [member1Id, member2Id].filter(id => id !== null) as number[];
    
    matchCountsCache.forEach((counts, cacheKey) => {
      // Parse cache key to get time period info
      const parts = cacheKey.split('_');
      const timePeriod = parts[0];
      const customStartStr = parts.slice(1, -1).join('_') || null;
      const customEndStr = parts[parts.length - 1] || null;
      const customStartDate = customStartStr && customStartStr !== '' ? customStartStr : null;
      const customEndDate = customEndStr && customEndStr !== '' ? customEndStr : null;

      // Calculate date range for this cache entry
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      if (timePeriod === 'today') {
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
      } else if (timePeriod === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
      } else if (timePeriod === 'month') {
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
      } else if (timePeriod === 'custom' && customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
      } else if (timePeriod === 'all') {
        // For 'all', count all matches regardless of date
        playerIds.forEach(playerId => {
          let count = 0;
          matchesCache.data!.forEach(m => {
            if (m.member1Id === playerId || m.member2Id === playerId) {
              count++;
            }
          });
          counts.set(playerId, count);
        });
        return; // Early return for 'all' since we've already processed it
      } else {
        return; // Skip invalid cache entries
      }

      // Recalculate counts for both players from remaining matches
      playerIds.forEach(playerId => {
        let count = 0;
        matchesCache.data!.forEach(m => {
          const mDate = new Date(m.updatedAt || m.createdAt);
        if (mDate >= startDate && mDate <= endDate) {
          if (m.member1Id === playerId || m.member2Id === playerId) {
            count++;
          }
        }
        });
        counts.set(playerId, count);
      });
    });
  }
};

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  roles: string[];
  picture?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface SimilarName {
  name: string;
  similarity: number;
}

const Players: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLTableSectionElement>(null);
  const shouldRestoreScrollRef = useRef<boolean>(false);
  const savedScrollPositionRef = useRef<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(40);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const currentMember = getMember();
  const isUserOrganizer = isOrganizer();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState('');
  const [newPlayerLastName, setNewPlayerLastName] = useState('');
  const [newPlayerBirthDate, setNewPlayerBirthDate] = useState<Date | null>(null);
  const [newPlayerRating, setNewPlayerRating] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerGender, setNewPlayerGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | ''>('');
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [newPlayerAddress, setNewPlayerAddress] = useState('');
  const [newPlayerPicture, setNewPlayerPicture] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [similarNames, setSimilarNames] = useState<SimilarName[]>([]);
  const [pendingPlayerData, setPendingPlayerData] = useState<{ firstName: string; lastName: string; birthDate: string | null; rating: number | null } | null>(null);
  const [showActiveConfirmation, setShowActiveConfirmation] = useState(false);
  const [pendingActiveToggle, setPendingActiveToggle] = useState<{ playerId: number; isActive: boolean; playerName: string } | null>(null);
  const [nameDisplayOrder, setNameDisplayOrderState] = useState<NameDisplayOrder>(getNameDisplayOrder());
  const [showImportResults, setShowImportResults] = useState(false);
  const [importResults, setImportResults] = useState<{
    total: number;
    successful: number;
    failed: number;
    successfulPlayers: Array<{ firstName: string; lastName: string; email: string }>;
    failedPlayers: Array<{ firstName: string; lastName: string; email?: string; error: string }>;
  } | null>(null);
  const [showExportSelection, setShowExportSelection] = useState(false);
  const [selectedPlayersForExport, setSelectedPlayersForExport] = useState<Set<number>>(new Set());
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showIdColumn, setShowIdColumn] = useState(false);
  const [showAgeColumn, setShowAgeColumn] = useState(false);
  const [showStatusColumn, setShowStatusColumn] = useState(false);
  const [showActionsColumn, setShowActionsColumn] = useState(false);
  const [showGamesColumn, setShowGamesColumn] = useState(false);
  const [gamesTimePeriod, setGamesTimePeriod] = useState<'today' | 'week' | 'month' | 'custom' | 'all'>('month');
  const [gamesCustomStartDate, setGamesCustomStartDate] = useState<Date | null>(null);
  const [gamesCustomEndDate, setGamesCustomEndDate] = useState<Date | null>(null);
  const [tempGamesCustomStartDate, setTempGamesCustomStartDate] = useState<Date | null>(null);
  const [tempGamesCustomEndDate, setTempGamesCustomEndDate] = useState<Date | null>(null);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [sortColumn, setSortColumn] = useState<'name' | 'rating' | 'age' | 'id' | 'games' | null>(null);
  const [matches, setMatches] = useState<Array<{
    id: number;
    member1Id: number;
    member2Id: number | null;
    updatedAt: string;
    createdAt: string;
  }>>([]);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [nameFilter, setNameFilter] = useState('');
  const [minRating, setMinRating] = useState<string>('');
  const [maxRating, setMaxRating] = useState<string>('9999');
  const [minAge, setMinAge] = useState<string>('');
  const [maxAge, setMaxAge] = useState<string>('');
  const [minGames, setMinGames] = useState<string>('');
  const [maxGames, setMaxGames] = useState<string>('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showRoleFilter, setShowRoleFilter] = useState(false);
  const roleFilterButtonRef = useRef<HTMLButtonElement>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('players_filtersCollapsed');
    return saved === 'true';
  });
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [tournamentCreationStep, setTournamentCreationStep] = useState<'type_selection' | 'player_selection' | 'rearrange' | 'confirmation' | 'organize_bracket' | 'completion'>('type_selection');
  const [selectedPlayersForTournament, setSelectedPlayersForTournament] = useState<number[]>([]);
  const [showTournamentConfirmation, setShowTournamentConfirmation] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentType, setTournamentType] = useState<'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH'>('ROUND_ROBIN');
  const [isMultiTournamentMode, setIsMultiTournamentMode] = useState(false);
  const [playersPerTournament, setMembersPerTournament] = useState<string>('6');
  const [playerGroups, setPlayerGroups] = useState<number[][]>([]); // Array of arrays, each array is a tournament group with player IDs
  const [draggedPlayer, setDraggedPlayer] = useState<{ playerId: number; fromGroupIndex: number } | null>(null); // Track dragged player
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null); // Track which group is being dragged over
  const [showSingleMatchConfirmation, setShowSingleMatchConfirmation] = useState(false);
  const [isSelectingForStats, setIsSelectingForStats] = useState(false);
  const [selectedPlayersForStats, setSelectedPlayersForStats] = useState<number[]>([]);
  const [isSelectingForHistory, setIsSelectingForHistory] = useState(false);
  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<number | null>(null);
  const [selectedOpponentsForHistory, setSelectedOpponentsForHistory] = useState<number[]>([]);
  const [lastHistorySelectionMode, setLastHistorySelectionMode] = useState<'againstPlayers' | 'ratingHistory' | null>(null);
  const [isOrganizingBracket, setIsOrganizingBracket] = useState(false);
  const [bracketPositions, setBracketPositions] = useState<Array<number | null>>([]);
  const [isDraggingInBracket, setIsDraggingInBracket] = useState(false);
  const [hasPlayerInTempZone, setHasPlayerInTempZone] = useState(false);
  const [showSelectedFirst, setShowSelectedFirst] = useState(true);
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGender, setEditGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | ''>('');
  const [editBirthDate, setEditBirthDate] = useState<Date | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPicture, setEditPicture] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editRating, setEditRating] = useState<string>('');
  
  // Password change state (only visible to the member themselves)
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Password reset state (only visible to Admins)
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  
  // Delete member state
  const [canDeleteMember, setCanDeleteMember] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load column visibility settings from localStorage on mount
  useEffect(() => {
    const savedShowIdColumn = localStorage.getItem('players_showIdColumn');
    const savedShowAgeColumn = localStorage.getItem('players_showAgeColumn');
    const savedShowStatusColumn = localStorage.getItem('players_showStatusColumn');
    const savedShowActionsColumn = localStorage.getItem('players_showActionsColumn');
    const savedShowGamesColumn = localStorage.getItem('players_showGamesColumn');
    const savedGamesTimePeriod = localStorage.getItem('players_gamesTimePeriod');
    const savedGamesCustomStartDate = localStorage.getItem('players_gamesCustomStartDate');
    const savedGamesCustomEndDate = localStorage.getItem('players_gamesCustomEndDate');
    const savedSortColumn = localStorage.getItem('players_sortColumn');
    const savedSortDirection = localStorage.getItem('players_sortDirection');
    const savedNameFilter = localStorage.getItem('players_nameFilter');
    const savedMinRating = localStorage.getItem('players_minRating');
    const savedMaxRating = localStorage.getItem('players_maxRating');
    const savedMinAge = localStorage.getItem('players_minAge');
    const savedMaxAge = localStorage.getItem('players_maxAge');
    const savedMinGames = localStorage.getItem('players_minGames');
    const savedMaxGames = localStorage.getItem('players_maxGames');
    const savedShowAllPlayers = localStorage.getItem('players_showAllPlayers');
    // Ensure showAllRoles is set correctly for admins (default to true so they can edit non-players)
    const savedShowAllMembers = localStorage.getItem('players_showAllRoles');
    if (isAdmin()) {
      // For admins: default to true (show all members), unless explicitly set to false in localStorage
      if (savedShowAllMembers !== 'false') {
        setShowAllRoles(true);
      }
    } else if (savedShowAllMembers === 'true') {
      setShowAllRoles(true);
    }
    
    if (savedShowIdColumn === 'true') setShowIdColumn(true);
    if (savedShowAgeColumn === 'true') setShowAgeColumn(true);
    if (savedShowStatusColumn === 'true') setShowStatusColumn(true);
    if (savedShowActionsColumn === 'true') setShowActionsColumn(true);
    if (savedShowGamesColumn === 'true') {
      setShowGamesColumn(true);
    }
    if (savedGamesTimePeriod && ['today', 'week', 'month', 'custom', 'all'].includes(savedGamesTimePeriod)) {
      setGamesTimePeriod(savedGamesTimePeriod as 'today' | 'week' | 'month' | 'custom' | 'all');
    }
    if (savedGamesCustomStartDate) {
      const date = new Date(savedGamesCustomStartDate);
      if (!isNaN(date.getTime())) {
        setGamesCustomStartDate(date);
        setTempGamesCustomStartDate(date);
      }
    }
    if (savedGamesCustomEndDate) {
      const date = new Date(savedGamesCustomEndDate);
      if (!isNaN(date.getTime())) {
        setGamesCustomEndDate(date);
        setTempGamesCustomEndDate(date);
      }
    }
    if (savedSortColumn && ['name', 'rating', 'age', 'id', 'games'].includes(savedSortColumn)) {
      setSortColumn(savedSortColumn as 'name' | 'rating' | 'age' | 'id' | 'games');
    }
    if (savedSortDirection && ['asc', 'desc'].includes(savedSortDirection)) {
      setSortDirection(savedSortDirection as 'asc' | 'desc');
    }
    if (savedNameFilter !== null) setNameFilter(savedNameFilter);
    if (savedMinRating !== null) setMinRating(savedMinRating);
    if (savedMaxRating !== null) setMaxRating(savedMaxRating);
    if (savedMinAge !== null) setMinAge(savedMinAge);
    if (savedMaxAge !== null) setMaxAge(savedMaxAge);
    if (savedMinGames !== null) setMinGames(savedMinGames);
    if (savedMaxGames !== null) setMaxGames(savedMaxGames);
    if (savedShowAllPlayers === 'true') setShowAllPlayers(true);
    // If admin and showing all roles, fetch all members (happens automatically via showAllRoles state)
  }, []);

  useEffect(() => {
    // Use cache if available, otherwise fetch
    if (membersCache.data !== null) {
      setMembers(membersCache.data);
      setLoading(false);
    } else {
      fetchMembers();
    }
  }, []);

  // Set up Socket.io connection for real-time player updates
  useEffect(() => {
    const socket = connectSocket();

    // Listen for player creation
    socket?.on('player:created', (data: { player: Member; timestamp: number }) => {
      // Update cache with new player
      if (membersCache.data) {
        membersCache.data = [...membersCache.data, data.player];
        membersCache.lastFetch = Date.now();
        // Update state if component is mounted
        setMembers([...membersCache.data]);
      } else {
        // Cache not initialized, fetch fresh data
        fetchMembers();
      }
    });

    // Listen for player updates
    socket?.on('player:updated', (data: { player: Member; timestamp: number }) => {
      // Update cache with updated player
      if (membersCache.data) {
        const index = membersCache.data.findIndex(p => p.id === data.player.id);
        if (index !== -1) {
          membersCache.data[index] = data.player;
        } else {
          // Player not in cache, add it
          membersCache.data.push(data.player);
        }
        membersCache.lastFetch = Date.now();
        // Update state if component is mounted
        setMembers([...membersCache.data]);
      } else {
        // Cache not initialized, fetch fresh data
        fetchMembers();
      }
    });

    // Listen for player imports (refresh entire list)
    socket?.on('players:imported', () => {
      // Invalidate cache and fetch fresh data
      membersCache.data = null;
      membersCache.lastFetch = 0;
      fetchMembers();
    });

    return () => {
      // Clean up socket listeners
      socket?.off('player:created');
      socket?.off('player:updated');
      socket?.off('players:imported');
    };
  }, []);

  // Handle edit own profile from header Settings button
  useEffect(() => {
    // Only trigger if editOwnProfile is true and we're not already editing
    if (location.state?.editOwnProfile === true && location.state?.memberId && !editingPlayerId) {
      const memberId = location.state.memberId;
      // Wait for members to load, then edit the member
      if (members.length > 0) {
        handleStartEdit(memberId);
        // Clear the state to prevent re-triggering using React Router's navigate
        navigate('/players', { 
          state: { ...location.state, editOwnProfile: false },
          replace: true 
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.editOwnProfile, location.state?.memberId, members.length, editingPlayerId]);

  // Auto-dismiss success messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Inject CSS keyframes for progress bar animation
  useEffect(() => {
    const styleId = 'tournament-progress-animation';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .progress-step-current {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const style = document.getElementById(styleId);
      if (style) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Fetch matches when Games column is shown
  useEffect(() => {
    if (showGamesColumn) {
      // Always use cache immediately if available for fast UI response
      const now = Date.now();
      const cacheAge = now - matchesCache.lastFetch;
      const hasCache = matchesCache.data !== null;
      const isCacheFresh = cacheAge < 30000; // 30 seconds
      
      if (hasCache) {
        // Use cached data immediately for fast UI
        setMatches(matchesCache.data!);
        
        // Fetch fresh data in background if cache is stale (older than 30 seconds)
        if (!isCacheFresh) {
          // Fetch in background without blocking UI
          fetchMatches().catch(() => {
            // Silently fail - we already have cached data to show
          });
        }
      } else {
        // No cache available, must fetch
        fetchMatches();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGamesColumn]);

  // Calculate rankings from ratings: ranking is based on rating (higher rating = better ranking)
  // Players with null rating have no ranking and are always lower than any positive ranking
  const playerRankings = useMemo(() => {
    // Sort players by rating (descending), null ratings go to end
    const sortedByRating = [...members]
      .filter(p => p.rating !== null) // Only include players with ratings
      .sort((a, b) => {
        // Sort by rating descending
        const ratingA = a.rating ?? 0;
        const ratingB = b.rating ?? 0;
        if (ratingB !== ratingA) {
          return ratingB - ratingA; // Higher rating = better
        }
        // Tiebreaker: lower ID = better ranking (consistent ordering)
        return a.id - b.id;
      });
    
    // Create a map: playerId -> ranking (1-based)
    const rankingMap = new Map<number, number>();
    sortedByRating.forEach((player, index) => {
      rankingMap.set(player.id, index + 1);
    });
    
    return rankingMap;
  }, [members]);

  // Calculate match counts per player for the selected time period
  const playerMatchCounts = useMemo(() => {
    if (!showGamesColumn || matches.length === 0) {
      return new Map<number, number>();
    }

    // Create cache key based on time period parameters
    const customStartKey = gamesCustomStartDate ? gamesCustomStartDate.toISOString() : null;
    const customEndKey = gamesCustomEndDate ? gamesCustomEndDate.toISOString() : null;
    const cacheKey = getMatchCountsCacheKey(gamesTimePeriod, customStartKey, customEndKey);
    
    // Check if we have cached data for this exact configuration
    const cachedCounts = matchCountsCache.get(cacheKey);
    if (cachedCounts) {
      return cachedCounts;
    }

    // Calculate the date range based on selected time period
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (gamesTimePeriod === 'today') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (gamesTimePeriod === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (gamesTimePeriod === 'month') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (gamesTimePeriod === 'custom') {
      if (!gamesCustomStartDate || !gamesCustomEndDate) {
        return new Map<number, number>();
      }
      startDate = new Date(gamesCustomStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(gamesCustomEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (gamesTimePeriod === 'all') {
      // For 'all', we don't filter by date - count all matches
      // We'll handle this in the forEach loop below
    } else {
      return new Map<number, number>();
    }

    // Count matches per player within the date range (or all matches if 'all')
    const matchCounts = new Map<number, number>();

    matches.forEach(match => {
      if (gamesTimePeriod === 'all') {
        // Count all matches regardless of date
        // Count for player1 (member1Id)
        if (match.member1Id !== null && match.member1Id !== 0) {
          matchCounts.set(match.member1Id, (matchCounts.get(match.member1Id) || 0) + 1);
        }
        // Count for player2 (member2Id)
        if (match.member2Id !== null && match.member2Id !== 0) {
          matchCounts.set(match.member2Id, (matchCounts.get(match.member2Id) || 0) + 1);
        }
      } else {
        // Filter by date range
        const matchDate = new Date(match.updatedAt || match.createdAt);
        
        // Check if match is within the date range
        if (matchDate >= startDate && matchDate <= endDate) {
          // Count for player1 (member1Id)
          if (match.member1Id !== null && match.member1Id !== 0) {
            matchCounts.set(match.member1Id, (matchCounts.get(match.member1Id) || 0) + 1);
          }
          // Count for player2 (member2Id)
          if (match.member2Id !== null && match.member2Id !== 0) {
            matchCounts.set(match.member2Id, (matchCounts.get(match.member2Id) || 0) + 1);
          }
        }
      }
    });

    // Cache the result
    matchCountsCache.set(cacheKey, matchCounts);

    return matchCounts;
  }, [showGamesColumn, matches, gamesTimePeriod, gamesCustomStartDate, gamesCustomEndDate]);


  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showSettingsMenu && !target.closest('[data-settings-menu]')) {
        setShowSettingsMenu(false);
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSettingsMenu]);

  // Note: Selected players for tournament are kept even if they don't match filter criteria
  // This allows users to maintain their selection while filtering

  // Unselect players that become invisible due to filtering (for stats selection)
  useEffect(() => {
    if (!isSelectingForStats || selectedPlayersForStats.length === 0) {
      return;
    }

    // Recalculate visible players inline to avoid dependency issues
    let filtered = showAllPlayers ? members : members.filter(p => p.isActive);
    
    if (nameFilter.trim()) {
      const searchTerm = nameFilter.trim().toLowerCase();
      filtered = filtered.filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const firstNameMatch = p.firstName.toLowerCase().includes(searchTerm);
        const lastNameMatch = p.lastName.toLowerCase().includes(searchTerm);
        const fullNameMatch = fullName.includes(searchTerm);
        return firstNameMatch || lastNameMatch || fullNameMatch;
      });
    }
    
    if (minRating !== '' || maxRating !== '9999') {
      const minRatingNum = minRating === '' ? 0 : parseInt(minRating) || 0;
      const maxRatingNum = maxRating === '' ? 9999 : parseInt(maxRating) || 9999;
      filtered = filtered.filter(p => {
        if (p.rating === null) return false;
        return p.rating >= minRatingNum && p.rating <= maxRatingNum;
      });
    }
    
    if (minAge !== '' || maxAge !== '') {
      filtered = filtered.filter(p => {
        const age = calculateAge(p.birthDate);
        if (age === null) return false;
        const minAgeNum = minAge === '' ? 0 : parseInt(minAge) || 0;
        const maxAgeNum = maxAge === '' ? 150 : parseInt(maxAge) || 150;
        return age >= minAgeNum && age <= maxAgeNum;
      });
    }

    const visiblePlayerIds = filtered.map(p => p.id);
    const invisibleSelected = selectedPlayersForStats.filter(
      playerId => !visiblePlayerIds.includes(playerId)
    );

    if (invisibleSelected.length > 0) {
      setSelectedPlayersForStats(
        selectedPlayersForStats.filter(playerId => visiblePlayerIds.includes(playerId))
      );
    }
  }, [nameFilter, minRating, maxRating, minAge, maxAge, showAllPlayers, members, isSelectingForStats]);

  // Unselect opponents that become invisible due to filtering (for history selection)
  // Note: The selected player for history is NOT unselected even if they become invisible
  // When filters are applied, all non-visible opponents automatically lose selection
  useEffect(() => {
    if (!isSelectingForHistory || selectedPlayerForHistory === null) {
      return;
    }

    // Recalculate visible players inline to avoid dependency issues
    let filtered = showAllPlayers ? members : members.filter(p => p.isActive);
    
    if (nameFilter.trim()) {
      const searchTerm = nameFilter.trim().toLowerCase();
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (p.id === selectedPlayerForHistory) return true;
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const firstNameMatch = p.firstName.toLowerCase().includes(searchTerm);
        const lastNameMatch = p.lastName.toLowerCase().includes(searchTerm);
        const fullNameMatch = fullName.includes(searchTerm);
        return firstNameMatch || lastNameMatch || fullNameMatch;
      });
    }
    
    if (minRating !== '' || maxRating !== '9999') {
      const minRatingNum = minRating === '' ? 0 : parseInt(minRating) || 0;
      const maxRatingNum = maxRating === '' ? 9999 : parseInt(maxRating) || 9999;
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (p.id === selectedPlayerForHistory) return true;
        if (p.rating === null) return false;
        return p.rating >= minRatingNum && p.rating <= maxRatingNum;
      });
    }
    
    if (minAge !== '' || maxAge !== '') {
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (p.id === selectedPlayerForHistory) return true;
        const age = calculateAge(p.birthDate);
        if (age === null) return false;
        const minAgeNum = minAge === '' ? 0 : parseInt(minAge) || 0;
        const maxAgeNum = maxAge === '' ? 150 : parseInt(maxAge) || 150;
        return age >= minAgeNum && age <= maxAgeNum;
      });
    }

    const visiblePlayerIds = filtered.map(p => p.id);
    // Always include the selected player for history in visible list
    if (!visiblePlayerIds.includes(selectedPlayerForHistory)) {
      visiblePlayerIds.push(selectedPlayerForHistory);
    }
    
    // Remove all opponents that are not visible (they automatically lose selection)
    setSelectedOpponentsForHistory(prev => 
      prev.filter(playerId => visiblePlayerIds.includes(playerId))
    );
  }, [nameFilter, minRating, maxRating, minAge, maxAge, showAllPlayers, members, isSelectingForHistory, selectedPlayerForHistory]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      // For admins, always fetch all members; for others, fetch only players (members with PLAYER role)
      const endpoint = isAdmin() ? '/players/all-members' : '/players';
      const response = await api.get(endpoint);
      setMembers(response.data);
      // Update cache
      membersCache.data = response.data;
      membersCache.lastFetch = Date.now();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async () => {
    try {
      const response = await api.get('/tournaments');
      const allMatches: Array<{
        id: number;
        member1Id: number;
        member2Id: number | null;
        updatedAt: string;
        createdAt: string;
      }> = [];
      
      // Extract all matches from all tournaments
      response.data.forEach((tournament: any) => {
        if (tournament.matches && Array.isArray(tournament.matches)) {
          tournament.matches.forEach((match: any) => {
            allMatches.push({
              id: match.id,
              member1Id: match.member1Id,
              member2Id: match.member2Id,
              updatedAt: match.updatedAt || match.createdAt,
              createdAt: match.createdAt,
            });
          });
        }
      });
      
      // Update cache
      matchesCache.data = allMatches;
      matchesCache.lastFetch = Date.now();
      // Note: We don't clear match counts cache here - it will be updated incrementally
      
      setMatches(allMatches);
    } catch (err: any) {
      // Don't show error to user, just log it
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate required fields
    if (!newPlayerGender) {
      setError('Please select a gender');
      return;
    }

    // Validate email (required)
    if (!newPlayerEmail || !newPlayerEmail.trim()) {
      setError('Email is required');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newPlayerEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate birthdate (required)
    if (!newPlayerBirthDate) {
      setError('Birth date is required');
      return;
    }

    try {
      const playerData: any = {
        firstName: newPlayerFirstName.trim(),
        lastName: newPlayerLastName.trim(),
        email: newPlayerEmail.trim(),
        gender: newPlayerGender,
        password: 'changeme', // Auto-set as per requirements
        roles: ['PLAYER'], // Default role
        birthDate: newPlayerBirthDate.toISOString().split('T')[0],
      };
      
      if (newPlayerRating) {
        const ratingValue = parseInt(newPlayerRating);
        if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 9999) {
          setError('Rating must be an integer between 0 and 9999');
          return;
        }
        playerData.rating = ratingValue;
      }
      
      // Optional fields
      if (newPlayerPhone.trim()) {
        playerData.phone = newPlayerPhone.trim();
      }
      if (newPlayerAddress.trim()) {
        playerData.address = newPlayerAddress.trim();
      }
      if (newPlayerPicture.trim()) {
        playerData.picture = newPlayerPicture.trim();
      }

      const response = await api.post('/players', playerData);
      
      // Check if confirmation is required
      if (response.data.requiresConfirmation) {
        setSimilarNames(response.data.similarNames);
        setPendingPlayerData({
          firstName: response.data.proposedFirstName,
          lastName: response.data.proposedLastName,
          birthDate: response.data.proposedBirthDate,
          rating: response.data.proposedRating,
        });
        setShowConfirmation(true);
        return;
      }

      // No similar names, proceed normally
      setSuccess('Player added successfully');
      setNewPlayerFirstName('');
      setNewPlayerLastName('');
      setNewPlayerBirthDate(null);
      setNewPlayerRating('');
      setNewPlayerEmail('');
      setNewPlayerGender('');
      setNewPlayerPhone('');
      setNewPlayerAddress('');
      setNewPlayerPicture('');
      setShowAddForm(false);
      fetchMembers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to add player';
      setError(errorMessage);
    }
  };

  const handleExportPlayers = () => {
    // Initialize with all filtered players selected
    const allPlayerIds = new Set(filteredPlayers.map(p => p.id));
    setSelectedPlayersForExport(allPlayerIds);
    setShowExportSelection(true);
  };

  const handleSelectAllForExport = () => {
    const allPlayerIds = new Set(filteredPlayers.map(p => p.id));
    setSelectedPlayersForExport(allPlayerIds);
  };

  const handleDeselectAllForExport = () => {
    setSelectedPlayersForExport(new Set());
  };

  const handleTogglePlayerForExport = (playerId: number) => {
    const newSelection = new Set(selectedPlayersForExport);
    if (newSelection.has(playerId)) {
      newSelection.delete(playerId);
    } else {
      newSelection.add(playerId);
    }
    setSelectedPlayersForExport(newSelection);
  };

  const handlePerformExport = () => {
    if (selectedPlayersForExport.size === 0) {
      setError('Please select at least one player to export');
      return;
    }

    try {
      // Filter to only selected players from the filtered list
      const selectedPlayers = filteredPlayers.filter(player => selectedPlayersForExport.has(player.id));

      if (selectedPlayers.length === 0) {
        setError('No players selected for export');
        return;
      }

      // Convert to CSV using the specified fields
      const headers = ['firstname', 'lastname', 'email', 'date of birth', 'gender', 'roles', 'phone', 'address', 'rating'];
      const csvRows = [
        headers.join(','),
        ...selectedPlayers.map((player) => {
          return headers.map(header => {
            let value: any;
            switch (header) {
              case 'firstname':
                value = player.firstName;
                break;
              case 'lastname':
                value = player.lastName;
                break;
              case 'email':
                value = player.email;
                break;
              case 'date of birth':
                value = player.birthDate;
                // Format birthDate if it's a date string
                if (value) {
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    value = date.toISOString().split('T')[0];
                  }
                }
                break;
              case 'gender':
                value = player.gender;
                break;
              case 'roles':
                // Convert roles to comma-separated first letters
                if (player.roles && player.roles.length > 0) {
                  value = player.roles.map(role => role.charAt(0)).join(', ');
                } else {
                  value = '';
                }
                break;
              case 'phone':
                value = player.phone || '';
                break;
              case 'address':
                value = player.address || '';
                break;
              case 'rating':
                value = player.rating || '';
                break;
              default:
                value = '';
            }
            
            if (value === null || value === undefined) return '';
            
            // Escape commas and quotes in CSV
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          }).join(',');
        }),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `players_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowExportSelection(false);
      setSelectedPlayersForExport(new Set());
      setSuccess(`Successfully exported ${selectedPlayers.length} player(s)`);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to export players';
      setError(errorMessage);
    }
  };

  const handleImportPlayers = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Filter out empty lines and lines starting with #
      const lines = text.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('#');
      });
      
      if (lines.length < 2) {
        setError('CSV file must have at least a header row and one data row');
        return;
      }

      // Parse CSV (simple parser - handles quoted values)
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++; // Skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const requiredHeaders = ['firstname', 'lastname', 'email'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      // Check for birthdate (can be 'birthdate' or 'date of birth')
      const hasBirthdate = headers.includes('birthdate') || headers.includes('date of birth');
      if (!hasBirthdate) {
        missingHeaders.push('birthdate (or "date of birth")');
      }
      
      if (missingHeaders.length > 0) {
        setError(`Missing required columns: ${missingHeaders.join(', ')}`);
        return;
      }

      // Map headers to player fields
      const players: any[] = [];
      const errors: string[] = [];
      
      lines.slice(1).forEach((line, index) => {
        const values = parseCSVLine(line);
        const player: any = {};
        const rowNumber = index + 2; // Row number (accounting for header row)
        
        headers.forEach((header, i) => {
          const value = values[i]?.trim() || '';
          if (value === '') return;
          
          switch (header) {
            case 'firstname':
              player.firstName = value;
              break;
            case 'lastname':
              player.lastName = value;
              break;
            case 'email':
              player.email = value;
              break;
            case 'date of birth':
            case 'birthdate':
              // Try to parse date
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                player.birthDate = date.toISOString().split('T')[0];
              } else {
                errors.push(`Row ${rowNumber}: Invalid birth date format`);
              }
              break;
            case 'gender':
              const genderUpper = value.toUpperCase();
              if (['MALE', 'FEMALE', 'OTHER'].includes(genderUpper)) {
                player.gender = genderUpper;
              }
              break;
            case 'roles':
              // Parse comma-separated first letters back to full role names
              const roleLetters = value.split(',').map(r => r.trim().toUpperCase());
              const roleMap: { [key: string]: string } = {
                'P': 'PLAYER',
                'C': 'COACH',
                'A': 'ADMIN',
                'O': 'ORGANIZER'
              };
              const roles = roleLetters
                .map(letter => roleMap[letter])
                .filter(role => role !== undefined);
              if (roles.length > 0) {
                player.roles = roles;
              }
              break;
            case 'phone':
              player.phone = value;
              break;
            case 'address':
              player.address = value;
              break;
            case 'rating':
              const rating = parseInt(value);
              if (!isNaN(rating) && rating >= 0 && rating <= 9999) {
                player.rating = rating;
              }
              break;
          }
        });
        
        // Validate required fields
        const rowErrors: string[] = [];
        
        if (!player.firstName || !player.lastName) {
          rowErrors.push(`Row ${rowNumber}: Missing required fields (firstName, lastName)`);
        }
        
        // Validate email (required)
        if (!player.email || !player.email.trim()) {
          rowErrors.push(`Row ${rowNumber}: Email is required`);
        } else {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(player.email.trim())) {
            rowErrors.push(`Row ${rowNumber}: Invalid email format`);
          }
        }
        
        // Validate birthdate (required)
        if (!player.birthDate) {
          rowErrors.push(`Row ${rowNumber}: Birth date is required`);
        }
        
        if (rowErrors.length > 0) {
          errors.push(...rowErrors);
          return; // Skip this player
        }
        
        // Set mustResetPassword to true for all imported players
        player.mustResetPassword = true;
        
        players.push(player);
      });
      
      // If there are validation errors, show them and stop
      if (errors.length > 0) {
        setError(`Import validation errors:\n${errors.join('\n')}`);
        event.target.value = '';
        return;
      }
      
      // Check if we have any valid players
      if (players.length === 0) {
        setError('No valid players to import. Please check your CSV file.');
        event.target.value = '';
        return;
      }

      // Send to backend
      const response = await api.post('/players/import', { players });
      setImportResults(response.data);
      setShowImportResults(true);
      fetchMembers(); // Refresh player list
      
      // Reset file input
      event.target.value = '';
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to import players';
      setError(errorMessage);
      event.target.value = '';
    }
  };

  const handleConfirmAdd = async () => {
    if (!pendingPlayerData) return;

    try {
      const playerData: any = {
        firstName: pendingPlayerData.firstName,
        lastName: pendingPlayerData.lastName,
      };
      
      if (pendingPlayerData.birthDate) {
        playerData.birthDate = pendingPlayerData.birthDate;
      }
      
      if (pendingPlayerData.rating) {
        playerData.rating = pendingPlayerData.rating;
      }

      // Make a second request with a flag to skip similarity check
      await api.post('/players', { ...playerData, skipSimilarityCheck: true });
      setSuccess('Player added successfully');
      setNewPlayerFirstName('');
      setNewPlayerLastName('');
      setNewPlayerBirthDate(null);
      setNewPlayerRating('');
      setNewPlayerEmail('');
      setNewPlayerGender('');
      setNewPlayerPhone('');
      setNewPlayerAddress('');
      setNewPlayerPicture('');
      setShowAddForm(false);
      setShowConfirmation(false);
      setSimilarNames([]);
      setPendingPlayerData(null);
      fetchMembers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to add player';
      setError(errorMessage);
      setShowConfirmation(false);
    }
  };

  const handleCancelAdd = () => {
    setShowConfirmation(false);
    setSimilarNames([]);
    setPendingPlayerData(null);
  };

  const handleModifyName = () => {
    setShowConfirmation(false);
    // Keep the form open with the current values so user can edit
  };

  const handleSort = (column: 'name' | 'rating' | 'age' | 'id' | 'games') => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      localStorage.setItem('players_sortDirection', newDirection);
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection('asc');
      localStorage.setItem('players_sortColumn', column);
      localStorage.setItem('players_sortDirection', 'asc');
    }
  };

  const getSortedPlayers = () => {
    // Use members directly - no conversion needed
    let allData: Member[] = [...members];
    
    // Filter by role: by default show only PLAYER role, unless Admin/Organizer toggles showAllRoles
    if (!showAllRoles) {
      allData = allData.filter(m => m.roles && m.roles.includes('PLAYER'));
    }
    
    // First filter by active status
    // When creating tournaments or matches, always exclude inactive players
    let filtered = (isCreatingTournament || isSelectingForStats) 
      ? allData.filter(p => p.isActive)
      : (showAllPlayers ? allData : allData.filter(p => p.isActive));
    
    // If selecting for history, always include the selected player (even if they don't match filters)
      let selectedPlayerForHistoryData: Member | null = null;
    if (isSelectingForHistory && selectedPlayerForHistory !== null) {
      selectedPlayerForHistoryData = allData.find(p => p.id === selectedPlayerForHistory) || null;
      if (selectedPlayerForHistoryData && !filtered.find(p => p.id === selectedPlayerForHistory)) {
        // Add the selected player to filtered list if not already there
        filtered = [...filtered, selectedPlayerForHistoryData];
      }
    }
    
    // Then filter by name if search term is provided
    if (nameFilter.trim()) {
      const searchTerm = nameFilter.trim().toLowerCase();
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (isSelectingForHistory && p.id === selectedPlayerForHistory) return true;
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const firstNameMatch = p.firstName.toLowerCase().includes(searchTerm);
        const lastNameMatch = p.lastName.toLowerCase().includes(searchTerm);
        const fullNameMatch = fullName.includes(searchTerm);
        return firstNameMatch || lastNameMatch || fullNameMatch;
      });
    }
    
    // Filter by rating range (only if range is provided)
    if (minRating !== '' || maxRating !== '9999') {
      const minRatingNum = minRating === '' ? 0 : parseInt(minRating) || 0;
      const maxRatingNum = maxRating === '' ? 9999 : parseInt(maxRating) || 9999;
      
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (isSelectingForHistory && p.id === selectedPlayerForHistory) return true;
        // When showing all members, allow non-players (those without ratings) to pass through
        if (p.rating === null) {
          return showAllRoles && isAdmin();
        }
        return p.rating >= minRatingNum && p.rating <= maxRatingNum;
      });
    }
    
    // Filter by age range (only if age filters are provided)
    if (minAge !== '' || maxAge !== '') {
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (isSelectingForHistory && p.id === selectedPlayerForHistory) return true;
        const age = calculateAge(p.birthDate);
        // When showing all members, allow non-players (those without birth dates) to pass through
        if (age === null) {
          return showAllRoles && isAdmin();
        }
        
        const minAgeNum = minAge === '' ? 0 : parseInt(minAge) || 0;
        const maxAgeNum = maxAge === '' ? 150 : parseInt(maxAge) || 150; // Reasonable max age
        
        return age >= minAgeNum && age <= maxAgeNum;
      });
    }
    
    // Filter by games count (only if games filters are provided and games column is visible)
    if (showGamesColumn && (minGames !== '' || maxGames !== '')) {
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (isSelectingForHistory && p.id === selectedPlayerForHistory) return true;
        const gamesCount = playerMatchCounts.get(p.id) || 0;
        
        const minGamesNum = minGames === '' ? 0 : parseInt(minGames) || 0;
        const maxGamesNum = maxGames === '' ? 999999 : parseInt(maxGames) || 999999;
        
        return gamesCount >= minGamesNum && gamesCount <= maxGamesNum;
      });
    }
    
    // Filter by roles (only if roles are selected and user is Admin)
    if (selectedRoles.length > 0 && isAdmin()) {
      filtered = filtered.filter(p => {
        // Always include the selected player for history
        if (isSelectingForHistory && p.id === selectedPlayerForHistory) return true;
        // A member should be displayed if they have at least one of the selected roles
        if (!p.roles || p.roles.length === 0) return false;
        return p.roles.some(role => selectedRoles.includes(role));
      });
    }
    
    // Helper function to get comparison value for sorting
    const getComparison = (a: Member, b: Member): number => {
      let comparison = 0;

      if (sortColumn === 'rating') {
        // Sort by rating (null values go to end)
        const ratingA = a.rating ?? -Infinity;
        const ratingB = b.rating ?? -Infinity;
        comparison = ratingA - ratingB;
      } else if (sortColumn === 'name') {
        // When explicitly sorting by name, use display order preference
        if (nameDisplayOrder === 'firstLast') {
          // Sort by first name first, then last name
          const firstNameCompare = a.firstName.localeCompare(b.firstName);
          if (firstNameCompare !== 0) {
            comparison = firstNameCompare;
          } else {
            comparison = a.lastName.localeCompare(b.lastName);
          }
        } else {
          // Sort by last name first, then first name (lastFirst)
          const lastNameCompare = a.lastName.localeCompare(b.lastName);
          if (lastNameCompare !== 0) {
            comparison = lastNameCompare;
          } else {
            comparison = a.firstName.localeCompare(b.firstName);
          }
        }
      } else if (sortColumn === 'age') {
        // Sort by age (null values go to end)
        const ageA = calculateAge(a.birthDate) ?? Infinity;
        const ageB = calculateAge(b.birthDate) ?? Infinity;
        comparison = ageA - ageB;
      } else if (sortColumn === 'id') {
        // Sort by ID (numeric)
        comparison = a.id - b.id;
      } else if (sortColumn === 'games') {
        // Sort by match count (null/zero values go to end)
        const gamesA = playerMatchCounts.get(a.id) ?? 0;
        const gamesB = playerMatchCounts.get(b.id) ?? 0;
        comparison = gamesA - gamesB;
      } else {
        // Default sorting when page first loads: always by last name, then first name
        const lastNameCompare = a.lastName.localeCompare(b.lastName);
        if (lastNameCompare !== 0) {
          comparison = lastNameCompare;
        } else {
          comparison = a.firstName.localeCompare(b.firstName);
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    };

    // If showSelectedFirst is enabled and we're in tournament selection mode, group by selection
    // Note: Stats selection doesn't move selected players to top
    // Note: Tournament creation doesn't move selected players to top (they're shown in info box)
    if (showSelectedFirst && isSelectingForStats) {
      const selectedIds = selectedPlayersForTournament;
      const selectedPlayers = filtered.filter(p => selectedIds.includes(p.id));
      const nonSelectedPlayers = filtered.filter(p => !selectedIds.includes(p.id));
      
      // Sort each group using the existing sorting logic
      const sortedSelected = [...selectedPlayers].sort((a, b) => getComparison(a, b));
      const sortedNonSelected = [...nonSelectedPlayers].sort((a, b) => getComparison(a, b));
      
      // Return selected players first, then non-selected players
      return [...sortedSelected, ...sortedNonSelected];
    }

    // Default sorting behavior
    return [...filtered].sort((a, b) => getComparison(a, b));
  };

  const handleToggleActiveClick = (playerId: number, isActive: boolean, playerName: string) => {
    setPendingActiveToggle({ playerId, isActive, playerName });
    setShowActiveConfirmation(true);
  };

  const handleConfirmToggleActive = async () => {
    if (!pendingActiveToggle) return;
    
    setShowActiveConfirmation(false);
    setError('');
    setSuccess('');

    try {
      const endpoint = pendingActiveToggle.isActive ? 'deactivate' : 'activate';
      await api.patch(`/players/${pendingActiveToggle.playerId}/${endpoint}`);
      setSuccess(`Player ${pendingActiveToggle.isActive ? 'deactivated' : 'reactivated'} successfully`);
      fetchMembers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update player');
    } finally {
      setPendingActiveToggle(null);
    }
  };

  const handleCancelToggleActive = () => {
    setShowActiveConfirmation(false);
    setPendingActiveToggle(null);
  };

  const handleStartEdit = async (memberId: number) => {
    // Don't allow editing if in special modes
    if (isCreatingTournament || isSelectingForStats || isSelectingForHistory || isOrganizingBracket) {
      return;
    }
    
    try {
      // First, check if member is already in the members list (cached)
      let member = members.find(m => m.id === memberId);
      
      // If not in cache, fetch from API (e.g., non-players when showing only players)
      if (!member) {
        const response = await api.get(`/players/${memberId}`);
        
        // Check if response exists and has data
        if (!response) {
          setError(`Failed to fetch member ${memberId}: No response from server`);
          return;
        }
        
        if (!response.data) {
          setError(`Failed to fetch member ${memberId}: Response data is null or undefined`);
          return;
        }
        
        member = response.data;
        
        // Validate member object
        if (!member || typeof member !== 'object') {
          setError(`Failed to fetch member ${memberId}: Invalid data format received`);
          return;
        }
        
        if (!member.id) {
          setError(`Failed to fetch member ${memberId}: Member data missing id field`);
          return;
        }
        
        if (member.id !== memberId) {
          setError(`Failed to fetch member ${memberId}: Response id mismatch (got ${member.id})`);
          return;
        }
      }
      
      setEditingPlayerId(member.id);
      setEditFirstName(member.firstName || '');
      setEditLastName(member.lastName || '');
      setEditEmail(member.email || '');
      setEditGender(member.gender || '');
      setEditBirthDate(member.birthDate ? new Date(member.birthDate) : null);
      setEditPhone(member.phone || '');
      setEditAddress(member.address || '');
      setEditPicture(member.picture || '');
      setEditIsActive(member.isActive !== undefined ? member.isActive : true);
      setEditRoles(member.roles || []);
      setEditRating(member.rating !== null && member.rating !== undefined ? String(member.rating) : '');
      
      // Check if member can be deleted (Admin only)
      const currentMember = getMember();
      const isAdminUser = currentMember && currentMember.roles && currentMember.roles.includes('ADMIN');
      if (isAdminUser) {
        try {
          const deleteCheckResponse = await api.get(`/players/${member.id}/can-delete`);
          setCanDeleteMember(deleteCheckResponse.data.canDelete);
        } catch (err) {
          // If check fails, assume cannot delete
          setCanDeleteMember(false);
        }
      } else {
        setCanDeleteMember(false);
      }
    } catch (err: unknown) {
      // Provide detailed error information
      const error = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      
      let errorMessage = `Failed to fetch member ${memberId}`;
      
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = `Member ${memberId} not found`;
        } else if (error.response.status === 403) {
          errorMessage = `Access denied: ${error.response.data?.error || 'Permission denied'}`;
        } else if (error.response.data?.error) {
          errorMessage = `Error fetching member ${memberId}: ${error.response.data.error}`;
        } else {
          errorMessage = `Error fetching member ${memberId}: HTTP ${error.response.status}`;
        }
      } else if (error.message) {
        errorMessage = `Error fetching member ${memberId}: ${error.message}`;
      }
      
      setError(errorMessage);
    }
  };

  const handleDeleteMember = async () => {
    if (!editingPlayerId) return;
    
    try {
      await api.delete(`/players/${editingPlayerId}`);
      setSuccess('Member deleted successfully');
      setShowDeleteConfirm(false);
      handleCancelEdit();
      fetchMembers(); // Refresh the list
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to delete member';
      setError(errorMessage);
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingPlayerId(null);
    setEditFirstName('');
    setEditLastName('');
    setEditEmail('');
    setEditGender('');
    setEditBirthDate(null);
    setEditPhone('');
    setEditAddress('');
    setEditPicture('');
    setEditIsActive(true);
    setEditRoles([]);
    setEditRating('');
    setShowPasswordChange(false);
    setCurrentPassword('');
    setNewPassword('');
    setCanDeleteMember(false);
    setShowDeleteConfirm(false);
    setConfirmPassword('');
    setShowPasswordReset(false);
    setResetPassword('');
    // Clear editOwnProfile state if it exists to prevent re-triggering
    if (location.state?.editOwnProfile) {
      navigate('/players', { 
        state: { ...location.state, editOwnProfile: false },
        replace: true 
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPlayerId) return;

    setError('');
    setSuccess('');

    const currentMember = getMember();
    const isAdminUser = currentMember && currentMember.roles && currentMember.roles.includes('ADMIN');
    const isEditingSelf = currentMember && currentMember.id === editingPlayerId;

    // Validate permissions
    if (!isAdminUser && !isEditingSelf) {
      setError('You can only edit your own profile');
      return;
    }

    try {
      const updateData: any = {};
      
      if (isAdminUser) {
        // Admin can edit all fields
        if (!editGender) {
          setError('Please select a gender');
          return;
        }
        updateData.firstName = editFirstName.trim();
        updateData.lastName = editLastName.trim();
        updateData.gender = editGender;
        updateData.birthDate = editBirthDate ? editBirthDate.toISOString().split('T')[0] : null;
        
        if (editRating.trim() === '') {
          updateData.rating = null;
        } else {
          const ratingNum = parseInt(editRating);
          if (!isNaN(ratingNum) && ratingNum >= 0 && ratingNum <= 9999) {
            updateData.rating = ratingNum;
          } else {
            setError('Rating must be between 0 and 9999');
            return;
          }
        }
        updateData.isActive = editIsActive;
        updateData.roles = editRoles;
      } else {
        // Regular member can only edit: email, phone, address, picture
        // Name, gender, birthDate, rating, roles, isActive are restricted
      }
      
      // Both admin and regular members can edit these fields
      updateData.email = editEmail.trim();
      updateData.phone = editPhone.trim() || null;
      updateData.address = editAddress.trim() || null;
      updateData.picture = editPicture.trim() || null;

      await api.patch(`/players/${editingPlayerId}`, updateData);
      setSuccess('Member updated successfully');
      // Clear editOwnProfile state if it exists before calling handleCancelEdit
      if (location.state?.editOwnProfile) {
        navigate('/players', { 
          state: { ...location.state, editOwnProfile: false },
          replace: true 
        });
      }
      handleCancelEdit(); // This will set editingPlayerId to null and clear all form fields
      fetchMembers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update member');
    }
  };

  const handleChangePassword = async () => {
    if (!editingPlayerId) return;

    setError('');
    setSuccess('');

    // Validate passwords
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All password fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    try {
      await api.post('/auth/member/change-password', {
        currentPassword,
        newPassword,
      });
      setSuccess('Password changed successfully');
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change password');
    }
  };

  const handleResetPassword = async () => {
    if (!editingPlayerId) return;

    setError('');
    setSuccess('');

    // If resetPassword is provided, validate it; otherwise use default 'changeme'
    if (resetPassword && resetPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      await api.post(`/auth/member/${editingPlayerId}/reset-password`, {
        newPassword: resetPassword || undefined, // If empty, backend will use 'changeme'
      });
      setSuccess('Password reset successfully');
      setShowPasswordReset(false);
      setResetPassword('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleClearFilters = () => {
    setNameFilter('');
    setMinRating('');
    setMaxRating('9999');
    setMinAge('');
    setMaxAge('');
    setMinGames('');
    setMaxGames('');
    setSelectedRoles([]);
    // Clear sticky filters from localStorage
    localStorage.removeItem('players_nameFilter');
    localStorage.removeItem('players_minRating');
    localStorage.removeItem('players_maxRating');
    localStorage.removeItem('players_minAge');
    localStorage.removeItem('players_maxAge');
    localStorage.removeItem('players_minGames');
    localStorage.removeItem('players_maxGames');
    localStorage.removeItem('players_selectedRoles');
  };

  const hasActiveFilters = () => {
    return nameFilter.trim() !== '' || minRating !== '' || maxRating !== '9999' || minAge !== '' || maxAge !== '' || minGames !== '' || maxGames !== '' || selectedRoles.length > 0;
  };

  // Calculate expected number of matches for round-robin tournament
  const getExpectedMatches = (participantCount: number): number => {
    return participantCount * (participantCount - 1) / 2;
  };

  // Build preview matrix for tournament confirmation (unused, kept for potential future use)
  // const buildPreviewMatrix = (selectedPlayerIds: number[]) => {
  //   const selectedPlayersList = players.filter(p => selectedPlayerIds.includes(p.id));
  //   const matrix: { [key: number]: { [key: number]: string } } = {};
  //   
  //   selectedPlayersList.forEach(p1 => {
  //     matrix[p1.id] = {};
  //     selectedPlayersList.forEach(p2 => {
  //       if (p1.id === p2.id) {
  //         matrix[p1.id][p2.id] = '-';
  //       } else {
  //         matrix[p1.id][p2.id] = '';
  //       }
  //     });
  //   });

  //   return { participants: selectedPlayersList, matrix };
  // };

  // Split players into groups based on desired size per tournament
  const splitPlayersIntoGroups = (
    selectedPlayerIds: number[],
    desiredSize: number
  ): number[][] => {
    // Get players sorted by ranking (higher rating = better ranking, sorted descending)
    const selectedPlayersList = members
      .filter(p => selectedPlayerIds.includes(p.id))
      .map(p => ({
        ...p,
        ranking: playerRankings.get(p.id) ?? 99999, // Higher ranking number = worse
        rating: p.rating ?? 0,
      }))
      .sort((a, b) => {
        // Sort by ranking (ascending - rank 1 first), then by rating (descending)
        if (a.ranking !== b.ranking) return a.ranking - b.ranking;
        return b.rating - a.rating;
      });

    const totalPlayers = selectedPlayersList.length;
    if (totalPlayers === 0) return [];

    // Calculate how many tournaments we need
    const numTournaments = Math.ceil(totalPlayers / desiredSize);
    
    // Calculate base size and remainder for even distribution
    const baseSize = Math.floor(totalPlayers / numTournaments);
    const remainder = totalPlayers % numTournaments;
    
    // Create groups
    const groups: number[][] = [];
    let playerIndex = 0;

    for (let i = 0; i < numTournaments; i++) {
      // Distribute remainder players to first tournaments
      const tournamentSize = i < remainder ? baseSize + 1 : baseSize;
      const tournamentPlayers = selectedPlayersList
        .slice(playerIndex, playerIndex + tournamentSize)
        .map(p => p.id);
      
      groups.push(tournamentPlayers);
      playerIndex += tournamentSize;
      
      if (playerIndex >= totalPlayers) break;
    }

    return groups;
  };

  // Move a player from one group to another
  const movePlayerToGroup = (playerId: number, fromGroupIndex: number, toGroupIndex: number) => {
    // Disable during single match confirmation phase only
    if (showSingleMatchConfirmation) {
      return;
    }
    
    const newGroups = [...playerGroups];
    
    // Remove player from source group
    newGroups[fromGroupIndex] = newGroups[fromGroupIndex].filter(id => id !== playerId);
    
    // Add player to target group
    if (!newGroups[toGroupIndex]) {
      newGroups[toGroupIndex] = [];
    }
    newGroups[toGroupIndex].push(playerId);
    
    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);
    
    setPlayerGroups(filteredGroups);
  };

  // Track last recalc key to avoid recalculating when manually moving players
  const lastRecalcKeyRef = useRef<string>('');
  
  // Check if we should restore scroll when location changes
  useEffect(() => {
    const shouldRestore = location.state?.restoreScroll === true;
    const savedPosition = getScrollPosition('/players');
    
    shouldRestoreScrollRef.current = shouldRestore && savedPosition !== null && savedPosition > 0;
    savedScrollPositionRef.current = savedPosition;
    
    if (!shouldRestore && !savedPosition) {
      // If navigating directly (no state and no saved position), scroll to top
      if (tableScrollRef.current) {
        tableScrollRef.current.scrollTop = 0;
      }
    }
  }, [location]);
  
  // Restore scroll position when table is ready and data is loaded
  useEffect(() => {
    if (!shouldRestoreScrollRef.current || !savedScrollPositionRef.current) {
      return;
    }
    
    const restoreScroll = () => {
      if (tableScrollRef.current && !loading) {
        const scrollHeight = tableScrollRef.current.scrollHeight;
        const clientHeight = tableScrollRef.current.clientHeight;
        const savedPosition = savedScrollPositionRef.current;
        
        // Only restore if the scroll position is valid (not beyond content)
        if (savedPosition !== null && scrollHeight > savedPosition && savedPosition <= scrollHeight - clientHeight + 100) {
          if (tableScrollRef.current) {
            tableScrollRef.current.scrollTop = savedPosition;
          }
          shouldRestoreScrollRef.current = false; // Mark as restored
          return true;
        }
      }
      return false;
    };
    
    // Try to restore immediately
    restoreScroll();
  }, [loading, members.length]); // Restore when loading completes or players data changes
  
  // Measure header height for sticky positioning of selected player row
  useEffect(() => {
    const measureHeader = () => {
      if (tableHeaderRef.current) {
        const height = tableHeaderRef.current.offsetHeight;
        if (height > 0) {
          setHeaderHeight(height);
        }
      }
    };
    
    // Measure immediately
    measureHeader();
    
    // Use ResizeObserver to track header height changes
    let resizeObserver: ResizeObserver | null = null;
    if (tableHeaderRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureHeader();
      });
      resizeObserver.observe(tableHeaderRef.current);
    }
    
    // Also measure after delays to account for dynamic content
    const timeout1 = setTimeout(measureHeader, 100);
    const timeout2 = setTimeout(measureHeader, 500);
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [isSelectingForHistory, showIdColumn, showAgeColumn, showGamesColumn, isCreatingTournament, isSelectingForStats, members.length]);
  
  // Save scroll position periodically while scrolling
  useEffect(() => {
    const scrollContainer = tableScrollRef.current;
    if (!scrollContainer) return;
    
    const handleScroll = () => {
      saveScrollPosition('/players', scrollContainer.scrollTop);
    };
    
    scrollContainer.addEventListener('scroll', handleScroll);
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  // Recalculate player groups when multi-tournament mode, selected players, or desired size changes
  useEffect(() => {
    if (!isMultiTournamentMode) {
      setPlayerGroups([]);
      lastRecalcKeyRef.current = '';
      return;
    }

    if (selectedPlayersForTournament.length === 0) {
      setPlayerGroups([]);
      lastRecalcKeyRef.current = '';
      return;
    }

    const desiredSize = parseInt(playersPerTournament) || 5;
    if (desiredSize < 3 || desiredSize > 99) {
      setPlayerGroups([]);
      lastRecalcKeyRef.current = '';
      return;
    }

    // Create a key to detect if we need to recalculate
    const sortedPlayerIds = [...selectedPlayersForTournament].sort((a, b) => a - b);
    const currentKey = `${sortedPlayerIds.join(',')}-${desiredSize}`;
    
    // Only recalculate if the key changed (selection or size changed) or if groups are empty
    // This preserves manual grouping changes when just moving players
    if (currentKey !== lastRecalcKeyRef.current || playerGroups.length === 0) {
      const groups = splitPlayersIntoGroups(selectedPlayersForTournament, desiredSize);
      setPlayerGroups(groups);
      lastRecalcKeyRef.current = currentKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiTournamentMode, selectedPlayersForTournament, playersPerTournament]);

  // Close move menu when clicking outside

  const handleStartTournamentCreation = () => {
    setIsCreatingTournament(true);
    setTournamentCreationStep('type_selection');
    setSelectedPlayersForTournament([]);
    setTournamentName('');
    setTournamentType('ROUND_ROBIN');
    setIsMultiTournamentMode(false);
    setShowSingleMatchConfirmation(false);
  };

  const handleStartMatchCreation = () => {
    setSelectedPlayersForTournament([]);
    setTournamentType('SINGLE_MATCH');
    setShowSingleMatchConfirmation(false);
    // Don't set isCreatingTournament - match creation is independent
  };

  const handleCancelMatchCreation = () => {
    setSelectedPlayersForTournament([]);
    setTournamentType('ROUND_ROBIN');
    setShowSingleMatchConfirmation(false);
  };

  const handleCancelTournamentCreation = () => {
    // Navigate back through steps
    if (tournamentCreationStep === 'type_selection') {
    setIsCreatingTournament(false);
    setSelectedPlayersForTournament([]);
    setTournamentName('');
      setTournamentType('ROUND_ROBIN');
      setIsMultiTournamentMode(false);
      setShowSingleMatchConfirmation(false);
    setShowTournamentConfirmation(false);
      setShowCancelConfirmation(false);
      setPlayerGroups([]);
    setIsOrganizingBracket(false);
    setBracketPositions([]);
      setNumSeedsForBracket(undefined);
    } else if (tournamentCreationStep === 'player_selection') {
      setTournamentCreationStep('type_selection');
    } else if (tournamentCreationStep === 'rearrange') {
      setTournamentCreationStep('player_selection');
    } else if (tournamentCreationStep === 'organize_bracket') {
      setTournamentCreationStep('player_selection');
    } else if (tournamentCreationStep === 'completion') {
      setTournamentCreationStep('organize_bracket');
    } else if (tournamentCreationStep === 'confirmation') {
      if (isMultiTournamentMode) {
        setTournamentCreationStep('rearrange');
      } else {
        setTournamentCreationStep('player_selection');
      }
    }
  };

  const handleConfirmCancelTournament = () => {
    setShowCancelConfirmation(false);
    setIsCreatingTournament(false);
    setSelectedPlayersForTournament([]);
    setTournamentName('');
    setShowTournamentConfirmation(false);
    setIsOrganizingBracket(false);
    setBracketPositions([]);
    setIsMultiTournamentMode(false);
    setShowSingleMatchConfirmation(false);
    setTournamentType('ROUND_ROBIN');
  };

  const handleCancelCancelTournament = () => {
    setShowCancelConfirmation(false);
  };

  const handleTogglePlayerForTournament = (playerId: number) => {
    // Disable selection during confirmation phase
    if (showTournamentConfirmation || showSingleMatchConfirmation) {
      return;
    }
    
    // Ensure player is active before allowing selection
    const player = members.find(p => p.id === playerId);
    if (!player || !player.isActive) {
      setError('Only active players can be selected for tournaments or matches.');
      return;
    }
    
    if (selectedPlayersForTournament.includes(playerId)) {
      setSelectedPlayersForTournament(selectedPlayersForTournament.filter(id => id !== playerId));
      setShowSingleMatchConfirmation(false);
    } else {
      // For Single Match, only allow 2 players
      if (tournamentType === 'SINGLE_MATCH' && selectedPlayersForTournament.length >= 2) {
        setError('Single Match can only have 2 players. Please deselect a player first.');
        return;
      }
      
      const newSelection = [...selectedPlayersForTournament, playerId];
      setSelectedPlayersForTournament(newSelection);
      
      // For Single Match, show confirmation after 2nd player is selected
      if (tournamentType === 'SINGLE_MATCH' && newSelection.length === 2) {
        setShowSingleMatchConfirmation(true);
      }
    }
  };

  // Generate initial bracket positions for PLAYOFF tournaments
  const [numSeedsForBracket, setNumSeedsForBracket] = useState<number | undefined>(undefined);

  // Calculate max number of seeded players: 
  // 1. Find first power of 2 >= numPlayers
  // 2. Divide by 4
  // 3. Take max(2, that number)
  // Returns all powers of 2 <= the calculated max (including 0 for random)
  const calculateMaxSeeds = (numPlayers: number): number => {
    // Find first power of 2 >= numPlayers
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
    // Divide by 4
    const quarterSize = bracketSize / 4;
    // Take max(2, quarterSize)
    return Math.max(2, quarterSize);
  };


  const handleOrganizeBracket = async () => {
    if (tournamentType !== 'PLAYOFF') return;
    if (selectedPlayersForTournament.length < 4) {
      setError('Select at least 4 players for the tournament');
      return;
    }

    try {
      setTournamentCreationStep('organize_bracket');
      setIsOrganizingBracket(true);
      
      // Calculate seeds automatically using the new formula
      // If not already set, use the calculated max seeds
      if (numSeedsForBracket === undefined) {
        const calculatedMaxSeeds = calculateMaxSeeds(selectedPlayersForTournament.length);
        setNumSeedsForBracket(calculatedMaxSeeds);
      }
      const numSeeds = numSeedsForBracket ?? calculateMaxSeeds(selectedPlayersForTournament.length);

      // Call server to generate bracket positions using server-side algorithm
      const response = await api.post('/tournaments/preview-bracket', {
        participantIds: selectedPlayersForTournament,
        numSeeds: numSeeds,
      });
      
      setBracketPositions(response.data.bracketPositions);
    } catch (error: any) {
      setError('Failed to generate bracket. Please try again.');
    }
  };

  const handleReseedBracket = async (numSeeds: number) => {
    setNumSeedsForBracket(numSeeds);
    
    if (tournamentType !== 'PLAYOFF' || selectedPlayersForTournament.length < 2) {
      return;
    }

    try {
      const response = await api.post('/tournaments/preview-bracket', {
        participantIds: selectedPlayersForTournament,
        numSeeds: numSeeds,
      });
      
      setBracketPositions(response.data.bracketPositions);
    } catch (error: any) {
      setError('Failed to generate bracket preview. Please try again.');
    }
  };

  const handleShowTournamentConfirmation = () => {
    if (tournamentType === 'SINGLE_MATCH') {
      if (selectedPlayersForTournament.length !== 2) {
        setError('Single Match requires exactly 2 players');
        return;
      }
      setShowSingleMatchConfirmation(true);
      return;
    }
    
    if (tournamentType === 'PLAYOFF') {
      if (!isOrganizingBracket) {
        setError('Please organize the bracket first');
        return;
      }
    }
    
    if (selectedPlayersForTournament.length < 2) {
      setError('Select at least 2 players for the tournament');
      return;
    }
    setShowTournamentConfirmation(true);
  };

  const handleFinishPlayerSelection = () => {
    if (tournamentType === 'ROUND_ROBIN') {
      const minPlayers = isMultiTournamentMode ? 3 : 3;
      if (selectedPlayersForTournament.length < minPlayers) {
        setError(`Select at least ${minPlayers} players`);
        return;
      }
      if (isMultiTournamentMode) {
        setTournamentCreationStep('rearrange');
      } else {
        setTournamentCreationStep('confirmation');
      }
    } else if (tournamentType === 'PLAYOFF') {
      if (selectedPlayersForTournament.length < 4) {
        setError('Select at least 4 players for Playoff tournament');
        return;
      }
      // Seeds will be calculated automatically when organizing brackets
      // Organize bracket will be handled by handleOrganizeBracket
    }
  };

  const handleCreateTournament = async () => {
    setError('');
    setSuccess('');

    // Validate based on tournament type
    if (tournamentType === 'SINGLE_MATCH') {
      if (selectedPlayersForTournament.length !== 2) {
        setError('Single Match requires exactly 2 players');
        return;
      }
    } else if (selectedPlayersForTournament.length < 2) {
      setError('Select at least 2 players');
      return;
    }

    try {
      // Multi-tournament mode only works for ROUND_ROBIN tournaments, not PLAYOFF
      if (isMultiTournamentMode && tournamentType === 'ROUND_ROBIN') {
        if (playerGroups.length === 0) {
          setError('No tournament groups defined. Please adjust the player groupings.');
          return;
        }

        // Validate all groups have at least 2 players
        const invalidGroups = playerGroups.filter(group => group.length < 2);
        if (invalidGroups.length > 0) {
          setError('Each tournament must have at least 2 players. Please adjust the groupings.');
          return;
        }

        const dateStr = new Date().toLocaleDateString();
        const baseName = tournamentName.trim() || `Tournament ${dateStr}`;
        const tournamentsData = playerGroups.map((group, index) => ({
          name: `${baseName}-${index + 1}`,
          participantIds: group,
          type: 'ROUND_ROBIN',
        }));

        await api.post('/tournaments/bulk', { tournaments: tournamentsData });
        setSuccess(`Successfully created ${playerGroups.length} tournament${playerGroups.length !== 1 ? 's' : ''}`);
      } else {
        const tournamentData: any = {
          participantIds: selectedPlayersForTournament,
          type: tournamentType,
        };
        
        // For PLAYOFF tournaments, include bracketPositions if available
        // Validate that all selected players are in bracketPositions
        if (tournamentType === 'PLAYOFF' && bracketPositions.length > 0) {
          // Verify all selected players are present in bracketPositions
          const playersInBracket = bracketPositions.filter((id): id is number => id !== null);
          const missingPlayers = selectedPlayersForTournament.filter(id => !playersInBracket.includes(id));
          
          if (missingPlayers.length > 0) {
            setError(`Some players are missing from the bracket. Please reorganize the bracket.`);
            return;
          }
          
          tournamentData.bracketPositions = bracketPositions;
        }
        
        // Auto-generate name if not provided
        if (!tournamentName.trim()) {
          const dateStr = new Date().toLocaleDateString();
          if (tournamentType === 'SINGLE_MATCH') {
            const player1 = members.find(p => p.id === selectedPlayersForTournament[0]);
            const player2 = members.find(p => p.id === selectedPlayersForTournament[1]);
            if (player1 && player2) {
              tournamentData.name = `${player1.firstName} ${player1.lastName} vs ${player2.firstName} ${player2.lastName} - ${dateStr}`;
            } else {
              tournamentData.name = `Match - ${dateStr}`;
            }
          } else if (tournamentType === 'PLAYOFF') {
            tournamentData.name = `Playoff ${dateStr}`;
          } else if (tournamentType === 'ROUND_ROBIN') {
            tournamentData.name = `Tournament ${dateStr}`;
          }
        } else {
          tournamentData.name = tournamentName.trim();
        }

        const response = await api.post('/tournaments', tournamentData);
        setSuccess('Tournament created successfully');
      }
      
      // Reset tournament creation state
      setIsCreatingTournament(false);
      setTournamentCreationStep('type_selection');
      setSelectedPlayersForTournament([]);
      setTournamentName('');
      setTournamentType('ROUND_ROBIN');
      setIsMultiTournamentMode(false);
      setShowSingleMatchConfirmation(false);
      setShowTournamentConfirmation(false);
      setPlayerGroups([]);
      setIsOrganizingBracket(false);
      setBracketPositions([]);
      setNumSeedsForBracket(undefined);
      fetchMembers(); // Refresh players to get updated data
      
      // Navigate to tournaments page
      setTimeout(() => {
        navigate('/tournaments');
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create tournament(s)');
    }
  };

  const handleStartStatsSelection = () => {
    setIsSelectingForStats(true);
    setSelectedPlayersForStats([]);
  };

  const handleCancelStatsSelection = () => {
    setIsSelectingForStats(false);
    setSelectedPlayersForStats([]);
  };

  const handleTogglePlayerForStats = (playerId: number) => {
    if (selectedPlayersForStats.includes(playerId)) {
      setSelectedPlayersForStats(selectedPlayersForStats.filter(id => id !== playerId));
    } else {
      setSelectedPlayersForStats([...selectedPlayersForStats, playerId]);
    }
  };

  const handleViewStatistics = () => {
    if (selectedPlayersForStats.length === 0) {
      setError('Please select at least one player to view statistics');
      return;
    }
    // Save scroll position before navigating
    if (tableScrollRef.current) {
      saveScrollPosition('/players', tableScrollRef.current.scrollTop);
    }
    navigate('/statistics', { state: { playerIds: selectedPlayersForStats } });
  };

  const handleCancelHistorySelection = () => {
    setIsSelectingForHistory(false);
    setSelectedPlayerForHistory(null);
    setSelectedOpponentsForHistory([]);
  };

  const handleSelectPlayerForHistory = (playerId: number) => {
    setSelectedPlayerForHistory(playerId);
    // Remove from opponents if it was there
    setSelectedOpponentsForHistory(prev => prev.filter(id => id !== playerId));
    // By default, select all other players as opponents
    const allOtherPlayerIds = members
      .filter(p => p.id !== playerId)
      .map(p => p.id);
    setSelectedOpponentsForHistory(allOtherPlayerIds);
    // Set mode based on whether opponents will be selected
    setLastHistorySelectionMode(allOtherPlayerIds.length > 0 ? 'againstPlayers' : 'ratingHistory');
  };

  const handleClearAllHistorySelections = () => {
    setSelectedOpponentsForHistory([]);
    setLastHistorySelectionMode('ratingHistory');
  };

  const handleSelectAllHistoryOpponents = () => {
    if (selectedPlayerForHistory === null) return;
    
    // Get all visible players (matching current filters) except the selected player
    const visiblePlayers = getSortedPlayers().filter(p => p.id !== selectedPlayerForHistory);
    const visiblePlayerIds = visiblePlayers.map(p => p.id);
    
    // Select all visible players as opponents
    setSelectedOpponentsForHistory(visiblePlayerIds);
    setLastHistorySelectionMode(visiblePlayerIds.length > 0 ? 'againstPlayers' : 'ratingHistory');
  };

  const handleToggleOpponentForHistory = (playerId: number) => {
    if (playerId === selectedPlayerForHistory) {
      return; // Can't select the main player as opponent
    }
    if (selectedOpponentsForHistory.includes(playerId)) {
      setSelectedOpponentsForHistory(selectedOpponentsForHistory.filter(id => id !== playerId));
    } else {
      setSelectedOpponentsForHistory([...selectedOpponentsForHistory, playerId]);
    }
  };

  const handleViewHistory = () => {
    if (selectedPlayerForHistory === null) {
      setError('Please select a player to view history');
      return;
    }
    // Allow viewing history with or without opponents
    // If no opponents selected, show full rating history
    // If opponents selected, show match history
    // Save scroll position before navigating
    if (tableScrollRef.current) {
      saveScrollPosition('/players', tableScrollRef.current.scrollTop);
    }
    navigate('/history', { 
      state: { 
        playerId: selectedPlayerForHistory, 
        opponentIds: selectedOpponentsForHistory.length > 0 ? selectedOpponentsForHistory : []
      } 
    });
  };

  const handleQuickViewStats = (playerId: number) => {
    setSelectedPlayersForStats([playerId]);
    // Save scroll position before navigating
    if (tableScrollRef.current) {
      saveScrollPosition('/players', tableScrollRef.current.scrollTop);
    }
    navigate('/statistics', { state: { playerIds: [playerId] } });
  };

  const handleQuickViewHistory = (playerId: number) => {
    setSelectedPlayerForHistory(playerId);
    // Pre-select all other players as opponents
    const allOtherPlayerIds = members
      .filter(p => p.id !== playerId)
      .map(p => p.id);
    setSelectedOpponentsForHistory(allOtherPlayerIds);
    setLastHistorySelectionMode('againstPlayers');
    setIsSelectingForHistory(true);
  };

  // Calculate age from birth date
  const calculateAge = (birthDate: string | null): number | null => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Compute filtered members based on all active filters
  const filteredPlayers = useMemo(() => {
    // Use members directly - no conversion needed
    let allData: Member[] = [...members];
    
    // Filter by role: by default show only PLAYER role, unless Admin/Organizer toggles showAllRoles
    if (!showAllRoles) {
      allData = allData.filter(m => m.roles && m.roles.includes('PLAYER'));
    }
    
    let filtered = showAllPlayers ? allData : allData.filter(p => p.isActive);
    
    if (nameFilter.trim()) {
      const searchTerm = nameFilter.trim().toLowerCase();
      filtered = filtered.filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const firstNameMatch = p.firstName.toLowerCase().includes(searchTerm);
        const lastNameMatch = p.lastName.toLowerCase().includes(searchTerm);
        const fullNameMatch = fullName.includes(searchTerm);
        return firstNameMatch || lastNameMatch || fullNameMatch;
      });
    }
    
    if (minRating !== '' || maxRating !== '9999') {
      const minRatingNum = minRating === '' ? 0 : parseInt(minRating) || 0;
      const maxRatingNum = maxRating === '' ? 9999 : parseInt(maxRating) || 9999;
      filtered = filtered.filter(p => {
        // When showing all members, allow non-players (those without ratings) to pass through
        if (p.rating === null) {
          return showAllRoles && isAdmin();
        }
        return p.rating >= minRatingNum && p.rating <= maxRatingNum;
      });
    }
    
    if (minAge !== '' || maxAge !== '') {
      filtered = filtered.filter(p => {
        const age = calculateAge(p.birthDate);
        // When showing all members, allow non-players (those without birth dates) to pass through
        if (age === null) {
          return showAllRoles && isAdmin();
        }
        const minAgeNum = minAge === '' ? 0 : parseInt(minAge) || 0;
        const maxAgeNum = maxAge === '' ? 150 : parseInt(maxAge) || 150;
        return age >= minAgeNum && age <= maxAgeNum;
      });
    }
    
    // Filter by roles (only if roles are selected and user is Admin)
    if (selectedRoles.length > 0 && isAdmin()) {
      filtered = filtered.filter(p => {
        // A member should be displayed if they have at least one of the selected roles
        if (!p.roles || p.roles.length === 0) return false;
        return p.roles.some(role => selectedRoles.includes(role));
      });
    }
    
    return filtered;
  }, [members, showAllRoles, nameFilter, minRating, maxRating, minAge, maxAge, showAllPlayers, selectedRoles]);

  if (loading) {
    return <div className="card">Loading...</div>;
  }

  return (
    <div>
      <div className="card">
        {/* Sticky header section */}
        <div style={{ 
          position: 'sticky', 
          top: 0, 
          backgroundColor: 'white', 
          zIndex: 100,
          paddingTop: '6px',
          paddingBottom: '8px',
          marginTop: '-10px',
          marginBottom: '6px',
          borderBottom: '2px solid #ddd',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto' }}>
            {!isCreatingTournament && !showAddForm && !isSelectingForStats && !isSelectingForHistory && (
              <button
                onClick={() => {
                  const newState = !filtersCollapsed;
                  setFiltersCollapsed(newState);
                  localStorage.setItem('players_filtersCollapsed', String(newState));
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '13px',
                  backgroundColor: '#e8e8e8',
                  color: '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  minWidth: '32px'
                }}
                title={filtersCollapsed ? 'Expand filters' : 'Collapse filters'}
              >
                {filtersCollapsed ? '▼' : '▲'}
              </button>
            )}
            {!isCreatingTournament && showAddForm && (
                  <button 
                onClick={() => setShowAddForm(false)}
                    style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: '#95a5a6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                  cursor: 'pointer',
                    }}
                  >
                Cancel
                  </button>
                )}
          </div>
          {!isCreatingTournament && !showAddForm && !isSelectingForStats && !isSelectingForHistory && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 auto', justifyContent: 'center' }}>
              {(() => {
                const buttonStyle: React.CSSProperties = {
                  padding: '5px 10px',
                      fontSize: '13px',
                  fontWeight: 'bold',
                  backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                };
                
                const hasAdminButton = isAdmin();
                const hasOrganizerButtons = isUserOrganizer;
                const hasButtonsBeforeSeparator = hasAdminButton || hasOrganizerButtons;
                
                return (
                  <>
                    {hasAdminButton && (
                      <button 
                        onClick={() => setShowAddForm(true)}
                        className="button-3d"
                        style={buttonStyle}
                        title="Add new player"
                      >
                        + Player
                  </button>
                )}
                    {hasOrganizerButtons && (
                      <>
                  <button 
                    onClick={handleStartTournamentCreation}
                          className="button-3d"
                          style={buttonStyle}
                          title="Create tournament"
                        >
                          + Tournament
                  </button>
                  <button 
                    onClick={handleStartMatchCreation}
                          className="button-3d"
                          style={buttonStyle}
                          title="Create match"
                        >
                          + Match
                  </button>
                      </>
                    )}
                    {hasButtonsBeforeSeparator && (
                      <span style={{ color: '#666', fontSize: '16px', margin: '0 4px', fontWeight: 'bold' }}>|</span>
                    )}
                    <button 
                      onClick={handleStartStatsSelection}
                      className="button-3d"
                      style={buttonStyle}
                      title="Show statistics for many players"
                      aria-label="Show statistics for many players"
                    >
                      Stats
                  </button>
                  </>
                );
              })()}
            </div>
          )}
          {!isCreatingTournament && !showAddForm && !isSelectingForStats && !isSelectingForHistory && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
              <button
                onClick={async () => {
                  // Clear all caches
                  membersCache.data = null;
                  membersCache.lastFetch = 0;
                  matchesCache.data = null;
                  matchesCache.lastFetch = 0;
                  matchCountsCache.clear();
                  
                  // Refetch everything
                  await fetchMembers();
                  await fetchMatches();
                  if (showAllRoles && isAdmin()) {
                    await fetchMembers();
                  }
                }}
                className="button-filter"
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Refresh all data from server"
              >
                ↻
              </button>
            </div>
          )}
        </div>
        
        {/* Tournament Information Box */}
        {isCreatingTournament && tournamentCreationStep !== 'type_selection' && tournamentType !== 'SINGLE_MATCH' && (
          <div style={{
            marginBottom: '15px',
            padding: '12px 16px',
            backgroundColor: '#f8f9fa',
            border: '2px solid #3498db',
            borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Tournament Name, Type, Details and Progress Bar on One Line */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#2c3e50'
              }}>
                {(() => {
                  const typeName = tournamentType === 'ROUND_ROBIN' ? 'Round Robin' : 'Playoff';
                  const playerCount = selectedPlayersForTournament.length;
                  const displayName = tournamentName.trim() || 'Tournament';
                  
                  // Build details string according to format
                  let details = '';
                  
                  if (tournamentType === 'ROUND_ROBIN') {
                    if (isMultiTournamentMode) {
                      const playersPerTourn = parseInt(playersPerTournament) || 6;
                      const numTournaments = playerCount > 0 ? Math.ceil(playerCount / playersPerTourn) : 0;
                      // Multi Round-Robin: Members per tournament: <M> Players:<N> Tournaments:<K>
                      details = `Players per tournament: ${playersPerTourn} Players:${playerCount} Tournaments:${numTournaments}`;
                    } else {
                      // Round-Robin: Members:<N>
                      details = `Players:${playerCount}`;
                    }
                  } else if (tournamentType === 'PLAYOFF') {
                    // Playoff: Members:<N> Seeded:<K>
                    // Only show Seeded after organize_bracket step
                    if (tournamentCreationStep === 'organize_bracket' || tournamentCreationStep === 'completion') {
                      const seededCount = numSeedsForBracket !== undefined ? numSeedsForBracket : 0;
                      details = `Players:${playerCount} Seeded:${seededCount}`;
                    } else {
                      // Before organize_bracket, only show players
                      details = `Players:${playerCount}`;
                    }
                  }
                  
                  // Define steps based on tournament type
                  let steps: Array<{ key: string, name: string }> = [];
                  
                  if (tournamentType === 'ROUND_ROBIN') {
                    if (isMultiTournamentMode) {
                      steps = [
                        { key: 'player_selection', name: 'Players selection' },
                        { key: 'rearrange', name: 'Rearrangement' },
                        { key: 'confirmation', name: 'Completion' }
                      ];
                    } else {
                      steps = [
                        { key: 'player_selection', name: 'Players selection' },
                        { key: 'confirmation', name: 'Completion' }
                      ];
                    }
                  } else if (tournamentType === 'PLAYOFF') {
                    steps = [
                      { key: 'player_selection', name: 'Players selection' },
                      { key: 'organize_bracket', name: 'Organize brackets' },
                      { key: 'completion', name: 'Completion' }
                    ];
                  }
                  
                  // Find current step index
                  const currentStepIndex = steps.findIndex(s => s.key === tournamentCreationStep);
                  
                  // Format: <tournament-name> (<tournament-type>) | <progress-bar> | <details>
                  return (
                    <>
                      <span style={{ color: '#2c3e50', fontWeight: 'bold' }}>{displayName}</span>
                      <span style={{ color: '#666', fontWeight: 'normal' }}> ({typeName})</span>
                      {steps.length > 0 && (
                        <>
                          <span style={{ color: '#2c3e50', margin: '0 4px' }}>|</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {steps.map((step, index) => {
                              const isCompleted = index < currentStepIndex;
                              const isCurrent = index === currentStepIndex;
                              const isFuture = index > currentStepIndex;
                              
                              return (
                                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div 
                                    className={isCurrent ? 'progress-step-current' : ''}
                                    style={{
                                      width: '12px',
                                      height: '12px',
                                      borderRadius: '50%',
                                      border: isFuture ? '2px solid #ccc' : 'none',
                                      backgroundColor: isCompleted ? '#2c3e50' : isCurrent ? '#3498db' : 'transparent',
                                      flexShrink: 0
                                    }} 
                                  />
                                  <span style={{ 
                                    fontSize: '12px', 
                                    color: isCompleted ? '#2c3e50' : isCurrent ? '#3498db' : '#999',
                                    fontWeight: isCurrent ? 'bold' : 'normal'
                                  }}>
                                    {step.name}
                                  </span>
                                </div>
                              );
                            })}
                </div>
              </>
                      )}
                      {details && (
                        <>
                          <span style={{ color: '#2c3e50', margin: '0 4px' }}>|</span>
                          <span style={{ color: '#2c3e50' }}>{details}</span>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            
            {/* Players List with Ratings */}
            {selectedPlayersForTournament.length > 0 ? (
              <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #e0e0e0'
                }}>
                {selectedPlayersForTournament.map(playerId => {
                  const player = members.find(p => p.id === playerId);
                  if (!player) return null;
                  return (
                    <div
                      key={playerId}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '3px',
                        fontSize: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ fontWeight: '500' }}>
                        {player.firstName} {player.lastName}
                      </span>
                      <span style={{ 
                        color: '#27ae60', 
                        fontWeight: 'bold'
                      }}>
                        {player.rating}
                    </span>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ 
                padding: '10px', 
                textAlign: 'center', 
                color: '#999',
                fontStyle: 'italic',
                fontSize: '12px',
                backgroundColor: 'white',
                borderRadius: '4px',
                border: '1px solid #e0e0e0'
              }}>
                No players selected yet
              </div>
            )}
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: '1 1 auto', minWidth: '200px' }}>
          {isCreatingTournament ? (
            <>
              {/* Step 1: Tournament Type Selection Modal (with Multi-tournament options) */}
              {tournamentCreationStep === 'type_selection' && (
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
                    zIndex: 10001
                  }}>
                    <div style={{
                      backgroundColor: 'white',
                      padding: '30px',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      minWidth: '400px',
                      maxWidth: '500px'
                    }}>
                      <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px' }}>Tournament Type</h2>
                      
                      {/* Tournament Name (optional) - First entry */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '8px', 
                          fontSize: '14px', 
                          fontWeight: '500',
                          color: '#333'
                        }}>
                          Tournament Name (optional):
                        </label>
                        <input
                          type="text"
                          value={tournamentName}
                          onChange={(e) => setTournamentName(e.target.value)}
                          placeholder="Auto-generated if empty"
                            style={{
                            width: '100%',
                            padding: '10px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: 'white'
                          }}
                        />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
                        <label style={{
                              display: 'flex',
                              alignItems: 'center',
                          gap: '10px',
                          padding: '12px',
                          border: tournamentType === 'ROUND_ROBIN' ? '2px solid #3498db' : '1px solid #ddd',
                              borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: tournamentType === 'ROUND_ROBIN' ? '#e8f4f8' : 'white'
                        }}>
                          <input
                            type="radio"
                            name="tournamentType"
                            value="ROUND_ROBIN"
                            checked={tournamentType === 'ROUND_ROBIN'}
                            onChange={() => {
                              setTournamentType('ROUND_ROBIN');
                              setIsMultiTournamentMode(false);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '16px', fontWeight: '500' }}>Round Robin</span>
                        </label>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '12px',
                          border: tournamentType === 'PLAYOFF' ? '2px solid #3498db' : '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: tournamentType === 'PLAYOFF' ? '#e8f4f8' : 'white'
                        }}>
                            <input
                              type="radio"
                              name="tournamentType"
                            value="PLAYOFF"
                            checked={tournamentType === 'PLAYOFF'}
                            onChange={() => {
                              setTournamentType('PLAYOFF');
                                setIsMultiTournamentMode(false);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '16px', fontWeight: '500' }}>Playoff</span>
                        </label>
                    </div>
                      
                      {/* Multi-tournament checkbox and players per tournament (greyed out unless Round Robin is selected) */}
                      <div style={{ 
                        marginBottom: '20px',
                        padding: '15px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        backgroundColor: tournamentType === 'ROUND_ROBIN' ? 'white' : '#f9f9f9',
                        opacity: tournamentType === 'ROUND_ROBIN' ? 1 : 0.6
                      }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: tournamentType === 'ROUND_ROBIN' ? 'pointer' : 'not-allowed',
                          marginBottom: tournamentType === 'ROUND_ROBIN' && isMultiTournamentMode ? '15px' : '0'
                        }}>
                          <input
                            type="checkbox"
                            checked={isMultiTournamentMode}
                            onChange={(e) => {
                              if (tournamentType === 'ROUND_ROBIN') {
                                setIsMultiTournamentMode(e.target.checked);
                                if (!e.target.checked) {
                                  setMembersPerTournament('6');
                                }
                              }
                            }}
                            disabled={tournamentType !== 'ROUND_ROBIN'}
                            style={{ 
                              cursor: tournamentType === 'ROUND_ROBIN' ? 'pointer' : 'not-allowed',
                              width: '18px',
                              height: '18px'
                            }}
                          />
                          <span style={{ 
                            fontSize: '16px', 
                            fontWeight: '500',
                            color: tournamentType === 'ROUND_ROBIN' ? '#333' : '#999'
                          }}>
                            Multi-tournament
                          </span>
                              </label>
                        
                        {/* Players per tournament input (only shown when Round Robin is selected AND multi-tournament is checked) */}
                        {tournamentType === 'ROUND_ROBIN' && isMultiTournamentMode && (
                          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e0e0e0' }}>
                            <label style={{ 
                              display: 'block', 
                              marginBottom: '8px', 
                              fontSize: '14px', 
                              fontWeight: '500',
                              color: '#333'
                            }}>
                              Players per tournament:
                            </label>
                            <input
                              type="number"
                              value={playersPerTournament}
                                onChange={(e) => {
                                  const value = e.target.value;
                                const num = parseInt(value);
                                if (value === '' || (num >= 3 && num <= 99)) {
                                  setMembersPerTournament(value);
                                }
                                }}
                              min="3"
                              max="99"
                                style={{
                                width: '100%',
                                padding: '10px',
                                fontSize: '14px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                backgroundColor: 'white'
                              }}
                            />
                            </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={handleCancelTournamentCreation}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#95a5a6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setTournamentCreationStep('player_selection');
                          }}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                      </div>
                    )}

                {/* Step 3: Member Selection */}
                {tournamentCreationStep === 'player_selection' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'stretch', width: '100%' }}>
                {/* Players label with tournament count info */}
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '10px', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto' }}>
                    <h3 style={{ margin: 0, fontSize: '20px' }}>Players</h3>
                    <span style={{ fontSize: '18px', color: '#2c3e50', fontWeight: 'bold' }}>
                      (<strong>{selectedPlayersForTournament.length}</strong> selected)
                    </span>
                    {isMultiTournamentMode && (() => {
                      const desiredSize = parseInt(playersPerTournament) || 6;
                      const numTournaments = selectedPlayersForTournament.length > 0 
                        ? Math.ceil(selectedPlayersForTournament.length / desiredSize)
                        : 0;
                                    return (
                        <span style={{ fontSize: '16px', color: '#27ae60', fontWeight: 'bold' }}>
                                        → {numTournaments} tournament{numTournaments !== 1 ? 's' : ''} will be created
                                      </span>
                                    );
                                })()}
                              </div>
                  {tournamentType === 'PLAYOFF' && (
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' }}>
                              <button
                        onClick={handleOrganizeBracket}
                        disabled={selectedPlayersForTournament.length < 4}
                                style={{
                                  padding: '8px 16px',
                          backgroundColor: selectedPlayersForTournament.length < 4 ? '#95a5a6' : '#3498db',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                          cursor: selectedPlayersForTournament.length < 4 ? 'not-allowed' : 'pointer',
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                          opacity: selectedPlayersForTournament.length < 4 ? 0.7 : 1,
                                }}
                              >
                        Organize Brackets
                              </button>
                              <button
                                onClick={handleCancelTournamentCreation}
                                style={{
                                  padding: '8px 16px',
                                  backgroundColor: '#95a5a6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                  )}
                  {tournamentType === 'ROUND_ROBIN' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' }}>
                                <button
                        onClick={handleFinishPlayerSelection}
                        disabled={selectedPlayersForTournament.length < 3}
                                  style={{
                                    padding: '8px 16px',
                          backgroundColor: selectedPlayersForTournament.length < 3 ? '#95a5a6' : '#27ae60',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                          cursor: selectedPlayersForTournament.length < 3 ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                          opacity: selectedPlayersForTournament.length < 3 ? 0.7 : 1,
                                  }}
                                >
                        Continue
                                </button>
                                <button
                                  onClick={handleCancelTournamentCreation}
                                  style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#95a5a6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                              </div>
                          </div>
                        )}
                
                {/* Organize Bracket UI (shown when step is organize_bracket) */}
                {tournamentCreationStep === 'organize_bracket' && isOrganizingBracket && tournamentType === 'PLAYOFF' && (
                  <div style={{ marginTop: '20px' }}>
                    <BracketPreview
                      players={selectedPlayersForTournament.map(id => members.find(p => p.id === id)).filter((p): p is Member => p !== undefined)}
                      bracketPositions={bracketPositions}
                      onBracketChange={setBracketPositions}
                      onReseed={handleReseedBracket}
                      onDragStateChange={setIsDraggingInBracket}
                      onTempZoneChange={setHasPlayerInTempZone}
                      initialNumSeeds={numSeedsForBracket}
                    />
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
                      <button 
                        onClick={() => setTournamentCreationStep('completion')}
                        disabled={isDraggingInBracket || hasPlayerInTempZone}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: (isDraggingInBracket || hasPlayerInTempZone) ? '#95a5a6' : '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: (isDraggingInBracket || hasPlayerInTempZone) ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          opacity: (isDraggingInBracket || hasPlayerInTempZone) ? 0.7 : 1,
                        }}
                        title={isDraggingInBracket ? 'Finish dragging player to enable tournament creation' : hasPlayerInTempZone ? 'Clear temporary drop zone to enable tournament creation' : 'Continue'}
                      >
                        Continue
                      </button>
                      <button 
                        onClick={handleCancelTournamentCreation}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#95a5a6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Completion Screen (for Playoff tournaments) */}
                {tournamentCreationStep === 'completion' && tournamentType === 'PLAYOFF' && bracketPositions.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>First Round Matches</h3>
                    <div style={{
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '20px',
                      backgroundColor: 'white',
                      maxHeight: '500px',
                      overflowY: 'auto'
                    }}>
                      {(() => {
                        const firstRoundMatches: Array<{ player1: number | null, player2: number | null }> = [];
                        // Pair up adjacent positions for first round matches
                        for (let i = 0; i < bracketPositions.length; i += 2) {
                          firstRoundMatches.push({
                            player1: bracketPositions[i] ?? null,
                            player2: bracketPositions[i + 1] ?? null
                          });
                        }
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {firstRoundMatches.map((match, index) => {
                              const player1 = match.player1 ? members.find(p => p.id === match.player1) : null;
                              const player2 = match.player2 ? members.find(p => p.id === match.player2) : null;
                              
                              return (
                                <div
                                  key={index}
                                  style={{
                                    padding: '12px 16px',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '6px',
                                    backgroundColor: '#f9f9f9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '20px'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                    <span style={{ 
                                      fontWeight: 'bold', 
                                      color: '#666',
                                      minWidth: '30px',
                                      fontSize: '14px'
                                    }}>
                                      Match {index + 1}:
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                      {player1 ? (
                                        <>
                                          <span style={{ fontWeight: '500' }}>
                                            {player1.firstName} {player1.lastName}
                                          </span>
                                          <span style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '12px' }}>
                                            ({player1.rating})
                                          </span>
                                        </>
                                      ) : (
                                        <span style={{ color: '#999', fontStyle: 'italic' }}>BYE</span>
                                      )}
                                    </div>
                                  </div>
                                  <span style={{ color: '#999', fontSize: '18px', fontWeight: 'bold' }}>vs</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
                                    {player2 ? (
                                      <>
                                        <span style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '12px' }}>
                                          ({player2.rating})
                                        </span>
                                        <span style={{ fontWeight: '500' }}>
                                          {player2.firstName} {player2.lastName}
                                        </span>
                                      </>
                                    ) : (
                                      <span style={{ color: '#999', fontStyle: 'italic' }}>BYE</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px', justifyContent: 'center' }}>
                      <button 
                        onClick={handleCreateTournament}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}
                      >
                        Create a Tournament
                      </button>
                      <button
                        onClick={() => setTournamentCreationStep('organize_bracket')}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#95a5a6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Rearrange UI (for Multi-tournament Round Robin) */}
                {tournamentCreationStep === 'rearrange' && isMultiTournamentMode && tournamentType === 'ROUND_ROBIN' && (
                  <div style={{ marginTop: '20px' }}>
                    <h3 style={{ marginBottom: '15px' }}>Rearrangement Players</h3>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
                      Players are listed with their ratings. Drag and drop players between tournaments to reorganize them.
                    </p>
                    <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#fafafa', maxHeight: '500px', overflowY: 'auto' }}>
                      {playerGroups.map((group, groupIndex) => {
                        const sortedGroup = [...group].sort((a, b) => {
                          const playerA = members.find(p => p.id === a);
                          const playerB = members.find(p => p.id === b);
                          const ratingA = playerA?.rating ?? 0;
                          const ratingB = playerB?.rating ?? 0;
                          return ratingB - ratingA;
                        });
                        
                        return (
                          <div 
                            key={groupIndex}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (draggedPlayer && draggedPlayer.fromGroupIndex !== groupIndex) {
                                setDragOverGroupIndex(groupIndex);
                              }
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverGroupIndex(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (draggedPlayer && draggedPlayer.fromGroupIndex !== groupIndex) {
                                movePlayerToGroup(draggedPlayer.playerId, draggedPlayer.fromGroupIndex, groupIndex);
                                setDraggedPlayer(null);
                                setDragOverGroupIndex(null);
                              }
                            }}
                            style={{
                              padding: '10px',
                              marginBottom: '10px',
                              marginTop: groupIndex > 0 ? '20px' : '0',
                              paddingTop: groupIndex > 0 ? '20px' : '10px',
                              borderTop: groupIndex > 0 ? '3px solid #3498db' : 'none',
                              backgroundColor: dragOverGroupIndex === groupIndex ? '#e8f4f8' : 'transparent',
                              borderRadius: '4px',
                              transition: 'background-color 0.2s',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px', 
                              marginBottom: '10px',
                            }}>
                              <h5 style={{ margin: 0, color: '#3498db' }}>
                                Tournament {groupIndex + 1} ({group.length} players)
                              </h5>
                              {dragOverGroupIndex === groupIndex && (
                                <span style={{ fontSize: '12px', color: '#3498db', fontStyle: 'italic' }}>
                                  Drop here to move player
                                </span>
                    )}
                  </div>
                            
                            {sortedGroup.map((playerId) => {
                              const player = members.find(p => p.id === playerId);
                              if (!player) return null;
                              
                              const isDragging = draggedPlayer?.playerId === playerId;
                              
                              return (
                                <div
                                  key={playerId}
                                  draggable
                                  onDragStart={(e) => {
                                    setDraggedPlayer({ playerId, fromGroupIndex: groupIndex });
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                  onDragEnd={() => {
                                    setDraggedPlayer(null);
                                    setDragOverGroupIndex(null);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 8px',
                                    marginBottom: '4px',
                                    backgroundColor: isDragging ? '#e0e0e0' : 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #e0e0e0',
                                    cursor: 'grab',
                                    opacity: isDragging ? 0.5 : 1,
                                    transition: 'opacity 0.2s, background-color 0.2s',
                                    userSelect: 'none',
                                  }}
                                  title="Drag to move to another tournament"
                                >
                                  <span style={{ fontSize: '16px', color: '#999' }}>⋮⋮</span>
                                  <span style={{ flex: 1, fontSize: '14px' }}>
                                    {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                                  </span>
                                  {player.rating !== null && player.rating !== undefined && (
                                    <span style={{ fontSize: '13px', color: '#666', minWidth: '60px', textAlign: 'right', fontWeight: 'bold' }}>
                                      {player.rating}
                                    </span>
                )}
              </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                      <button
                        onClick={handleCancelTournamentCreation}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#95a5a6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setTournamentCreationStep('confirmation');
                        }}
                        disabled={hasPlayerInTempZone}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: hasPlayerInTempZone ? '#95a5a6' : '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: hasPlayerInTempZone ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          opacity: hasPlayerInTempZone ? 0.7 : 1
                        }}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirmation Screen (for Round Robin only - Playoff creates directly from Completion) */}
                {tournamentCreationStep === 'confirmation' && tournamentType !== 'PLAYOFF' && (
                  <div style={{ marginTop: '20px' }}>
                    <div style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      maxHeight: '90vh',
                      overflowY: 'auto',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                    }}>
                      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
                        {isMultiTournamentMode ? 'Confirm Multi-Tournament Creation' : 'Confirm Tournament Creation'}
                      </h3>
                      
                      {!isMultiTournamentMode && tournamentType === 'ROUND_ROBIN' && (
                        <div style={{ marginBottom: '20px' }}>
                          <h4>Selected Players ({selectedPlayersForTournament.length}):</h4>
                          <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', maxHeight: '300px', overflowY: 'auto' }}>
                            {selectedPlayersForTournament.map(playerId => {
                              const player = members.find(p => p.id === playerId);
                              if (!player) return null;
                              return (
                                <div key={playerId} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</span>
                                  {player.rating !== null && <span style={{ color: '#666' }}>{player.rating}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {isMultiTournamentMode && (
                        <div style={{ marginBottom: '20px' }}>
                          <h4 style={{ marginBottom: '10px' }}>
                            {playerGroups.length} Tournament{playerGroups.length !== 1 ? 's' : ''} will be created
                          </h4>
                          <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#fafafa', maxHeight: '400px', overflowY: 'auto' }}>
                            {playerGroups.map((group, groupIndex) => {
                              const sortedGroup = [...group].sort((a, b) => {
                                const playerA = members.find(p => p.id === a);
                                const playerB = members.find(p => p.id === b);
                                const ratingA = playerA?.rating ?? 0;
                                const ratingB = playerB?.rating ?? 0;
                                return ratingB - ratingA;
                              });
                              
                              return (
                                <div key={groupIndex} style={{
                                  marginBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                                  paddingBottom: groupIndex < playerGroups.length - 1 ? '20px' : '0',
                                  borderBottom: groupIndex < playerGroups.length - 1 ? '2px solid #3498db' : 'none'
                                }}>
                                  <h5 style={{ margin: '0 0 10px 0', color: '#3498db' }}>
                                    Tournament {groupIndex + 1} ({group.length} players)
                                  </h5>
                                  {sortedGroup.map((playerId) => {
                                    const player = members.find(p => p.id === playerId);
                                    if (!player) return null;
                                    return (
                                      <div key={playerId} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</span>
                                        {player.rating !== null && <span style={{ color: '#666', fontWeight: 'bold' }}>{player.rating}</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button
                          onClick={handleCancelTournamentCreation}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#95a5a6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateTournament}
                          disabled={hasPlayerInTempZone}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: hasPlayerInTempZone ? '#95a5a6' : '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: hasPlayerInTempZone ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            opacity: hasPlayerInTempZone ? 0.7 : 1
                          }}
                        >
                          Create a Tournament
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : isSelectingForStats ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#2c3e50', fontWeight: 'bold' }}>
                  <strong>{selectedPlayersForStats.length}</strong> selected
                </span>
                <button 
                  onClick={handleViewStatistics}
                  disabled={selectedPlayersForStats.length === 0}
                  style={selectedPlayersForStats.length === 0 ? {
                    backgroundColor: '#95a5a6',
                    color: '#fff',
                    cursor: 'not-allowed',
                    opacity: 0.7,
                    fontSize: '13px',
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '4px',
                  } : {
                    backgroundColor: '#3498db',
                    color: '#fff',
                    fontSize: '13px',
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  View Statistics
                </button>
                <button onClick={handleCancelStatsSelection}>
                  Cancel
                </button>
              </div>
            ) : isSelectingForHistory ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {selectedPlayerForHistory ? 'Player selected' : 'Select a player'} • {selectedOpponentsForHistory.length} opponent{selectedOpponentsForHistory.length !== 1 ? 's' : ''} selected
                </span>
                {selectedPlayerForHistory !== null && (
                  <>
                    <button 
                      onClick={handleSelectAllHistoryOpponents}
                      title="All players for the current filter"
                      style={{
                        backgroundColor: '#5dade2',
                        color: '#fff',
                        fontSize: '13px',
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        opacity: lastHistorySelectionMode === 'againstPlayers' ? 1 : 0.85,
                      }}
                    >
                      Select All
                    </button>
                      <button 
                        onClick={handleClearAllHistorySelections}
                      title="The history of player's ranking changes"
                        style={{
                        backgroundColor: '#5dade2',
                          color: '#fff',
                          fontSize: '13px',
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        opacity: lastHistorySelectionMode === 'ratingHistory' ? 1 : 0.85,
                        }}
                      >
                        Deselect All
                      </button>
                  </>
                )}
                <div style={{ marginLeft: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  onClick={handleViewHistory}
                  disabled={selectedPlayerForHistory === null || selectedOpponentsForHistory.length === 0}
                  style={(selectedPlayerForHistory === null || selectedOpponentsForHistory.length === 0) ? {
                    backgroundColor: '#95a5a6',
                    color: '#fff',
                    cursor: 'not-allowed',
                      opacity: 0.7,
                      fontSize: '13px',
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      letterSpacing: 'normal',
                    } : {
                      backgroundColor: '#3498db',
                      color: '#fff',
                      fontSize: '13px',
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      letterSpacing: 'normal',
                    }}
                    title={selectedOpponentsForHistory.length === 0 ? 'Select at least one opponent to view history' : 'View match history with selected opponents'}
                >
                  View History
                </button>
                  <button 
                    onClick={handleCancelHistorySelection}
                    style={{
                      backgroundColor: '#3498db',
                      color: '#fff',
                      fontSize: '13px',
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      letterSpacing: 'normal',
                    }}
                  >
                  Cancel
                </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {showAddForm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
          }}>
            <div className="card" style={{ maxWidth: '500px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
                <h3 style={{ margin: 0 }}>Add Player</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewPlayerFirstName('');
                    setNewPlayerLastName('');
                    setNewPlayerBirthDate(null);
                    setNewPlayerRating('');
                    setError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '0',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={newPlayerFirstName}
                    onChange={(e) => setNewPlayerFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={newPlayerLastName}
                    onChange={(e) => setNewPlayerLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Birth Date *</label>
                  <DatePicker
                    selected={newPlayerBirthDate}
                    onChange={(date: Date | null) => setNewPlayerBirthDate(date)}
                    dateFormat="yyyy-MM-dd"
                    showYearDropdown
                    showMonthDropdown
                    dropdownMode="select"
                    scrollableYearDropdown
                    yearDropdownItemNumber={100}
                    maxDate={new Date()}
                    placeholderText="Select birth date"
                    required
                    className="date-picker-input"
                    wrapperClassName="date-picker-wrapper"
                  />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={newPlayerEmail}
                    onChange={(e) => setNewPlayerEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Gender *</label>
                  <select
                    value={newPlayerGender}
                    onChange={(e) => setNewPlayerGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER' | '')}
                    required
                  >
                    <option value="">Select gender...</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Initial Rating (optional)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="9999"
                    value={newPlayerRating}
                    onChange={(e) => setNewPlayerRating(e.target.value)}
                    placeholder="Leave empty for unrated (0-9999)"
                  />
                </div>
                <div className="form-group">
                  <label>Phone (optional)</label>
                  <input
                    type="tel"
                    value={newPlayerPhone}
                    onChange={(e) => setNewPlayerPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                <div className="form-group">
                  <label>Address (optional)</label>
                  <input
                    type="text"
                    value={newPlayerAddress}
                    onChange={(e) => setNewPlayerAddress(e.target.value)}
                    placeholder="Address"
                  />
                </div>
                <div className="form-group">
                  <label>Picture URL (optional)</label>
                  <input
                    type="url"
                    value={newPlayerPicture}
                    onChange={(e) => setNewPlayerPicture(e.target.value)}
                    placeholder="Image URL"
                  />
                </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewPlayerFirstName('');
                      setNewPlayerLastName('');
                      setNewPlayerBirthDate(null);
                      setNewPlayerRating('');
                      setNewPlayerEmail('');
                      setNewPlayerGender('');
                      setNewPlayerPhone('');
                      setNewPlayerAddress('');
                      setNewPlayerPicture('');
                      setError('');
                    }}
                    className="button-filter"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="button-3d">Add Player</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showConfirmation && pendingPlayerData && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
          }}>
            <div className="card" style={{ maxWidth: '500px', width: '90%', position: 'relative' }}>
              <h3 style={{ marginBottom: '15px', color: '#e67e22' }}>⚠️ Similar Player Names Found</h3>
              <p style={{ marginBottom: '15px' }}>
                You're trying to add: <strong>{pendingPlayerData.firstName} {pendingPlayerData.lastName}</strong>
                {pendingPlayerData.rating && ` (Rating: ${pendingPlayerData.rating})`}
              </p>
              <p style={{ marginBottom: '15px', fontWeight: 'bold' }}>Similar existing players:</p>
              <ul style={{ marginBottom: '20px', paddingLeft: '20px' }}>
                {similarNames.map((similar, index) => (
                  <li key={index} style={{ marginBottom: '8px' }}>
                    <strong>{similar.name}</strong> ({similar.similarity}% similar)
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  style={{ backgroundColor: '#95a5a6', color: 'white' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleModifyName}
                  style={{ backgroundColor: '#3498db', color: 'white' }}
                >
                  Modify Name
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  style={{ backgroundColor: '#27ae60', color: 'white' }}
                >
                  Confirm & Add
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportResults && importResults && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
          }}>
            <div className="card" style={{ maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>Import Results</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportResults(false);
                    setImportResults(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '0',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close"
                >
                  ×
                </button>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
                  <div style={{ flex: 1, padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>{importResults.successful}</div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Successfully Imported</div>
                  </div>
                  <div style={{ flex: 1, padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c' }}>{importResults.failed}</div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Failed</div>
                  </div>
                  <div style={{ flex: 1, padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{importResults.total}</div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Total</div>
                  </div>
                </div>
              </div>

              {importResults.failed > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '10px', color: '#e74c3c' }}>Failed Players:</h4>
                  <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f5f5f5' }}>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>First Name</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Last Name</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResults.failedPlayers.map((player, index) => (
                          <tr key={index}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.firstName}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.lastName}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.email || '-'}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee', color: '#e74c3c' }}>{player.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResults.successful > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '10px', color: '#27ae60' }}>Successfully Imported Players:</h4>
                  <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f5f5f5' }}>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>First Name</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Last Name</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResults.successfulPlayers.map((player, index) => (
                          <tr key={index}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.firstName}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.lastName}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportResults(false);
                    setImportResults(null);
                  }}
                  style={{ backgroundColor: '#3498db', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportSelection && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
          }}>
            <div className="card" style={{ maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>Select Players to Export</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportSelection(false);
                    setSelectedPlayersForExport(new Set());
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '0',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close"
                >
                  ×
                </button>
              </div>
              
              <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleSelectAllForExport}
                  className="button-3d success"
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllForExport}
                  className="button-filter"
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Deselect All
                </button>
                <span style={{ marginLeft: '10px', fontSize: '14px', color: '#666' }}>
                  {selectedPlayersForExport.size} of {filteredPlayers.length} selected
                </span>
              </div>

              <div style={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPlayersForExport.size === filteredPlayers.length && filteredPlayers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleSelectAllForExport();
                            } else {
                              handleDeselectAllForExport();
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player) => (
                      <tr key={player.id} style={{ backgroundColor: selectedPlayersForExport.has(player.id) ? '#e8f5e9' : 'white' }}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          <input
                            type="checkbox"
                            checked={selectedPlayersForExport.has(player.id)}
                            onChange={() => handleTogglePlayerForExport(player.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{player.email}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          {player.rating !== null ? player.rating : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportSelection(false);
                    setSelectedPlayersForExport(new Set());
                  }}
                  className="button-filter"
                  style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePerformExport}
                  disabled={selectedPlayersForExport.size === 0}
                  className="button-3d"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: selectedPlayersForExport.size === 0 ? 'not-allowed' : 'pointer',
                    opacity: selectedPlayersForExport.size === 0 ? 0.7 : 1,
                  }}
                >
                  Export Selected ({selectedPlayersForExport.size})
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message" style={{ 
            animation: 'fadeIn 0.3s ease-in',
            marginBottom: '15px'
          }}>
            {error}
          </div>
        )}
        {success && (
          <div className="success-message" style={{ 
            animation: 'fadeIn 0.3s ease-in',
            marginBottom: '15px'
          }}>
            {success}
          </div>
        )}

        <div style={{ marginBottom: '0px' }}>
          {!filtersCollapsed && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1', minWidth: '150px' }}>
              <label htmlFor="nameFilter" style={{ display: 'inline-block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', backgroundColor: '#e8e8e8', padding: '4px 8px', borderRadius: '4px' }}>
                🔍 Name
              </label>
              <input
                id="nameFilter"
                type="text"
                value={nameFilter}
                onChange={(e) => {
                  const value = e.target.value;
                  setNameFilter(value);
                  localStorage.setItem('players_nameFilter', value);
                }}
                placeholder="Search by name..."
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1', minWidth: '150px' }}>
              <label htmlFor="ratingFilter" style={{ display: 'inline-block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', backgroundColor: '#e8e8e8', padding: '4px 8px', borderRadius: '4px' }}>
                📊 Rating
              </label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  id="minRating"
                  type="number"
                  value={minRating}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMinRating(value);
                    localStorage.setItem('players_minRating', value);
                  }}
                  min="0"
                  max="9999"
                  placeholder="Min"
                  style={{
                    flex: '1',
                    padding: '8px',
                    fontSize: '13px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#666' }}>to</span>
                <input
                  id="maxRating"
                  type="number"
                  value={maxRating}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMaxRating(value);
                    localStorage.setItem('players_maxRating', value);
                  }}
                  min="0"
                  max="9999"
                  placeholder="Max"
                  style={{
                    flex: '1',
                    padding: '8px',
                    fontSize: '13px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            {showAgeColumn && (
            <div className="form-group" style={{ marginBottom: 0, flex: '1', minWidth: '150px' }}>
              <label htmlFor="ageFilter" style={{ display: 'inline-block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', backgroundColor: '#e8e8e8', padding: '4px 8px', borderRadius: '4px' }}>
                🎂 Age
              </label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  id="minAge"
                  type="number"
                  value={minAge}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMinAge(value);
                    localStorage.setItem('players_minAge', value);
                  }}
                  min="0"
                  max="150"
                  placeholder="Min"
                  style={{
                    flex: '1',
                    padding: '8px',
                    fontSize: '13px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#666' }}>to</span>
                <input
                  id="maxAge"
                  type="number"
                  value={maxAge}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMaxAge(value);
                    localStorage.setItem('players_maxAge', value);
                  }}
                  min="0"
                  max="150"
                  placeholder="Max"
                  style={{
                    flex: '1',
                    padding: '8px',
                    fontSize: '13px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            )}
            {showGamesColumn && (
              <div className="form-group" style={{ marginBottom: 0, flex: '1', minWidth: '150px' }}>
                <label htmlFor="gamesFilter" style={{ display: 'inline-block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', backgroundColor: '#e8e8e8', padding: '4px 8px', borderRadius: '4px' }}>
                  🎮 Games
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    id="minGames"
                    type="number"
                    value={minGames}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMinGames(value);
                      localStorage.setItem('players_minGames', value);
                    }}
                    min="0"
                    placeholder="Min"
                    style={{
                      flex: '1',
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#666' }}>to</span>
                  <input
                    id="maxGames"
                    type="number"
                    value={maxGames}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMaxGames(value);
                      localStorage.setItem('players_maxGames', value);
                    }}
                    min="0"
                    placeholder="Max"
                    style={{
                      flex: '1',
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            )}
            {isAdmin() && (
              <div className="form-group" style={{ marginBottom: 0, flex: '1', minWidth: '150px', position: 'relative' }}>
                <label htmlFor="roleFilter" style={{ display: 'inline-block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', backgroundColor: '#e8e8e8', padding: '4px 8px', borderRadius: '4px', width: '100%' }}>
                  👤 Roles
                </label>
                <button
                  ref={roleFilterButtonRef}
                  id="roleFilter"
                  type="button"
                  onClick={() => setShowRoleFilter(true)}
                  className="button-filter"
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Select Roles</span>
                  <span style={{ fontSize: '12px', color: 'white' }}>▼</span>
                </button>
                {showRoleFilter && (
                  <>
                    <div style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'transparent',
                      zIndex: 10001
                    }}
                    onClick={() => setShowRoleFilter(false)}
                    />
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        padding: '15px',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        minWidth: '200px',
                        zIndex: 10001,
                        border: '1px solid #ddd'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px', color: '#3498db', fontWeight: 'bold' }}>▼</span>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Filter by Roles</h3>
                        </div>
                        <button
                          onClick={() => setShowRoleFilter(false)}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '20px',
                            cursor: 'pointer',
                            padding: '0',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#666'
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '6px'
                      }}>
                        {['PLAYER', 'COACH', 'ADMIN', 'ORGANIZER'].map(role => (
                          <label key={role} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            cursor: 'pointer', 
                            fontSize: '14px',
                            padding: '8px',
                            borderRadius: '4px',
                            backgroundColor: selectedRoles.includes(role) ? '#e8f4f8' : 'transparent'
                          }}>
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes(role)}
                              onChange={(e) => {
                                const newRoles = e.target.checked
                                  ? [...selectedRoles, role]
                                  : selectedRoles.filter(r => r !== role);
                                setSelectedRoles(newRoles);
                                localStorage.setItem('players_selectedRoles', JSON.stringify(newRoles));
                              }}
                              style={{ cursor: 'pointer', margin: 0, width: '16px', height: '16px' }}
                            />
                            <span>{role}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 0 }}>
              <button
                onClick={handleClearFilters}
                disabled={!hasActiveFilters()}
                className="button-filter"
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  cursor: hasActiveFilters() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  height: 'fit-content',
                  opacity: hasActiveFilters() ? 1 : 0.6,
                }}
                title="Clear all filters"
              >
                🗑️ Clear Filters
              </button>
            </div>
          </div>
          )}
          {(nameFilter.trim() || minRating !== '' || maxRating !== '9999' || minAge !== '' || maxAge !== '' || minGames !== '' || maxGames !== '') && (() => {
            const filteredCount = getSortedPlayers().filter(player => {
              // When selecting for history and a player is selected, exclude that player from the count
              if (isSelectingForHistory && selectedPlayerForHistory !== null) {
                return player.id !== selectedPlayerForHistory;
              }
              return true;
            }).length;
            return (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                Showing {filteredCount} matching player{filteredCount !== 1 ? 's' : ''}
              </div>
            );
          })()}
        </div>
        {/* Selected players box for stats selection */}
        {isSelectingForStats && selectedPlayersForStats.length > 0 && (() => {
          const sortedPlayers = getSortedPlayers();
          const selectedPlayers = sortedPlayers.filter(p => selectedPlayersForStats.includes(p.id));
          return (
            <div style={{
              marginBottom: '15px',
              padding: '12px',
              backgroundColor: '#e8f4f8',
              border: '1px solid #3498db',
              borderRadius: '4px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: 'bold', 
                color: '#2c3e50', 
                marginBottom: '8px' 
              }}>
                Selected Players ({selectedPlayers.length}):
              </div>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px' 
              }}>
                {selectedPlayers.map(player => (
                  <span
                    key={player.id}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#3498db',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleTogglePlayerForStats(player.id)}
                    title="Click to deselect"
                  >
                    {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                    {player.rating !== null && ` (${player.rating})`}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {/* Table section with sticky header */}
        <div 
          ref={(node) => {
            // TypeScript workaround: assign to ref through a type assertion
            (tableScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            // When ref is set and we should restore scroll, try to restore
            if (node && shouldRestoreScrollRef.current && savedScrollPositionRef.current && !loading) {
              const scrollHeight = node.scrollHeight;
              const clientHeight = node.clientHeight;
              const savedPosition = savedScrollPositionRef.current;
              
              if (savedPosition !== null && scrollHeight > savedPosition && savedPosition <= scrollHeight - clientHeight + 100) {
                // Use requestAnimationFrame to ensure DOM is fully ready
                requestAnimationFrame(() => {
                  if (node && shouldRestoreScrollRef.current) {
                    node.scrollTop = savedPosition;
                    shouldRestoreScrollRef.current = false;
                  }
                });
              }
            }
          }}
          style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}
        >
        <table style={{ marginTop: 0, width: '100%', borderCollapse: 'collapse' }}>
          <thead 
            ref={tableHeaderRef}
            style={{ 
              position: 'sticky', 
              top: 0, 
              backgroundColor: '#f8f9fa', 
              zIndex: 9999,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
            <tr>
              {(isCreatingTournament || isSelectingForStats || isSelectingForHistory) && (
                <th style={{ width: isSelectingForHistory ? '120px' : '80px', backgroundColor: '#f8f9fa', padding: '12px' }}>
                  {isSelectingForHistory ? (
                    selectedPlayerForHistory ? 'Opponent' : 'Select'
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      {isCreatingTournament && (
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={showSelectedFirst}
                          onChange={(e) => setShowSelectedFirst(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', margin: 0 }}
                        />
                      </label>
                      )}
                    </div>
                  )}
                </th>
              )}
              {showIdColumn && (
                <th 
                  style={{ backgroundColor: '#f8f9fa', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('id')}
                >
                  ID
                  {sortColumn === 'id' && (
                    <span style={{ marginLeft: '5px' }}>
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              )}
              <th 
                style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'left', backgroundColor: '#f8f9fa' }}
                onClick={() => handleSort('name')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {!isCreatingTournament && !isSelectingForStats && !isSelectingForHistory && !isOrganizingBracket && (
                    <>
                      <span style={{ width: '14px', display: 'inline-block' }}></span>
                      <span style={{ width: '14px', display: 'inline-block' }}></span>
                      {showAllPlayers && <span style={{ width: '22px', display: 'inline-block' }}></span>}
                    </>
                  )}
                  <span>Name</span>
                  {sortColumn === 'name' && (
                    <span style={{ marginLeft: '5px' }}>
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              {showAllRoles && isAdmin() && (
                <th style={{ backgroundColor: '#f8f9fa', textAlign: 'center' }}>
                  Roles
                </th>
              )}
              {showAgeColumn && (
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: '#f8f9fa' }}
                  onClick={() => handleSort('age')}
                >
                  Age
                  {sortColumn === 'age' && (
                    <span style={{ marginLeft: '5px' }}>
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              )}
              <th 
                style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: '#f8f9fa' }}
                onClick={() => handleSort('rating')}
              >
                Rating
                {sortColumn === 'rating' && (
                  <span style={{ marginLeft: '5px' }}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              {showGamesColumn && (
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none', position: 'relative', backgroundColor: '#f8f9fa' }}
                  onClick={() => handleSort('games')}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>Games</span>
                      {sortColumn === 'games' && (
                        <span>
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%' }}>
                      <select
                        value={gamesTimePeriod}
                        onChange={(e) => {
                          const value = e.target.value as 'today' | 'week' | 'month' | 'custom' | 'all';
                          setGamesTimePeriod(value);
                          localStorage.setItem('players_gamesTimePeriod', value);
                          if (value !== 'custom') {
                            setGamesCustomStartDate(null);
                            setGamesCustomEndDate(null);
                            setTempGamesCustomStartDate(null);
                            setTempGamesCustomEndDate(null);
                            setShowCustomDatePicker(false);
                            localStorage.removeItem('players_gamesCustomStartDate');
                            localStorage.removeItem('players_gamesCustomEndDate');
                          } else {
                            // When switching to custom, initialize temp dates with current saved dates
                            setTempGamesCustomStartDate(gamesCustomStartDate);
                            setTempGamesCustomEndDate(gamesCustomEndDate);
                            // Only show dialog if no dates are already set
                            if (!gamesCustomStartDate || !gamesCustomEndDate) {
                              setShowCustomDatePicker(true);
                            }
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '2px 4px',
                          fontSize: '11px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          backgroundColor: 'white',
                          minWidth: '100px',
                          width: 'auto',
                          textAlign: 'center',
                        }}
                      >
                        <option value="today">Today</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                        <option value="custom">Custom Range</option>
                        <option value="all">All Games</option>
                      </select>
                      {gamesTimePeriod === 'custom' && !showCustomDatePicker && (
                        <div 
                          style={{
                            fontSize: '10px',
                            color: gamesCustomStartDate && gamesCustomEndDate ? '#666' : '#999',
                            cursor: 'pointer',
                            textDecoration: gamesCustomStartDate && gamesCustomEndDate ? 'underline' : 'none',
                            fontStyle: gamesCustomStartDate && gamesCustomEndDate ? 'normal' : 'italic',
                            textAlign: 'center',
                            width: '100%',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCustomDatePicker(true);
                          }}
                          title={gamesCustomStartDate && gamesCustomEndDate ? "Click to change date range" : "Click to select date range"}
                        >
                          {gamesCustomStartDate && gamesCustomEndDate 
                            ? `${gamesCustomStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${gamesCustomEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'Click to select date range'}
                        </div>
                      )}
                    </div>
                  </div>
                  {gamesTimePeriod === 'custom' && showCustomDatePicker && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '10px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        zIndex: 10001,
                        marginTop: '5px',
                        minWidth: '250px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                        Select Date Range:
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>Start Date:</label>
                        <div style={{ width: '100%' }}>
                          <DatePicker
                            selected={tempGamesCustomStartDate}
                            onChange={(date: Date | null) => {
                              setTempGamesCustomStartDate(date);
                              // Clear end date if start date is after it
                              if (date && tempGamesCustomEndDate && date > tempGamesCustomEndDate) {
                                setTempGamesCustomEndDate(null);
                              }
                            }}
                            dateFormat="MM/dd/yyyy"
                            placeholderText="Select start date"
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>End Date:</label>
                        <div style={{ width: '100%' }}>
                          <DatePicker
                            selected={tempGamesCustomEndDate}
                            onChange={(date: Date | null) => {
                              setTempGamesCustomEndDate(date);
                            }}
                            dateFormat="MM/dd/yyyy"
                            placeholderText="Select end date"
                            minDate={tempGamesCustomStartDate || undefined}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Cancel: reset temp dates to saved dates and close dialog
                            setTempGamesCustomStartDate(gamesCustomStartDate);
                            setTempGamesCustomEndDate(gamesCustomEndDate);
                            setShowCustomDatePicker(false);
                          }}
                          style={{
                            padding: '4px 12px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            backgroundColor: '#f5f5f5',
                            color: '#333',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // OK: apply temp dates to actual dates and close dialog
                            setGamesCustomStartDate(tempGamesCustomStartDate);
                            setGamesCustomEndDate(tempGamesCustomEndDate);
                            if (tempGamesCustomStartDate) {
                              localStorage.setItem('players_gamesCustomStartDate', tempGamesCustomStartDate.toISOString());
                            } else {
                              localStorage.removeItem('players_gamesCustomStartDate');
                            }
                            if (tempGamesCustomEndDate) {
                              localStorage.setItem('players_gamesCustomEndDate', tempGamesCustomEndDate.toISOString());
                            } else {
                              localStorage.removeItem('players_gamesCustomEndDate');
                            }
                            setShowCustomDatePicker(false);
                          }}
                          disabled={!tempGamesCustomStartDate || !tempGamesCustomEndDate}
                          style={{
                            padding: '4px 12px',
                            border: '1px solid #4CAF50',
                            borderRadius: '4px',
                            backgroundColor: tempGamesCustomStartDate && tempGamesCustomEndDate ? '#4CAF50' : '#ccc',
                            color: 'white',
                            cursor: tempGamesCustomStartDate && tempGamesCustomEndDate ? 'pointer' : 'not-allowed',
                            fontSize: '12px',
                          }}
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              )}
              {isAdmin() && (
                <th style={{ textAlign: 'center', backgroundColor: '#f8f9fa', padding: '12px' }}>
                  Edit
                </th>
              )}
              <th style={{ textAlign: 'right', paddingRight: '10px', backgroundColor: '#f8f9fa' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }} data-settings-menu>
                    <button
                      onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                      className="button-filter"
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      ⚙️ Settings
                    </button>
                    {showSettingsMenu && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: '5px',
                          backgroundColor: '#f5f5f5',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                          padding: '10px',
                          minWidth: '200px',
                          zIndex: 10001,
                        }}
                      >
                        <div style={{ marginBottom: '6px', fontWeight: 'bold', borderBottom: '1px solid #ddd', paddingBottom: '4px', fontSize: '13px' }}>
                          Display Options
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={showIdColumn}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setShowIdColumn(checked);
                              localStorage.setItem('players_showIdColumn', checked.toString());
                            }}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          <span>Show ID Column</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={showAgeColumn}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setShowAgeColumn(checked);
                              localStorage.setItem('players_showAgeColumn', checked.toString());
                            }}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          <span>Show Age Column</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={showGamesColumn}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setShowGamesColumn(checked);
                              localStorage.setItem('players_showGamesColumn', checked.toString());
                              if (checked) {
                                fetchMatches();
                              }
                            }}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          <span>Show Games Column</span>
                        </label>
                        <div style={{ borderTop: '1px solid #ddd', marginTop: '6px', marginBottom: '6px' }}></div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={showAllPlayers}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setShowAllPlayers(checked);
                              localStorage.setItem('players_showAllPlayers', checked.toString());
                            }}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          <span>Show All Players (including inactive)</span>
                        </label>
                        {isAdmin() && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
                            <input
                              type="checkbox"
                              checked={showAllRoles}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setShowAllRoles(checked);
                                localStorage.setItem('players_showAllRoles', checked.toString());
                                if (checked) {
                                  fetchMembers();
                                }
                              }}
                              style={{ cursor: 'pointer', margin: 0 }}
                            />
                            <span>Show All Members</span>
                          </label>
                        )}
                        <div style={{ borderTop: '1px solid #ddd', paddingTop: '6px', marginTop: '6px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                            <span>Name:</span>
                            <select
                              value={nameDisplayOrder}
                              onChange={(e) => {
                                const order = e.target.value as NameDisplayOrder;
                                setNameDisplayOrderState(order);
                                setNameDisplayOrder(order);
                              }}
                              style={{
                                padding: '3px 6px',
                                cursor: 'pointer',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '12px',
                              }}
                            >
                              <option value="firstLast">First Last</option>
                              <option value="lastFirst">Last, First</option>
                            </select>
                          </label>
                        </div>
                        <div style={{ borderTop: '1px solid #ddd', marginTop: '6px', marginBottom: '6px' }}></div>
                        {isAdmin() && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                            {(() => {
                              const isDisabled = isSelectingForStats || isSelectingForHistory;
                              const buttonStyle: React.CSSProperties = {
                                padding: '6px 12px',
                                fontSize: '12px',
                                backgroundColor: isDisabled ? '#95a5a6' : '#3498db',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                opacity: isDisabled ? 0.7 : 1,
                                width: '100%',
                                textAlign: 'center',
                              };
                              
                              return (
                                <>
                                  <button 
                                    onClick={handleExportPlayers}
                                    disabled={isDisabled}
                                    className="button-3d"
                                    style={buttonStyle}
                                    title="Export players to CSV"
                                  >
                                    📥 Export
                                  </button>
                                  <label
                                    className="button-3d"
                                    style={buttonStyle}
                                    title="Import players from CSV"
                                  >
                                    📤 Import
                                    <input
                                      type="file"
                                      accept=".csv"
                                      onChange={handleImportPlayers}
                                      disabled={isDisabled}
                                      style={{ display: 'none' }}
                                    />
                                  </label>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </th>
            </tr>
          </thead>
          {/* Sticky selected player row for history selection - appears right under header */}
          {isSelectingForHistory && selectedPlayerForHistory !== null && (() => {
            const selectedPlayer = members.find(p => p.id === selectedPlayerForHistory);
            if (!selectedPlayer) return null;
            
            return (
              <thead style={{ 
                position: 'sticky', 
                top: `${headerHeight}px`, // Position right below the main header row (dynamically calculated)
                backgroundColor: '#e8f5e9',
                zIndex: 9999,
                borderBottom: '2px solid #4caf50',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>
                <tr>
                  {isSelectingForHistory && (
                    <th style={{ 
                      width: '120px',
                      padding: '12px',
                      backgroundColor: '#e8f5e9',
                      borderBottom: '2px solid #4caf50',
                      textAlign: 'center'
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', justifyContent: 'center' }}>
                        <input
                          type="radio"
                          name="historyPlayer"
                          checked={true}
                          readOnly
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>Player</span>
                      </label>
                    </th>
                  )}
                  {showIdColumn && (
                    <th style={{ 
                      fontWeight: 'bold', 
                      color: '#666', 
                      padding: '12px', 
                      backgroundColor: '#e8f5e9', 
                      borderBottom: '2px solid #4caf50'
                    }}>
                      {selectedPlayer.id}
                    </th>
                  )}
                  <th style={{ 
                    padding: '12px', 
                    backgroundColor: '#e8f5e9', 
                    borderBottom: '2px solid #4caf50',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#1b5e20', fontWeight: 'bold' }}>
                          {formatPlayerName(selectedPlayer.firstName, selectedPlayer.lastName, nameDisplayOrder)}
                          {(() => {
                            const ranking = playerRankings.get(selectedPlayer.id);
                            return ranking ? (
                              <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '4px' }}>
                                ({ranking})
                              </span>
                            ) : null;
                          })()}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlayerForHistory(null);
                          setSelectedOpponentsForHistory([]);
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        title="Change selected player"
                      >
                        Change
                      </button>
                    </div>
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    fontWeight: 'bold', 
                    color: selectedPlayer.rating !== null ? '#2c3e50' : '#95a5a6',
                    padding: '12px',
                    backgroundColor: '#e8f5e9',
                    borderBottom: '2px solid #4caf50'
                  }}>
                    {selectedPlayer.rating !== null ? selectedPlayer.rating : '-'}
                  </th>
                  {showAgeColumn && (
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px', 
                      backgroundColor: '#e8f5e9', 
                      borderBottom: '2px solid #4caf50'
                    }}>
                      {calculateAge(selectedPlayer.birthDate) !== null ? calculateAge(selectedPlayer.birthDate) : '-'}
                    </th>
                  )}
                  {showGamesColumn && (
                  <th style={{ 
                    textAlign: 'center', 
                    fontWeight: 'bold', 
                    padding: '12px',
                    backgroundColor: '#e8f5e9',
                    borderBottom: '2px solid #4caf50'
                  }}>
                      {playerMatchCounts.get(selectedPlayer.id) || 0}
                  </th>
                  )}
                  {isAdmin() && (
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px', 
                      backgroundColor: '#e8f5e9', 
                      borderBottom: '2px solid #4caf50'
                    }}>
                    </th>
                  )}
                  <th style={{ 
                    textAlign: 'right', 
                    paddingRight: '10px', 
                    padding: '12px', 
                    backgroundColor: '#e8f5e9', 
                    borderBottom: '2px solid #4caf50'
                  }}>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {selectedOpponentsForHistory.length} opponent{selectedOpponentsForHistory.length !== 1 ? 's' : ''}
                    </span>
                  </th>
                </tr>
              </thead>
            );
          })()}
          <tbody>
            {(() => {
              const sortedPlayers = getSortedPlayers();
              const filteredForHistory = sortedPlayers.filter(player => {
                // When selecting for history and a player is selected, exclude that player from the list
                if (isSelectingForHistory && selectedPlayerForHistory !== null) {
                  return player.id !== selectedPlayerForHistory;
                }
                return true;
              });
              return filteredForHistory.map((player) => {
              // Render normal row (edit form is now in a modal)
              return (
                <tr 
                key={player.id}
                style={{
                  cursor: isSelectingForHistory ? 'pointer' : 'default'
                }}
                onClick={isSelectingForHistory ? () => handleSelectPlayerForHistory(player.id) : undefined}
              >
                {isSelectingForHistory ? (
                  <td style={{ textAlign: 'center' }}>
                    {selectedPlayerForHistory === player.id ? (
                      // Selected player: show radio button
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', justifyContent: 'center' }}>
                        <input
                          type="radio"
                          name="historyPlayer"
                          checked={true}
                          readOnly
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Player</span>
                      </label>
                    ) : selectedPlayerForHistory === null ? (
                      // No player selected yet: show radio button for all players
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', justifyContent: 'center' }}>
                        <input
                          type="radio"
                          name="historyPlayer"
                          checked={false}
                          onChange={() => handleSelectPlayerForHistory(player.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Player</span>
                      </label>
                    ) : (
                      // Other players: show only opponent checkbox
                      <label 
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', justifyContent: 'center' }}
                        onClick={(e) => e.stopPropagation()} // Prevent row click from triggering
                      >
                        <input
                          type="checkbox"
                          checked={selectedOpponentsForHistory.includes(player.id)}
                          onChange={() => handleToggleOpponentForHistory(player.id)}
                          onClick={(e) => e.stopPropagation()} // Prevent row click from triggering
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Opponent</span>
                      </label>
                    )}
                  </td>
                ) : (isCreatingTournament || isSelectingForStats || tournamentType === 'SINGLE_MATCH') && (
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={
                        tournamentType === 'SINGLE_MATCH'
                          ? selectedPlayersForTournament.includes(player.id)
                          : isCreatingTournament 
                            ? selectedPlayersForTournament.includes(player.id)
                            : selectedPlayersForStats.includes(player.id)
                      }
                      onChange={() => {
                        if (tournamentType === 'SINGLE_MATCH') {
                          handleTogglePlayerForTournament(player.id);
                        } else if (isCreatingTournament) {
                          handleTogglePlayerForTournament(player.id);
                        } else {
                          handleTogglePlayerForStats(player.id);
                        }
                      }}
                      disabled={
                        (tournamentType === 'SINGLE_MATCH' && (
                          showSingleMatchConfirmation ||
                          (selectedPlayersForTournament.length >= 2 && !selectedPlayersForTournament.includes(player.id))
                        )) ||
                        (isCreatingTournament && (
                          showTournamentConfirmation || 
                          showSingleMatchConfirmation ||
                          ((tournamentType as string) === 'SINGLE_MATCH' && selectedPlayersForTournament.length >= 2 && !selectedPlayersForTournament.includes(player.id))
                        ))
                      }
                      style={{ 
                        cursor: (
                          (tournamentType === 'SINGLE_MATCH' && (
                            showSingleMatchConfirmation ||
                            (selectedPlayersForTournament.length >= 2 && !selectedPlayersForTournament.includes(player.id))
                          )) ||
                          (isCreatingTournament && (
                            showTournamentConfirmation || 
                            showSingleMatchConfirmation ||
                            ((tournamentType as string) === 'SINGLE_MATCH' && selectedPlayersForTournament.length >= 2 && !selectedPlayersForTournament.includes(player.id))
                          ))
                        ) ? 'not-allowed' : 'pointer',
                        opacity: (
                          (tournamentType === 'SINGLE_MATCH' && (
                            showSingleMatchConfirmation ||
                            (selectedPlayersForTournament.length >= 2 && !selectedPlayersForTournament.includes(player.id))
                          )) ||
                          (isCreatingTournament && (
                            showTournamentConfirmation || 
                            showSingleMatchConfirmation ||
                            ((tournamentType as string) === 'SINGLE_MATCH' && selectedPlayersForTournament.length >= 2 && !selectedPlayersForTournament.includes(player.id))
                          ))
                        ) ? 0.5 : 1
                      }}
                    />
                  </td>
                )}
                {showIdColumn && (
                  <td style={{ fontWeight: 'bold', color: '#666' }}>{player.id}</td>
                )}
                <td 
                  style={isSelectingForHistory ? { cursor: 'pointer' } : {}}
                  onClick={isSelectingForHistory ? () => handleSelectPlayerForHistory(player.id) : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    {!isCreatingTournament && !isSelectingForStats && !isSelectingForHistory && !isOrganizingBracket && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickViewStats(player.id);
                          }}
                          title="Show statistics for a player"
                          aria-label="Show statistics for a player"
                          style={{
                            padding: '2px 3px',
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '4px',
                          }}
                        >
                          📊
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickViewHistory(player.id);
                          }}
                          title="Game history for the player against selected group"
                          aria-label="Game history for the player against selected group"
                          style={{
                            padding: '2px 3px',
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '4px',
                          }}
                        >
                          📜
                        </button>
                        {showAllPlayers && (
                          <>
                            <span style={{ marginLeft: '4px' }}></span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleActiveClick(player.id, player.isActive, formatPlayerName(player.firstName, player.lastName, nameDisplayOrder));
                              }}
                              title={player.isActive ? 'Deactivate player' : 'Activate player'}
                              style={{
                                padding: '2px 6px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: player.isActive ? '#27ae60' : '#e74c3c',
                              }}
                            >
                              {player.isActive ? '✓' : '✗'}
                            </button>
                          </>
                        )}
                      </>
                    )}
                    <span style={{ color: player.isActive ? '#000' : '#666', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                      {isSelectingForStats && player.rating !== null && (
                        <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '2px' }}>
                          ({player.rating})
                        </span>
                      )}
                      {!isSelectingForStats && (() => {
                        const ranking = playerRankings.get(player.id);
                        return ranking ? (
                          <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '2px' }}>
                            ({ranking})
                          </span>
                        ) : null;
                      })()}
                    </span>
                  </div>
                </td>
                {showAllRoles && isAdmin() && (
                  <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                    {player.roles && player.roles.length > 0 
                      ? player.roles.map(role => role.charAt(0)).join(', ')
                      : '-'}
                  </td>
                )}
                {showAgeColumn && (
                  <td style={{ textAlign: 'center' }}>
                    {calculateAge(player.birthDate) !== null ? calculateAge(player.birthDate) : '-'}
                  </td>
                )}
                <td style={{ textAlign: 'center', fontWeight: 'bold', color: player.rating !== null ? '#2c3e50' : '#95a5a6' }}>
                  {player.rating !== null ? player.rating : '-'}
                </td>
                  {showGamesColumn && (
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                      {playerMatchCounts.get(player.id) || 0}
                    </td>
                  )}
                {isAdmin() && (
                  <td style={{ textAlign: 'center', padding: '8px' }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleStartEdit(player.id);
                      }}
                      title="Edit member profile"
                      style={{
                        padding: '2px 3px',
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: '16px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                    >
                      ✏️
                    </button>
                  </td>
                )}
              </tr>
              );
            });
            })()}
          </tbody>
        </table>
        </div>
        {/* End of table section */}

      </div>
      {/* End of card */}
      
      {/* Edit Member Modal */}
      {editingPlayerId && (() => {
        try {
          // Find member in members list (may not be in list if showing only players and member doesn't have PLAYER role)
          let player = members.find(p => p.id === editingPlayerId);
          // If not in current members list, create from edit state
          if (!player) {
            player = {
              id: editingPlayerId,
              firstName: editFirstName || '',
              lastName: editLastName || '',
              email: editEmail || '',
              gender: (editGender || 'MALE') as 'MALE' | 'FEMALE' | 'OTHER',
              birthDate: editBirthDate ? editBirthDate.toISOString().split('T')[0] : null,
              isActive: editIsActive,
              rating: editRating ? parseInt(editRating) : null,
              roles: editRoles || [],
              phone: editPhone || null,
              address: editAddress || null,
              picture: editPicture || null,
            };
          }
        const currentMember = getMember();
        const isEditingSelf = currentMember && currentMember.id === editingPlayerId;
        const isAdminUser = currentMember && currentMember.roles && currentMember.roles.includes('ADMIN');
        
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
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10001,
              overflow: 'auto',
              padding: '20px'
            }}
            onClick={(e) => {
              // Close modal when clicking on the backdrop
              if (e.target === e.currentTarget) {
                handleCancelEdit();
              }
            }}
          >
            <div 
              className="card" 
              style={{ 
                maxWidth: '700px', 
                width: '100%', 
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}
              onClick={(e) => {
                // Prevent closing when clicking inside the modal
                e.stopPropagation();
              }}
            >
              <h3 style={{ margin: '0 0 20px 0', flexShrink: 0 }}>
                Edit Member: {formatPlayerName(editFirstName || player.firstName, editLastName || player.lastName, nameDisplayOrder)}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {/* Name fields */}
                          <div>
                            <label style={{ 
                              display: 'block', 
                              marginBottom: '4px', 
                              fontSize: '13px', 
                              fontWeight: 'bold',
                              color: !isAdminUser ? '#999' : 'inherit'
                            }}>First Name *</label>
                            <input
                              type="text"
                              value={editFirstName}
                              onChange={(e) => setEditFirstName(e.target.value)}
                              disabled={!isAdminUser}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                borderRadius: '4px',
                                backgroundColor: !isAdminUser ? '#f5f5f5' : 'white',
                                color: !isAdminUser ? '#999' : 'inherit',
                                cursor: !isAdminUser ? 'not-allowed' : 'text',
                                opacity: !isAdminUser ? 0.7 : 1
                              }}
                              autoFocus={isAdminUser || undefined}
                              required
                            />
                          </div>
                          <div>
                            <label style={{ 
                              display: 'block', 
                              marginBottom: '4px', 
                              fontSize: '13px', 
                              fontWeight: 'bold',
                              color: !isAdminUser ? '#999' : 'inherit'
                            }}>Last Name *</label>
                            <input
                              type="text"
                              value={editLastName}
                              onChange={(e) => setEditLastName(e.target.value)}
                              disabled={!isAdminUser}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                borderRadius: '4px',
                                backgroundColor: !isAdminUser ? '#f5f5f5' : 'white',
                                color: !isAdminUser ? '#999' : 'inherit',
                                cursor: !isAdminUser ? 'not-allowed' : 'text',
                                opacity: !isAdminUser ? 0.7 : 1
                              }}
                              required
                            />
                          </div>
                          {/* Email - editable by all */}
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Email *</label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                              required
                            />
                          </div>
                          {/* Gender */}
                          <div>
                            <label style={{ 
                              display: 'block', 
                              marginBottom: '4px', 
                              fontSize: '13px', 
                              fontWeight: 'bold',
                              color: !isAdminUser ? '#999' : 'inherit'
                            }}>Gender *</label>
                            <select
                              value={editGender}
                              onChange={(e) => setEditGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER' | '')}
                              disabled={!isAdminUser}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                borderRadius: '4px',
                                backgroundColor: !isAdminUser ? '#f5f5f5' : 'white',
                                color: !isAdminUser ? '#999' : 'inherit',
                                cursor: !isAdminUser ? 'not-allowed' : 'pointer',
                                opacity: !isAdminUser ? 0.7 : 1
                              }}
                              required
                            >
                              <option value="">Select gender...</option>
                              <option value="MALE">Male</option>
                              <option value="FEMALE">Female</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          {/* Birth Date */}
                          <div>
                            <label style={{ 
                              display: 'block', 
                              marginBottom: '4px', 
                              fontSize: '13px', 
                              fontWeight: 'bold',
                              color: !isAdminUser ? '#999' : 'inherit'
                            }}>Birth Date</label>
                            <div style={{ 
                              width: '100%',
                              opacity: !isAdminUser ? 0.7 : 1,
                              pointerEvents: !isAdminUser ? 'none' : 'auto'
                            }}>
                              <DatePicker
                                selected={editBirthDate}
                                onChange={(date: Date | null) => setEditBirthDate(date)}
                                disabled={!isAdminUser}
                                dateFormat="MM/dd/yyyy"
                                showYearDropdown
                                showMonthDropdown
                                dropdownMode="select"
                                wrapperClassName="date-picker-wrapper"
                                className={!isAdminUser ? "form-control disabled" : "form-control"}
                              />
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Phone</label>
                            <input
                              type="text"
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Address</label>
                            <input
                              type="text"
                              value={editAddress}
                              onChange={(e) => setEditAddress(e.target.value)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Picture URL</label>
                            <input
                              type="text"
                              value={editPicture}
                              onChange={(e) => setEditPicture(e.target.value)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                              placeholder="https://..."
                            />
                          </div>
                  {/* Active Status - Only visible to Admins */}
                  {isAdminUser && (
                          <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                              <input
                                type="checkbox"
                                checked={editIsActive}
                                onChange={(e) => setEditIsActive(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                              />
                              <span>Active</span>
                            </label>
                          </div>
                  )}
                        </div>
                        
                {/* Rating Section */}
                {isAdminUser && (
                  <div style={{ marginTop: '16px', padding: '12px', background: '#e3f2fd', borderRadius: '4px', border: '1px solid #2196F3' }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Rating</h5>
                    <div>
                      <input
                        type="number"
                        value={editRating}
                        onChange={(e) => setEditRating(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        placeholder="Rating (0-9999) or leave empty"
                        min="0"
                        max="9999"
                      />
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
                        Leave empty to remove rating. Current: {editRating ? editRating : (player.rating !== null ? player.rating : 'Not set')}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Roles Section */}
                {isAdminUser && (
                  <div style={{ marginTop: '16px', padding: '12px', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Roles</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {['PLAYER', 'COACH', 'ORGANIZER', 'ADMIN'].map((role) => (
                        <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={editRoles.includes(role)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditRoles([...editRoles, role]);
                              } else {
                                setEditRoles(editRoles.filter(r => r !== role));
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Password Change Section - Only visible to the member themselves */}
                              {isEditingSelf && (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '1px solid #ddd' }}>
                                  <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Change Password</h5>
                                  {!showPasswordChange ? (
                                    <button
                                      onClick={() => setShowPasswordChange(true)}
                                      style={{ fontSize: '13px', padding: '6px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                      Change Password
                                    </button>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      <div>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Current Password *</label>
                                        <input
                                          type="password"
                                          value={currentPassword}
                                          onChange={(e) => setCurrentPassword(e.target.value)}
                                          style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                          placeholder="Enter current password"
                                        />
                                      </div>
                                      <div>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>New Password *</label>
                                        <input
                                          type="password"
                                          value={newPassword}
                                          onChange={(e) => setNewPassword(e.target.value)}
                                          style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                          placeholder="Enter new password (min 6 characters)"
                                        />
                                      </div>
                                      <div>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Confirm New Password *</label>
                                        <input
                                          type="password"
                                          value={confirmPassword}
                                          onChange={(e) => setConfirmPassword(e.target.value)}
                                          style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                          placeholder="Confirm new password"
                                        />
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                          onClick={handleChangePassword}
                                          className="button-3d success"
                                          style={{ fontSize: '12px', padding: '6px 12px' }}
                                        >
                                          Change Password
                                        </button>
                                        <button
                                          onClick={() => {
                                            setShowPasswordChange(false);
                                            setCurrentPassword('');
                                            setNewPassword('');
                                            setConfirmPassword('');
                                          }}
                                          className="button-filter"
                                          style={{ fontSize: '12px', padding: '6px 12px' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Password Reset Section - Only visible to Admins for other members */}
                {isAdminUser && !isEditingSelf && (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                                  <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Reset Password</h5>
                                  {!showPasswordReset ? (
                                    <button
                                      onClick={() => setShowPasswordReset(true)}
                                      className="button-3d"
                                      style={{ fontSize: '13px', padding: '6px 12px', background: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                      Reset Password
                                    </button>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {!resetPassword && (
                                        <div style={{ padding: '8px', background: '#e7f3ff', border: '1px solid #2196F3', borderRadius: '4px', fontSize: '12px', color: '#1976D2' }}>
                                          <strong>⚠️ Password Reset Notice:</strong> Leaving the password field empty will reset the password. The member will be required to set a new password on their next login.
                                        </div>
                                      )}
                                      <div>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                                          New Password {!resetPassword && <span style={{ color: '#d32f2f', fontWeight: 'normal' }}>(leave empty to force password reset on next login)</span>}
                                        </label>
                                        <input
                                          type="password"
                                          value={resetPassword}
                                          onChange={(e) => setResetPassword(e.target.value)}
                                          style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                          placeholder={resetPassword ? 'Enter new password' : "Leave empty to force password reset on next login"}
                                        />
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                          onClick={handleResetPassword}
                                          className="button-3d"
                                          style={{ fontSize: '12px', padding: '6px 12px', background: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                          {resetPassword ? 'Set New Password' : 'Reset Password (Force Setup on Login)'}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setShowPasswordReset(false);
                                            setResetPassword('');
                                          }}
                                          className="button-filter"
                                          style={{ fontSize: '12px', padding: '6px 12px' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                
                {/* Delete Member Section - Only visible to Admins if member can be deleted and not self-deleting an admin */}
                {isAdminUser && canDeleteMember && !(isEditingSelf && editRoles.includes('ADMIN')) && (
                  <div style={{ marginTop: '16px', padding: '12px', background: '#ffebee', borderRadius: '4px', border: '1px solid #f44336' }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', color: '#d32f2f' }}>Delete Member</h5>
                    <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
                      This member is not referenced in any matches and can be permanently deleted.
                    </p>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="button-3d danger"
                      style={{ 
                        fontSize: '13px', 
                        padding: '8px 16px', 
                        borderRadius: '4px', 
                        cursor: 'pointer' 
                      }}
                    >
                      Delete Member
                    </button>
                  </div>
                )}
                
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #eee', flexShrink: 0 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelEdit();
                  }}
                  className="button-filter"
                  style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveEdit();
                  }}
                  className="button-3d success"
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  Save
                </button>
              </div>
            </div>
    </div>
          );
        } catch (error) {
          return null;
        }
      })()}

      {/* Delete Member Confirmation Modal */}
      {showDeleteConfirm && editingPlayerId && (() => {
        const player = members.find(p => p.id === editingPlayerId);
        if (!player) return null;
        
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
          }}>
            <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
              <h3 style={{ marginBottom: '15px', color: '#f44336' }}>
                ⚠️ Delete Member?
              </h3>
              <p style={{ marginBottom: '20px' }}>
                Are you sure you want to permanently delete <strong>{formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}</strong>?
              </p>
              <p style={{ marginBottom: '20px', fontSize: '13px', color: '#666' }}>
                This action cannot be undone. The member will be permanently removed from the system.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="button-filter"
                  style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteMember}
                  className="button-3d danger"
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Activate/Deactivate Confirmation Modal */}
      {showActiveConfirmation && pendingActiveToggle && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10001,
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
            <h3 style={{ marginBottom: '15px', color: pendingActiveToggle.isActive ? '#e67e22' : '#27ae60' }}>
              {pendingActiveToggle.isActive ? '⚠️ Deactivate Player?' : '✓ Activate Player?'}
            </h3>
            <p style={{ marginBottom: '20px' }}>
              Are you sure you want to {pendingActiveToggle.isActive ? 'deactivate' : 'activate'} <strong>{pendingActiveToggle.playerName}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelToggleActive}
                style={{ backgroundColor: '#95a5a6', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleActive}
                style={{ 
                  backgroundColor: pendingActiveToggle.isActive ? '#e74c3c' : '#27ae60', 
                  color: 'white', 
                  padding: '8px 16px', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }}
              >
                {pendingActiveToggle.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Tournament Creation Confirmation Modal */}
      {showCancelConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10001,
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
            <h3 style={{ marginBottom: '15px', color: '#e67e22' }}>
              ⚠️ Cancel Tournament Creation?
            </h3>
            <p style={{ marginBottom: '20px' }}>
              You have selected <strong>{selectedPlayersForTournament.length} players</strong>. Are you sure you want to cancel tournament creation? All selected players will be cleared.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelCancelTournament}
                style={{ backgroundColor: '#95a5a6', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Keep Creating
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelTournament}
                style={{ 
                  backgroundColor: '#e74c3c', 
                  color: 'white', 
                  padding: '8px 16px', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }}
              >
                Cancel Tournament
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Tournament Confirmation Modal (old - for non-step flows) */}
      {showTournamentConfirmation && tournamentCreationStep !== 'confirmation' && (
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
          zIndex: 10001,
        }} onClick={() => setShowTournamentConfirmation(false)}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '90%',
            width: '1000px',
            maxHeight: '90vh',
            overflowY: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
              {isMultiTournamentMode ? 'Confirm Multi-Tournament Creation' : 'Confirm Tournament Creation'}
            </h3>
            
            {tournamentType === 'SINGLE_MATCH' && (
              <div className="form-group" style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>Match Name (auto-generated):</label>
                {(() => {
                  const player1 = members.find(p => p.id === selectedPlayersForTournament[0]);
                  const player2 = members.find(p => p.id === selectedPlayersForTournament[1]);
                  const dateStr = new Date().toLocaleDateString();
                  const matchName = player1 && player2
                    ? `${player1.firstName} ${player1.lastName} vs ${player2.firstName} ${player2.lastName} - ${dateStr}`
                    : `Match - ${dateStr}`;
                  return <div style={{ color: '#666', fontSize: '14px' }}>{matchName}</div>;
                })()}
              </div>
            )}

            {isMultiTournamentMode ? (
              (() => {
                return (
                  <div>
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ marginBottom: '10px' }}>
                        {playerGroups.length} Tournament{playerGroups.length !== 1 ? 's' : ''} will be created
                      </h4>
                      <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
                        Players are listed in ranking order. Drag and drop players between tournaments to reorganize them.
                      </p>
                      
                      <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px', backgroundColor: '#fafafa', maxHeight: '500px', overflowY: 'auto' }}>
                        {playerGroups.map((group, groupIndex) => {
                          // Sort players within group by ranking
                          const sortedGroup = [...group].sort((a, b) => {
                            const rankA = playerRankings.get(a) ?? 99999;
                            const rankB = playerRankings.get(b) ?? 99999;
                            if (rankA !== rankB) return rankA - rankB;
                            const playerA = members.find(p => p.id === a);
                            const playerB = members.find(p => p.id === b);
                            const ratingA = playerA?.rating ?? 0;
                            const ratingB = playerB?.rating ?? 0;
                            return ratingB - ratingA;
                          });
                          
                          return (
                          <div 
                            key={groupIndex}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (showSingleMatchConfirmation) return;
                              if (draggedPlayer && draggedPlayer.fromGroupIndex !== groupIndex) {
                                setDragOverGroupIndex(groupIndex);
                              }
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverGroupIndex(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (showSingleMatchConfirmation) return;
                              if (draggedPlayer && draggedPlayer.fromGroupIndex !== groupIndex) {
                                movePlayerToGroup(draggedPlayer.playerId, draggedPlayer.fromGroupIndex, groupIndex);
                                setDraggedPlayer(null);
                                setDragOverGroupIndex(null);
                              }
                            }}
                            style={{
                              padding: '10px',
                              marginBottom: '10px',
                              marginTop: groupIndex > 0 ? '20px' : '0',
                              paddingTop: groupIndex > 0 ? '20px' : '10px',
                              borderTop: groupIndex > 0 ? '2px solid #3498db' : 'none',
                              backgroundColor: dragOverGroupIndex === groupIndex ? '#e8f4f8' : 'transparent',
                              borderRadius: '4px',
                              transition: 'background-color 0.2s',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px', 
                              marginBottom: '10px',
                            }}>
                              <h5 style={{ margin: 0, color: '#3498db' }}>
                                Tournament {groupIndex + 1} ({group.length} players)
                              </h5>
                              {dragOverGroupIndex === groupIndex && (
                                <span style={{ fontSize: '12px', color: '#3498db', fontStyle: 'italic' }}>
                                  Drop here to move player
                                </span>
                              )}
                            </div>
                            
                            {sortedGroup.map((playerId) => {
                              const player = members.find(p => p.id === playerId);
                              if (!player) return null;
                              
                              const ranking = playerRankings.get(playerId);
                              const isDragging = draggedPlayer?.playerId === playerId;
                              
                              return (
                                <div
                                  key={playerId}
                                  draggable={!showSingleMatchConfirmation}
                                  onDragStart={(e) => {
                                    if (showSingleMatchConfirmation) {
                                      e.preventDefault();
                                      return;
                                    }
                                    setDraggedPlayer({ playerId, fromGroupIndex: groupIndex });
                                    e.dataTransfer.effectAllowed = 'move';
                                    // Create a custom drag image
                                    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
                                    dragImage.style.opacity = '0.5';
                                    document.body.appendChild(dragImage);
                                    e.dataTransfer.setDragImage(dragImage, 0, 0);
                                    setTimeout(() => document.body.removeChild(dragImage), 0);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedPlayer(null);
                                    setDragOverGroupIndex(null);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 8px',
                                    marginBottom: '4px',
                                    backgroundColor: isDragging ? '#e0e0e0' : 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #e0e0e0',
                                    cursor: (showTournamentConfirmation || showSingleMatchConfirmation) ? 'not-allowed' : 'grab',
                                    opacity: isDragging ? 0.5 : ((showTournamentConfirmation || showSingleMatchConfirmation) ? 0.5 : 1),
                                    transition: 'opacity 0.2s, background-color 0.2s',
                                    userSelect: 'none',
                                  }}
                                  title="Drag to move to another tournament"
                                >
                                  <span style={{ fontSize: '16px', color: '#999' }}>⋮⋮</span>
                                  <span style={{ minWidth: '40px', fontSize: '13px', color: '#666' }}>
                                    {ranking ? `#${ranking}` : '-'}
                                  </span>
                                  <span style={{ flex: 1, fontSize: '14px' }}>
                                    {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                                  </span>
                                  {player.rating !== null && player.rating !== undefined && (
                                    <span style={{ fontSize: '13px', color: '#666', minWidth: '60px', textAlign: 'right' }}>
                                      {player.rating}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : tournamentType === 'PLAYOFF' ? (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '10px' }}>Playoff Bracket Preview</h4>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                  {selectedPlayersForTournament.length} participants
                </p>
                {(() => {
                  // Convert bracketPositions to matches format for TraditionalBracket
                  const bracketSize = Math.pow(2, Math.ceil(Math.log2(selectedPlayersForTournament.length)));
                  const previewMatches: Array<{
                    round: number;
                    position: number;
                    player1Id: number | null;
                    player2Id: number | null;
                    player1IsBye: boolean;
                    player2IsBye: boolean;
                    matchId?: number;
                    winnerId?: number | null;
                    nextMatchId?: number | null;
                    player1Sets?: number;
                    player2Sets?: number;
                    player1Forfeit?: boolean;
                    player2Forfeit?: boolean;
                  }> = [];
                  
                  // Create first round matches from bracketPositions
                  for (let i = 0; i < bracketSize; i += 2) {
                    const player1Id = bracketPositions[i] || null;
                    const player2Id = bracketPositions[i + 1] || null;
                    const position = (i / 2) + 1;
                    
                    previewMatches.push({
                      round: 1,
                      position,
                      player1Id,
                      player2Id,
                      player1IsBye: player1Id === null,
                      player2IsBye: player2Id === null,
                    });
                  }
                  
                  // Create participants array for TraditionalBracket
                  const previewParticipants = selectedPlayersForTournament.map((playerId, index) => {
                    const player = members.find(p => p.id === playerId);
                    return {
                      id: index,
                      player: player || { id: playerId, firstName: 'Unknown', lastName: 'Player', rating: null },
                      playerRatingAtTime: player?.rating || null,
                    };
                  });
                  
                  // Simple list view for confirmation screen - just round 1 pairs in two columns
                  return (
                    <div style={{ 
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      padding: '12px',
                      backgroundColor: '#fafafa',
                      maxWidth: '500px',
                      margin: '0 auto',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {previewMatches.map((match, index) => {
                          const player1 = match.player1Id ? previewParticipants.find(p => p.player.id === match.player1Id) : null;
                          const player2 = match.player2Id ? previewParticipants.find(p => p.player.id === match.player2Id) : null;
                          const player1Name = player1 ? formatPlayerName(player1.player.firstName, player1.player.lastName, nameDisplayOrder) : 'BYE';
                          const player2Name = player2 ? formatPlayerName(player2.player.firstName, player2.player.lastName, nameDisplayOrder) : 'BYE';
                          const player1Rating = player1?.player.rating ?? null;
                          const player2Rating = player2?.player.rating ?? null;
                          
                          return (
                            <div
                              key={index}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '8px 10px',
                                backgroundColor: 'white',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                              }}
                            >
                              <div style={{ flex: 1, fontSize: '14px' }}>
                                <div style={{ fontWeight: '500' }}>
                                  {player1Name}
                                </div>
                                {player1Rating !== null && (
                                  <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                                    {player1Rating}
                                  </div>
                                )}
                              </div>
                              <div style={{ 
                                fontSize: '18px', 
                                color: '#3498db',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: '24px',
                              }}>
                                🏓
                              </div>
                              <div style={{ flex: 1, fontSize: '14px', textAlign: 'right' }}>
                                <div style={{ fontWeight: '500' }}>
                                  {player2Name}
                                </div>
                                {player2Rating !== null && (
                                  <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                                    {player2Rating}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '10px' }}>Participants ({selectedPlayersForTournament.length})</h4>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                  Expected matches: {getExpectedMatches(selectedPlayersForTournament.length)}
                </p>
                
                <div style={{ marginBottom: '20px' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '14px', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', textAlign: 'left' }}>Ranking</th>
                        <th style={{ padding: '8px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', textAlign: 'left' }}>Player</th>
                        <th style={{ padding: '8px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', textAlign: 'left' }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Get selected players with their rankings
                        const selectedPlayers = selectedPlayersForTournament
                          .map(playerId => {
                            const player = members.find(p => p.id === playerId);
                            return player ? {
                              ...player,
                              ranking: playerRankings.get(playerId) ?? null
                            } : null;
                          })
                          .filter((p): p is NonNullable<typeof p> => p !== null)
                          .sort((a, b) => {
                            // Sort by ranking (lower number = better), then by rating (higher = better)
                            const rankA = a.ranking ?? 99999;
                            const rankB = b.ranking ?? 99999;
                            if (rankA !== rankB) return rankA - rankB;
                            const ratingA = a.rating ?? 0;
                            const ratingB = b.rating ?? 0;
                            return ratingB - ratingA;
                          });

                        return selectedPlayers.map((player) => (
                          <tr key={player.id}>
                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {player.ranking ?? '-'}
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                              {formatPlayerName(player.firstName, player.lastName, nameDisplayOrder)}
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>
                              {player.rating !== null && player.rating !== undefined ? player.rating : '-'}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTournamentConfirmation(false)}>Cancel</button>
              <button 
                onClick={handleCreateTournament} 
                className="success"
                disabled={hasPlayerInTempZone}
                style={{
                  opacity: hasPlayerInTempZone ? 0.7 : 1,
                  cursor: hasPlayerInTempZone ? 'not-allowed' : 'pointer',
                }}
                title={hasPlayerInTempZone ? 'Clear temporary drop zone to enable tournament creation' : ''}
              >
                Create a Tournament
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Match Confirmation Modal */}
      {showSingleMatchConfirmation && selectedPlayersForTournament.length === 2 && (
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
          zIndex: 10001,
        }} onClick={() => setShowSingleMatchConfirmation(false)}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>
              Single Match Confirmation
            </h3>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              {(() => {
                const player1 = members.find(p => p.id === selectedPlayersForTournament[0]);
                const player2 = members.find(p => p.id === selectedPlayersForTournament[1]);
                return (
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                      {player1 && formatPlayerName(player1.firstName, player1.lastName, nameDisplayOrder)}
                      {player1?.rating !== null && player1?.rating !== undefined && (
                        <span style={{ fontSize: '14px', color: '#666', fontWeight: 'normal', marginLeft: '8px' }}>
                          (Rating: {player1.rating})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '20px', margin: '10px 0', color: '#3498db' }}>VS</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {player2 && formatPlayerName(player2.firstName, player2.lastName, nameDisplayOrder)}
                      {player2?.rating !== null && player2?.rating !== undefined && (
                        <span style={{ fontSize: '14px', color: '#666', fontWeight: 'normal', marginLeft: '8px' }}>
                          (Rating: {player2.rating})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px', fontSize: '13px', color: '#666' }}>
              Match name will be auto-generated from player names and date
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={handleCancelMatchCreation}>Cancel</button>
              <button onClick={handleCreateTournament} className="success">
                Confirm & Create Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Players;


