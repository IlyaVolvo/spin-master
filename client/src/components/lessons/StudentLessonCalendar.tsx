import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { addDaysToYmd, clubTodayYmd } from '../../utils/clubDateTime';
import { getErrorMessage } from '../../utils/errorHandler';
import { formatMoney } from '../../utils/formatMoney';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import { hasMemberRole } from '../../utils/auth';
import { weekdayForYmd } from '../../utils/clubHoursDisplay';
import CancelLessonDialog from './CancelLessonDialog';
import LessonSlotCaption from './LessonSlotCaption';
import ReserveLessonDialog from './ReserveLessonDialog';
import { useLessonCalendarUpdated } from './useLessonCalendarUpdated';
import {
  addMinutes,
  axisFromDays,
  axisTimeLabels,
  cellIsClosed,
  countConsecutiveRepeatWeeks,
  type DayHours,
  formatClubDay,
  formatSlotRange,
  mergeTouchingTimeBlocks,
  parseMinutes,
  snapToAllowedDuration,
  startOfWeekMonday,
  untilOnForWeeklyCount,
} from './availabilityDraft';

const CELL_H = 18;
const GREY = '#dfe4ea';
const OPEN = '#eef6f0';
const MINE = 'rgba(93, 173, 226, 0.82)';
const TAKEN_HATCH =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 3px, transparent 3px, transparent 9px)';

type CoachLane = {
  id: number;
  memberId: number;
  firstName: string;
  lastName: string;
  color: string;
  hourlyRateCents: number;
};

type FreeWindow = {
  coachProfileId: number;
  clubDate: string;
  startTime: string;
  endTime: string;
};

type MineBlock = {
  id: number;
  ids: number[];
  clubDate: string;
  startTime: string;
  endTime: string;
  coachProfileId: number;
  coachName: string;
  color: string;
};

type TakenBlock = {
  coachProfileId: number;
  clubDate: string;
  startTime: string;
  endTime: string;
  kind: 'individual' | 'group';
  playerFirstName: string | null;
  playerLastName: string | null;
};

type WeekPayload = {
  from: string;
  to: string;
  horizonTo: string;
  axis: { start: string; end: string } | null;
  days: Array<{ clubDate: string; hours: DayHours }>;
  coaches: CoachLane[];
  windows: FreeWindow[];
  taken: TakenBlock[];
  mine: MineBlock[];
  allowedMinutes: number[];
  defaultMinutes: number;
};

type Selection = {
  coachProfileId: number;
  clubDate: string;
  startTime: string;
  endTime: string;
  windowStart: string;
  windowEnd: string;
};

type DragState = {
  kind: 'create';
  clubDate: string;
  coachProfileId: number;
  anchorStart: string;
  originY: number;
  moved: boolean;
};

