import type { NameDisplayOrder } from '../utils/nameFormatter';

// Tournament Type
// Tournament types are dynamically registered via the plugin system
// No longer a static enum - types come from the tournament plugin registry
export type TournamentType = string;

// Tournament Status Enum
// Tracks the lifecycle state of a tournament
export enum TournamentStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

// Member Interface
// Represents a club member who can participate in tournaments
export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null; // ELO-style rating for matchmaking and rankings
}

// Tournament Participant Interface
// Links a member to a tournament with snapshot of their rating at tournament start
// This allows historical rating tracking even if current rating changes
export interface TournamentParticipant {
  id: number;
  memberId: number;
  member: Member;
  playerRatingAtTime: number | null; // Rating when tournament started
  postRatingAtTime?: number | null; // Rating after tournament completion
}

// Match Interface
// Represents a match within a tournament
// member2Id can be null for BYE matches in playoff brackets
export interface Match {
  id: number;
  tournamentId: number;
  member1Id: number;
  member2Id: number | null; // Null for BYE matches
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  createdAt?: string;
  updatedAt?: string;
  round?: number | null; // Used for round-robin scheduling
  position?: number | null; // Used for playoff bracket positioning
  nextMatchId?: number | null; // Used for playoff bracket progression
  player1RatingBefore?: number | null; // Rating snapshot before match
  player1RatingChange?: number | null; // Rating change from this match
  player2RatingBefore?: number | null;
  player2RatingChange?: number | null;
}

// Standalone Match Interface
// Represents a match that is NOT part of any tournament
// These are individual matches recorded between two members
// Displayed interspersed with completed tournaments by date
export interface StandaloneMatch {
  id: number;
  member1Id: number;
  member2Id: number;
  member1: Member; // Full member details included
  member2: Member; // Full member details included
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  createdAt: string;
  updatedAt?: string;
  player1RatingBefore?: number | null;
  player1RatingChange?: number | null;
  player2RatingBefore?: number | null;
  player2RatingChange?: number | null;
}

// Bracket Match Interface
// Represents a position in a playoff bracket structure
// Links to actual Match when played, or remains empty for future matches
export interface BracketMatch {
  id: number;
  round: number; // 1 = finals, 2 = semi-finals, etc.
  position: number; // Position within the round
  member1Id: number | null; // Null until determined by previous matches
  member2Id: number | null; // Null until determined by previous matches
  nextMatchId: number | null; // Which bracket match the winner advances to
  match?: Match | null; // Actual match result if played
}

// Preliminary Round Robin Config Interface
// Configuration for PRELIMINARY_WITH_FINAL_ROUND_ROBIN compound tournaments
export interface PreliminaryRoundRobinConfig {
  id: number;
  tournamentId: number;
  finalRoundRobinSize: number;
  autoQualifiedCount: number;
  autoQualifiedMemberIds: number[];
}

// Tournament Interface
// Main tournament entity supporting both basic and compound tournament types
// Basic tournaments have participants and matches directly
// Compound tournaments have childTournaments instead
export interface Tournament {
  id: number;
  name: string | null;
  type: TournamentType; // Required: identifies the plugin type for tournament-specific actions
  status: TournamentStatus;
  cancelled?: boolean; // True if tournament was cancelled (moved to completed but not finished)
  parentTournamentId?: number | null; // For child tournaments in compound structures
  createdAt: string;
  recordedAt?: string; // When results were recorded (for historical tournaments)
  participants: TournamentParticipant[]; // Only for basic tournaments
  matches: Match[]; // Only for basic tournaments
  bracketMatches?: BracketMatch[]; // Playoff bracket structure
  swissData?: SwissTournamentData; // Swiss tournament configuration
  swissRounds?: SwissRound[]; // Swiss tournament rounds
  swissRoundMatches?: SwissRoundMatch[]; // Swiss round pairings
  // Compound tournament specific
  groupNumber?: number | null; // For round-robin groups in compound tournaments
  childTournaments?: Tournament[]; // Child tournaments for compound types
  // PRELIMINARY_WITH_FINAL_ROUND_ROBIN configuration
  preliminaryRoundRobinConfig?: PreliminaryRoundRobinConfig | null;
}

export interface TournamentHierarchy {
  tournament: Tournament;
  children: TournamentHierarchy[];
  depth: number;
}

// Swiss Tournament Interfaces
// Swiss tournaments pair players based on current standings each round
// Players with similar records play each other
export interface SwissTournamentData {
  numberOfRounds: number;
  pairByRating: boolean;
  currentRound: number;
  isCompleted: boolean;
}

