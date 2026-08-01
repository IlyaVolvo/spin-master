import 'express-session';

declare module 'express-session' {
  interface SessionData {
    member?: {
      id: number;
      email: string | null;
      firstName: string;
      lastName: string;
      roles: string[];
    };
    /** When true, elevated Organizer/Admin privileges are relinquished (public terminal). */
    kioskMode?: boolean;
    /** checkin | browse | tournamentScore when in kiosk mode. */
    kioskKind?: 'checkin' | 'browse' | 'tournamentScore';
    /** Tournament id when kioskKind is tournamentScore. */
    kioskTournamentId?: number;
    /** When set, check-in kiosk staff may purchase for this member until expiresAt. */
    kioskPaymentUnlock?: {
      memberId: number;
      expiresAt: number;
    };
  }
}

