/** True when clubDate is today and now is at or before start + grace. */
export function isHostClaimWindowOpen(args: {
  clubDate: string;
  todayYmd: string;
  startAtMs: number;
  graceMinutes: number;
  nowMs: number;
}): boolean {
  if (args.clubDate !== args.todayYmd) return false;
  return args.nowMs <= args.startAtMs + Math.max(0, args.graceMinutes) * 60 * 1000;
}

/** True when the claim window has already ended (past day, or today after grace). */
export function isHostClaimWindowPast(args: {
  clubDate: string;
  todayYmd: string;
  startAtMs: number;
  graceMinutes: number;
  nowMs: number;
}): boolean {
  if (args.clubDate < args.todayYmd) return true;
  if (args.clubDate > args.todayYmd) return false;
  return args.nowMs > args.startAtMs + Math.max(0, args.graceMinutes) * 60 * 1000;
}
