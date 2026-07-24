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
  }
}

