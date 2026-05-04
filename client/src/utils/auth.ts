const TOKEN_KEY = 'pingpong_token';
const MEMBER_KEY = 'pingpong_member';

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





