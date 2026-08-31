import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import api from '../../utils/api';
import { addDaysToYmd } from '../../utils/clubDateTime';
import { getErrorMessage } from '../../utils/errorHandler';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import HoverTimeHint from './HoverTimeHint';
import LessonSlotCaption from './LessonSlotCaption';
import {
  absorbTouching,
  addMinutes,
  axisFromDays,
  axisTimeLabels,
  cellIsClosed,
  clampCreateEnd,
  clampResize,
  type DayHours,
  type DraftWindow,
  type ReservedBlock,
  formatClubDay,
  formatSlotRange,
  maxCreateEnd,
  newDraftKey,
  parseMinutes,
  repeatCopies,
  repeatCopiesUntil,
  replaceWithAbsorbed,
  reservedOnDay,
  mergeTouchingTimeBlocks,
  slotContainsReserved,
  startOfWeekMonday,
} from './availabilityDraft';

const CELL_H = 18;
const HANDLE = 12;
const GREY = '#dfe4ea';
const OPEN = '#eef6f0';
const SLOT = '#82e0aa';
const SLOT_SELECTED = '#27ae60';
const RESERVED = 'rgba(93, 173, 226, 0.72)';

type EditorWeek = {
  from: string;
  to: string;
  axis: { start: string; end: string } | null;
  days: Array<{
    clubDate: string;
    hours: DayHours;
  }>;
};

type DragState =
  | {
      kind: 'create';
      clubDate: string;
      anchorStart: string;
      startTime: string;
      endTime: string;
      moved: boolean;
      originY: number;
    }
  | { kind: 'resize'; key: string; edge: 'start' | 'end' };

type MenuState = { x: number; y: number; key: string };

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

function SlotTimes({ startTime, endTime }: { startTime: string; endTime: string }) {
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
      }}
    >
      {formatSlotRange(startTime, endTime)}
    </div>
  );
}

