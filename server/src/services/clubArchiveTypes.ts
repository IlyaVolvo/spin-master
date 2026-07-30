/**
 * Club archive (v1): members + completed tournaments for Admin export/import.
 * Readable JSON; IDs are stable references within the file (remapped on import).
 */

export const CLUB_ARCHIVE_VERSION = 1 as const;

export type ClubArchiveMemberRole = 'PLAYER' | 'COACH' | 'ADMIN' | 'ORGANIZER';
export type ClubArchiveGender = 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
export type ClubArchiveTournamentType =
  | 'ROUND_ROBIN'
  | 'PLAYOFF'
  | 'SWISS'
  | 'MULTI_ROUND_ROBINS'
  | 'PRELIMINARY_WITH_FINAL_PLAYOFF'
  | 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN';

export interface ClubArchiveMember {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  gender: ClubArchiveGender;
  birthDate: string | null; // YYYY-MM-DD
  roles: ClubArchiveMemberRole[];
  rating: number | null; // trusted club rating after import
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
}

export interface ClubArchiveTournament {
  id: number;
  name: string | null;
  type: ClubArchiveTournamentType;
  status: 'COMPLETED';
  cancelled: boolean;
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
}

export interface ClubArchiveDocument {
  version: typeof CLUB_ARCHIVE_VERSION;
  exportedAt: string;
  members: ClubArchiveMember[];
  standaloneMatches: ClubArchiveStandaloneMatch[];
  tournaments: ClubArchiveTournament[];
}

export interface ClubArchiveImportResult {
  membersCreated: number;
  membersUpdated: number;
  tournamentsCreated: number;
  matchesCreated: number;
  standaloneMatchesCreated: number;
}
