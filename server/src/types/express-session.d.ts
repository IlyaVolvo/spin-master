import 'express-session';

declare module 'express-session' {
  interface SessionData {
    member?: {
      id: number;
      email: string;
      firstName: string;
      lastName: string;
      roles: string[];
    };
  }
}

