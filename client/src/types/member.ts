/** Shared member / roster types (client). */

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  emailConfirmedAt?: string | null;
  rating: number | null;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  roles: string[];
  picture?: string | null;
  phone?: string | null;
  address?: string | null;
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
  emailSent: boolean;
  successfulPlayers: Array<{ firstName: string; lastName: string; email: string }>;
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
  email: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  birthDate: string | null;
  rating: number | null;
  phone: string | null;
  address: string | null;
  picture: string | null;
  roles: string[];
  emailConfirmedAt?: string | null;
}
