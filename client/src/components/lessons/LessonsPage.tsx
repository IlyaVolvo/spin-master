import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { getMember, hasMemberRole, isAdmin } from '../../utils/auth';
import { addDaysToYmd, addMonthsToYmd, clubTodayYmd, clubYmd, formatClubDate, formatClubTime } from '../../utils/clubDateTime';
import { getSystemConfig } from '../../utils/systemConfig';
import { formatMoney } from '../../utils/formatMoney';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import CoachEditorCalendar from './CoachEditorCalendar';
import CoachGroupCalendar from './CoachGroupCalendar';
import StudentLessonCalendar from './StudentLessonCalendar';
import CancelLessonDialog from './CancelLessonDialog';
import { printCoachSchedule } from './printCoachSchedule';
import {
  type DayHours,
  type DraftWindow,
  type ReservedBlock,
  axisFromDays,
  buildWeekFrame,
  formatClubDay,
  formatSlotRange,
  mergeAdjacentWindows,
  startOfWeekMonday,
  windowsFromPublished,
} from './availabilityDraft';

type Tab = 'find' | 'mine' | 'calendar' | 'classes' | 'log';

const RATING_RANGE_TIP =
  'Leave blank for no limit. Players outside this range will not see your times.';

const coachField: CSSProperties = {
  width: 76,
  boxSizing: 'border-box',
  padding: '7px 8px',
  border: '1px solid #d5dde5',
  borderRadius: 8,
  fontSize: 14,
  color: '#1e2937',
  background: '#fff',
  textAlign: 'center',
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

const lessonTh: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: 12,
  fontWeight: 700,
  color: '#1e2937',
  background: '#e8eef3',
  borderBottom: '1px solid #c5d0da',
  whiteSpace: 'nowrap',
};
const lessonThDate: CSSProperties = { ...lessonTh, padding: '6px 4px 6px 10px' };
const lessonThTime: CSSProperties = { ...lessonTh, padding: '6px 10px 6px 4px' };
const lessonTd: CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  color: '#111',
  verticalAlign: 'middle',
  borderBottom: '1px solid #e2e8f0',
};
const lessonTdDate: CSSProperties = { ...lessonTd, padding: '6px 4px 6px 10px', whiteSpace: 'nowrap' };
const lessonTdTime: CSSProperties = {
  ...lessonTd,
  padding: '6px 10px 6px 4px',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};
const lessonNameLink: CSSProperties = {
  color: '#1e3a4c',
  textDecoration: 'none',
  fontWeight: 650,
  padding: '3px 10px',
  borderRadius: 6,
  background: '#e8eef3',
  display: 'inline-block',
};
const lessonRemoveBtn: CSSProperties = {
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
};
const lessonTable: CSSProperties = {
  width: 'max-content',
  maxWidth: '100%',
  borderCollapse: 'collapse',
  margin: 0,
};
const lessonSectionBar: CSSProperties = {
  padding: '8px 12px',
  background: '#2c3e50',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
};

function weekBoundaryStyle(clubDate: string, prevClubDate: string | null): CSSProperties {
  const week = startOfWeekMonday(clubDate);
  const prevWeek = prevClubDate ? startOfWeekMonday(prevClubDate) : null;
  if (prevWeek && week !== prevWeek) {
    return { borderTop: '2px solid #2c3e50' };
  }
  return {};
}

function RatingLabel() {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span style={{ fontSize: 13, fontWeight: 650, color: '#334155' }}>Rating:</span>
      <button
        type="button"
        aria-label={RATING_RANGE_TIP}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: 18,
          height: 18,
          padding: 0,
          border: '1px solid #b0bec5',
          borderRadius: '50%',
          background: '#fff',
          color: '#607d8b',
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
            width: 240,
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
          {RATING_RANGE_TIP}
        </span>
      ) : null}
    </span>
  );
}