function axisTimes(axis: { start: string; end: string }): string[] {
  const out: string[] = [];
  for (let t = parseMinutes(axis.start); t < parseMinutes(axis.end); t += 15) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

function timeFromOffset(axisStart: string, offsetY: number): string {
  const row = Math.max(0, Math.floor(offsetY / CELL_H));
  return addMinutes(axisStart, row * 15);
}

function clampToWindow(startTime: string, endTime: string, windowStart: string, windowEnd: string): {
  startTime: string;
  endTime: string;
} | null {
  const w0 = parseMinutes(windowStart);
  const w1 = parseMinutes(windowEnd);
  let s = Math.max(w0, parseMinutes(startTime));
  let e = Math.min(w1, parseMinutes(endTime));
  s = Math.floor(s / 15) * 15;
  e = Math.ceil(e / 15) * 15;
  if (e - s < 15) return null;
  return { startTime: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, endTime: `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}` };
}

function selectionFromPointer(opts: {
  window: FreeWindow;
  anchorStart: string;
  hovered: string;
}): { startTime: string; endTime: string } | null {
  const w0 = parseMinutes(opts.window.startTime);
  const w1 = parseMinutes(opts.window.endTime);
  const anchor = Math.max(w0, Math.min(w1 - 15, parseMinutes(opts.anchorStart)));
  const hovered = Math.max(w0, Math.min(w1 - 15, parseMinutes(opts.hovered)));
  const start = Math.min(anchor, hovered);
  const end = Math.min(w1, Math.max(anchor, hovered) + 15);
  if (end - start < 15) return null;
  return {
    startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
    endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
  };
}

function snapSelection(
  sel: { startTime: string; endTime: string },
  window: { startTime: string; endTime: string },
  allowed: number[],
  fallbackMinutes: number,
): { startTime: string; endTime: string } | null {
  const w0 = parseMinutes(window.startTime);
  const w1 = parseMinutes(window.endTime);
  const start = parseMinutes(sel.startTime);
  const dragged = parseMinutes(sel.endTime) - start;
  const maxFromStart = w1 - start;
  let mins = snapToAllowedDuration(dragged, allowed, maxFromStart);
  if (mins == null) {
    mins = snapToAllowedDuration(fallbackMinutes, allowed, w1 - w0);
    if (mins == null) return null;
    const end = Math.min(w1, start + mins);
    const nextStart = end - mins;
    if (nextStart < w0) return null;
    return clampToWindow(
      `${String(Math.floor(nextStart / 60)).padStart(2, '0')}:${String(nextStart % 60).padStart(2, '0')}`,
      `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
      window.startTime,
      window.endTime,
    );
  }
  return clampToWindow(sel.startTime, addMinutes(sel.startTime, mins), window.startTime, window.endTime);
}

function WeekOfHeading({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>{label}</h3>
      <button
        type="button"
        aria-label={tip}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: 18,
          height: 18,
          padding: 0,
          border: '1px solid rgba(255, 255, 255, 0.45)',
          borderRadius: '50%',
          background: 'transparent',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: '16px',
          cursor: 'help',
        }}
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 8,
            width: 280,
            padding: '8px 10px',
            background: '#1e2937',
            color: '#fff',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.45,
            borderRadius: 8,
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.22)',
          }}
        >
          {tip}
        </span>
      ) : null}
    </span>
  );
}

function SlotTimes({
  startTime,
  endTime,
  weeksLabel,
}: {
  startTime: string;
  endTime: string;
  weeksLabel?: string | null;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 1,
        transform: 'translateX(-50%)',
        background: 'rgba(20, 40, 50, 0.92)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '16px',
        padding: '0 6px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 6,
        textAlign: 'center',
      }}
    >
      {formatSlotRange(startTime, endTime)}
      {weeksLabel ? <div style={{ fontWeight: 500, opacity: 0.92 }}>{weeksLabel}</div> : null}
    </div>
  );
}

export default function StudentLessonCalendar({ onError }: { onError: (m: string | null) => void }) {
  const isPlayer = hasMemberRole('PLAYER');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(clubTodayYmd()));
  const [data, setData] = useState<WeekPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [horizonWindows, setHorizonWindows] = useState<FreeWindow[] | null>(null);
  const [cancelIds, setCancelIds] = useState<number[] | null>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dataRef = useRef(data);
  dataRef.current = data;
  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const load = (from = weekStart, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const to = addDaysToYmd(from, 6);
    api
      .get('/lessons/individual/week', { params: { from, to } })
      .then((res) => {
        setData(res.data);
        if (!opts?.silent) onError(null);
        const sel = selectionRef.current;
        if (sel && Array.isArray(res.data?.windows)) {
          const fits = (res.data.windows as FreeWindow[]).some(
            (w) =>
              w.coachProfileId === sel.coachProfileId &&
              w.clubDate === sel.clubDate &&
              parseMinutes(w.startTime) <= parseMinutes(sel.startTime) &&
              parseMinutes(w.endTime) >= parseMinutes(sel.endTime),
          );
          if (!fits) {
            setSelection(null);
            setReserveOpen(false);
          }
        }
        const horizonTo = res.data?.horizonTo;
        const fromDay = res.data?.from || from;
        if (!horizonTo) {
          setHorizonWindows(res.data.windows || []);
          return;
        }
        return api
          .get('/lessons/individual/windows', { params: { from: fromDay, to: horizonTo } })
          .then((win) => {
            setHorizonWindows(Array.isArray(win.data?.windows) ? win.data.windows : []);
          })
          .catch(() => setHorizonWindows(res.data.windows || []));
      })
      .catch((err) => {
        if (!opts?.silent) onError(getErrorMessage(err, 'Could not load availability'));
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  };

  useEffect(() => {
    if (!isPlayer) return;
    load(weekStart);
    setSelection(null);
    setReserveOpen(false);
    setDrag(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, isPlayer]);

  useLessonCalendarUpdated(() => {
    if (!isPlayer || busyRef.current) return;
    load(weekStartRef.current, { silent: true });
  });

  const axis = data?.axis ?? (data ? axisFromDays(data.days) : null) ?? { start: '10:00', end: '22:00' };
  const times = useMemo(() => axisTimes(axis), [axis.start, axis.end]);
  const coaches = data?.coaches || [];
  const laneCount = Math.max(1, coaches.length);
  const allowed = data?.allowedMinutes?.length ? data.allowedMinutes : [30, 60, 90, 120];
  const defaultMinutes = data?.defaultMinutes || 60;
  const horizonTo = data?.horizonTo || data?.to || weekStart;
  const repeatWindows = horizonWindows ?? data?.windows ?? [];

  const maxWeeksFor = (sel: Selection | null) => {
    if (!sel) return 1;
    const count = countConsecutiveRepeatWeeks({
      windows: repeatWindows.filter((window) => window.coachProfileId === sel.coachProfileId),
      clubDate: sel.clubDate,
      startTime: sel.startTime,
      endTime: sel.endTime,
      horizonTo,
      addDays: addDaysToYmd,
    });
    return Math.max(1, count);
  };

  const beginCreate = (window: FreeWindow, startTime: string, originY: number) => {
    if (busy || reserveOpen) return;
    const cell = clampToWindow(startTime, addMinutes(startTime, 15), window.startTime, window.endTime);
    if (!cell) return;
    setReserveOpen(false);
    setSelection({
      coachProfileId: window.coachProfileId,
      clubDate: window.clubDate,
      startTime: cell.startTime,
      endTime: cell.endTime,
      windowStart: window.startTime,
      windowEnd: window.endTime,
    });
    setDrag({
      kind: 'create',
      clubDate: window.clubDate,
      coachProfileId: window.coachProfileId,
      anchorStart: cell.startTime,
      originY,
      moved: false,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const current = dragRef.current;
      const week = dataRef.current;
      const sel = selectionRef.current;
      if (!current || !week || !sel) return;
      const col = columnRefs.current[sel.clubDate];
      if (!col) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const hoveredTime = timeFromOffset(axis.start, y);
      const bounds = {
        startTime: sel.windowStart,
        endTime: sel.windowEnd,
        clubDate: sel.clubDate,
        coachProfileId: sel.coachProfileId,
      };
      if (current.kind === 'create') {
        const moved = current.moved || Math.abs(y - current.originY) >= CELL_H / 2;
        const next = selectionFromPointer({
          window: bounds,
          anchorStart: current.anchorStart,
          hovered: hoveredTime,
        });
        if (!next) return;
        setDrag({ ...current, moved });
        setSelection({ ...sel, startTime: next.startTime, endTime: next.endTime });
        return;
      }
    };
    const onUp = () => {
      const sel = selectionRef.current;
      const week = dataRef.current;
      const current = dragRef.current;
      setDrag(null);
      if (!sel || !week || !current) return;
      const snapped = snapSelection(
        sel,
        { startTime: sel.windowStart, endTime: sel.windowEnd },
        week.allowedMinutes?.length ? week.allowedMinutes : allowed,
        week.defaultMinutes || defaultMinutes,
      );
      if (!snapped) {
        setSelection(null);
        setReserveOpen(false);
        return;
      }
      setSelection({ ...sel, startTime: snapped.startTime, endTime: snapped.endTime });
      setReserveOpen(true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, axis.start, allowed, defaultMinutes]);

  const book = async (weeks: number) => {
    if (!selection || !data) return;
    const coach = coaches.find((c) => c.id === selection.coachProfileId);
    if (!coach) return;
    const durationMinutes = parseMinutes(selection.endTime) - parseMinutes(selection.startTime);
    const count = Math.min(maxWeeksFor(selection), Math.max(1, Math.floor(weeks) || 1));
    setBusy(true);
    onError(null);
    setNotice(null);
    try {
      if (count === 1) {
        const res = await api.post('/lessons/individual', {
          coachProfileId: selection.coachProfileId,
          clubDate: selection.clubDate,
          startTime: selection.startTime,
          durationMinutes,
        });
        const checkoutUrl =
          typeof res.data?.checkout?.checkoutUrl === 'string' ? res.data.checkout.checkoutUrl.trim() : '';
        if (checkoutUrl) {
          window.location.assign(checkoutUrl);
          return;
        }
        setNotice(`Reserved ${formatClubDay(selection.clubDate)} ${selection.startTime}–${selection.endTime}.`);
      } else {
        const res = await api.post('/lessons/individual/series', {
          coachProfileId: selection.coachProfileId,
          startTime: selection.startTime,
          durationMinutes,
          weekdays: [weekdayForYmd(selection.clubDate)],
          intervalWeeks: 1,
          startsOn: selection.clubDate,
          untilOn: untilOnForWeeklyCount(selection.clubDate, count, addDaysToYmd),
        });
        const booked = Array.isArray(res.data?.booked) ? res.data.booked : [];
        const skipped = (res.data?.skipped as string[] | undefined) || [];
        if (!booked.length) {
          onError(skipped.length ? `Could not reserve (${skipped.join(', ')} unavailable).` : 'Could not reserve');
          load();
          return;
        }
        setNotice(
          skipped.length
            ? `Reserved ${booked.length} week${booked.length === 1 ? '' : 's'} (skipped ${skipped.join(', ')}).`
            : `Reserved ${count} weekly lessons starting ${formatClubDay(selection.clubDate)}.`,
        );
      }
      setReserveOpen(false);
      setSelection(null);
      load();
    } catch (err) {
      onError(getErrorMessage(err, 'Could not reserve'));
      load();
    } finally {
      setBusy(false);
    }
  };

  const cancelLesson = async (reason: string) => {
    if (!cancelIds?.length) return;
    setBusy(true);
    onError(null);
    try {
      for (const id of cancelIds) {
        await api.post(`/lessons/individual/${id}/cancel`, { reason });
      }
      setNotice('Reservation cancelled. That time is available again.');
      setCancelIds(null);
      load();
    } catch (err) {
      onError(getErrorMessage(err, 'Could not cancel'));
    } finally {
      setBusy(false);
    }
  };

  if (!isPlayer) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>A player role is required to reserve lessons.</p>
      </div>
    );
  }

  const selectedCoach = selection ? coaches.find((c) => c.id === selection.coachProfileId) : null;
  const selectedPrice =
    selectedCoach && selection
      ? Math.round(
          (selectedCoach.hourlyRateCents * (parseMinutes(selection.endTime) - parseMinutes(selection.startTime))) / 60,
        )
      : 0;
  const selectedMaxWeeks = maxWeeksFor(selection);
  const weeksLabel = `${selectedMaxWeeks} ${selectedMaxWeeks === 1 ? 'week' : 'weeks'}`;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {notice ? <p style={{ color: '#1e8449', margin: 0, padding: '10px 16px' }}>{notice}</p> : null}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '10px 16px',
          background: '#2c3e50',
          color: '#fff',
        }}
      >
        <WeekOfHeading
          label={`Week of ${data ? formatClubDay(data.from) : formatClubDay(weekStart)}`}
          tip={`Click a coach’s available time and drag to the length you want. Release to choose how many weeks to reserve. Allowed durations: ${allowed.join(', ')} min.`}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            aria-label="Previous week"
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: 8,
              minWidth: 40,
              padding: '7px 10px',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: 'none',
            }}
            onClick={() => setWeekStart(addDaysToYmd(weekStart, -7))}
          >
            ←
          </button>
          <button
            type="button"
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: 'none',
            }}
            onClick={() => setWeekStart(startOfWeekMonday(clubTodayYmd()))}
          >
            This week
          </button>
          <button
            type="button"
            aria-label="Next week"
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: 8,
              minWidth: 40,
              padding: '7px 10px',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: 'none',
            }}
            onClick={() => setWeekStart(addDaysToYmd(weekStart, 7))}
          >
            →
          </button>
        </div>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {coaches.map((coach) => (
          <Link
            key={coach.id}
            to={`/coaches/${coach.memberId}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#2c3e50', fontSize: 13 }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 2, background: coach.color, display: 'inline-block' }} />
            {formatPlayerName(coach.firstName, coach.lastName, getNameDisplayOrder())}{' '}
            <span style={{ color: '#78909c' }}>{formatMoney(coach.hourlyRateCents)}/hr</span>
          </Link>
        ))}
        {!loading && coaches.length === 0 ? (
          <span style={{ fontSize: 13, color: '#78909c' }}>No coaches available for your rating this week.</span>
        ) : null}
      </div>

      {loading && !data ? <p>Loading…</p> : null}

      <div style={{ overflowX: 'auto', marginTop: 12, userSelect: 'none' }}>
        <div style={{ display: 'flex', minWidth: Math.max(720, 54 + (data?.days.length || 7) * Math.max(92, laneCount * 36)) }}>
          <div style={{ width: 54, flexShrink: 0, paddingTop: 28 }}>
            <div style={{ position: 'relative', height: times.length * CELL_H }}>
              {axisTimeLabels(axis).map((label) => (
                <div
                  key={`${label.kind}-${label.time}`}
                  style={{
                    position: 'absolute',
                    top: (label.minutesFromStart / 15) * CELL_H,
                    left: 0,
                    right: 4,
                    fontSize: 11,
                    fontWeight: label.kind === 'hour' ? 400 : 600,
                    color: '#546e7a',
                    lineHeight: '14px',
                    transform:
                      label.kind === 'start' ? 'none' : label.kind === 'end' ? 'translateY(-100%)' : 'translateY(-50%)',
                    textAlign: 'right',
                  }}
                >
                  {label.time}
                </div>
              ))}
            </div>
          </div>
          {(data?.days || []).map((day) => {
            const hours = day.hours;
            const dayWindows = (data?.windows || []).filter((w) => w.clubDate === day.clubDate);
            const dayTaken = mergeTouchingTimeBlocks(
              (data?.taken || []).filter((t) => t.clubDate === day.clubDate),
              (a, b) =>
                a.coachProfileId === b.coachProfileId &&
                a.kind === b.kind &&
                (a.playerFirstName || '') === (b.playerFirstName || '') &&
                (a.playerLastName || '') === (b.playerLastName || ''),
            );
            const dayMine = mergeTouchingTimeBlocks(
              (data?.mine || [])
                .filter((m) => m.clubDate === day.clubDate)
                .map((m) => ({ ...m, ids: m.ids?.length ? m.ids : [m.id] })),
              (a, b) => a.coachProfileId === b.coachProfileId,
              (into, from) => {
                into.ids = [...into.ids, ...from.ids];
              },
            );
            return (
              <div key={day.clubDate} style={{ flex: 1, minWidth: Math.max(92, laneCount * 36), paddingLeft: 4 }}>
                <div style={{ height: 28, fontSize: 12, fontWeight: 600, color: '#2c3e50' }}>{formatClubDay(day.clubDate)}</div>
                <div
                  ref={(el) => {
                    columnRefs.current[day.clubDate] = el;
                  }}
                  style={{ position: 'relative', height: times.length * CELL_H }}
                >
                  {times.map((time) => {
                    const closed = cellIsClosed(hours, time);
                    return (
                      <div
                        key={time}
                        style={{
                          height: CELL_H,
                          background: closed ? GREY : OPEN,
                          borderTop: parseMinutes(time) % 60 === 0 ? '1px solid #cfd8dc' : '1px solid transparent',
                        }}
                      />
                    );
                  })}
                  {coaches.map((coach, lane) =>
                    dayWindows
                      .filter((w) => w.coachProfileId === coach.id)
                      .map((slot) => {
                        const top = ((parseMinutes(slot.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                        const height = ((parseMinutes(slot.endTime) - parseMinutes(slot.startTime)) / 15) * CELL_H;
                        const leftPct = (lane / laneCount) * 100;
                        const widthPct = 100 / laneCount;
                        const key = `${coach.id}-${slot.clubDate}-${slot.startTime}`;
                        const isSel =
                          selection?.coachProfileId === coach.id &&
                          selection.clubDate === day.clubDate &&
                          parseMinutes(selection.startTime) < parseMinutes(slot.endTime) &&
                          parseMinutes(selection.endTime) > parseMinutes(slot.startTime);
                        const slotH = Math.max(CELL_H, height);
                        const coachName = formatPlayerName(coach.firstName, coach.lastName, getNameDisplayOrder());
                        return (
                          <div
                            key={key}
                            onPointerDown={(e) => {
                              if (e.button !== 0 || busy || reserveOpen) return;
                              e.preventDefault();
                              e.stopPropagation();
                              const localY = e.clientY - e.currentTarget.getBoundingClientRect().top;
                              const startTime = timeFromOffset(slot.startTime, localY);
                              beginCreate(slot, startTime, e.clientY);
                            }}
                            style={{
                              position: 'absolute',
                              left: `calc(${leftPct}% + 1px)`,
                              width: `calc(${widthPct}% - 2px)`,
                              top,
                              height: slotH,
                              background: coach.color,
                              opacity: isSel ? 0.35 : 0.78,
                              borderRadius: 3,
                              cursor: 'ns-resize',
                              zIndex: 1,
                              overflow: 'hidden',
                            }}
                            title={`${coachName} ${formatSlotRange(slot.startTime, slot.endTime)}`}
                          >
                            <LessonSlotCaption
                              name=""
                              startTime={slot.startTime}
                              endTime={slot.endTime}
                              height={slotH}
                            />
                          </div>
                        );
                      }),
                  )}
                  {dayTaken.map((block) => {
                    const coach = coaches.find((c) => c.id === block.coachProfileId);
                    const lane = Math.max(0, coaches.findIndex((c) => c.id === block.coachProfileId));
                    const top = ((parseMinutes(block.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                    const height = ((parseMinutes(block.endTime) - parseMinutes(block.startTime)) / 15) * CELL_H;
                    const slotH = Math.max(CELL_H, height);
                    const who =
                      block.kind === 'group'
                        ? 'Class'
                        : block.playerFirstName || block.playerLastName
                          ? formatPlayerName(
                              block.playerFirstName || '',
                              block.playerLastName || '',
                              getNameDisplayOrder(),
                            )
                          : 'Student';
                    return (
                      <div
                        key={`taken-${block.coachProfileId}-${block.startTime}-${who}`}
                        title={`${who} ${formatSlotRange(block.startTime, block.endTime)} (taken)`}
                        style={{
                          position: 'absolute',
                          left: `calc(${(lane / laneCount) * 100}% + 1px)`,
                          width: `calc(${100 / laneCount}% - 2px)`,
                          top,
                          height: slotH,
                          backgroundColor: coach?.color || '#7f8c8d',
                          backgroundImage: TAKEN_HATCH,
                          borderRadius: 3,
                          zIndex: 2,
                          overflow: 'hidden',
                          cursor: 'default',
                          boxSizing: 'border-box',
                        }}
                      >
                        <LessonSlotCaption
                          name={who}
                          startTime={block.startTime}
                          endTime={block.endTime}
                          height={slotH}
                        />
                      </div>
                    );
                  })}
                  {selection && selection.clubDate === day.clubDate
                    ? (() => {
                        const coach = coaches.find((c) => c.id === selection.coachProfileId);
                        const lane = Math.max(0, coaches.findIndex((c) => c.id === selection.coachProfileId));
                        const top = ((parseMinutes(selection.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                        const height = ((parseMinutes(selection.endTime) - parseMinutes(selection.startTime)) / 15) * CELL_H;
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left: `calc(${(lane / laneCount) * 100}% + 1px)`,
                              width: `calc(${100 / laneCount}% - 2px)`,
                              top,
                              height: Math.max(CELL_H, height),
                              background: coach?.color || '#27ae60',
                              boxShadow: '0 0 0 2px #1e8449',
                              borderRadius: 3,
                              zIndex: 3,
                              pointerEvents: 'none',
                            }}
                          >
                            <SlotTimes
                              startTime={selection.startTime}
                              endTime={selection.endTime}
                              weeksLabel={weeksLabel}
                            />
                          </div>
                        );
                      })()
                    : null}
                  {dayMine.map((block) => {
                    const top = ((parseMinutes(block.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                    const height = ((parseMinutes(block.endTime) - parseMinutes(block.startTime)) / 15) * CELL_H;
                    const lane = Math.max(0, coaches.findIndex((c) => c.id === block.coachProfileId));
                    const inLanes = lane >= 0 && coaches.length > 0;
                    const slotH = Math.max(CELL_H, height);
                    return (
                      <div
                        key={`mine-${block.ids.join('-')}`}
                        role="button"
                        tabIndex={0}
                        title={`YOU ${formatSlotRange(block.startTime, block.endTime)} with ${block.coachName}. Click to cancel.`}
                        onClick={() => setCancelIds(block.ids)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setCancelIds(block.ids);
                        }}
                        style={{
                          position: 'absolute',
                          left: inLanes ? `calc(${(lane / laneCount) * 100}% + 2px)` : 8,
                          width: inLanes ? `calc(${100 / laneCount}% - 4px)` : undefined,
                          right: inLanes ? undefined : 8,
                          top,
                          height: slotH,
                          background: MINE,
                          borderRadius: 3,
                          zIndex: 4,
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                        }}
                      >
                        <LessonSlotCaption
                          name="YOU"
                          startTime={block.startTime}
                          endTime={block.endTime}
                          height={slotH}
                          color="#1a5276"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {selection && selectedCoach ? (
        <ReserveLessonDialog
          open={reserveOpen}
          busy={busy}
          coachName={formatPlayerName(selectedCoach.firstName, selectedCoach.lastName, getNameDisplayOrder())}
          whenLabel={`${formatClubDay(selection.clubDate)} ${formatSlotRange(selection.startTime, selection.endTime)}`}
          priceCents={selectedPrice}
          maxWeeks={selectedMaxWeeks}
          onCancel={() => {
            if (busy) return;
            setReserveOpen(false);
            setSelection(null);
          }}
          onReserve={(weeks) => void book(weeks)}
        />
      ) : null}

      <CancelLessonDialog
        open={cancelIds != null}
        busy={busy}
        onClose={() => setCancelIds(null)}
        onConfirm={(reason) => void cancelLesson(reason)}
      />
    </div>
  );
}
