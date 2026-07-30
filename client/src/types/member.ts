/** Shared member / roster types (client). */

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  emailConfirmedAt?: string | null;
  rating: number | null;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
  roles: string[];
  picture?: string | null;
  phone?: string | null;
  address?: string | null;
  segment?: string | null;
  /** Inclusive last day of free trial (YYYY-MM-DD or ISO); admin-managed. */
  trialEndsOn?: string | null;
  /** Consent to use online/automatic payment (requires email). */
  onlinePayConsent?: boolean;
  tournamentNotificationsEnabled?: boolean;
  /** Present on session/me payloads when returned by API. */
  hasPassword?: boolean;
  /** null = inherit club default; only meaningful for Organizer/Admin. */
  autoRelinquishPrivileges?: boolean | null;
  /** Admin roster only (`/players/all-members`): current plan status for $ indicator. */
  planIndicator?: 'active' | 'expiring_soon' | 'none';
}

export interface SimilarName {
  name: string;
  similarity: number;
}

export interface ImportParseReport {
  fileErrors: string[];
  totalDataRows: number;
  validRows: number;
  rejectedRows: number;
  failedRows: Array<{ rowNumber: number; rawLine: string; messages: string[] }>;
}

export interface PlayerImportResultsPayload {
  total: number;
  successful: number;
  failed: number;
  emailFailed: number;
  addedWithoutEmail?: number;
  emailSent: boolean;
  successfulPlayers: Array<{ firstName: string; lastName: string; email: string | null }>;
  failedPlayers: Array<{
    firstName: string;
    lastName: string;
    email?: string;
    birthDate?: string | null;
    error: string;
  }>;
  emailFailedPlayers: Array<{ firstName: string; lastName: string; email: string; error: string }>;
}

export interface PendingPlayerData {
  firstName: string;
  lastName: string;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
  birthDate: string | null;
  rating: number | null;
  phone: string | null;
  address: string | null;
  picture: string | null;
  roles: string[];
  tournamentNotificationsEnabled?: boolean;
  emailConfirmedAt?: string | null;
}
