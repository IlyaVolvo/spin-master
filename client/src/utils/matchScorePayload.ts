import { getMember, isOrganizer } from './auth';

/** Non-organizers must send opponent password for two-player tournament scores (server validates). */
export function attachOpponentPasswordIfNeeded(
  apiData: Record<string, unknown>,
  opponentPassword: string | undefined
): void {
  if (!isOrganizer() && opponentPassword?.trim()) {
    apiData.opponentPassword = opponentPassword.trim();
  }
}

/** Organizers may edit any match; players may edit only matches they are in (two-sided). */
export function canOpenTournamentMatchEditor(member1Id: number, member2Id: number | null): boolean {
  if (isOrganizer()) return true;
  const me = getMember()?.id;
  if (!me) return false;
  if (member2Id == null || member2Id === 0) return false;
  return me === member1Id || me === member2Id;
}

/** Show opponent password field: logged-in player in the match, not an organizer-only flow. */
export function shouldShowOpponentPasswordForMatchEdit(editing: {
  member1Id: number;
  member2Id: number;
}): boolean {
  if (isOrganizer()) return false;
  const me = getMember()?.id;
  if (!me) return false;
  if (editing.member2Id == null || editing.member2Id === 0) return false;
  return me === editing.member1Id || me === editing.member2Id;
}
