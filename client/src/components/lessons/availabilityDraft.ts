import { addDaysToYmd } from '../../utils/clubDateTime';

export type DraftWindow = {
  key: string;
  occurrenceId: number | null;
  clubDate: string;
  startTime: string;
  endTime: string;
};

export type DayHours = { closed: true } | { closed: false; open: string; close: string };

export type ReservedBlock = {
  clubDate: string;
  startTime: string;
  endTime: string;
  lessonId?: number | null;
  kind?: 'individual' | 'group';
  playerFirstName?: string | null;
  playerLastName?: string | null;
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type AxisTimeLabel = {
  time: string;
  minutesFromStart: number;
  kind: 'start' | 'hour' | 'end';
};

/** Boundary times plus on-the-hour marks between them (no :15 / :30 / :45 labels). */
export function axisTimeLabels(axis: { start: string; end: string }): AxisTimeLabel[] {
  const startM = parseMinutes(axis.start);
  const endM = parseMinutes(axis.end);
  if (endM <= startM) return [{ time: axis.start, minutesFromStart: 0, kind: 'start' }];
  const labels: AxisTimeLabel[] = [{ time: axis.start, minutesFromStart: 0, kind: 'start' }];
  const firstHour = Math.ceil((startM + 1) / 60) * 60;
  for (let t = firstHour; t < endM; t += 60) {
    labels.push({ time: formatMinutes(t), minutesFromStart: t - startM, kind: 'hour' });
  }
  labels.push({ time: axis.end, minutesFromStart: endM - startM, kind: 'end' });
  return labels;
}

export function addMinutes(hhmm: string, delta: number): string {
  return formatMinutes(parseMinutes(hhmm) + delta);
}

export function windowContainsRange(
  windowStart: string,
  windowEnd: string,
  startTime: string,
  endTime: string,
): boolean {
  return parseMinutes(startTime) >= parseMinutes(windowStart) && parseMinutes(endTime) <= parseMinutes(windowEnd);
}

/** Consecutive weekly copies of this start/end that still fit a coach's free windows, including the first date. */
export function countConsecutiveRepeatWeeks(opts: {
  windows: Array<{ clubDate: string; startTime: string; endTime: string }>;
  clubDate: string;
  startTime: string;
  endTime: string;
  horizonTo: string;
  addDays: (ymd: string, n: number) => string;
}): number {
  let count = 0;
  let date = opts.clubDate;
  while (date <= opts.horizonTo) {
    const fits = opts.windows.some(
      (window) => window.clubDate === date && windowContainsRange(window.startTime, window.endTime, opts.startTime, opts.endTime),
    );
    if (!fits) break;
    count += 1;
    date = opts.addDays(date, 7);
  }
  return count;
}

export function untilOnForWeeklyCount(startsOn: string, weeks: number, addDays: (ymd: string, n: number) => string): string {
  const count = Math.max(1, Math.floor(weeks));
  return addDays(startsOn, 7 * (count - 1));
}

export function snapToAllowedDuration(
  draggedMinutes: number,
  allowedMinutes: number[],
  maxFitMinutes: number,
): number | null {
  const allowed = [...new Set(allowedMinutes.map((m) => Math.floor(Number(m) || 0)))].filter(
    (m) => m >= 15 && m <= maxFitMinutes && m % 15 === 0,
  );
  if (!allowed.length) return null;
  const target = Math.max(15, Math.floor(draggedMinutes));
  let best = allowed[0];
  for (const m of allowed) {
    const d = Math.abs(m - target);
    const bd = Math.abs(best - target);
    if (d < bd || (d === bd && m > best)) best = m;
  }
  return best;
}

export function snapDown(hhmm: string): string {
  const mins = parseMinutes(hhmm);
  return formatMinutes(Math.floor(mins / 15) * 15);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return parseMinutes(aStart) < parseMinutes(bEnd) && parseMinutes(bStart) < parseMinutes(aEnd);
}

export function newDraftKey(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidHhmm(value: string): boolean {
  return HHMM.test(value);
}

export function othersOnDay(windows: DraftWindow[], clubDate: string, ignoreKey?: string): DraftWindow[] {
  return windows.filter((w) => w.clubDate === clubDate && w.key !== ignoreKey);
}

export function reservedOnDay(reserved: ReservedBlock[], clubDate: string): ReservedBlock[] {
  return reserved.filter((r) => r.clubDate === clubDate);
}

/** Merge same-person blocks that touch or overlap on a day (display one span, not hourly chips). */
export function mergeTouchingTimeBlocks<T extends { clubDate: string; startTime: string; endTime: string }>(
  blocks: T[],
  sameGroup: (a: T, b: T) => boolean,
  absorb?: (into: T, from: T) => void,
): T[] {
  const sorted = [...blocks].sort((a, b) => {
    if (a.clubDate !== b.clubDate) return a.clubDate.localeCompare(b.clubDate);
    return parseMinutes(a.startTime) - parseMinutes(b.startTime) || parseMinutes(a.endTime) - parseMinutes(b.endTime);
  });
  const out: T[] = [];
  for (const block of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.clubDate === block.clubDate &&
      sameGroup(last, block) &&
      parseMinutes(last.endTime) >= parseMinutes(block.startTime)
    ) {
      if (parseMinutes(block.endTime) > parseMinutes(last.endTime)) last.endTime = block.endTime;
      absorb?.(last, block);
      continue;
    }
    out.push({ ...block });
  }
  return out;
}

/** Latest end allowed when creating from `startTime` — club close or next busy block, not other free windows. */
export function maxCreateEnd(startTime: string, hours: DayHours, reserved: ReservedBlock[]): string | null {
  if (hours.closed) return null;
  const start = parseMinutes(startTime);
  const close = parseMinutes(hours.close);
  if (start < parseMinutes(hours.open) || start + 15 > close) return null;
  let max = close;
  for (const r of reserved) {
    const rs = parseMinutes(r.startTime);
    if (rs >= start && rs < max) max = rs;
  }
  if (max < start + 15) return null;
  return formatMinutes(max);
}

export function clampCreateEnd(
  startTime: string,
  proposedEnd: string,
  hours: DayHours,
  reserved: ReservedBlock[],
): string | null {
  const max = maxCreateEnd(startTime, hours, reserved);
  if (!max) return null;
  const minEnd = addMinutes(startTime, 15);
  const snapped = formatMinutes(Math.max(parseMinutes(minEnd), Math.ceil(parseMinutes(proposedEnd) / 15) * 15));
  if (parseMinutes(snapped) > parseMinutes(max)) return max;
  if (parseMinutes(snapped) < parseMinutes(minEnd)) return minEnd;
  return snapped;
}

export function clampResize(opts: {
  window: DraftWindow;
  edge: 'start' | 'end';
  proposed: string;
  hours: DayHours;
  reserved: ReservedBlock[];
}): { startTime: string; endTime: string } | null {
  const { window: slot, edge, hours } = opts;
  if (hours.closed) return null;
  const open = parseMinutes(hours.open);
  const close = parseMinutes(hours.close);
  const reserved = reservedOnDay(opts.reserved, slot.clubDate);
  const start0 = parseMinutes(slot.startTime);
  const end0 = parseMinutes(slot.endTime);

  if (edge === 'end') {
    let minEnd = start0 + 15;
    let maxEnd = close;
    for (const r of reserved) {
      const rs = parseMinutes(r.startTime);
      const re = parseMinutes(r.endTime);
      if (rs < end0 && re > start0) minEnd = Math.max(minEnd, re);
      if (rs >= end0) maxEnd = Math.min(maxEnd, rs);
    }
    if (minEnd > maxEnd) return null;
    let end = Math.round(parseMinutes(opts.proposed) / 15) * 15;
    end = Math.max(minEnd, Math.min(maxEnd, end));
    return { startTime: slot.startTime, endTime: formatMinutes(end) };
  }

  let maxStart = end0 - 15;
  let minStart = open;
  for (const r of reserved) {
    const rs = parseMinutes(r.startTime);
    const re = parseMinutes(r.endTime);
    if (rs < end0 && re > start0) maxStart = Math.min(maxStart, rs);
    if (re <= start0) minStart = Math.max(minStart, re);
  }
  if (minStart > maxStart) return null;
  let start = Math.round(parseMinutes(opts.proposed) / 15) * 15;
  start = Math.max(minStart, Math.min(maxStart, start));
  return { startTime: formatMinutes(start), endTime: slot.endTime };
}

/** Merge this window with any free windows it now touches or overlaps. */
export function absorbTouching(
  slot: DraftWindow,
  windows: DraftWindow[],
): { keep: DraftWindow; removeKeys: string[] } {
  const removeKeys: string[] = [];
  let start = parseMinutes(slot.startTime);
  let end = parseMinutes(slot.endTime);
  let occurrenceId = slot.occurrenceId;
  let changed = true;
  while (changed) {
    changed = false;
    for (const other of windows) {
      if (other.key === slot.key || other.clubDate !== slot.clubDate) continue;
      if (removeKeys.includes(other.key)) continue;
      const os = parseMinutes(other.startTime);
      const oe = parseMinutes(other.endTime);
      if (end < os || start > oe) continue;
      start = Math.min(start, os);
      end = Math.max(end, oe);
      if (occurrenceId == null && other.occurrenceId != null) occurrenceId = other.occurrenceId;
      removeKeys.push(other.key);
      changed = true;
    }
  }
  return {
    keep: { ...slot, startTime: formatMinutes(start), endTime: formatMinutes(end), occurrenceId },
    removeKeys,
  };
}

export function replaceWithAbsorbed(windows: DraftWindow[], slot: DraftWindow): DraftWindow[] {
  const { keep, removeKeys } = absorbTouching(slot, windows);
  return [...windows.filter((w) => w.key !== slot.key && !removeKeys.includes(w.key)), keep];
}

export function mergeAdjacentWindows(windows: DraftWindow[]): DraftWindow[] {
  const byDate = new Map<string, DraftWindow[]>();
  for (const w of windows) {
    const list = byDate.get(w.clubDate) ?? [];
    list.push(w);
    byDate.set(w.clubDate, list);
  }
  const out: DraftWindow[] = [];
  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));
    if (!sorted.length) continue;
    let cur: DraftWindow = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i += 1) {
      const next = sorted[i];
      if (parseMinutes(cur.endTime) >= parseMinutes(next.startTime)) {
        cur = {
          ...cur,
          endTime: formatMinutes(Math.max(parseMinutes(cur.endTime), parseMinutes(next.endTime))),
          occurrenceId: cur.occurrenceId ?? next.occurrenceId,
        };
      } else {
        out.push(cur);
        cur = { ...next };
      }
    }
    out.push(cur);
  }
  return out;
}

