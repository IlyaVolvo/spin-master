import type { AchievementCategoryId } from './categoryIds';

export type AchievementPeriodPreset = 'week' | 'month' | 'year' | 'forever';

export type AchievementScope =
  | { type: 'tournament'; tournamentId: number }
  | {
      type: 'period';
      period: AchievementPeriodPreset | 'custom';
      from: Date | null;
      to: Date | null;
    };

export type AchievementPublicMember = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  rating: number | null;
};

export type AchievementEntry = {
  rank: number;
  member: AchievementPublicMember;
  value: number;
  label: string;
  tournamentId?: number | null;
  matchId?: number | null;
  opponent?: AchievementPublicMember | null;
  winnerRatingBefore?: number | null;
  loserRatingBefore?: number | null;
  scoreLabel?: string | null;
};

export type AchievementCategoryResult = {
  id: AchievementCategoryId;
  title: string;
  entries: AchievementEntry[];
};

export type AchievementEmptyMessage = {
  text: string;
};

export type AchievementMatchRow = {
  id: number;
  tournamentId: number | null;
  rootTournamentId: number | null;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AchievementParticipantRow = {
  tournamentId: number;
  rootTournamentId: number;
  memberId: number;
  playerRatingAtTime: number | null;
  member: AchievementPublicMember;
};

export type AchievementRatingHistoryRow = {
  id: number;
  memberId: number;
  rating: number | null;
  ratingChange: number | null;
  timestamp: Date;
  reason: string;
  tournamentId: number | null;
  matchId: number | null;
};

export type AchievementTournamentMeta = {
  id: number;
  name: string | null;
  type: string;
  parentTournamentId: number | null;
  groupNumber: number | null;
  status: string;
};

export type AchievementContext = {
  scope: AchievementScope;
  prisma: any;
  matches: AchievementMatchRow[];
  participants: AchievementParticipantRow[];
  ratingHistory: AchievementRatingHistoryRow[];
  tournamentsById: Map<number, AchievementTournamentMeta>;
  /** Root ids in scope (public-eligible). */
  rootTournamentIds: number[];
  membersById: Map<number, AchievementPublicMember>;
};

export type AchievementPlugin = {
  id: AchievementCategoryId;
  title: string;
  supportsScope: (scope: AchievementScope) => boolean;
  compute: (ctx: AchievementContext) => Promise<AchievementEntry[]> | AchievementEntry[];
};