export default function LessonsPage() {
  const location = useLocation();
  const coach = hasMemberRole('COACH') || isAdmin();
  const admin = isAdmin();
  const coachWorkspace = location.pathname.startsWith('/coach');
  const [tab, setTab] = useState<Tab>(coachWorkspace && coach ? 'calendar' : 'find');
  const [error, setError] = useState<string | null>(null);

  const coachTabs: Array<{ id: Tab; label: string }> = coach
    ? [
        { id: 'calendar', label: 'Calendar' },
        { id: 'classes', label: 'Group classes' },
      ]
    : [];
  const playerTabs: Array<{ id: Tab; label: string }> = [
    { id: 'find', label: 'Find a lesson' },
    { id: 'mine', label: 'My lessons' },
  ];
  const extraTabs: Array<{ id: Tab; label: string }> = admin ? [{ id: 'log', label: 'Log' }] : [];

  const tabBtn = (t: { id: Tab; label: string }) => (
    <button
      key={t.id}
      type="button"
      onClick={() => setTab(t.id)}
      style={{
        padding: '6px 12px',
        borderRadius: '6px',
        border: tab === t.id ? '1px solid #2d6f8f' : '1px solid #cfd8dc',
        background: tab === t.id ? '#e8f4f8' : 'white',
        color: '#111',
        cursor: 'pointer',
      }}
    >
      {t.label}
    </button>
  );

  return (
    <div>
      {!coachWorkspace ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {coachTabs.map(tabBtn)}
          {coachTabs.length > 0 ? (
            <span
              aria-hidden="true"
              style={{
                width: 1,
                height: 22,
                background: '#c5d0da',
                margin: '0 10px',
                flexShrink: 0,
              }}
            />
          ) : null}
          {playerTabs.map(tabBtn)}
          {extraTabs.length > 0 ? (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{extraTabs.map(tabBtn)}</span>
          ) : null}
        </div>
      ) : null}
      {error ? <p style={{ color: '#c0392b' }}>{error}</p> : null}
      {coachWorkspace ? (
        coach ? <CoachCalendar onError={setError} /> : <p>This page is for coaches.</p>
      ) : (
        <>
          {tab === 'find' ? <StudentLessonCalendar onError={setError} /> : null}
          {tab === 'mine' ? <MyLessons onError={setError} /> : null}
          {tab === 'calendar' && coach ? <CoachCalendar onError={setError} /> : null}
          {tab === 'classes' && coach ? <CoachGroupCalendar onError={setError} /> : null}
          {tab === 'log' && admin ? <LifecycleLog onError={setError} /> : null}
        </>
      )}
    </div>
  );
}