export function canPlaceWindow(
  clubDate: string,
  startTime: string,
  endTime: string,
  windows: DraftWindow[],
  hours: DayHours,
  ignoreKey?: string,
): boolean {
  if (hours.closed) return false;
  if (!isValidHhmm(startTime) || !isValidHhmm(endTime)) return false;
  if (parseMinutes(endTime) - parseMinutes(startTime) < 15) return false;
  if (parseMinutes(startTime) < parseMinutes(hours.open)) return false;
  if (parseMinutes(endTime) > parseMinutes(hours.close)) return false;
  return !othersOnDay(windows, clubDate, ignoreKey).some((w) =>
    rangesOverlap(startTime, endTime, w.startTime, w.endTime),
  );
}

export function slotContainsReserved(slot: DraftWindow, reserved: ReservedBlock[]): boolean {
  return reservedOnDay(reserved, slot.clubDate).some((r) =>
    rangesOverlap(slot.startTime, slot.endTime, r.startTime, r.endTime),
  );
}

export function startOfWeekMonday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  const shifted = new Date(Date.UTC(y, m - 1, d - back));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function formatClubDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Clock like `11:00am` from `HH:MM`. */
export function formatSlotClock(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Range like `11:00am-12:30pm`. */
export function formatSlotRange(startTime: string, endTime: string): string {
  return `${formatSlotClock(startTime)}-${formatSlotClock(endTime)}`;
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function weekdayKey(ymd: string): (typeof DOW)[number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()];
}

export function axisFromDays(days: Array<{ hours: DayHours }>): { start: string; end: string } | null {
  let min = 24 * 60;
  let max = 0;
  for (const day of days) {
    if (day.hours.closed) continue;
    min = Math.min(min, parseMinutes(day.hours.open));
    max = Math.max(max, parseMinutes(day.hours.close));
  }
  if (max <= min) return null;
  return {
    start: formatMinutes(Math.floor(min / 15) * 15),
    end: formatMinutes(Math.ceil(max / 15) * 15),
  };
}

export function buildWeekFrame(
  monday: string,
  weeklyHours: Record<string, DayHours>,
): {
  from: string;
  to: string;
  axis: { start: string; end: string };
  days: Array<{ clubDate: string; hours: DayHours }>;
  windows: Array<{ id: number; clubDate: string; startTime: string; endTime: string }>;
} {
  const days: Array<{ clubDate: string; hours: DayHours }> = [];
  for (let i = 0; i < 7; i += 1) {
    const clubDate = addDaysToYmd(monday, i);
    const hours = weeklyHours[weekdayKey(clubDate)] || { closed: true };
    days.push({ clubDate, hours });
  }
  return {
    from: monday,
    to: addDaysToYmd(monday, 6),
    axis: axisFromDays(days) || { start: '10:00', end: '22:00' },
    days,
    windows: [],
  };
}

export function cellIsClosed(hours: DayHours, time: string): boolean {
  if (hours.closed) return true;
  const t = parseMinutes(time);
  return t < parseMinutes(hours.open) || t + 15 > parseMinutes(hours.close);
}

export function windowsFromPublished(
  rows: Array<{ id: number; clubDate: string; startTime: string; endTime: string }>,
): DraftWindow[] {
  return rows.map((row) => ({
    key: `occ-${row.id}`,
    occurrenceId: row.id,
    clubDate: row.clubDate,
    startTime: row.startTime,
    endTime: row.endTime,
  }));
}

export function repeatCopies(
  slot: DraftWindow,
  weeks: number,
  windows: DraftWindow[],
  hoursForDate: (ymd: string) => DayHours | undefined,
  addDays: (ymd: string, n: number) => string,
): DraftWindow[] {
  const count = Math.max(1, Math.floor(weeks));
  const added: DraftWindow[] = [];
  const all = [...windows];
  for (let i = 1; i < count; i += 1) {
    const clubDate = addDays(slot.clubDate, 7 * i);
    const hours = hoursForDate(clubDate);
    if (!hours) continue;
    if (!canPlaceWindow(clubDate, slot.startTime, slot.endTime, all, hours)) continue;
    const copy: DraftWindow = {
      key: newDraftKey(),
      occurrenceId: null,
      clubDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
    };
    added.push(copy);
    all.push(copy);
  }
  return added;
}

/** Weekly copies from the week after `slot` through `untilYmd` inclusive. */
export function repeatCopiesUntil(
  slot: DraftWindow,
  untilYmd: string,
  windows: DraftWindow[],
  hoursForDate: (ymd: string) => DayHours | undefined,
  addDays: (ymd: string, n: number) => string,
): DraftWindow[] {
  const added: DraftWindow[] = [];
  const all = [...windows];
  for (let i = 1; i <= 52; i += 1) {
    const clubDate = addDays(slot.clubDate, 7 * i);
    if (clubDate > untilYmd) break;
    const hours = hoursForDate(clubDate);
    if (!hours) continue;
    if (!canPlaceWindow(clubDate, slot.startTime, slot.endTime, all, hours)) continue;
    const copy: DraftWindow = {
      key: newDraftKey(),
      occurrenceId: null,
      clubDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
    };
    added.push(copy);
    all.push(copy);
  }
  return added;
}
