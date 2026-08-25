/** Close at the later of (start + grace) and slot end, so duty hours stay claimable. */
export function hostClaimClosesAtMs(
  startAtMs: number,
  endAtMs: number,
  graceMinutes: number,
): number {
  const afterStart = startAtMs + Math.max(0, graceMinutes) * 60 * 1000;
  return Math.max(afterStart, endAtMs);
}

/** True when clubDate is today and now is at or before max(start + grace, slot end). */
export function isHostClaimWindowOpen(args: {
  clubDate: string;
  todayYmd: string;
  startAtMs: number;
  endAtMs: number;
  graceMinutes: number;
  nowMs: number;
}): boolean {
  if (args.clubDate !== args.todayYmd) return false;
  return args.nowMs <= hostClaimClosesAtMs(args.startAtMs, args.endAtMs, args.graceMinutes);
}

/** True when the claim window has already ended (past day, or today after close). */
export function isHostClaimWindowPast(args: {
  clubDate: string;
  todayYmd: string;
  startAtMs: number;
  endAtMs: number;
  graceMinutes: number;
  nowMs: number;
}): boolean {
  if (args.clubDate < args.todayYmd) return true;
  if (args.clubDate > args.todayYmd) return false;
  return args.nowMs > hostClaimClosesAtMs(args.startAtMs, args.endAtMs, args.graceMinutes);
}
