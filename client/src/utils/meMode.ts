import { getMember, type Member } from './auth';

export const ME_COMPACT_MAX_PX = 768;
/**
 * Full-app header needs logo + Actions + ~5 icon controls on one row.
 * Below this width (or in portrait on a compact device) require landscape / wider layout.
 */
export const FULL_APP_MIN_WIDTH_PX = 700;
const PREFER_FULL_APP_KEY = 'pingpong_prefer_full_app';

/** True when the narrower viewport side is phone/compact-sized. */
export function isCompactViewport(
  width: number = typeof window !== 'undefined' ? window.innerWidth : ME_COMPACT_MAX_PX + 1,
  height: number = typeof window !== 'undefined' ? window.innerHeight : ME_COMPACT_MAX_PX + 1,
): boolean {
  return Math.min(width, height) <= ME_COMPACT_MAX_PX;
}

export function isPortraitViewport(
  width: number = typeof window !== 'undefined' ? window.innerWidth : ME_COMPACT_MAX_PX + 1,
  height: number = typeof window !== 'undefined' ? window.innerHeight : ME_COMPACT_MAX_PX + 1,
): boolean {
  return height > width;
}

/**
 * Full app (Players / Tournaments / Admin shell) needs a landscape-capable width.
 * `/me` is exempt. Triggered by portrait on a compact device, or any width too narrow
 * for the header row (logo, Actions, icon cluster).
 */
export function requiresLandscapeForFullApp(
  width: number = typeof window !== 'undefined' ? window.innerWidth : FULL_APP_MIN_WIDTH_PX + 1,
  height: number = typeof window !== 'undefined' ? window.innerHeight : FULL_APP_MIN_WIDTH_PX + 1,
): boolean {
  if (width < FULL_APP_MIN_WIDTH_PX) return true;
  if (isCompactViewport(width, height) && isPortraitViewport(width, height)) return true;
  return false;
}

export function memberHasPlayerRole(member: Member | null | undefined): boolean {
  if (!member?.roles || !Array.isArray(member.roles)) return false;
  return member.roles.some((r) => String(r).toUpperCase() === 'PLAYER');
}

export function getPreferFullApp(): boolean {
  try {
    return sessionStorage.getItem(PREFER_FULL_APP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPreferFullApp(prefer: boolean): void {
  try {
    if (prefer) {
      sessionStorage.setItem(PREFER_FULL_APP_KEY, '1');
    } else {
      sessionStorage.removeItem(PREFER_FULL_APP_KEY);
    }
  } catch {
    // sessionStorage may be unavailable
  }
}

export function clearPreferFullApp(): void {
  setPreferFullApp(false);
}

/**
 * Default landing should be `/me` when compact + Player role,
 * not in kiosk, and the user has not chosen Full app this session.
 */
export function shouldDefaultToMe(member: Member | null | undefined = getMember()): boolean {
  if (!member) return false;
  if (member.kioskMode === true) return false;
  if (!memberHasPlayerRole(member)) return false;
  if (getPreferFullApp()) return false;
  if (!isCompactViewport()) return false;
  return true;
}

/** Show the header “Me” return control (compact Player, including after Full app). */
export function shouldShowMeReturnLink(member: Member | null | undefined = getMember()): boolean {
  if (!member) return false;
  if (member.kioskMode === true) return false;
  if (!memberHasPlayerRole(member)) return false;
  return isCompactViewport();
}

export function defaultAuthenticatedPath(
  member: Member | null | undefined = getMember(),
): '/me' | '/players' {
  return shouldDefaultToMe(member) ? '/me' : '/players';
}
