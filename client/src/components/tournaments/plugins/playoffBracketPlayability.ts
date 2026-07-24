/**
 * Playoff-only: when a first-time result may be recorded (aligned with server
 * recordPlayoffBracketMatchResult / PlayoffBracketResultError messages).
 * Other tournament types do not import this module.
 */

export type PlayoffBracketSlotForGuard = {
  member1Id: number | null | undefined;
  member2Id: number | null | undefined;
  /** Set when a Match row is already linked to this bracket slot */
  linkedMatch?: unknown | null;
};

/**
 * @returns null if a first result may be recorded; otherwise a user-facing reason to block entry.
 */
export function getPlayoffFirstResultBlockedReason(
  slot: PlayoffBracketSlotForGuard
): string | null {
  if (slot.linkedMatch != null) {
    return 'Match already has a result. Clear it first to re-enter.';
  }
  const m1 = slot.member1Id;
  const m2 = slot.member2Id;
  if (m1 === 0 || m2 === 0) {
    return 'Cannot update BYE match';
  }
  if (m1 == null || m2 == null) {
    return 'Both players must be determined before entering a result';
  }
  return null;
}

export function canRecordPlayoffFirstResult(slot: PlayoffBracketSlotForGuard): boolean {
  return getPlayoffFirstResultBlockedReason(slot) === null;
}
