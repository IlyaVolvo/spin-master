import { clubLocalDateTimeUtc, getClubDate } from '../utils/clubDate';
import { getPaymentsConfig } from '../services/systemConfigService';
import { isHostClaimWindowOpen, isHostClaimWindowPast } from './hostWindowMath';

export { isHostClaimWindowOpen, isHostClaimWindowPast } from './hostWindowMath';

export function hostGraceMinutes(configMinutes?: number): number {
  if (typeof configMinutes === 'number' && Number.isFinite(configMinutes)) {
    return Math.max(0, Math.floor(configMinutes));
  }
  return Math.max(0, Math.floor(Number(getPaymentsConfig().hostGraceMinutes) || 30));
}

export function hostWindowClosesAt(
  clubDate: string,
  startTime: string,
  endTime: string,
  graceMinutes: number,
  timeZone?: string,
): Date {
  const startAt = clubLocalDateTimeUtc(clubDate, startTime, timeZone);
  const endAt = clubLocalDateTimeUtc(clubDate, endTime, timeZone);
  const afterStart = startAt.getTime() + Math.max(0, graceMinutes) * 60 * 1000;
  return new Date(Math.max(afterStart, endAt.getTime()));
}

export function hostClaimWindowState(
  clubDate: string,
  startTime: string,
  endTime: string,
  now: Date = new Date(),
  graceMinutes: number = hostGraceMinutes(),
): { open: boolean; past: boolean; closesAt: Date } {
  const todayYmd = getClubDate(now);
  const startAt = clubLocalDateTimeUtc(clubDate, startTime);
  const endAt = clubLocalDateTimeUtc(clubDate, endTime);
  const closesAt = hostWindowClosesAt(clubDate, startTime, endTime, graceMinutes);
  const args = {
    clubDate,
    todayYmd,
    startAtMs: startAt.getTime(),
    endAtMs: endAt.getTime(),
    graceMinutes,
    nowMs: now.getTime(),
  };
  return {
    open: isHostClaimWindowOpen(args),
    past: isHostClaimWindowPast(args),
    closesAt,
  };
}
