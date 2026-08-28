import type { ClubDayHours } from './systemConfigService';
import { formatMinutes, parseMinutes, windowContains } from '../utils/lessonTime';

export const EDIT_SESSION_MINUTES_DEFAULT = 10;

const COACH_COLORS = [
  '#1abc9c',
  '#3498db',
  '#9b59b6',
  '#e67e22',
  '#e74c3c',
  '#16a085',
  '#2980b9',
  '#8e44ad',
  '#d35400',
  '#c0392b',
  '#27ae60',
  '#2c3e50',
  '#f39c12',
  '#7f8c8d',
  '#1a5276',
];

export function coachDisplayColor(coachProfileId: number): string {
  const id = Math.max(0, Math.floor(coachProfileId));
  return COACH_COLORS[(id * 17) % COACH_COLORS.length];
}
export const BOOKING_FROZEN_MESSAGE =
  'This coach is updating their calendar. Booking is paused until they finish.';

export type CalendarCellState = 'closed' | 'unavailable' | 'available' | 'reserved';

export type CalendarCell = {
  startTime: string;
  endTime: string;
  state: CalendarCellState;
  lessonId: number | null;
  mine: boolean;
};

export type ReservedBlock = {
  startTime: string;
  endTime: string;
  lessonId: number | null;
  mine: boolean;
};

export type AvailabilityBlock = {
  startTime: string;
  endTime: string;
};

export function isEditSessionActive(until: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(until && until.getTime() > now.getTime());
}

export function editSessionExpiry(from: Date, minutes: number): Date {
  const mins = Math.max(1, Math.floor(minutes));
  return new Date(from.getTime() + mins * 60 * 1000);
}

export function reminderIsDue(opts: {
  clubStart: Date;
  reminderHours: number;
  reminderSentAt: Date | null;
  now: Date;
}): boolean {
  if (opts.reminderHours <= 0) return false;
  if (opts.reminderSentAt) return false;
  if (opts.now.getTime() >= opts.clubStart.getTime()) return false;
  const dueAt = opts.clubStart.getTime() - opts.reminderHours * 3600 * 1000;
  return opts.now.getTime() >= dueAt;
}

export function buildTimeAxis(days: ClubDayHours[]): { start: string; end: string } | null {
  let min = 24 * 60;
  let max = 0;
  for (const hours of days) {
    if (hours.closed) continue;
    min = Math.min(min, parseMinutes(hours.open));
    max = Math.max(max, parseMinutes(hours.close));
  }
  if (max <= min) return null;
  const start = Math.floor(min / 15) * 15;
  const end = Math.ceil(max / 15) * 15;
  return { start: formatMinutes(start), end: formatMinutes(end) };
}

function cellOverlaps(
  cellStart: string,
  cellEnd: string,
  blockStart: string,
  blockEnd: string,
): boolean {
  return parseMinutes(cellStart) < parseMinutes(blockEnd) && parseMinutes(blockStart) < parseMinutes(cellEnd);
}

export function buildDayCells(opts: {
  hours: ClubDayHours;
  axisStart: string;
  axisEnd: string;
  availability: AvailabilityBlock[];
  reserved: ReservedBlock[];
}): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const axis0 = parseMinutes(opts.axisStart);
  const axis1 = parseMinutes(opts.axisEnd);
  for (let t = axis0; t < axis1; t += 15) {
    const startTime = formatMinutes(t);
    const endTime = formatMinutes(t + 15);
    if (opts.hours.closed) {
      cells.push({ startTime, endTime, state: 'closed', lessonId: null, mine: false });
      continue;
    }
    const open = parseMinutes(opts.hours.open);
    const close = parseMinutes(opts.hours.close);
    if (t < open || t + 15 > close) {
      cells.push({ startTime, endTime, state: 'closed', lessonId: null, mine: false });
      continue;
    }
    const reserved = opts.reserved.find((row) => cellOverlaps(startTime, endTime, row.startTime, row.endTime));
    if (reserved) {
      cells.push({
        startTime,
        endTime,
        state: 'reserved',
        lessonId: reserved.lessonId,
        mine: reserved.mine,
      });
      continue;
    }
    const offered = opts.availability.some((row) => windowContains(row.startTime, row.endTime, startTime, endTime));
    cells.push({
      startTime,
      endTime,
      state: offered ? 'available' : 'unavailable',
      lessonId: null,
      mine: false,
    });
  }
  return cells;
}

export function isValidDurationStart(cells: CalendarCell[], startTime: string, durationMinutes: number): boolean {
  const needed = Math.max(15, Math.floor(durationMinutes));
  const startMin = parseMinutes(startTime);
  const endMin = startMin + needed;
  for (let t = startMin; t < endMin; t += 15) {
    const cell = cells.find((c) => parseMinutes(c.startTime) === t);
    if (!cell || cell.state !== 'available') return false;
  }
  return true;
}