function MyLessons({ onError }: { onError: (m: string | null) => void }) {
  const [lessons, setLessons] = useState<Array<Record<string, unknown>>>([]);
  const [classes, setClasses] = useState<Array<Record<string, unknown>>>([]);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    api
      .get('/lessons/mine')
      .then((res) => {
        setLessons(res.data.lessons || []);
        setClasses(res.data.classes || []);
      })
      .catch((err) => onError(getErrorMessage(err, 'Could not load lessons')));
  };
  useEffect(() => {
    load();
  }, [onError]);
  const cancelLesson = async (reason: string) => {
    if (cancelId == null) return;
    setBusy(true);
    onError(null);
    try {
      await api.post(`/lessons/individual/${cancelId}/cancel`, { reason });
      setCancelId(null);
      load();
    } catch (err) {
      onError(getErrorMessage(err, 'Could not cancel'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', width: 'fit-content', maxWidth: '100%' }}>
      <div style={lessonSectionBar}>Individual</div>
      <table style={lessonTable}>
        <thead>
          <tr>
            <th style={lessonThDate}>Date</th>
            <th style={lessonThTime}>Time</th>
            <th style={lessonTh}>Coach</th>
            <th style={{ ...lessonTh, textAlign: 'right' }}>Price</th>
            <th style={lessonTh} />
          </tr>
        </thead>
        <tbody>
          {lessons.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...lessonTd, color: '#64748b' }}>
                No upcoming individual lessons.
              </td>
            </tr>
          ) : (
            lessons.map((row, i) => {
              const coach = row.coach as { member?: { id: number; firstName: string; lastName: string } };
              const name = coach?.member
                ? formatPlayerName(coach.member.firstName, coach.member.lastName, getNameDisplayOrder())
                : 'Coach';
              const clubDate = String(row.clubDate);
              const prevDate = i > 0 ? String(lessons[i - 1].clubDate) : null;
              const stripe = i % 2 === 0 ? '#fff' : '#f4f7fa';
              const weekLine = weekBoundaryStyle(clubDate, prevDate);
              return (
                <tr key={String(row.id)} style={{ background: stripe }}>
                  <td style={{ ...lessonTdDate, ...weekLine }}>{formatClubDay(clubDate)}</td>
                  <td style={{ ...lessonTdTime, ...weekLine }}>
                    {formatSlotRange(String(row.startTime), String(row.endTime))}
                  </td>
                  <td style={{ ...lessonTd, ...weekLine, whiteSpace: 'nowrap' }}>
                    {coach?.member?.id ? (
                      <Link to={`/coaches/${coach.member.id}`} className="lesson-name-link" style={lessonNameLink}>
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </td>
                  <td
                    style={{
                      ...lessonTd,
                      ...weekLine,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatMoney(Number(row.priceCents) || 0)}
                  </td>
                  <td style={{ ...lessonTd, ...weekLine, textAlign: 'center', width: 40 }}>
                    <button
                      type="button"
                      className="danger"
                      aria-label="Cancel lesson"
                      title="Cancel"
                      style={lessonRemoveBtn}
                      onClick={() => setCancelId(Number(row.id))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div style={lessonSectionBar}>Group classes</div>
      <table style={lessonTable}>
        <thead>
          <tr>
            <th style={lessonThDate}>Date</th>
            <th style={lessonThTime}>Time</th>
            <th style={lessonTh}>Class</th>
            <th style={lessonTh}>Status</th>
            <th style={lessonTh} />
          </tr>
        </thead>
        <tbody>
          {classes.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...lessonTd, color: '#64748b' }}>
                No upcoming class registrations.
              </td>
            </tr>
          ) : (
            classes.map((row, i) => {
              const occ = row.occurrence as {
                clubDate: string;
                startTime: string;
                endTime: string;
                groupClass?: { title: string; publicCode: string };
              };
              const clubDate = String(occ?.clubDate || '');
              const prevDate =
                i > 0
                  ? String((classes[i - 1].occurrence as { clubDate?: string } | undefined)?.clubDate || '')
                  : null;
              const stripe = i % 2 === 0 ? '#fff' : '#f4f7fa';
              const weekLine = weekBoundaryStyle(clubDate, prevDate);
              const title = occ?.groupClass?.title || 'Class';
              return (
                <tr key={String(row.id)} style={{ background: stripe }}>
                  <td style={{ ...lessonTdDate, ...weekLine }}>{clubDate ? formatClubDay(clubDate) : '—'}</td>
                  <td style={{ ...lessonTdTime, ...weekLine }}>
                    {occ?.startTime && occ?.endTime ? formatSlotRange(occ.startTime, occ.endTime) : '—'}
                  </td>
                  <td style={{ ...lessonTd, ...weekLine, whiteSpace: 'nowrap' }}>
                    {occ?.groupClass?.publicCode ? (
                      <Link to={`/classes/${occ.groupClass.publicCode}`} className="lesson-name-link" style={lessonNameLink}>
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </td>
                  <td style={{ ...lessonTd, ...weekLine, whiteSpace: 'nowrap' }}>{String(row.status)}</td>
                  <td style={{ ...lessonTd, ...weekLine, textAlign: 'center', width: 40 }}>
                    <button
                      type="button"
                      className="danger"
                      aria-label="Drop class"
                      title="Drop"
                      style={lessonRemoveBtn}
                      onClick={() => {
                        api
                          .post(`/lessons/group-registrations/${row.id}/drop`)
                          .then(() => load())
                          .catch((err) => onError(getErrorMessage(err, 'Could not drop')));
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <CancelLessonDialog
        open={cancelId != null}
        busy={busy}
        onClose={() => setCancelId(null)}
        onConfirm={(reason) => void cancelLesson(reason)}
      />
    </div>
  );
}

function CoachCalendar({ onError }: { onError: (m: string | null) => void }) {
  const cfg = getSystemConfig().lessons;
  const [rate, setRate] = useState('0');
  const [savedRate, setSavedRate] = useState('0');
  const [bio, setBio] = useState('');
  const [savedBio, setSavedBio] = useState('');
  const [teachingActive, setTeachingActive] = useState(true);
  const [ratingMin, setRatingMin] = useState('');
  const [ratingMax, setRatingMax] = useState('');
  const [savedRatingMin, setSavedRatingMin] = useState('');
  const [savedRatingMax, setSavedRatingMax] = useState('');
  const [coachName, setCoachName] = useState('');
  const [picture, setPicture] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(true);
  const [slotsOpen, setSlotsOpen] = useState(true);
  const [printWeeks, setPrintWeeks] = useState(4);
  const [printing, setPrinting] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [lessons, setLessons] = useState<Array<Record<string, unknown>>>([]);
  const [reduceId, setReduceId] = useState<number | null>(null);
  const [reduceRate, setReduceRate] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(clubTodayYmd()));
  const [week, setWeek] = useState(() =>
    buildWeekFrame(startOfWeekMonday(clubTodayYmd()), getSystemConfig().branding.weeklyHours),
  );
  const [draft, setDraft] = useState<DraftWindow[] | null>(null);
  const [hoursByDate, setHoursByDate] = useState<Record<string, DayHours>>({});
  const [reserved, setReserved] = useState<ReservedBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const slotsRef = useRef<HTMLDivElement | null>(null);
  const editing = draft != null;
  const updateDraft = useCallback((updater: (prev: DraftWindow[]) => DraftWindow[]) => {
    setDraft((cur) => (cur ? updater(cur) : cur));
  }, []);

  const mergeWeek = (
    days: Array<{ clubDate: string; hours: DayHours }>,
    extraReserved: ReservedBlock[],
  ) => {
    setHoursByDate((cur) => {
      const next = { ...cur };
      for (const day of days) next[day.clubDate] = day.hours;
      return next;
    });
    setReserved((cur) => {
      const dates = new Set(extraReserved.map((r) => r.clubDate).concat(days.map((d) => d.clubDate)));
      return [...cur.filter((r) => !dates.has(r.clubDate)), ...extraReserved];
    });
  };

  const loadWeek = (from: string) => {
    const fallback = buildWeekFrame(from, getSystemConfig().branding.weeklyHours);
    setWeek(fallback);
    mergeWeek(fallback.days, []);
    const to = addDaysToYmd(from, 6);
    api
      .get('/lessons/me/calendar', { params: { from, to } })
      .then((res) => {
        const days = (res.data.days || []) as Array<{ clubDate: string; hours: DayHours }>;
        const filledDays = days.length === 7 ? days : fallback.days;
        setWeek({
          from: res.data.from || fallback.from,
          to: res.data.to || fallback.to,
          axis: res.data.axis || axisFromDays(filledDays) || fallback.axis,
          days: filledDays,
          windows: res.data.windows || [],
        });
        mergeWeek(filledDays, res.data.reserved || []);
      })
      .catch((err) => onError(getErrorMessage(err, 'Could not load calendar')));
  };

  const loadDraftWindows = async () => {
    const from = weekStart < startOfWeekMonday(clubTodayYmd()) ? weekStart : startOfWeekMonday(clubTodayYmd());
    const to = addMonthsToYmd(startOfWeekMonday(clubTodayYmd()), cfg?.horizonMonths ?? 3);
    const res = await api.get('/lessons/availability', { params: { from, to } });
    const rows = ((res.data || []) as Array<Record<string, unknown>>).filter((r) => !r.cancelled);
    return mergeAdjacentWindows(
      windowsFromPublished(
        rows.map((r) => ({
          id: Number(r.id),
          clubDate: String(r.clubDate),
          startTime: String(r.startTime),
          endTime: String(r.endTime),
        })),
      ),
    );
  };

  const loadProfileAndTeaching = () => {
    api
      .get('/lessons/me/profile')
      .then((res) => {
        const nextRate = String((res.data.hourlyRateCents || 0) / 100);
        setRate(nextRate);
        setSavedRate(nextRate);
        setBio(res.data.bio || '');
        setSavedBio(res.data.bio || '');
        setTeachingActive(res.data.teachingActive !== false);
        const min = res.data.studentRatingMin == null ? '' : String(res.data.studentRatingMin);
        const max = res.data.studentRatingMax == null ? '' : String(res.data.studentRatingMax);
        setRatingMin(min);
        setSavedRatingMin(min);
        setRatingMax(max);
        setSavedRatingMax(max);
        const m = res.data.member as { firstName?: string; lastName?: string; picture?: string | null } | undefined;
        if (m) {
          setCoachName(formatPlayerName(m.firstName || '', m.lastName || '', getNameDisplayOrder()));
          setPicture(m.picture || null);
        }
        if (res.data.bookingFrozen && draft == null) {
          void enterEdit(false);
        }
      })
      .catch((err) => onError(getErrorMessage(err, 'Could not load profile')));
    api
      .get('/lessons/teaching')
      .then((res) => setLessons(res.data.lessons || []))
      .catch((err) => onError(getErrorMessage(err, 'Could not load teaching')));
  };

  const enterEdit = async (startSession: boolean) => {
    onError(null);
    try {
      if (startSession) await api.post('/lessons/me/edit-session/start');
      const windows = await loadDraftWindows();
      setDraft(windows);
      setSlotsOpen(true);
    } catch (err) {
      onError(getErrorMessage(err, 'Could not start editing'));
    }
  };

  const saveProfile = async (patch: {
    hourlyRateCents?: number;
    bio?: string;
    teachingActive?: boolean;
    studentRatingMin?: number | null;
    studentRatingMax?: number | null;
  }) => {
    onError(null);
    setProfileSaving(true);
    try {
      await api.patch('/lessons/me/profile', patch);
      if (patch.hourlyRateCents != null) {
        const next = String(patch.hourlyRateCents / 100);
        setSavedRate(next);
      }
      if (patch.bio != null) setSavedBio(patch.bio);
      if (patch.studentRatingMin !== undefined) {
        setSavedRatingMin(patch.studentRatingMin == null ? '' : String(patch.studentRatingMin));
      }
      if (patch.studentRatingMax !== undefined) {
        setSavedRatingMax(patch.studentRatingMax == null ? '' : String(patch.studentRatingMax));
      }
    } catch (err) {
      onError(getErrorMessage(err, 'Could not save profile'));
    } finally {
      setProfileSaving(false);
    }
  };

  const printSchedule = async () => {
    const weeks = Math.max(1, Math.min(12, Math.floor(Number(printWeeks) || 4)));
    setPrinting(true);
    onError(null);
    try {
      const from = weekStart;
      const to = addDaysToYmd(from, 7 * weeks - 1);
      const res = await api.get('/lessons/me/calendar', { params: { from, to } });
      const days = (res.data.days || []) as Array<{ clubDate: string; hours: DayHours }>;
      const windows = (res.data.windows || []) as Array<{ clubDate: string; startTime: string; endTime: string }>;
      const reservedRows = (res.data.reserved || []) as ReservedBlock[];
      printCoachSchedule({
        coachName: coachName || 'Coach',
        clubName: getSystemConfig().branding.clubName || 'Club',
        weekCount: weeks,
        days: days.map((day) => ({
          clubDate: day.clubDate,
          hours: day.hours,
          windows: windows.filter((w) => w.clubDate === day.clubDate),
          reserved: reservedRows.filter((r) => r.clubDate === day.clubDate),
        })),
      });
    } catch (err) {
      onError(getErrorMessage(err, 'Could not load schedule to print'));
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    loadProfileAndTeaching();
  }, []);

  useEffect(() => {
    loadWeek(weekStart);
  }, [weekStart]);

  useEffect(() => {
    if (!editing) return;
    const idleMs = Math.max(1, cfg?.editSessionMinutes ?? 10) * 60 * 1000;
    let lastActivity = Date.now();
    let lastBeat = 0;
    let ended = false;
    const root = slotsRef.current;
    const beat = () => {
      lastActivity = Date.now();
      if (ended) return;
      if (Date.now() - lastBeat < 30000) return;
      lastBeat = Date.now();
      api.post('/lessons/me/edit-session/heartbeat').catch(() => setDraft(null));
    };
    const expire = window.setInterval(() => {
      if (ended || Date.now() - lastActivity < idleMs) return;
      ended = true;
      api.post('/lessons/me/edit-session/end').finally(() => setDraft(null));
    }, 15000);
    root?.addEventListener('pointerdown', beat);
    root?.addEventListener('keydown', beat);
    return () => {
      window.clearInterval(expire);
      root?.removeEventListener('pointerdown', beat);
      root?.removeEventListener('keydown', beat);
    };
  }, [editing, cfg?.editSessionMinutes]);

  const discard = async () => {
    onError(null);
    try {
      await api.post('/lessons/me/edit-session/end');
      setDraft(null);
      loadWeek(weekStart);
    } catch (err) {
      onError(getErrorMessage(err, 'Could not discard'));
    }
  };

  const saveSlots = async () => {
    if (!draft) return;
    onError(null);
    setSaving(true);
    try {
      await api.post('/lessons/availability/commit', {
        windows: draft.map((w) => ({
          id: w.occurrenceId,
          clubDate: w.clubDate,
          startTime: w.startTime,
          endTime: w.endTime,
        })),
      });
      await api.post('/lessons/me/edit-session/end');
      setDraft(null);
      loadWeek(weekStart);
      loadProfileAndTeaching();
    } catch (err) {
      onError(getErrorMessage(err, 'Could not save calendar'));
    } finally {
      setSaving(false);
    }
  };

  const member = getMember();
  const initials = coachName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const sectionToggle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: 'inherit',
  };
  const bar: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '10px 16px',
    background: '#2c3e50',
    color: '#fff',
  };
  const barGhost: CSSProperties = {
    ...ghostBtn,
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.35)',
  };
  const barTitle: CSSProperties = {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
  };
  const barChevron: CSSProperties = {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    width: 12,
    lineHeight: 1,
  };

  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 0,
          overflow: 'hidden',
          borderRadius: 16,
          border: '1px solid #e8eef3',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 28px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={bar}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#34495e',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.35)',
              }}
              title="Picture coming later"
            >
              {picture ? (
                <img src={picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                initials || 'C'
              )}
            </div>
            <h2 style={barTitle}>{coachName || '…'}</h2>
            {member ? (
              <Link
                to={`/coaches/${member.id}`}
                title="Public page"
                aria-label="Public page"
                style={{
                  display: 'inline-flex',
                  color: '#fff',
                  lineHeight: 0,
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 3h6v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13 3 7.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </Link>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff', margin: 0 }}>
              Weeks
              <input
                type="number"
                min={1}
                max={12}
                value={printWeeks}
                onChange={(e) => setPrintWeeks(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                style={{ ...coachField, width: 52 }}
              />
            </label>
            <button type="button" style={barGhost} disabled={printing} onClick={() => void printSchedule()}>
              {printing ? 'Preparing…' : 'Print schedule'}
            </button>
          </div>
        </div>

        <div style={{ ...bar, borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            style={{ ...sectionToggle, color: '#fff' }}
          >
            <span aria-hidden="true" style={barChevron}>
              {profileOpen ? '▼' : '▶'}
            </span>
            <h3 style={barTitle}>Profile</h3>
            {profileSaving ? (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)' }}>Saving…</span>
            ) : null}
          </button>
        </div>
        {profileOpen ? (
          <div
            style={{
              padding: '14px 16px 16px',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13, fontWeight: 650, color: '#334155' }}>
                Rate
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>$</span>
                <input
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  onBlur={() => {
                    const cents = Math.max(0, Math.round(Number(rate) * 100));
                    if (!Number.isFinite(cents)) return;
                    setRate(String(cents / 100));
                    if (String(cents / 100) === savedRate) return;
                    void saveProfile({ hourlyRateCents: cents });
                  }}
                  style={coachField}
                />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <RatingLabel />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="from"
                  aria-label="Rating from"
                  value={ratingMin}
                  onChange={(e) => setRatingMin(e.target.value)}
                  onBlur={() => {
                    const next = ratingMin.trim() === '' ? null : Math.floor(Number(ratingMin));
                    if (next != null && !Number.isFinite(next)) {
                      setRatingMin(savedRatingMin);
                      return;
                    }
                    const asText = next == null ? '' : String(next);
                    setRatingMin(asText);
                    if (asText === savedRatingMin) return;
                    void saveProfile({ studentRatingMin: next });
                  }}
                  style={coachField}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="to"
                  aria-label="Rating to"
                  value={ratingMax}
                  onChange={(e) => setRatingMax(e.target.value)}
                  onBlur={() => {
                    const next = ratingMax.trim() === '' ? null : Math.floor(Number(ratingMax));
                    if (next != null && !Number.isFinite(next)) {
                      setRatingMax(savedRatingMax);
                      return;
                    }
                    const asText = next == null ? '' : String(next);
                    setRatingMax(asText);
                    if (asText === savedRatingMax) return;
                    void saveProfile({ studentRatingMax: next });
                  }}
                  style={coachField}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, marginLeft: 'auto' }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={teachingActive}
                  aria-label="Teaching active"
                  onClick={() => {
                    const next = !teachingActive;
                    setTeachingActive(next);
                    void saveProfile({ teachingActive: next });
                  }}
                  style={{
                    width: 42,
                    height: 24,
                    padding: 2,
                    border: 'none',
                    borderRadius: 12,
                    background: teachingActive ? '#2d9f6f' : '#cbd5e1',
                    cursor: 'pointer',
                    position: 'relative',
                    boxShadow: 'none',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#fff',
                      transform: teachingActive ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </button>
                <span style={{ fontSize: 13, fontWeight: 650, color: '#334155' }}>Teaching</span>
              </label>
            </div>
            <label style={{ display: 'block', margin: '14px 0 0', fontSize: 13, fontWeight: 650, color: '#334155' }}>
              Bio
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                onBlur={() => {
                  if (bio === savedBio) return;
                  void saveProfile({ bio });
                }}
                rows={4}
                placeholder="A short note students see on your public page"
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: 8,
                  padding: '10px 12px',
                  border: '1px solid #d5dde5',
                  borderRadius: 10,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: '#1e2937',
                  background: '#fff',
                  resize: 'vertical',
                }}
              />
            </label>
          </div>
        ) : null}

        <div ref={slotsRef}>
          <div style={{ ...bar, borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setSlotsOpen((open) => !open)}
                aria-expanded={slotsOpen}
                style={{ ...sectionToggle, color: '#fff' }}
              >
                <span aria-hidden="true" style={barChevron}>
                  {slotsOpen ? '▼' : '▶'}
                </span>
                <h3 style={barTitle}>Slots</h3>
              </button>
              {!editing ? (
                <button
                  type="button"
                  title="Edit slots"
                  aria-label="Edit slots"
                  onClick={() => void enterEdit(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 2,
                    border: 'none',
                    background: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    lineHeight: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M11.2 2.3a1.4 1.4 0 0 1 2 2L5.8 11.7 3 12.5l.8-2.8 7.4-7.4Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path d="M10.2 3.3 12.7 5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
            {editing ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="button-filter" disabled={saving} onClick={() => void discard()}>
                  Discard
                </button>
                <button type="button" className="button-3d" disabled={saving} onClick={() => void saveSlots()}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : null}
          </div>
          {editing ? (
            <p
              style={{
                margin: 0,
                padding: '10px 16px',
                background: '#fff7ed',
                borderBottom: '1px solid #fed7aa',
                color: '#9a3412',
                fontSize: 13,
              }}
            >
              Booking is paused. Slot changes stay off your public page until you Save.
            </p>
          ) : null}
          {slotsOpen ? (
            <>
              <div style={{ ...bar, borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
                <h4 style={barTitle}>Week of {formatClubDay(weekStart)}</h4>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    aria-label="Previous week"
                    style={{ ...barGhost, minWidth: 40, padding: '7px 10px' }}
                    onClick={() => setWeekStart(addDaysToYmd(weekStart, -7))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    style={barGhost}
                    onClick={() => setWeekStart(startOfWeekMonday(clubTodayYmd()))}
                  >
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
              <CoachEditorCalendar
                week={week}
                windows={draft ?? mergeAdjacentWindows(windowsFromPublished(week.windows))}
                reserved={reserved}
                hoursByDate={hoursByDate}
                editing={editing}
                onWindowsChange={updateDraft}
                onMergeWeek={mergeWeek}
                onError={onError}
              />
              <h4 style={{ margin: '18px 0 10px', fontSize: 14, fontWeight: 650, color: '#334155' }}>Teaching</h4>
              {lessons.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>No upcoming lessons.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lessons.map((row) => {
                    const player = row.player as { firstName?: string; lastName?: string } | undefined;
                    const name = player
                      ? formatPlayerName(player.firstName || '', player.lastName || '', getNameDisplayOrder())
                      : 'player';
                    const id = Number(row.id);
                    return (
                      <div
                        key={String(row.id)}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          background: '#fff',
                          border: '1px solid #e8eef3',
                          borderRadius: 10,
                        }}
                      >
                        <span style={{ fontSize: 13, color: '#0f172a', flex: '1 1 180px' }}>
                          {String(row.clubDate)} {String(row.startTime)} · {name}
                        </span>
                        <button
                          type="button"
                          style={{ ...ghostBtn, padding: '6px 10px' }}
                          onClick={() => {
                            setReduceId(id);
                            setReduceRate(String((Number(row.hourlyRateCents) || 0) / 100));
                          }}
                        >
                          Reduce rate
                        </button>
                        <button
                          type="button"
                          className="danger"
                          style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13 }}
                          onClick={() => {
                            api
                              .post(`/lessons/individual/${row.id}/cancel`)
                              .then(() => {
                                loadProfileAndTeaching();
                                loadWeek(weekStart);
                                setDraft((cur) => (cur ? mergeAdjacentWindows(cur) : cur));
                              })
                              .catch((err) => onError(getErrorMessage(err, 'Could not cancel')));
                          }}
                        >
                          Cancel
                        </button>
                        {reduceId === id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                            <input
                              value={reduceRate}
                              onChange={(e) => setReduceRate(e.target.value)}
                              style={{ ...coachField, width: 88 }}
                            />
                            <button
                              type="button"
                              style={{ ...ghostBtn, padding: '6px 10px' }}
                              onClick={() => {
                                api
                                  .post(`/lessons/individual/${reduceId}/reduce-rate`, {
                                    hourlyRateCents: Math.round(Number(reduceRate) * 100),
                                  })
                                  .then(() => {
                                    setReduceId(null);
                                    loadProfileAndTeaching();
                                  })
                                  .catch((err) => onError(getErrorMessage(err, 'Could not reduce rate')));
                              }}
                            >
                              Save rate
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}


const LOG_ACTION_LABEL: Record<string, string> = {
  PLACE: 'Place',
  REGISTER: 'Register',
  WAITLIST: 'Waitlist',
  DROP: 'Drop',
  CANCEL: 'Cancel',
  PROMOTE: 'Promote',
  RATE_REDUCE: 'Reduce rate',
  CLASS_CREATE: 'Create class',
  CLASS_RUN_BELOW_MIN: 'Run below min',
  AVAILABILITY_CANCEL: 'Cancel slot',
};

const LOG_ENTITY_LABEL: Record<string, string> = {
  individual_lesson: 'Lesson',
  group_class: 'Class',
  group_registration: 'Registration',
  group_occurrence: 'Occurrence',
  availability_occurrence: 'Slot',
};

type LogRow = {
  id: number;
  occurredAt: string;
  action: string;
  actorType: string;
  entityType: string;
  entityId: number;
  details?: Record<string, unknown> | null;
  actor?: { id: number; firstName: string; lastName: string } | null;
};

function logActorName(row: LogRow): string {
  if (row.actor) return formatPlayerName(row.actor.firstName, row.actor.lastName, getNameDisplayOrder());
  const kind = String(row.actorType || '').toLowerCase();
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : '—';
}

function logDetail(row: LogRow): string {
  const entity = LOG_ENTITY_LABEL[row.entityType] || row.entityType.replace(/_/g, ' ');
  const d = row.details && typeof row.details === 'object' && !Array.isArray(row.details) ? row.details : {};
  const extras: string[] = [];
  if (typeof d.clubDate === 'string' && typeof d.startTime === 'string') extras.push(`${d.clubDate} ${d.startTime}`);
  if (typeof d.publicCode === 'string') extras.push(d.publicCode);
  if (typeof d.title === 'string') extras.push(d.title);
  if (typeof d.status === 'string') extras.push(String(d.status).toLowerCase());
  if (typeof d.occurrenceCount === 'number') extras.push(`${d.occurrenceCount} sessions`);
  if (!extras.length) extras.push(`#${row.entityId}`);
  return `${entity} · ${extras.join(' · ')}`;
}

function LifecycleLog({ onError }: { onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  useEffect(() => {
    api
      .get('/lessons/lifecycle')
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch((err) => onError(getErrorMessage(err, 'Could not load log')));
  }, [onError]);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', width: 'fit-content', maxWidth: '100%' }}>
      <div style={lessonSectionBar}>Log</div>
      <table style={lessonTable}>
        <thead>
          <tr>
            <th style={lessonThDate}>Date</th>
            <th style={lessonThTime}>Time</th>
            <th style={lessonTh}>Action</th>
            <th style={lessonTh}>Who</th>
            <th style={lessonTh}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...lessonTd, color: '#64748b' }}>
                No lesson events yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const day = clubYmd(row.occurredAt);
              const prevDay = i > 0 ? clubYmd(rows[i - 1].occurredAt) : null;
              const stripe = i % 2 === 0 ? '#fff' : '#f4f7fa';
              const dayLine = prevDay && day !== prevDay ? { borderTop: '2px solid #2c3e50' } : {};
              return (
                <tr key={row.id} style={{ background: stripe }}>
                  <td style={{ ...lessonTdDate, ...dayLine }}>{formatClubDate(row.occurredAt)}</td>
                  <td style={{ ...lessonTdTime, ...dayLine }}>{formatClubTime(row.occurredAt)}</td>
                  <td style={{ ...lessonTd, ...dayLine, whiteSpace: 'nowrap', fontWeight: 650 }}>
                    {LOG_ACTION_LABEL[row.action] || row.action}
                  </td>
                  <td style={{ ...lessonTd, ...dayLine, whiteSpace: 'nowrap' }}>{logActorName(row)}</td>
                  <td style={{ ...lessonTd, ...dayLine, whiteSpace: 'nowrap' }}>{logDetail(row)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