export default function CoachEditorCalendar(props: {
  week: EditorWeek;
  windows: DraftWindow[];
  reserved: ReservedBlock[];
  hoursByDate: Record<string, DayHours>;
  editing: boolean;
  onWindowsChange: (updater: (prev: DraftWindow[]) => DraftWindow[]) => void;
  onMergeWeek: (days: EditorWeek['days'], reserved: ReservedBlock[]) => void;
  onError: (message: string | null) => void;
}) {
  const { week, windows, reserved, hoursByDate, editing, onWindowsChange, onMergeWeek, onError } = props;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<{ clubDate: string; time: string } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [repeatUntil, setRepeatUntil] = useState('');
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const axis = week.axis ?? axisFromDays(week.days) ?? { start: '10:00', end: '22:00' };
  const times = useMemo(() => axisTimes(axis), [axis.start, axis.end]);
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const axisRef = useRef(axis);
  axisRef.current = axis;
  const hoursRef = useRef(hoursByDate);
  hoursRef.current = hoursByDate;
  const reservedRef = useRef(reserved);
  reservedRef.current = reserved;

  useEffect(() => {
    setMenu(null);
    setHoverTime(null);
  }, [week.from, editing]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const current = dragRef.current;
      const axis = axisRef.current;
      if (!current || !axis) return;
      const clubDate =
        current.kind === 'create' ? current.clubDate : windowsRef.current.find((w) => w.key === current.key)?.clubDate;
      if (!clubDate) return;
      const col = columnRefs.current[clubDate];
      if (!col) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const hovered = timeFromOffset(axis.start, y);
      const hours = hoursRef.current[clubDate];
      if (!hours) return;
      if (current.kind === 'create' && current.clubDate === clubDate) {
        const moved = current.moved || hovered !== current.anchorStart || Math.abs(y - current.originY) >= CELL_H;
        if (!moved) return;
        const end = clampCreateEnd(
          current.anchorStart,
          addMinutes(hovered, 15),
          hours,
          reservedOnDay(reservedRef.current, clubDate),
        );
        if (!end) return;
        const proposed: DraftWindow = {
          key: 'preview',
          occurrenceId: null,
          clubDate,
          startTime: current.anchorStart,
          endTime: end,
        };
        const visual = absorbTouching(proposed, windowsRef.current).keep;
        setSelectedKey(null);
        setDrag({
          ...current,
          moved: true,
          startTime: visual.startTime,
          endTime: visual.endTime,
        });
        return;
      }
      if (current.kind === 'resize') {
        const slot = windowsRef.current.find((w) => w.key === current.key);
        if (!slot || slot.clubDate !== clubDate) return;
        const next = clampResize({
          window: slot,
          edge: current.edge,
          proposed: current.edge === 'end' ? addMinutes(hovered, 15) : hovered,
          hours,
          reserved: reservedRef.current,
        });
        if (!next) return;
        onWindowsChange((prev) =>
          prev.map((w) =>
            w.key === slot.key ? { ...w, startTime: next.startTime, endTime: next.endTime } : w,
          ),
        );
      }
    };
    const onUp = () => {
      const current = dragRef.current;
      if (
        current?.kind === 'create' &&
        current.moved &&
        parseMinutes(current.endTime) > parseMinutes(current.startTime)
      ) {
        const created: DraftWindow = {
          key: newDraftKey(),
          occurrenceId: null,
          clubDate: current.clubDate,
          startTime: current.startTime,
          endTime: current.endTime,
        };
        onWindowsChange((prev) => replaceWithAbsorbed(prev, created));
        setSelectedKey(created.key);
      }
      if (current?.kind === 'resize') {
        onWindowsChange((prev) => {
          const slot = prev.find((w) => w.key === current.key);
          return slot ? replaceWithAbsorbed(prev, slot) : prev;
        });
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [Boolean(drag), onWindowsChange]);

  const selected = windows.find((w) => w.key === selectedKey) || null;

  const hoursOf = (ymd: string): DayHours | undefined => hoursByDate[ymd];

  const ensureWeekHours = async (ymd: string) => {
    if (hoursByDate[ymd]) return hoursByDate[ymd];
    const from = startOfWeekMonday(ymd);
    const to = addDaysToYmd(from, 6);
    try {
      const res = await api.get('/lessons/me/calendar', { params: { from, to } });
      const days = (res.data?.days || []) as EditorWeek['days'];
      const extraReserved = (res.data?.reserved || []) as ReservedBlock[];
      onMergeWeek(days, extraReserved);
      return days.find((d) => d.clubDate === ymd)?.hours;
    } catch (err) {
      onError(getErrorMessage(err, 'Could not load that week'));
      return undefined;
    }
  };

  const startCreate = (clubDate: string, startTime: string, originY: number) => {
    if (!editing) return;
    const hours = hoursOf(clubDate);
    if (!hours) return;
    const coveringReserved = reservedOnDay(reserved, clubDate).some(
      (r) => parseMinutes(r.startTime) <= parseMinutes(startTime) && parseMinutes(startTime) < parseMinutes(r.endTime),
    );
    if (coveringReserved) return;
    const covering = windows.find(
      (w) =>
        w.clubDate === clubDate &&
        parseMinutes(w.startTime) <= parseMinutes(startTime) &&
        parseMinutes(startTime) < parseMinutes(w.endTime),
    );
    if (covering) {
      setSelectedKey(covering.key);
      return;
    }
    const maxEnd = maxCreateEnd(startTime, hours, reservedOnDay(reserved, clubDate));
    if (!maxEnd) return;
    setMenu(null);
    setHoverTime(null);
    setDrag({
      kind: 'create',
      clubDate,
      anchorStart: startTime,
      startTime,
      endTime: startTime,
      moved: false,
      originY,
    });
  };

  const openMenu = (event: MouseEvent, key: string) => {
    if (!editing) return;
    event.preventDefault();
    setSelectedKey(key);
    setRepeatWeeks(1);
    setRepeatUntil('');
    setMenu({ x: event.clientX, y: event.clientY, key });
  };

  const removeSelected = () => {
    if (!selected) return;
    if (slotContainsReserved(selected, reserved)) {
      onError('Cancel the reservation in Teaching before removing this window.');
      setMenu(null);
      return;
    }
    onWindowsChange((prev) => prev.filter((w) => w.key !== selected.key));
    setSelectedKey(null);
    setMenu(null);
  };

  const repeatSelected = async () => {
    if (!selected) return;
    const until = /^\d{4}-\d{2}-\d{2}$/.test(repeatUntil) ? repeatUntil : '';
    const weeks = Math.max(1, Math.floor(Number(repeatWeeks) || 1));
    if (until) {
      if (until < addDaysToYmd(selected.clubDate, 7)) return;
    } else if (weeks < 2) {
      return;
    }
    const localHours: Record<string, DayHours> = { ...hoursByDate };
    const lastDate = until || addDaysToYmd(selected.clubDate, 7 * (weeks - 1));
    for (let i = 1; ; i += 1) {
      const ymd = addDaysToYmd(selected.clubDate, 7 * i);
      if (ymd > lastDate || i > 52) break;
      if (!localHours[ymd]) {
        const hours = await ensureWeekHours(ymd);
        if (hours) localHours[ymd] = hours;
      }
    }
    const hoursFor = (ymd: string) => localHours[ymd];
    const copies = until
      ? repeatCopiesUntil(selected, until, windows, hoursFor, addDaysToYmd)
      : repeatCopies(selected, weeks, windows, hoursFor, addDaysToYmd);
    onWindowsChange((prev) => [...prev, ...copies]);
    setMenu(null);
  };

  const preview =
    drag?.kind === 'create' && drag.moved && parseMinutes(drag.endTime) > parseMinutes(drag.startTime)
      ? { clubDate: drag.clubDate, startTime: drag.startTime, endTime: drag.endTime, key: 'preview', occurrenceId: null }
      : null;
  const hiddenKeys = useMemo(() => {
    if (drag?.kind !== 'create' || !drag.moved) return new Set<string>();
    return new Set(
      absorbTouching(
        {
          key: 'preview',
          occurrenceId: null,
          clubDate: drag.clubDate,
          startTime: drag.startTime,
          endTime: drag.endTime,
        },
        windows,
      ).removeKeys,
    );
  }, [drag, windows]);

  return (
    <div>
      <div style={{ overflowX: 'auto', marginTop: 12, userSelect: 'none' }}>
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
                      label.kind === 'start' ? 'none' : label.kind === 'end' ? 'translateY(-100%)' : 'translateY(-50%)',
                    textAlign: 'right',
                  }}
                >
                  {label.time}
                </div>
              ))}
            </div>
          </div>
          {week.days.map((day) => {
            const hours = day.hours;
            const daySlots = windows.filter((w) => w.clubDate === day.clubDate && !hiddenKeys.has(w.key));
            const dayReserved = mergeTouchingTimeBlocks(
              reserved.filter((r) => r.clubDate === day.clubDate),
              (a, b) =>
                (a.kind || 'individual') === (b.kind || 'individual') &&
                (a.playerFirstName || '') === (b.playerFirstName || '') &&
                (a.playerLastName || '') === (b.playerLastName || ''),
            );
            return (
              <div key={day.clubDate} style={{ flex: 1, minWidth: 92, paddingLeft: 4 }}>
                <div style={{ height: 28, fontSize: 12, fontWeight: 600, color: '#2c3e50' }}>{formatClubDay(day.clubDate)}</div>
                <div
                  ref={(el) => {
                    columnRefs.current[day.clubDate] = el;
                  }}
                  onPointerMove={(e) => {
                    if (!editing || drag) {
                      if (hoverTime?.clubDate === day.clubDate) setHoverTime(null);
                      return;
                    }
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const time = timeFromOffset(axis.start, y);
                    if (cellIsClosed(hours, time)) {
                      if (hoverTime?.clubDate === day.clubDate) setHoverTime(null);
                      return;
                    }
                    const coveringReserved = reservedOnDay(reserved, day.clubDate).some(
                      (r) =>
                        parseMinutes(r.startTime) <= parseMinutes(time) &&
                        parseMinutes(time) < parseMinutes(r.endTime),
                    );
                    const coveringWindow = windows.some(
                      (w) =>
                        w.clubDate === day.clubDate &&
                        parseMinutes(w.startTime) <= parseMinutes(time) &&
                        parseMinutes(time) < parseMinutes(w.endTime),
                    );
                    if (coveringReserved || coveringWindow) {
                      if (hoverTime?.clubDate === day.clubDate) setHoverTime(null);
                      return;
                    }
                    if (hoverTime?.clubDate !== day.clubDate || hoverTime.time !== time) {
                      setHoverTime({ clubDate: day.clubDate, time });
                    }
                  }}
                  onPointerLeave={() => {
                    setHoverTime((cur) => (cur?.clubDate === day.clubDate ? null : cur));
                  }}
                  style={{ position: 'relative', height: times.length * CELL_H }}
                >
                  {times.map((time) => {
                    const closed = cellIsClosed(hours, time);
                    return (
                      <div
                        key={time}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          if (closed) return;
                          startCreate(day.clubDate, time, e.clientY);
                        }}
                        style={{
                          height: CELL_H,
                          background: closed ? GREY : OPEN,
                          borderTop: parseMinutes(time) % 60 === 0 ? '1px solid #cfd8dc' : '1px solid transparent',
                          borderBottom: 'none',
                          cursor: editing && !closed ? 'crosshair' : 'default',
                        }}
                      />
                    );
                  })}
                  {[...daySlots, ...(preview && preview.clubDate === day.clubDate ? [preview] : [])].map((slot) => {
                    const top = ((parseMinutes(slot.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                    const height = ((parseMinutes(slot.endTime) - parseMinutes(slot.startTime)) / 15) * CELL_H;
                    const isSel = slot.key === selectedKey || slot.key === 'preview';
                    const showTimes = isSel || hoveredKey === slot.key || (drag?.kind === 'resize' && drag.key === slot.key);
                    return (
                      <div
                        key={slot.key}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          if (!editing) return;
                          setSelectedKey(slot.key);
                          setMenu(null);
                          const localY = e.clientY - e.currentTarget.getBoundingClientRect().top;
                          if (localY <= HANDLE) {
                            setDrag({ kind: 'resize', key: slot.key, edge: 'start' });
                          } else if (height - localY <= HANDLE) {
                            setDrag({ kind: 'resize', key: slot.key, edge: 'end' });
                          }
                        }}
                        onPointerEnter={() => setHoveredKey(slot.key)}
                        onPointerLeave={() => setHoveredKey((cur) => (cur === slot.key ? null : cur))}
                        onContextMenu={(e) => openMenu(e, slot.key)}
                        style={{
                          position: 'absolute',
                          left: 2,
                          right: 2,
                          top,
                          height: Math.max(CELL_H, height),
                          background: isSel ? SLOT_SELECTED : SLOT,
                          borderRadius: 3,
                          boxShadow: isSel ? '0 0 0 2px #1e8449' : 'none',
                          cursor: editing ? 'pointer' : 'default',
                          zIndex: 1,
                        }}
                      >
                        {showTimes ? <SlotTimes startTime={slot.startTime} endTime={slot.endTime} /> : null}
                        {editing ? (
                          <>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HANDLE, cursor: 'ns-resize' }} />
                            <div
                              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HANDLE, cursor: 'ns-resize' }}
                            />
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                  {dayReserved.map((block, i) => {
                    const top = ((parseMinutes(block.startTime) - parseMinutes(axis.start)) / 15) * CELL_H;
                    const height = ((parseMinutes(block.endTime) - parseMinutes(block.startTime)) / 15) * CELL_H;
                    const student =
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
                        key={`r-${i}-${block.startTime}`}
                        title={`${student} ${formatSlotRange(block.startTime, block.endTime)}`}
                        style={{
                          position: 'absolute',
                          left: 8,
                          right: 8,
                          top,
                          height: Math.max(CELL_H, height),
                          background: RESERVED,
                          borderRadius: 3,
                          pointerEvents: 'none',
                          zIndex: 2,
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                        }}
                      >
                        <LessonSlotCaption
                          name={student}
                          startTime={block.startTime}
                          endTime={block.endTime}
                          height={Math.max(CELL_H, height)}
                          color="#111"
                        />
                      </div>
                    );
                  })}
                  {editing && hoverTime?.clubDate === day.clubDate && !drag ? (
                    <HoverTimeHint
                      time={hoverTime.time}
                      offsetMinutes={parseMinutes(hoverTime.time) - parseMinutes(axis.start)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editing ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#546e7a' }}>
          Click an empty time and drag to open a window (snaps to 15 minutes from where you drop). Drag either end
          to resize. Right-click a window to repeat or remove.
        </p>
      ) : null}
      {menu && selected ? (
        <div
          role="dialog"
          aria-label="Time window"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 288)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 280)),
            zIndex: 40,
            width: 268,
            background: '#fff',
            border: '1px solid rgba(70, 130, 180, 0.22)',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(15, 32, 48, 0.18)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 14px 10px',
              background: 'linear-gradient(165deg, #f4f8fb 0%, #ffffff 100%)',
              borderBottom: '1px solid #e8eef2',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#5F9EA0',
              }}
            >
              {formatClubDay(selected.clubDate)}
            </div>
            <div style={{ marginTop: 2, fontSize: 17, fontWeight: 700, color: '#2c3e50', letterSpacing: '-0.02em' }}>
              {selected.startTime}–{selected.endTime}
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#546e7a', marginBottom: 8 }}>Repeat</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <input
                type="number"
                min={1}
                max={52}
                value={repeatWeeks}
                onChange={(e) => {
                  setRepeatUntil('');
                  setRepeatWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)));
                }}
                style={{
                  width: 52,
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  border: '1px solid #cfd8dc',
                  borderRadius: 6,
                  fontSize: 14,
                  textAlign: 'center',
                  background: repeatUntil ? '#eef1f3' : '#fff',
                  color: repeatUntil ? '#90a4ae' : '#2c3e50',
                }}
              />
              <span style={{ fontSize: 13, color: repeatUntil ? '#90a4ae' : '#2c3e50' }}>weeks</span>
              <span style={{ fontSize: 12, color: '#90a4ae' }}>or until</span>
              <input
                type="date"
                value={repeatUntil}
                min={addDaysToYmd(selected.clubDate, 7)}
                onChange={(e) => {
                  setRepeatWeeks(1);
                  setRepeatUntil(e.target.value);
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '6px 6px',
                  border: '1px solid #cfd8dc',
                  borderRadius: 6,
                  fontSize: 12,
                  background: repeatWeeks >= 2 ? '#eef1f3' : '#fff',
                  color: repeatWeeks >= 2 ? '#90a4ae' : '#2c3e50',
                }}
              />
            </div>
            <button
              type="button"
              disabled={
                repeatUntil
                  ? repeatUntil < addDaysToYmd(selected.clubDate, 7)
                  : repeatWeeks < 2
              }
              onClick={() => void repeatSelected()}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6 }}
            >
              Repeat
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="danger"
                onClick={removeSelected}
                disabled={slotContainsReserved(selected, reserved)}
                title={slotContainsReserved(selected, reserved) ? 'This window has a reservation' : 'Remove'}
                style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6 }}
              >
                Remove
              </button>
              <button
                type="button"
                className="button-filter"
                onClick={() => setMenu(null)}
                style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {menu ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 30 }}
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}
