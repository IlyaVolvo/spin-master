import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../utils/api';
import {
  getAuthStateSnapshot,
  getMember,
  hasMemberRole,
  subscribeAuthState,
} from '../../utils/auth';
import { addDaysToYmd, clubTodayYmd } from '../../utils/clubDateTime';
import { getErrorMessage } from '../../utils/errorHandler';
import { formatMoney } from '../../utils/formatMoney';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import { getSystemConfig, loadPublicSystemConfig } from '../../utils/systemConfig';
import { axisFromDays, axisTimeLabels } from './availabilityDraft';
import CancelLessonDialog from './CancelLessonDialog';
import { PublicLessonShell } from '../public/PublicResultsShell';

type CellState = 'closed' | 'unavailable' | 'available' | 'reserved';

type CalendarCell = {
  startTime: string;
  endTime: string;
  state: CellState;
  lessonId: number | null;
  mine: boolean;
};

type CalendarDay = {
  clubDate: string;
  hours: { closed: true } | { closed: false; open: string; close: string };
  cells: CalendarCell[];
};

type CoachCalendar = {
  id: number;
  coachProfileId: number;
  firstName: string;
  lastName: string;
  rating: number | null;
  hourlyRateCents: number;
  bio: string;
  bookingFrozen: boolean;
  bookingFrozenMessage: string | null;
  from: string;
  to: string;
  axis: { start: string; end: string } | null;
  days: CalendarDay[];
};

type PendingBook = {
  clubDate: string;
  startTime: string;
  endTime: string;
};

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const GREY = '#dfe4ea';
const AVAILABLE = '#d5f5e3';
const CLICKABLE = '#82e0aa';
const RESERVED = '#aed6f1';
const MINE = '#5dade2';

function startOfWeekMonday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysToYmd(ymd, -back);
}

function formatClubDay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function weekdayFromDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()];
}

