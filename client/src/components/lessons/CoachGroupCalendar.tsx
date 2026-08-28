import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { addDaysToYmd, clubTodayYmd } from '../../utils/clubDateTime';
import { getErrorMessage } from '../../utils/errorHandler';
import { isAdmin } from '../../utils/auth';
import { getSystemConfig } from '../../utils/systemConfig';
import { formatMoney } from '../../utils/formatMoney';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import LessonSlotCaption from './LessonSlotCaption';
import { useLessonCalendarUpdated } from './useLessonCalendarUpdated';
import {
  addMinutes,
  axisFromDays,
  axisTimeLabels,
  buildWeekFrame,
  cellIsClosed,
  type DayHours,
  formatClubDay,
  formatSlotRange,
  parseMinutes,
  type ReservedBlock,
  snapToAllowedDuration,
  startOfWeekMonday,
  weekdayKey,
} from './availabilityDraft';

const CELL_H = 18;
const GREY = '#dfe4ea';
const OPEN = '#eef6f0';
const CLASS_COLORS = ['#f5c16c', '#7ec8e3', '#d5a6e6', '#f0a08c', '#9ad0b4'];
const TAKEN_HATCH =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 3px, transparent 3px, transparent 9px)';

const field: CSSProperties = {
  boxSizing: 'border-box',
  padding: '7px 8px',
  border: '1px solid #d5dde5',
  borderRadius: 8,
  fontSize: 14,
  color: '#1e2937',
  background: '#fff',
};

const ghostBtn: CSSProperties = {
  background: '#fff',
  color: '#334155',
  border: '1px solid #d5dde5',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  fontWeight: 600,
  boxShadow: 'none',
};

const barGhost: CSSProperties = {
  background: 'transparent',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  fontWeight: 600,
  boxShadow: 'none',
};

