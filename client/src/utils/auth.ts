const TOKEN_KEY = 'pingpong_token';
const MEMBER_KEY = 'pingpong_member';
const AUTH_EXPIRED_MESSAGE_KEY = 'pingpong_auth_expired_message';

export const DEFAULT_AUTH_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

export interface Member {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  rating?: number | null;
  isActive?: boolean;
  emailConfirmedAt?: string | null;
  mustResetPassword?: boolean;
  tournamentNotificationsEnabled?: boolean;
  /** From API: false when password is unset (admin reset / invite). */
  hasPassword?: boolean;
}

type AuthExpiredListener = (message: string) => void;

const authExpiredListeners = new Set<AuthExpiredListener>();
let authExpiryHandling = false;

// Token-based auth (for backward compatibility with User login)
export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

// Session-based auth (for Member login)
export const getMember = (): Member | null => {
  const memberStr = localStorage.getItem(MEMBER_KEY);
  return memberStr ? JSON.parse(memberStr) : null;
};

export const setMember = (member: Member): void => {
  localStorage.setItem(MEMBER_KEY, JSON.stringify(member));
};

export const removeMember = (): void => {
  localStorage.removeItem(MEMBER_KEY);
};

export const isAuthenticated = (): boolean => {
  return !!(getToken() || getMember());
};

export const getAuthHeaders = () => {
  const token = getToken();
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

export function consumeAuthExpiredMessage(): string | null {
  try {
    const message = sessionStorage.getItem(AUTH_EXPIRED_MESSAGE_KEY);
    if (message) {
      sessionStorage.removeItem(AUTH_EXPIRED_MESSAGE_KEY);
      return message;
    }
  } catch {
    // sessionStorage may be unavailable
  }
  return null;
}

export function subscribeAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

/**
 * Clear local auth and notify the app that the user must log in again.
 * Safe to call multiple times for concurrent 401s.
 */
export function handleAuthExpired(message: string = DEFAULT_AUTH_EXPIRED_MESSAGE): void {
  if (authExpiryHandling) {
    return;
  }
  if (!getToken() && !getMember()) {
    return;
  }

  authExpiryHandling = true;
  try {
    removeToken();
    removeMember();
    try {
      sessionStorage.setItem(AUTH_EXPIRED_MESSAGE_KEY, message);
    } catch {
      // sessionStorage may be unavailable
    }
    authExpiredListeners.forEach((listener) => {
      try {
        listener(message);
      } catch {
        // Ignore listener errors so one bad subscriber cannot block logout
      }
    });
  } finally {
    // Allow a later expiry after the user logs in again
    queueMicrotask(() => {
      authExpiryHandling = false;
    });
  }
}

const AUTH_FAILURE_CODES = new Set([
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'AUTHENTICATION_REQUIRED',
  'SESSION_EXPIRED',
]);

const NON_SESSION_401_PATTERNS = [
  /invalid credentials/i,
  /invalid password/i,
  /invalid opponent password/i,
  /current password is incorrect/i,
  /password confirmation/i,
];

/**
 * True when a 401 means the user's login session/token is no longer valid
 * (vs. a password check or login form failure).
 */
export function isSessionAuthFailure(status?: number, data?: any, requestUrl?: string): boolean {
  if (status !== 401) {
    return false;
  }

  const url = (requestUrl || '').toLowerCase();
  if (
    url.includes('/auth/member/login') ||
    url.includes('/auth/member/forgot') ||
    url.includes('/auth/member/reset') ||
    url.includes('/auth/login')
  ) {
    return false;
  }

  const code = typeof data?.code === 'string' ? data.code : '';
  if (AUTH_FAILURE_CODES.has(code)) {
    return true;
  }

  const errorText = typeof data?.error === 'string'
    ? data.error
    : typeof data?.message === 'string'
      ? data.message
      : '';

  if (NON_SESSION_401_PATTERNS.some((pattern) => pattern.test(errorText))) {
    return false;
  }

  // Only treat generic 401s as session loss when the client believed it was logged in
  return isAuthenticated() && (
    /not authenticated/i.test(errorText) ||
    /authentication required/i.test(errorText) ||
    /invalid token/i.test(errorText) ||
    /session has expired/i.test(errorText) ||
    /jwt expired/i.test(errorText) ||
    errorText === ''
  );
}

// Role checking utilities — case-insensitive, aligned with server organizerAccess / Prisma enum quirks

function memberRolesUpper(member: Member | null): string[] {
  if (!member?.roles || !Array.isArray(member.roles)) return [];
  return member.roles.map((r) => String(r).toUpperCase());
}

/** True if the logged-in member has this role (case-insensitive). */
export const hasMemberRole = (role: string): boolean => {
  const want = role.toUpperCase();
  return memberRolesUpper(getMember()).includes(want);
};

export const isAdmin = (): boolean => hasMemberRole('ADMIN');

export const isOrganizer = (): boolean => hasMemberRole('ORGANIZER');

export const canEditMember = (memberId: number): boolean => {
  const member = getMember();
  if (!member) return false;
  // Can edit if it's their own profile or if they're an Admin
  return member.id === memberId || isAdmin();
};
