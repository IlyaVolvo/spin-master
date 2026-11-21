/**
 * Club archive: members, tournaments, and rating history for Admin export/import.
 * Readable JSON; IDs are stable references within the file (remapped on import).
 *
 * Version 1: members, standalone matches, and completed tournaments. Import sets a
 * single trusted rating and does not restore rating history.
 * Version 2: every tournament status, full rating history, and point-exchange rules.
 */

export const CLUB_ARCHIVE_VERSION = 2 as const;
export const CLUB_ARCHIVE_VERSIONS = [1, 2] as const;

export type ClubArchiveVersion = (typeof CLUB_ARCHIVE_VERSIONS)[number];

export type ClubArchiveMemberRole = 'PLAYER' | 'COACH' | 'ADMIN' | 'ORGANIZER';
export type ClubArchiveGender = 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
export type ClubArchiveTournamentType =
  | 'ROUND_ROBIN'
  | 'PLAYOFF'
  | 'SWISS'
  | 'MULTI_ROUND_ROBINS'
  | 'PRELIMINARY_WITH_FINAL_PLAYOFF'
  | 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN';

export type ClubArchiveTournamentStatus = 'PRE_REGISTRATION' | 'ACTIVE' | 'COMPLETED';

export type ClubArchiveRatingReason =
  | 'TOURNAMENT_COMPLETED'
  | 'MATCH_COMPLETED'
  | 'RESULT_CORRECTED'
  | 'MANUAL_ADJUSTMENT'
  | 'INITIAL_RATING';

export interface ClubArchiveMember {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  gender: ClubArchiveGender;
  birthDate: string | null; // YYYY-MM-DD
  roles: ClubArchiveMemberRole[];
  rating: number | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  tournamentNotificationsEnabled: boolean;
  autoRelinquishPrivileges: boolean | null;
}

export interface ClubArchiveParticipant {
  memberId: number;
  playerRatingAtTime: number | null;
}

export interface ClubArchiveMatch {
  id: number;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  notPlayed: boolean;
  round: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ClubArchiveBracketMatch {
  id: number;
  round: number;
  position: number;
  member1Id: number | null;
  member2Id: number | null;
  nextBracketMatchId: number | null;
  matchId: number | null;
}

export interface ClubArchiveSwissData {
  numberOfRounds: number;
  pairByRating: boolean;
  currentRound: number;
  isCompleted: boolean;
}

export interface ClubArchivePreliminaryConfig {
  finalSize: number;
  autoQualifiedCount: number;
  autoQualifiedMemberIds: number[];
  qualifiersPerGroup: number;
}

export interface ClubArchiveTournament {
  id: number;
  name: string | null;
  type: ClubArchiveTournamentType;
  status: ClubArchiveTournamentStatus;
  cancelled: boolean;
  createdAt: string | null;
  recordedAt: string | null;
  tournamentDate: string | null; // ISO
  minRating: number | null;
  maxRating: number | null;
  maxParticipants: number | null;
  groupNumber: number | null;
  participants: ClubArchiveParticipant[];
  matches: ClubArchiveMatch[];
  bracketMatches: ClubArchiveBracketMatch[];
  swissData: ClubArchiveSwissData | null;
  preliminaryConfig: ClubArchivePreliminaryConfig | null;
  children: ClubArchiveTournament[];
}

export interface ClubArchiveStandaloneMatch {
  id: number;
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  notPlayed: boolean;
  createdAt: string; // ISO — ordering hint
  updatedAt?: string | null;
}

export interface ClubArchiveRatingHistoryEntry {
  memberId: number;
  rating: number | null;
  ratingChange: number | null;
  timestamp: string;
  reason: ClubArchiveRatingReason;
  tournamentId: number | null;
  matchId: number | null;
}

export interface ClubArchivePointExchangeRule {
  minDiff: number;
  maxDiff: number;
  expectedPoints: number;
  upsetPoints: number;
  effectiveFrom: string;
}

export interface ClubArchiveDocument {
  version: ClubArchiveVersion;
  exportedAt: string;
  members: ClubArchiveMember[];
  standaloneMatches: ClubArchiveStandaloneMatch[];
  tournaments: ClubArchiveTournament[];
  /** Empty for version 1. */
  ratingHistory: ClubArchiveRatingHistoryEntry[];
  /** Empty for version 1. */
  pointExchangeRules: ClubArchivePointExchangeRule[];
}

export interface ClubArchiveImportResult {
  membersCreated: number;
  membersUpdated: number;
  tournamentsCreated: number;
  matchesCreated: number;
  standaloneMatchesCreated: number;
  ratingHistoryCreated: number;
}