export interface SwissRound {
  id: number;
  tournamentId: number;
  roundNumber: number;
  isCompleted: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface SwissRoundMatch {
  id: number;
  swissRoundId: number;
  roundNumber: number;
  member1Id: number;
  member2Id: number;
  matchId?: number;
  tableNumber?: number;
  createdAt: string;
}

// Tournament Plugin System
// Modular architecture where each tournament type is handled by a plugin
// This eliminates type-specific conditional logic from the main component
// Each plugin provides setup, active management, and completed viewing panels
export interface TournamentPlugin {
  type: TournamentType;
  isBasic: boolean;
  name: string;
  description: string;
  icon?: React.ComponentType<{ size: number; color: string }>;

  getCreationFlow?: () => TournamentCreationFlow;

  // Creation/setup
  createSetupPanel: (props: TournamentSetupProps) => React.ReactNode;
  validateSetup: (data: any) => string | null;
  createTournament: (data: any) => Promise<Tournament>;

  // Active tournament management
  createActivePanel: (props: TournamentActiveProps) => React.ReactNode;
  createSchedulePanel: (props: TournamentScheduleProps) => React.ReactNode;

  // Completed tournament viewing
  createCompletedPanel: (props: TournamentCompletedProps) => React.ReactNode;

  // Display name for tournament type (for UI display only, no logic should depend on this)
  getTypeName?: () => string;

  // Tournament-specific calculations (eliminates conditional logic in main code)
  calculateExpectedMatches?: (tournament: Tournament) => number;
  countPlayedMatches?: (tournament: Tournament) => number;
  countNonForfeitedMatches?: (tournament: Tournament) => number;
  areAllMatchesPlayed?: (tournament: Tournament) => boolean;
  canDeleteTournament?: (tournament: Tournament) => boolean;
  getDeleteConfirmationMessage?: (tournament: Tournament) => string;

  // Cancellation handling - each type may provide specific cleanup logic
  handleCancellation?: (tournament: Tournament) => Promise<{ shouldKeepMatches: boolean; message?: string }>;

  // Schedule generation
  generateSchedule?: (tournament: Tournament) => any[];

  // Print/export
  generatePrintContent?: (tournament: Tournament) => string;

  // Additional features
  canPrintResults?: boolean;
  createPrintPanel?: (props: TournamentPrintProps) => React.ReactNode;
  renderHeader?: (props: { tournament: Tournament; onEditClick: () => void }) => React.ReactNode;
}

export interface TournamentCreationFlow {
  minPlayers: number;
  maxPlayers: number; // -1 means unlimited
  steps: TournamentCreationStep[];
  // If provided, the plugin owns the entire post-player-selection flow.
  // Players.tsx will render this instead of its own step-based UI.
  renderPostSelectionFlow?: (props: PostSelectionFlowProps) => React.ReactNode;
}

export interface PostSelectionFlowProps {
  selectedPlayerIds: number[];
  members: Member[];
  tournamentName: string;
  setTournamentName: (name: string) => void;
  editingTournamentId: number | null;
  onCreated: () => void;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onCancel: () => void;
  onBackToPlayerSelection: () => void;
  formatPlayerName: (firstName: string, lastName: string, order?: NameDisplayOrder) => string;
  nameDisplayOrder: NameDisplayOrder;
}

export interface TournamentCreationStep {
  id: string;
  title: string;
  render: (props: TournamentCreationStepProps) => React.ReactNode;
}

export interface TournamentCreationStepProps {
  tournamentName: string;
  setTournamentName: (name: string) => void;
  selectedPlayerIds: number[];
  members?: Member[];
  data: Record<string, any>;
  setData: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
}

export interface PanelProps {
  tournament: Tournament;
  onTournamentUpdate: (tournament: Tournament) => void;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

export interface TournamentSetupProps extends PanelProps {
  onComplete: (tournament: Tournament) => void;
  onCancel: () => void;
}

export interface TournamentActiveProps extends PanelProps {
  onMatchUpdate: (match: Match) => void;
}

export interface TournamentScheduleProps extends PanelProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export interface TournamentCompletedProps extends PanelProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export interface TournamentPrintProps extends PanelProps {}

// Panel configuration
export interface PanelConfig {
  id: string;
  title: string;
  visible: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  render: () => React.ReactNode;
  actions?: PanelAction[];
}

export interface PanelAction {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

// UI State interfaces
export interface UIState {
  activePanels: Set<string>;
  expandedPanels: Set<string>;
  panelData: Record<string, any>;
}

export interface FilterState {
  dateFilterType: string;
  dateFilterStart: string;
  dateFilterEnd: string;
  nameFilter: string;
  showActive: boolean;
  showCompleted: boolean;
}
