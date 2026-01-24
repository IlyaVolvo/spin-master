export enum TournamentType {
  // Basic tournaments
  ROUND_ROBIN = 'ROUND_ROBIN',
  PLAYOFF = 'PLAYOFF',
  SWISS = 'SWISS',
  
  // Compound tournaments
  PRELIMINARY_WITH_FINAL_PLAYOFF = 'PRELIMINARY_WITH_FINAL_PLAYOFF',
  PRELIMINARY_WITH_FINAL_ROUND_ROBIN = 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
}

export enum TournamentStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null;
}

export interface TournamentParticipant {
  id: number;
  memberId: number;
  member: Member;
  playerRatingAtTime: number | null;
  postRatingAtTime?: number | null;
}

export interface Match {
  id: number;
  tournamentId: number;
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

export interface BracketMatch {
  id: number;
  round: number;
  position: number;
  member1Id: number | null;
  member2Id: number | null;
  nextMatchId: number | null;
  match?: Match | null;
}

export interface Tournament {
  id: number;
  name: string | null;
  type: TournamentType;
  status: TournamentStatus;
  parentTournamentId?: number | null;
  createdAt: string;
  updatedAt: string;
  recordedAt?: string | null;
  participants: TournamentParticipant[];
  matches: Match[];
  bracketMatches?: BracketMatch[];
  swissData?: SwissTournamentData;
  swissRounds?: SwissRound[];
  swissRoundMatches?: SwissRoundMatch[];
  // Compound tournament specific
  groupNumber?: number | null;
  childTournaments?: Tournament[];
}

export interface TournamentHierarchy {
  tournament: Tournament;
  children: TournamentHierarchy[];
  depth: number;
}

// Swiss tournament specific interfaces
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

// Plugin system interfaces
export interface TournamentPlugin {
  type: TournamentType;
  isBasic: boolean;
  name: string;
  description: string;
  icon?: React.ComponentType<{ size: number; color: string }>;
  
  // Creation/setup
  createSetupPanel: (props: TournamentSetupProps) => React.ReactNode;
  validateSetup: (data: any) => string | null;
  createTournament: (data: any) => Promise<Tournament>;
  
  // Active tournament management
  createActivePanel: (props: TournamentActiveProps) => React.ReactNode;
  createSchedulePanel: (props: TournamentScheduleProps) => React.ReactNode;
  
  // Completed tournament viewing
  createCompletedPanel: (props: TournamentCompletedProps) => React.ReactNode;
  
  // Additional features
  canPrintResults?: boolean;
  createPrintPanel?: (props: TournamentPrintProps) => React.ReactNode;
  renderHeader?: (props: { tournament: Tournament; onEditClick: () => void }) => React.ReactNode;
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
