import api from './api';
import { setToken, setMember, type KioskKind } from './auth';

export type EnterKioskOptions = {
  kind: KioskKind;
  tournamentId?: number;
};

/**
 * Enter kiosk mode with the given kind, refresh session member, and return
 * the destination path for navigation.
 */
export async function enterKioskMode(options: EnterKioskOptions): Promise<string> {
  const body: { kind: KioskKind; tournamentId?: number } = { kind: options.kind };
  if (options.kind === 'tournamentScore' && options.tournamentId != null) {
    body.tournamentId = options.tournamentId;
  }

  const response = await api.post('/auth/member/relinquish-privileges', body);
  if (response.data.token) {
    setToken(response.data.token);
  }

  const me = await api.get('/auth/member/me');
  if (me.data.member) {
    setMember(me.data.member);
  }

  window.dispatchEvent(new CustomEvent('kiosk-mode-changed'));

  if (options.kind === 'checkin') {
    return '/players';
  }
  if (options.kind === 'tournamentScore' && options.tournamentId != null) {
    return `/tournaments/${options.tournamentId}`;
  }
  return '/players';
}

/** Auto-relinquish default: browse if Organizer, else checkin if Admin. */
export function defaultKioskKindForRoles(roles: string[] | undefined): KioskKind | null {
  const upper = (roles || []).map((r) => String(r).toUpperCase());
  if (upper.includes('ORGANIZER')) return 'browse';
  if (upper.includes('ADMIN')) return 'checkin';
  return null;
}