function untilOnForWeeks(startsOn: string, weeks: number): string {
  return addDaysToYmd(startsOn, 7 * (Math.max(1, weeks) - 1));
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function durationFits(cells: CalendarCell[], startTime: string, durationMinutes: number): boolean {
  const startMin = parseMinutes(startTime);
  const endMin = startMin + durationMinutes;
  for (let t = startMin; t < endMin; t += 15) {
    const cell = cells.find((c) => parseMinutes(c.startTime) === t);
    if (!cell || cell.state !== 'available') return false;
  }
  return true;
}

function addMinutes(hhmm: string, delta: number): string {
  const total = parseMinutes(hhmm) + delta;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function cellColor(cell: CalendarCell, clickable: boolean): string {
  if (cell.state === 'available') return clickable ? CLICKABLE : AVAILABLE;
  if (cell.state === 'reserved') return cell.mine ? MINE : RESERVED;
  return GREY;
}

export default function PublicCoachPage() {
  const authenticated = useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot, () => false);
  const body = <CoachPageBody canBook={authenticated} />;
  if (authenticated) return body;
  return <PublicLessonShell>{body}</PublicLessonShell>;
}

function CoachPageBody({ canBook }: { canBook: boolean }) {
  const { id } = useParams<{ id: string }>();
  const member = getMember();
  const isPlayer = hasMemberRole('PLAYER');
  const cfg = getSystemConfig().lessons;
  const allowedMinutes = cfg?.individualDurations.allowedMinutes ?? [60];
  const defaultMinutes = cfg?.individualDurations.defaultMinutes ?? 60;

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(clubTodayYmd()));
  const [data, setData] = useState<CoachCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(defaultMinutes);
  const [reminderHours, setReminderHours] = useState(0);
  const [weeks, setWeeks] = useState<1 | 2 | 4>(1);
  const [pending, setPending] = useState<PendingBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);

  useEffect(() => {
    void loadPublicSystemConfig();
  }, []);

  useEffect(() => {
    if (!allowedMinutes.includes(duration)) setDuration(defaultMinutes);
  }, [allowedMinutes, defaultMinutes, duration]);

  const load = useCallback(async () => {
    const weekEnd = addDaysToYmd(weekStart, 6);
    const res = await api.get(`/public/lessons/coaches/${id}`, { params: { from: weekStart, to: weekEnd } });
    setData(res.data);
  }, [id, weekStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(getErrorMessage(err, 'Coach not found'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const frozen = Boolean(data?.bookingFrozen);
  const name = data ? formatPlayerName(data.firstName, data.lastName, getNameDisplayOrder()) : '';
  const ownPage = Boolean(member && data && member.id === data.id);
  const calendarAxis = useMemo(() => {
    if (!data) return null;
    return data.axis || axisFromDays(data.days) || { start: '10:00', end: '22:00' };
  }, [data]);
  const axisTimes = useMemo(() => {
    if (!data) return [];
    const fromCells = data.days[0]?.cells.map((c) => c.startTime) ?? [];
    if (fromCells.length) return fromCells;
    if (!calendarAxis) return [];
    const out: string[] = [];
    const [sh, sm] = calendarAxis.start.split(':').map(Number);
    const [eh, em] = calendarAxis.end.split(':').map(Number);
    for (let t = sh * 60 + sm; t < eh * 60 + em; t += 15) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
    return out;
  }, [data, calendarAxis]);
  const hourLabels = useMemo(() => {
    if (!calendarAxis) return new Set<string>();
    return new Set(axisTimeLabels(calendarAxis).filter((l) => l.kind !== 'end').map((l) => l.time));
  }, [calendarAxis]);

  const book = async () => {
    if (!pending || !data) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (weeks === 1) {
        const res = await api.post('/lessons/individual', {
          coachProfileId: data.coachProfileId,
          clubDate: pending.clubDate,
          startTime: pending.startTime,
          durationMinutes: duration,
          reminderHours,
        });
        const checkoutUrl =
          typeof res.data?.checkout?.checkoutUrl === 'string' ? res.data.checkout.checkoutUrl.trim() : '';
        if (checkoutUrl) {
          window.location.assign(checkoutUrl);
          return;
        }
        setNotice(`Booked ${formatClubDay(pending.clubDate)} ${pending.startTime}–${pending.endTime}.`);
      } else {
        const res = await api.post('/lessons/individual/series', {
          coachProfileId: data.coachProfileId,
          startTime: pending.startTime,
          durationMinutes: duration,
          reminderHours,
          weekdays: [weekdayFromDate(pending.clubDate)],
          intervalWeeks: 1,
          startsOn: pending.clubDate,
          untilOn: untilOnForWeeks(pending.clubDate, weeks),
        });
        const skipped = (res.data?.skipped as string[] | undefined) || [];
        setNotice(
          skipped.length
            ? `Booked ${weeks} weeks (skipped ${skipped.join(', ')}).`
            : `Booked ${weeks} weekly lessons starting ${formatClubDay(pending.clubDate)}.`,
        );
      }
      setPending(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'This time is no longer available.'));
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const cancelMine = async (reason: string) => {
    if (cancelId == null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/lessons/individual/${cancelId}/cancel`, { reason });
      setNotice('Reservation cancelled. That time is available again.');
      setCancelId(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not cancel'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {data && error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}
      {loading ? <div className="card">Loading…</div> : null}
      {!loading && !data ? (
        <div className="card">
          <p style={{ margin: 0 }}>{error || 'This coach page is not available.'}</p>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="card" style={{ marginBottom: '16px' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600, color: '#2c3e50' }}>{name}</h1>
            <div style={{ fontSize: '14px', color: '#546e7a' }}>{formatMoney(data.hourlyRateCents)} / hour</div>
            <button
              type="button"
              className="button-filter"
              style={{ marginTop: '10px' }}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? 'Hide details' : 'Details'}
            </button>
            {detailsOpen ? (
              <div style={{ marginTop: '12px', color: '#37474f', fontSize: '14px' }}>
                {data.rating != null ? <p style={{ margin: '0 0 8px' }}>Rating {data.rating}</p> : null}
                {data.bio ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.bio}</p> : <p style={{ margin: 0 }}>No bio yet.</p>}
                {ownPage ? (
                  <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#546e7a' }}>
                    This is your public page. <Link to="/lessons?view=calendar">Edit on Coach</Link>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="card" style={{ marginBottom: '16px', position: 'relative', padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '10px 16px',
                background: '#2c3e50',
                color: '#fff',
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>
                Week of {formatClubDay(data.from)}
              </h2>
              <div style={{ display: 'flex', gap: '6px' }}>
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
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
              <label className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
                Duration
                <select
                  value={duration}
                  disabled={frozen}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {allowedMinutes.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              {canBook && isPlayer ? (
                <label className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
                  Reminder email
                  <select
                    value={reminderHours}
                    disabled={frozen}
                    onChange={(e) => setReminderHours(Number(e.target.value))}
                  >
                    <option value={0}>None (0 hours)</option>
                    <option value={1}>1 hour before</option>
                    <option value={2}>2 hours before</option>
                    <option value={4}>4 hours before</option>
                    <option value={12}>12 hours before</option>
                    <option value={24}>24 hours before</option>
                  </select>
                </label>
              ) : null}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#546e7a' }}>
              Grey = closed or not offered. Green = available. Blue = reserved.
              {canBook && isPlayer ? ' Pick a duration, then click a green start time.' : ' Log in as a player to book.'}
            </p>

            {frozen ? (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px 14px',
                  background: '#fff6e5',
                  border: '1px solid #f0c36d',
                  borderRadius: '6px',
                  color: '#7a4f01',
                  fontWeight: 600,
                }}
              >
                {data.bookingFrozenMessage || 'This coach is updating their calendar. Booking is paused until they finish.'}
              </div>
            ) : null}

            {!data.days.length || axisTimes.length === 0 ? (
              <p style={{ margin: '16px 0 0', color: '#546e7a' }}>The club is closed this week.</p>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 6px', position: 'sticky', left: 0, background: '#fff' }}>Time</th>
                      {data.days.map((day) => (
                        <th key={day.clubDate} style={{ textAlign: 'left', padding: '4px 6px', minWidth: '88px' }}>
                          {formatClubDay(day.clubDate)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {axisTimes.map((time, rowIndex) => (
                      <tr key={time}>
                        <td
                          style={{
                            padding: '0 6px',
                            position: 'sticky',
                            left: 0,
                            background: '#fff',
                            whiteSpace: 'nowrap',
                            fontWeight: time === calendarAxis?.start ? 600 : 400,
                            color: '#546e7a',
                            borderTop: parseMinutes(time) % 60 === 0 ? '1px solid #cfd8dc' : undefined,
                          }}
                        >
                          {hourLabels.has(time) ? time : ''}
                        </td>
                        {data.days.map((day) => {
                          const cell = day.cells[rowIndex];
                          if (!cell) return <td key={day.clubDate} />;
                          const clickable =
                            !frozen &&
                            canBook &&
                            isPlayer &&
                            cell.state === 'available' &&
                            durationFits(day.cells, cell.startTime, duration);
                          const cancelable = !frozen && canBook && cell.mine && cell.lessonId != null;
                          return (
                            <td key={day.clubDate} style={{ padding: '1px' }}>
                              <div
                                role={clickable || cancelable ? 'button' : undefined}
                                tabIndex={clickable || cancelable ? 0 : undefined}
                                title={
                                  clickable
                                    ? `Book ${cell.startTime}–${addMinutes(cell.startTime, duration)}`
                                    : cancelable
                                      ? 'Cancel your reservation'
                                      : cell.state
                                }
                                onClick={() => {
                                  if (busy) return;
                                  if (cancelable && cell.lessonId != null) {
                                    setCancelId(cell.lessonId);
                                    return;
                                  }
                                  if (!clickable) return;
                                  setPending({
                                    clubDate: day.clubDate,
                                    startTime: cell.startTime,
                                    endTime: addMinutes(cell.startTime, duration),
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter' && e.key !== ' ') return;
                                  e.currentTarget.click();
                                }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  height: '16px',
                                  border: '1px solid #eef2f6',
                                  borderRadius: '2px',
                                  background: cellColor(cell, clickable),
                                  cursor: clickable || cancelable ? 'pointer' : 'default',
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {calendarAxis ? (
                    <tfoot>
                      <tr>
                        <td
                          style={{
                            padding: '0 6px',
                            position: 'sticky',
                            left: 0,
                            background: '#fff',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            color: '#546e7a',
                            lineHeight: '14px',
                          }}
                        >
                          {calendarAxis.end}
                        </td>
                        {data.days.map((day) => (
                          <td key={day.clubDate} />
                        ))}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}

            {pending ? (
              <div style={{ marginTop: '14px', padding: '12px', background: '#f8fbff', borderRadius: '6px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                  Book {formatClubDay(pending.clubDate)} {pending.startTime}–{pending.endTime} ·{' '}
                  {formatMoney(Math.round((data.hourlyRateCents * duration) / 60))}
                </div>
                <label className="form-group" style={{ marginBottom: '8px', maxWidth: '220px' }}>
                  Repeat
                  <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value) as 1 | 2 | 4)}>
                    <option value={1}>This time only (1 week)</option>
                    <option value={2}>2 weeks</option>
                    <option value={4}>4 weeks</option>
                  </select>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="button-3d" disabled={busy || frozen} onClick={() => void book()}>
                    {busy ? 'Booking…' : 'Confirm'}
                  </button>
                  <button type="button" className="button-filter" disabled={busy} onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </>
      ) : null}
      <CancelLessonDialog
        open={cancelId != null}
        busy={busy}
        onClose={() => setCancelId(null)}
        onConfirm={(reason) => void cancelMine(reason)}
      />
    </div>
  );
}
