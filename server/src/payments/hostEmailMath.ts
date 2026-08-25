/** When the host reminder may first be sent (slot start minus configured minutes). */
export function hostReminderDueAtMs(startAtMs: number, minutesBefore: number): number {
  return startAtMs - Math.max(0, minutesBefore) * 60 * 1000;
}

/** When the no-show admin email may first be sent (slot start plus configured minutes). */
export function hostNoShowDueAtMs(startAtMs: number, minutesAfter: number): number {
  return startAtMs + Math.max(0, minutesAfter) * 60 * 1000;
}

/**
 * Reminder is due from (start - minutes) until slot start, and only once.
 * minutesBefore 0 uses a one-minute window just before start so a 60s tick can still send it.
 */
export function isHostReminderDue(args: {
  nowMs: number;
  startAtMs: number;
  minutesBefore: number;
  alreadySent: boolean;
}): boolean {
  if (args.alreadySent) return false;
  if (args.nowMs >= args.startAtMs) return false;
  const minutes = Math.max(0, args.minutesBefore);
  const dueAt = minutes === 0
    ? args.startAtMs - 60 * 1000
    : hostReminderDueAtMs(args.startAtMs, minutes);
  return args.nowMs >= dueAt;
}

export function isHostNoShowDue(args: {
  nowMs: number;
  startAtMs: number;
  minutesAfter: number;
  alreadySent: boolean;
  arrived: boolean;
}): boolean {
  if (args.alreadySent || args.arrived) return false;
  return args.nowMs >= hostNoShowDueAtMs(args.startAtMs, args.minutesAfter);
}

/** True when a successful visit means the host showed up for this slot. */
export function visitCountsAsHostArrival(args: {
  checkInAtMs: number;
  checkOutAtMs: number | null;
  slotStartMs: number;
}): boolean {
  if (args.checkInAtMs >= args.slotStartMs) return true;
  if (args.checkOutAtMs == null) return true;
  return args.checkOutAtMs >= args.slotStartMs;
}
