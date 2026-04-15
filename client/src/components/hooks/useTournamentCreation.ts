import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { tournamentPluginRegistry } from '../tournaments/TournamentPluginRegistry';
import type { TournamentType } from '../../types/tournament';
import {
  getShiftRangeSlice,
  toggleRangeInSelectionWithAddGate,
} from '../../utils/shiftRangeSelection';
import { useShiftRangeAnchor } from './useShiftRangeAnchor';

type TournamentCreationStep = 'type_selection' | 'player_selection' | 'plugin_flow';

interface TournamentCreationMember {
  id: number;
  isActive: boolean;
  roles: string[];
}

interface UseTournamentCreationParams {
  members: TournamentCreationMember[];
  fetchMembersRef: React.RefObject<(() => void) | null>;
  setError: (msg: string) => void;
  filtersCollapsed: boolean;
  setFiltersCollapsed: (collapsed: boolean) => void;
}

export function useTournamentCreation({
  members,
  fetchMembersRef,
  setError,
  filtersCollapsed,
  setFiltersCollapsed,
}: UseTournamentCreationParams) {
  const navigate = useNavigate();
  const location = useLocation();
  const { anchorRef: lastClickedPlayerIdRef, resetAnchor: resetShiftRangeAnchor } = useShiftRangeAnchor();

  // State
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<number | null>(null);
  const [repeatingTournament, setRepeatingTournament] = useState(false);
  const [existingParticipantIds, setExistingParticipantIds] = useState<Set<number>>(new Set());
  const [tournamentCreationStep, setTournamentCreationStep] = useState<TournamentCreationStep>('type_selection');
  const [selectedPlayersForTournament, setSelectedPlayersForTournament] = useState<number[]>([]);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentType, setTournamentType] = useState<TournamentType>('');
  const [creationTournamentType, setCreationTournamentType] = useState<TournamentType | null>(null);
  const [expandedMenuGroups, setExpandedMenuGroups] = useState<Set<string>>(new Set());

  // Derived
  const creationPlugin = useMemo(() => {
    if (!creationTournamentType) return null;
    try {
      return tournamentPluginRegistry.get(creationTournamentType);
    } catch {
      return null;
    }
  }, [creationTournamentType]);

  const creationFlow = useMemo(() => {
    return creationPlugin?.getCreationFlow?.();
  }, [creationPlugin]);

  const isUsingPluginWizard = Boolean(creationPlugin && creationFlow && creationFlow.steps.length > 0);

  // Handle tournament modification from Tournaments component
  useEffect(() => {
    if (location.state?.modifyTournament === true && location.state?.tournamentId && !isCreatingTournament && members.length > 0) {
      const tournamentId = location.state.tournamentId;
      const participantIds = location.state.participantIds || [];
      
      setEditingTournamentId(tournamentId);
      setExistingParticipantIds(new Set(participantIds));
      setIsCreatingTournament(true);
      setTournamentCreationStep('player_selection');
      setSelectedPlayersForTournament(participantIds);
      setTournamentName(location.state.tournamentName || '');
      if (!location.state.tournamentType) {
        throw new Error('tournamentType is required in navigation state for modifyTournament');
      }
      setTournamentType(location.state.tournamentType);
      setCreationTournamentType(location.state.tournamentType);
      
      // Clear the state to prevent re-triggering
      navigate('/players', { 
        state: { ...location.state, modifyTournament: false },
        replace: true 
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.modifyTournament, location.state?.tournamentId, members.length, isCreatingTournament]);

  // Handle tournament repeat from Tournaments component
  useEffect(() => {
    if (location.state?.repeatTournament === true && !isCreatingTournament && members.length > 0) {
      const participantIds = location.state.participantIds || [];
      
      setEditingTournamentId(null);
      setRepeatingTournament(true);
      setExistingParticipantIds(new Set(participantIds));
      setIsCreatingTournament(true);
      setTournamentCreationStep('player_selection');
      setSelectedPlayersForTournament(participantIds);
      setTournamentName(location.state.tournamentName || '');
      if (!location.state.tournamentType) {
        throw new Error('tournamentType is required in navigation state for repeatTournament');
      }
      setTournamentType(location.state.tournamentType);
      setCreationTournamentType(location.state.tournamentType);
      
      // Clear the state to prevent re-triggering
      navigate('/players', { 
        state: { ...location.state, repeatTournament: false },
        replace: true 
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.repeatTournament, members.length, isCreatingTournament]);

  // Auto-expand filters when in player selection mode for tournaments
  useEffect(() => {
    if (isCreatingTournament && tournamentCreationStep === 'player_selection' && filtersCollapsed) {
      setFiltersCollapsed(false);
      // Don't save to localStorage - this is temporary for player selection
    }
  }, [isCreatingTournament, tournamentCreationStep, filtersCollapsed]);

  // Handlers
  const handleStartTournamentCreation = () => {
    setIsCreatingTournament(true);
    setTournamentCreationStep('type_selection');
    setSelectedPlayersForTournament([]);
    setTournamentName('');
    setTournamentType('');
    setCreationTournamentType(null);
    setExpandedMenuGroups(new Set());
    resetShiftRangeAnchor();
  };

  const resetState = () => {
    setIsCreatingTournament(false);
    setEditingTournamentId(null);
    setRepeatingTournament(false);
    setExistingParticipantIds(new Set());
    setSelectedPlayersForTournament([]);
    setTournamentName('');
    setTournamentType('');
    setShowCancelConfirmation(false);
    resetShiftRangeAnchor();
  };

  const handleCancelTournamentCreation = () => {
    // In modify or repeat mode, cancel goes back to tournaments page
    if (editingTournamentId || repeatingTournament) {
      resetState();
      navigate('/tournaments');
      return;
    }

    if (tournamentCreationStep === 'type_selection') {
      // Exit tournament creation entirely
      resetState();
    } else if (tournamentCreationStep === 'player_selection') {
      setTournamentCreationStep('type_selection');
    } else if (tournamentCreationStep === 'plugin_flow') {
      // Back from plugin flow goes to player selection
      setTournamentCreationStep('player_selection');
    }
  };

  const handleConfirmCancelTournament = () => {
    resetState();
  };

  const handleCancelCancelTournament = () => {
    setShowCancelConfirmation(false);
  };

  const handleTogglePlayerForTournament = (playerId: number, shiftKey?: boolean, visiblePlayerIds?: number[]) => {
    // Disable selection during plugin flow phase
    if (tournamentCreationStep === 'plugin_flow') {
      return;
    }
    
    // Ensure player is active and has PLAYER role before allowing selection
    const player = members.find(p => p.id === playerId);
    if (!player || !player.isActive || !player.roles?.includes('PLAYER')) {
      setError('Only active players can be selected for tournaments or matches.');
      return;
    }

    const rangeSlice = getShiftRangeSlice(
      shiftKey,
      lastClickedPlayerIdRef.current,
      playerId,
      visiblePlayerIds
    );
    if (rangeSlice) {
      const canAddId = (id: number) => {
        const p = members.find((m) => m.id === id);
        return Boolean(p && p.isActive);
      };
      setSelectedPlayersForTournament(
        toggleRangeInSelectionWithAddGate(
          selectedPlayersForTournament,
          playerId,
          rangeSlice,
          canAddId
        )
      );
      lastClickedPlayerIdRef.current = playerId;
      return;
    }
    
    if (selectedPlayersForTournament.includes(playerId)) {
      setSelectedPlayersForTournament(selectedPlayersForTournament.filter(id => id !== playerId));
    } else {
      const newSelection = [...selectedPlayersForTournament, playerId];
      setSelectedPlayersForTournament(newSelection);
    }
    lastClickedPlayerIdRef.current = playerId;
  };

  const handleFinishPlayerSelection = () => {
    const minPlayers = creationFlow?.minPlayers ?? 2;
    const maxPlayers = creationFlow?.maxPlayers ?? -1;

    if (selectedPlayersForTournament.length < minPlayers) {
      setError(`Select at least ${minPlayers} players`);
      return;
    }

    if (maxPlayers > 0 && selectedPlayersForTournament.length > maxPlayers) {
      setError(`Select at most ${maxPlayers} players`);
      return;
    }

    // Delegate to plugin's post-selection flow
    setTournamentCreationStep('plugin_flow');
  };

  // Called by plugin post-selection flow when tournament is created successfully
  const handleTournamentCreated = () => {
    resetState();
    setTournamentCreationStep('type_selection');
    setCreationTournamentType(null);
    fetchMembersRef.current?.();

    setTimeout(() => {
      navigate('/tournaments');
    }, 1000);
  };

  return {
    // State
    isCreatingTournament,
    editingTournamentId,
    repeatingTournament,
    existingParticipantIds,
    tournamentCreationStep,
    setTournamentCreationStep,
    selectedPlayersForTournament,
    setSelectedPlayersForTournament,
    showCancelConfirmation,
    setShowCancelConfirmation,
    tournamentName,
    setTournamentName,
    tournamentType,
    setTournamentType,
    creationTournamentType,
    setCreationTournamentType,
    expandedMenuGroups,
    setExpandedMenuGroups,

    // Derived
    creationPlugin,
    creationFlow,
    isUsingPluginWizard,

    // Handlers
    handleStartTournamentCreation,
    handleCancelTournamentCreation,
    handleConfirmCancelTournament,
    handleCancelCancelTournament,
    handleTogglePlayerForTournament,
    handleFinishPlayerSelection,
    handleTournamentCreated,
  };
}