const sectionBar: CSSProperties = {
  padding: '8px 16px',
  background: '#2c3e50',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

type MemberLite = { id: number; firstName: string; lastName: string };
type Registration = { id: number; status: string; member?: MemberLite };
type Occurrence = {
  id: number;
  clubDate: string;
  startTime: string;
  endTime: string;
  runBelowMin?: boolean;
  registrations?: Registration[];
};
type GroupClass = {
  id: number;
  title: string;
  publicCode: string;
  durationMinutes: number;
  pricePerOccurrenceCents?: number;
  minParticipants: number;
  maxParticipants: number;
  occurrences?: Occurrence[];
};

type Draft = {
  clubDate: string;
  startTime: string;
  endTime: string;
};

type DragState = {
  clubDate: string;
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

function colorForClass(id: number): string {
  return CLASS_COLORS[Math.abs(id) % CLASS_COLORS.length];
}

function rangeFromPointer(opts: {
  hours: DayHours;
  anchorStart: string;
  hovered: string;
  allowed: number[];
  fallback: number;
}): { startTime: string; endTime: string } | null {
  if (opts.hours.closed) return null;
  const open = parseMinutes(opts.hours.open);
  const close = parseMinutes(opts.hours.close);
  const anchor = Math.max(open, Math.min(close - 15, parseMinutes(opts.anchorStart)));
  const hovered = Math.max(open, Math.min(close - 15, parseMinutes(opts.hovered)));
  const start = Math.min(anchor, hovered);
  const rawEnd = Math.min(close, Math.max(anchor, hovered) + 15);
  const maxFit = close - start;
  const mins = snapToAllowedDuration(rawEnd - start, opts.allowed, maxFit);
  if (mins == null) {
    const fallback = snapToAllowedDuration(opts.fallback, opts.allowed, maxFit);
    if (fallback == null) return null;
    return {
      startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      endTime: addMinutes(
        `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
        fallback,
      ),
    };
  }
  return {
    startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
    endTime: addMinutes(
      `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      mins,
    ),
  };
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

export default function CoachGroupCalendar({ onError }: { onError: (m: string | null) => void }) {
  const cfg = getSystemConfig().lessons;
  const admin = isAdmin();
  const allowed = cfg?.groupDurations.allowedMinutes ?? [60];
  const defaultMinutes = cfg?.groupDurations.defaultMinutes ?? 60;
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(clubTodayYmd()));
  const [days, setDays] = useState(() => buildWeekFrame(weekStart, getSystemConfig().branding.weeklyHours).days);
  const [axis, setAxis] = useState(() => buildWeekFrame(weekStart, getSystemConfig().branding.weeklyHours).axis);
  const [reserved, setReserved] = useState<ReservedBlock[]>([]);
  const [classes, setClasses] = useState<GroupClass[]>([]);
  const [players, setPlayers] = useState<MemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('20');
  const [minP, setMinP] = useState(cfg?.defaultGroupMinParticipants ?? 2);
  const [maxP, setMaxP] = useState(cfg?.defaultGroupMaxParticipants ?? 8);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [repeatCount, setRepeatCount] = useState(8);
  const [bandId, setBandId] = useState('');
  const [placeMemberId, setPlaceMemberId] = useState('');
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const occurrences = useMemo(() => {
    const out: Array<Occurrence & { classId: number; title: string; minParticipants: number; maxParticipants: number; publicCode: string }> =
      [];
    for (const cls of classes) {
      for (const occ of cls.occurrences || []) {
        out.push({
          ...occ,
          classId: cls.id,
          title: cls.title,
          minParticipants: cls.minParticipants,
          maxParticipants: cls.maxParticipants,
          publicCode: cls.publicCode,
        });
      }
    }
    return out;
  }, [classes]);

  const selected = occurrences.find((o) => o.id === selectedId) || null;
  const selectedClass = selected ? classes.find((c) => c.id === selected.classId) : null;

  const load = (from = weekStart, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const fallback = buildWeekFrame(from, getSystemConfig().branding.weeklyHours);
    const to = addDaysToYmd(from, 6);
    Promise.all([
      api.get('/lessons/me/calendar', { params: { from, to } }),
      api.get('/lessons/teaching'),
    ])
      .then(([cal, teaching]) => {
        const nextDays = ((cal.data.days || []) as Array<{ clubDate: string; hours: DayHours }>);
        const filled = nextDays.length === 7 ? nextDays : fallback.days;
        setDays(filled);
        setAxis(cal.data.axis || axisFromDays(filled) || fallback.axis);
        setReserved((cal.data.reserved || []) as ReservedBlock[]);
        setClasses((teaching.data.classes || []) as GroupClass[]);
        if (!opts?.silent) onError(null);
      })
      .catch((err) => {
        if (!opts?.silent) onError(getErrorMessage(err, 'Could not load group classes'));
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  };

  useEffect(() => {
    load(weekStart);
    setDraft(null);
    setDrag(null);
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    api
      .get('/players')
      .then((res) => setPlayers(Array.isArray(res.data) ? res.data : res.data.members || res.data.players || []))
      .catch(() => undefined);
  }, []);

  useLessonCalendarUpdated(() => {
    if (busyRef.current) return;
    load(weekStartRef.current, { silent: true });
  });

  const times = axisTimes(axis);
  const individualBusy = reserved.filter((r) => r.kind !== 'group');

  const occAt = (clubDate: string, time: string) => {
    const t = parseMinutes(time);
    return occurrences.find(
      (o) => o.clubDate === clubDate && parseMinutes(o.startTime) <= t && t < parseMinutes(o.endTime),
    );
  };

  const individualAt = (clubDate: string, time: string) => {
    const t = parseMinutes(time);
    return individualBusy.some(
      (r) => r.clubDate === clubDate && parseMinutes(r.startTime) <= t && t < parseMinutes(r.endTime),
    );
  };

  const hoursFor = (ymd: string) => days.find((d) => d.clubDate === ymd)?.hours || { closed: true as const };

  const beginCreate = (clubDate: string, startTime: string, originY: number) => {
    const hours = hoursFor(clubDate);
    const next = rangeFromPointer({
      hours,
      anchorStart: startTime,
      hovered: startTime,
      allowed,
      fallback: defaultMinutes,
    });
    if (!next) return;
    setSelectedId(null);
    setDraft({ clubDate, ...next });
    setDrag({ clubDate, anchorStart: startTime, originY, moved: false });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const col = columnRefs.current[current.clubDate];
      if (!col) return;
      const moved = current.moved || Math.abs(e.clientY - current.originY) >= 4;
      const hovered = timeFromOffset(axis.start, e.clientY - col.getBoundingClientRect().top);
      const next = rangeFromPointer({
        hours: hoursFor(current.clubDate),
        anchorStart: current.anchorStart,
        hovered,
        allowed,
        fallback: defaultMinutes,
      });
      if (next) setDraft({ clubDate: current.clubDate, ...next });
      if (moved && !current.moved) setDrag({ ...current, moved: true });
    };
    const onUp = () => {
      const current = dragRef.current;
      setDrag(null);
      if (!current || current.moved) return;
      const next = rangeFromPointer({
        hours: hoursFor(current.clubDate),
        anchorStart: current.anchorStart,
        hovered: addMinutes(current.anchorStart, Math.max(0, defaultMinutes - 15)),
        allowed,
        fallback: defaultMinutes,
      });
      if (next) setDraft({ clubDate: current.clubDate, ...next });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag), axis.start]);

  const band = (cfg?.ratingBands || []).find((b) => b.id === bandId);
  const durationMinutes = draft
    ? parseMinutes(draft.endTime) - parseMinutes(draft.startTime)
    : defaultMinutes;

  const create = async () => {
    if (!draft) return;
    onError(null);
    setBusy(true);
    try {
      const untilOn = addDaysToYmd(draft.clubDate, 7 * intervalWeeks * Math.max(0, repeatCount - 1));
      await api.post('/lessons/group-classes', {
        title,
        durationMinutes,
        priceDollars: Number(price),
        minParticipants: minP,
        maxParticipants: maxP,
        startsOn: draft.clubDate,
        untilOn,
        slots: [{ weekday: weekdayKey(draft.clubDate), startTime: draft.startTime }],
        intervalWeeks,
        ratingMin: band?.min ?? null,
        ratingMax: band?.max ?? null,
      });
      setDraft(null);
      setTitle('');
      load(weekStart);
    } catch (err) {
      onError(getErrorMessage(err, 'Could not create class'));
    } finally {
      setBusy(false);
    }
  };

  const act = (promise: Promise<unknown>, fail: string) => {
    onError(null);
    setBusy(true);
    promise
      .then(() => load(weekStart))
      .catch((err) => onError(getErrorMessage(err, fail)))
      .finally(() => setBusy(false));
  };

  const registered = (occ: Occurrence) =>
    (occ.registrations || []).filter((r) => r.status === 'REGISTERED');
  const waitlisted = (occ: Occurrence) =>
    (occ.registrations || []).filter((r) => r.status === 'WAITLIST');

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
          label={`Week of ${formatClubDay(weekStart)}`}
          tip="Drag on open hours to set a class time, then fill in the series. Click a class to see who is registered, place a player, or cancel that week."
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            aria-label="Previous week"
            style={{ ...barGhost, minWidth: 40, padding: '7px 10px' }}
            onClick={() => setWeekStart(addDaysToYmd(weekStart, -7))}
          >
            ←
          </button>
          <button type="button" style={barGhost} onClick={() => setWeekStart(startOfWeekMonday(clubTodayYmd()))}>
            This week
          </button>
          <button
            type="button"
            aria-label="Next week"
            style={{ ...barGhost, minWidth: 40, padding: '7px 10px' }}
            onClick={() => setWeekStart(addDaysToYmd(weekStart, 7))}
          >
            →
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 16px' }}>
        {loading && days.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Loading…</p> : null}
        <div style={{ overflowX: 'auto', userSelect: 'none' }}>
          <div style={{ display: 'flex', minWidth: 720 }}>
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
                        label.kind === 'start'
                          ? 'none'
                          : label.kind === 'end'
                            ? 'translateY(-100%)'
                            : 'translateY(-50%)',
                      textAlign: 'right',
                    }}
                  >
                    {label.time}
                  </div>
                ))}
              </div>
            </div>
            {days.map((day) => {
              const hours = day.hours;
              const dayOccs = occurrences.filter((o) => o.clubDate === day.clubDate);
              const dayBusy = individualBusy.filter((r) => r.clubDate === day.clubDate);
              return (
                <div key={day.clubDate} style={{ flex: 1, minWidth: 92, paddingLeft: 4 }}>
                  <div style={{ height: 28, fontSize: 12, fontWeight: 600, color: '#2c3e50' }}>
                    {formatClubDay(day.clubDate)}
                  </div>
                  <div
                    ref={(el) => {
                      columnRefs.current[day.clubDate] = el;
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || busy) return;
                      const localY = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const startTime = timeFromOffset(axis.start, localY);
                      if (cellIsClosed(hours, startTime)) return;
                      if (occAt(day.clubDate, startTime)) return;
                      if (individualAt(day.clubDate, startTime)) return;
                      e.preventDefault();
                      beginCreate(day.clubDate, startTime, e.clientY);
                    }}
                    style={{ position: 'relative', height: times.length * CELL_H, cursor: 'ns-resize' }}
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
                    {dayBusy.map((block, i) => {
                      const top = ((parseMinutes(block.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                      const height = ((parseMinutes(block.endTime) - parseMinutes(block.startTime)) / 15) * CELL_H;
                      const slotH = Math.max(CELL_H, height);
                      const who =
                        block.playerFirstName || block.playerLastName
                          ? formatPlayerName(
                              block.playerFirstName || '',
                              block.playerLastName || '',
                              getNameDisplayOrder(),
                            )
                          : 'Student';
                      return (
                        <div
                          key={`busy-${i}-${block.startTime}`}
                          title={`${who} ${formatSlotRange(block.startTime, block.endTime)}`}
                          style={{
                            position: 'absolute',
                            left: 2,
                            right: 2,
                            top,
                            height: slotH,
                            backgroundColor: 'rgba(93, 173, 226, 0.72)',
                            backgroundImage: TAKEN_HATCH,
                            borderRadius: 3,
                            zIndex: 2,
                            overflow: 'hidden',
                            pointerEvents: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <LessonSlotCaption name={who} startTime={block.startTime} endTime={block.endTime} height={slotH} />
                        </div>
                      );
                    })}
                    {dayOccs.map((occ) => {
                      const top = ((parseMinutes(occ.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                      const height = ((parseMinutes(occ.endTime) - parseMinutes(occ.startTime)) / 15) * CELL_H;
                      const slotH = Math.max(CELL_H, height);
                      const count = registered(occ).length;
                      const isSel = selectedId === occ.id;
                      const label = `${occ.title} ${count}/${occ.maxParticipants}`;
                      return (
                        <div
                          key={occ.id}
                          role="button"
                          tabIndex={0}
                          title={`${occ.title} ${formatSlotRange(occ.startTime, occ.endTime)} · ${count}/${occ.maxParticipants}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button !== 0) return;
                            setDraft(null);
                            setSelectedId(occ.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setSelectedId(occ.id);
                          }}
                          style={{
                            position: 'absolute',
                            left: 2,
                            right: 2,
                            top,
                            height: slotH,
                            background: colorForClass(occ.classId),
                            boxShadow: isSel ? '0 0 0 2px #1e3a4c' : 'none',
                            borderRadius: 3,
                            zIndex: 3,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            boxSizing: 'border-box',
                          }}
                        >
                          <LessonSlotCaption
                            name={label}
                            startTime={occ.startTime}
                            endTime={occ.endTime}
                            height={slotH}
                          />
                        </div>
                      );
                    })}
                    {draft && draft.clubDate === day.clubDate ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: 2,
                          right: 2,
                          top: ((parseMinutes(draft.startTime) - parseMinutes(axis.start)) / 15) * CELL_H,
                          height: Math.max(
                            CELL_H,
                            ((parseMinutes(draft.endTime) - parseMinutes(draft.startTime)) / 15) * CELL_H,
                          ),
                          background: '#f5c16c',
                          boxShadow: '0 0 0 2px #c47b12',
                          borderRadius: 3,
                          zIndex: 4,
                          pointerEvents: 'none',
                          overflow: 'hidden',
                        }}
                      >
                        <LessonSlotCaption
                          name="New class"
                          startTime={draft.startTime}
                          endTime={draft.endTime}
                          height={Math.max(
                            CELL_H,
                            ((parseMinutes(draft.endTime) - parseMinutes(draft.startTime)) / 15) * CELL_H,
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {draft ? (
        <>
          <div style={sectionBar}>
            <span>
              New class · {formatClubDay(draft.clubDate)} {formatSlotRange(draft.startTime, draft.endTime)}
            </span>
            <button
              type="button"
              style={{ ...barGhost, padding: '4px 10px' }}
              onClick={() => {
                setDraft(null);
                setDrag(null);
              }}
            >
              Dismiss
            </button>
          </div>
          <div
            style={{
              padding: '14px 16px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px 16px',
              alignItems: 'center',
              background: '#f8fafc',
            }}
          >
            <input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...field, width: 200 }}
            />
            <select
              value={durationMinutes}
              onChange={(e) => {
                const mins = Number(e.target.value);
                setDraft((cur) => (cur ? { ...cur, endTime: addMinutes(cur.startTime, mins) } : cur));
              }}
              style={{ ...field, width: 100 }}
            >
              {allowed.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <select value={intervalWeeks} onChange={(e) => setIntervalWeeks(Number(e.target.value))} style={{ ...field, width: 140 }}>
              <option value={1}>Every week</option>
              <option value={2}>Every 2 weeks</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
              Sessions
              <input
                type="number"
                min={1}
                max={40}
                value={repeatCount}
                onChange={(e) => setRepeatCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                style={{ ...field, width: 64, textAlign: 'center' }}
              />
            </label>
            <select value={bandId} onChange={(e) => setBandId(e.target.value)} style={{ ...field, width: 140 }}>
              <option value="">Any rating</option>
              {(cfg?.ratingBands || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
              $
              <input value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...field, width: 72, textAlign: 'center' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
              Min
              <input
                type="number"
                value={minP}
                onChange={(e) => setMinP(Number(e.target.value))}
                style={{ ...field, width: 56, textAlign: 'center' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
              Max
              <input
                type="number"
                value={maxP}
                onChange={(e) => setMaxP(Number(e.target.value))}
                style={{ ...field, width: 56, textAlign: 'center' }}
              />
            </label>
            <button type="button" disabled={busy} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create class'}
            </button>
          </div>
        </>
      ) : null}

      {selected && selectedClass ? (
        <>
          <div style={sectionBar}>
            <span>
              {selected.title} · {formatClubDay(selected.clubDate)}{' '}
              {formatSlotRange(selected.startTime, selected.endTime)}
            </span>
            <Link to={`/classes/${selected.publicCode}`} className="lesson-name-link" style={{ color: '#fff', background: 'rgba(255,255,255,0.14)', textDecoration: 'none', fontWeight: 650, padding: '3px 10px', borderRadius: 6 }}>
              Public page
            </Link>
          </div>
          <div style={{ padding: '14px 16px 16px', background: '#f8fafc' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155' }}>
              {registered(selected).length}/{selected.maxParticipants} registered
              {waitlisted(selected).length ? ` · ${waitlisted(selected).length} waitlist` : ''}
              {registered(selected).length < selected.minParticipants && !selected.runBelowMin
                ? ' · below minimum'
                : ''}
              {selectedClass.pricePerOccurrenceCents != null
                ? ` · ${formatMoney(selectedClass.pricePerOccurrenceCents)}`
                : ''}
            </p>
            {registered(selected).length > 0 ? (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#0f172a' }}>
                {registered(selected)
                  .map((r) =>
                    r.member
                      ? formatPlayerName(r.member.firstName, r.member.lastName, getNameDisplayOrder())
                      : 'Player',
                  )
                  .join(', ')}
              </p>
            ) : (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#64748b' }}>No one registered yet.</p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <select
                value={placeMemberId}
                onChange={(e) => setPlaceMemberId(e.target.value)}
                style={{ ...field, minWidth: 180 }}
              >
                <option value="">Place a player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPlayerName(p.firstName, p.lastName, getNameDisplayOrder())}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={ghostBtn}
                disabled={!placeMemberId || busy}
                onClick={() => {
                  if (!placeMemberId) return;
                  act(
                    api.post(`/lessons/group-occurrences/${selected.id}/register`, {
                      playerMemberId: Number(placeMemberId),
                      waitlistIfFull: true,
                    }),
                    'Could not register',
                  );
                }}
              >
                Place
              </button>
              {registered(selected).length < selected.minParticipants && !selected.runBelowMin ? (
                <button
                  type="button"
                  style={ghostBtn}
                  disabled={busy}
                  onClick={() =>
                    act(api.post(`/lessons/group-occurrences/${selected.id}/run-below-min`), 'Could not run')
                  }
                >
                  Run anyway
                </button>
              ) : null}
              <button
                type="button"
                className="danger"
                aria-label="Cancel occurrence"
                title="Cancel this week"
                disabled={busy}
                style={{
                  width: 28,
                  height: 28,
                  minWidth: 28,
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.18)',
                }}
                onClick={() => {
                  act(api.post(`/lessons/group-occurrences/${selected.id}/cancel`), 'Could not cancel');
                  setSelectedId(null);
                }}
              >
                ×
              </button>
              {admin ? (
                <button
                  type="button"
                  style={ghostBtn}
                  disabled={busy}
                  onClick={() => {
                    act(
                      api.post(`/lessons/group-classes/${selected.classId}/cancel-remaining`, {
                        from: selected.clubDate,
                      }),
                      'Could not cancel remaining',
                    );
                    setSelectedId(null);
                  }}
                >
                  Cancel remaining
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
