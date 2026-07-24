import { getAuthPolicyConfig } from '../services/systemConfigService';

/** True if member roles include Organizer or Admin (case-insensitive). */
export function memberHasElevatedRoles(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => {
    const r = String(role).toUpperCase();
    return r === 'ORGANIZER' || r === 'ADMIN';
  });
}

/**
 * Resolve whether auto privilege relinquish applies.
 * Member override: true/false wins; null/undefined inherits the club default.
 */
export function resolveAutoRelinquishPrivileges(
  memberOverride: boolean | null | undefined
): boolean {
  if (memberOverride === true) return true;
  if (memberOverride === false) return false;
  try {
    return getAuthPolicyConfig().autoRelinquishPrivileges === true;
  } catch {
    return false;
  }
}

/** Idle minutes before re-entering kiosk after a manual restore (0 = disabled). */
export function getAutoRelinquishIdleMinutes(): number {
  try {
    return getAuthPolicyConfig().autoRelinquishIdleMinutes;
  } catch {
    return 5;
  }
}

/** Whether login / session start should enter kiosk for this elevated member. */
export function shouldAutoEnterKioskMode(input: {
  roles: unknown;
  autoRelinquishPrivileges: boolean | null | undefined;
}): boolean {
  if (!memberHasElevatedRoles(input.roles)) {
    return false;
  }
  return resolveAutoRelinquishPrivileges(input.autoRelinquishPrivileges);
}
