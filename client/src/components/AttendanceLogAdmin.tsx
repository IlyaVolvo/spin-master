import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isAdmin } from '../utils/auth';
import api from '../utils/api';
import { formatClubDateTime } from '../utils/clubDateTime';
import { getErrorMessage } from '../utils/errorHandler';
import { connectSocket, getSocket } from '../utils/socket';

type VisitRow = {
  id: number;
  memberId: number;
  memberName: string;
  clubDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  closedBy: string | null;
  isCourtesy: boolean;
  dailyPaymentApplied: boolean;
  courtesyClearedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  eventTournamentId?: number | null;
  eventName?: string | null;
  /** Why admission was granted: Trial / Plan (…) / Courtesy / event name */
  admissionBasis?: string | null;
};

type AttendanceStatusValue = 'present' | 'out' | 'rejected';

const ALL_ATTENDANCE_STATUSES: AttendanceStatusValue[] = ['present', 'out', 'rejected'];
const ATTENDANCE_STATUS_FILTER_KEY = 'attendanceLog_statuses';

function loadStickyAttendanceStatuses(): Set<AttendanceStatusValue> {
  try {
    const raw = localStorage.getItem(ATTENDANCE_STATUS_FILTER_KEY);
    if (!raw) return new Set(ALL_ATTENDANCE_STATUSES);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(ALL_ATTENDANCE_STATUSES);
    const valid = parsed.filter((s): s is AttendanceStatusValue =>
      ALL_ATTENDANCE_STATUSES.includes(s as AttendanceStatusValue),
    );
    if (valid.length === 0) return new Set(ALL_ATTENDANCE_STATUSES);
    return new Set(valid);
  } catch {
    return new Set(ALL_ATTENDANCE_STATUSES);
  }
}

function saveStickyAttendanceStatuses(selected: Set<AttendanceStatusValue>) {
  try {
    localStorage.setItem(
      ATTENDANCE_STATUS_FILTER_KEY,
      JSON.stringify(ALL_ATTENDANCE_STATUSES.filter((s) => selected.has(s))),
    );
  } catch {
    // localStorage may be unavailable
  }
}

type MemberAttendanceTarget = {
  memberId: number;
  memberName: string;
};

function visitMatchesStatuses(v: VisitRow, selected: Set<AttendanceStatusValue>): boolean {
  if (v.rejectedAt) return selected.has('rejected');
  if (!v.checkOutAt) return selected.has('present');
  return selected.has('out');
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  fontSize: '10px',
  fontWeight: 700,
  color: '#3c7890',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  borderBottom: '1px solid #d8e8f0',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '3px 8px',
  borderBottom: '1px solid #eee',
  fontSize: '12px',
  color: '#17324d',
  verticalAlign: 'middle',
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
};

const dateInputStyle: CSSProperties = {
  padding: '9px 11px',
  border: '1px solid #b9c7d8',
  borderRadius: '6px',
  backgroundColor: '#f8fbff',
  color: '#17324d',
  fontWeight: 600,
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const formatted = formatClubDateTime(iso);
  return formatted === '—' ? iso : formatted;
}

function visitEventLabel(v: VisitRow): string | null {
  if (v.eventTournamentId == null && !v.admissionBasis) return null;
  if (v.admissionBasis?.trim()) return v.admissionBasis.trim();
  const name = v.eventName?.trim();
  return name ? name : v.eventTournamentId != null ? 'Event' : null;
}

function visitStatusSummary(v: VisitRow): {
  label: string;
  tooltip: string;
  color: string;
  background: string;
} {
  const admission = visitEventLabel(v);
  if (v.rejectedAt) {
    const reason = v.rejectionReason?.trim();
    return {
      label: 'Rejected',
      tooltip: reason || 'Check-in rejected',
      color: '#922b21',
      background: '#fadbd8',
    };
  }
  if (!v.checkOutAt) {
    const bits: string[] = ['Currently present'];
    if (admission) bits.push(admission);
    return {
      label: 'Present',
      tooltip: bits.join(' · '),
      color: '#1e8449',
      background: '#d5f5e3',
    };
  }
  const bits: string[] = ['Checked out'];
  if (v.closedBy === 'AUTO') bits.push('Club close (AUTO)');
  else if (v.closedBy) bits.push(`Closed by ${v.closedBy}`);
  if (admission) bits.push(admission);
  return {
    label: 'Out',
    tooltip: bits.join(' · '),
    color: '#566573',
    background: '#eaecee',
  };
}

function VisitStatus({ v }: { v: VisitRow }) {
  const status = visitStatusSummary(v);
  return (
    <span
      title={status.tooltip}
      style={{
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: 700,
        color: status.color,
        background: status.background,
        padding: '2px 6px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        cursor: 'help',
      }}
    >
      {status.label}
    </span>
  );
}

function VisitAdmission({ v }: { v: VisitRow }) {
  if (v.rejectedAt) return <span style={{ color: '#888' }}>—</span>;
  const label = (v.admissionBasis || visitEventLabel(v) || '').trim();
  if (!label) return <span style={{ color: '#888' }}>—</span>;
  const eventStyle = v.eventTournamentId != null;
  return (
    <span
      title="Admission grounds for this check-in"
      style={{
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: 600,
        color: eventStyle ? '#6c3483' : v.isCourtesy ? '#9a7d0a' : '#1a5276',
        background: eventStyle ? '#f5eef8' : v.isCourtesy ? '#fef9e7' : '#eaf2f8',
        padding: '2px 6px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        maxWidth: '280px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  );
}

function MemberAttendancePopup({
  memberId,
  memberName,
  onClose,
}: {
  memberId: number;
  memberName: string;
  onClose: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      const params: Record<string, string> = { memberId: String(memberId) };
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      api
        .get('/club/admin/visits', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          const rows: VisitRow[] = Array.isArray(res.data?.visits) ? res.data.visits : [];
          // Newest check-in first (API already orders desc; keep client sort as safety).
          rows.sort((a, b) => {
            const tb = new Date(b.checkInAt).getTime();
            const ta = new Date(a.checkInAt).getTime();
            return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
          });
          setVisits(rows);
          setError('');
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setVisits([]);
          setError(getErrorMessage(err, 'Failed to load member attendance'));
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, 0);

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [memberId, dateFrom, dateTo]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={`Attendance for ${memberName}`}
        style={{
          maxWidth: '720px',
          width: '100%',
          maxHeight: '90vh',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0 }}>
            Attendance — {memberName} ({memberId})
          </h3>
          <button type="button" onClick={onClose} style={{ padding: '6px 12px', cursor: 'pointer' }}>
            Close
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px 16px',
            alignItems: 'flex-end',
            marginTop: '14px',
            flexShrink: 0,
          }}
        >
          <div>
            <label
              htmlFor="member-attendance-from"
              style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
            >
              From
            </label>
            <input
              id="member-attendance-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Member attendance from date"
              style={dateInputStyle}
            />
          </div>
          <div>
            <label
              htmlFor="member-attendance-to"
              style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
            >
              To
            </label>
            <input
              id="member-attendance-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Member attendance to date"
              style={dateInputStyle}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              style={{ fontSize: '12px', marginBottom: '2px' }}
            >
              Clear dates
            </button>
          )}
        </div>

        {error ? <div className="error-message" style={{ marginTop: '10px', flexShrink: 0 }}>{error}</div> : null}
        {loading ? (
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#666', flexShrink: 0 }}>Loading…</div>
        ) : null}

        <div
          style={{
            marginTop: '12px',
            overflow: 'auto',
            flex: '1 1 auto',
            minHeight: 0,
          }}
        >
          {!loading && visits.length === 0 && !error ? (
            <div style={{ fontSize: '13px', color: '#888' }}>
              {dateFrom || dateTo
                ? 'No visits matched the selected date range.'
                : 'No visits recorded for this member.'}
            </div>
          ) : null}

          {!loading && visits.length > 0 ? (
            <table style={{ width: 'max-content', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: '#fff' }}>Check-in</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: '#fff' }}>Check-out</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: '#fff' }}>Status</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: '#fff' }}>Admission</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => {
                  return (
                    <tr key={v.id}>
                      <td style={tdStyle}>{formatWhen(v.checkInAt)}</td>
                      <td style={tdStyle}>
                        {v.checkOutAt && !v.rejectedAt ? formatWhen(v.checkOutAt) : '—'}
                      </td>
                      <td style={tdStyle}>
                        <VisitStatus v={v} />
                      </td>
                      <td style={tdStyle}>
                        <VisitAdmission v={v} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AttendanceLogAdmin() {
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusSelected, setStatusSelected] = useState<Set<AttendanceStatusValue>>(
    loadStickyAttendanceStatuses,
  );
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [presentCount, setPresentCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberAttendanceTarget | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [closeClubBusy, setCloseClubBusy] = useState(false);
  const [closeClubAt, setCloseClubAt] = useState('');
  const [closeClubMessage, setCloseClubMessage] = useState('');
  const [closeClubModalOpen, setCloseClubModalOpen] = useState(false);
  const [closeClubPassword, setCloseClubPassword] = useState('');
  const [closeClubError, setCloseClubError] = useState('');
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!isAdmin()) return;
    connectSocket();
    const socket = getSocket();
    const onVisitUpdated = () => setRefreshToken((n) => n + 1);
    socket?.on('club:visitUpdated', onVisitUpdated);
    return () => {
      socket?.off('club:visitUpdated', onVisitUpdated);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin()) return;
    let cancelled = false;
    api
      .get('/club/kiosk/present')
      .then((res) => {
        if (cancelled) return;
        const count = Number(res.data?.presentCount);
        setPresentCount(Number.isFinite(count) && count >= 0 ? count : 0);
      })
      .catch(() => {
        if (!cancelled) setPresentCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (!isAdmin()) {
      setLoading(false);
      setError('Admin access required');
      return;
    }

    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      const q = memberFilter.trim();
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const statusList = ALL_ATTENDANCE_STATUSES.filter((s) => statusSelected.has(s));
      if (statusList.length > 0 && statusList.length < ALL_ATTENDANCE_STATUSES.length) {
        params.status = statusList.join(',');
      }
      api
        .get('/club/admin/visits', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          const rows: VisitRow[] = Array.isArray(res.data?.visits) ? res.data.visits : [];
          setVisits(rows.filter((v) => visitMatchesStatuses(v, statusSelected)));
          setError('');
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setVisits([]);
          setError(getErrorMessage(err, 'Failed to load attendance log'));
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, memberFilter.trim() ? 250 : 0);

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [memberFilter, dateFrom, dateTo, statusSelected, refreshToken]);

  if (!isAdmin()) {
    return <div className="card error-message">Admin access required</div>;
  }

  const allStatusesSelected = ALL_ATTENDANCE_STATUSES.every((s) => statusSelected.has(s));
  const filtersActive = Boolean(memberFilter.trim() || dateFrom || dateTo || !allStatusesSelected);
  const presentLabel =
    presentCount == null
      ? 'Attendance Log'
      : `Attendance Log (${presentCount} Present)`;

  const toggleStatus = (value: AttendanceStatusValue) => {
    setStatusSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size <= 1) return prev;
        next.delete(value);
      } else {
        next.add(value);
      }
      saveStickyAttendanceStatuses(next);
      return next;
    });
  };

  const openCloseClubModal = () => {
    setCloseClubPassword('');
    setCloseClubError('');
    setCloseClubModalOpen(true);
  };

  const handleCloseClub = async () => {
    if (!closeClubPassword.trim()) {
      setCloseClubError('Password is required');
      return;
    }
    setCloseClubBusy(true);
    setCloseClubError('');
    setCloseClubMessage('');
    try {
      const body: { password: string; checkOutAt?: string } = {
        password: closeClubPassword,
      };
      if (closeClubAt.trim() !== '') {
        body.checkOutAt = new Date(closeClubAt).toISOString();
      }
      const res = await api.post('/club/admin/close-club', body);
      const closed = Number(res.data?.closedCount) || 0;
      setCloseClubMessage(`Checked out ${closed} member${closed === 1 ? '' : 's'}.`);
      setCloseClubModalOpen(false);
      setCloseClubPassword('');
      setRefreshToken((n) => n + 1);
    } catch (err) {
      setCloseClubError(getErrorMessage(err, 'Failed to close club'));
    } finally {
      setCloseClubBusy(false);
    }
  };

  return (
    <div style={{ paddingBottom: '16px' }}>
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px 20px',
        }}
      >
        <h2
          style={{ margin: 0, display: 'inline-block', cursor: 'help' }}
          title="Check-in and check-out history, newest first. Includes rejected check-in attempts. Click a member for their attendance history."
        >
          {presentLabel}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <label
            htmlFor="close-club-at"
            style={{ fontSize: '12px', fontWeight: 600, color: '#566573' }}
          >
            Close at (optional)
          </label>
          <input
            id="close-club-at"
            type="datetime-local"
            value={closeClubAt}
            onChange={(e) => setCloseClubAt(e.target.value)}
            disabled={closeClubBusy}
            style={{
              padding: '6px 8px',
              border: '1px solid #b9c7d8',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#17324d',
            }}
          />
          <button
            type="button"
            onClick={openCloseClubModal}
            disabled={closeClubBusy || presentCount === 0}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #922b21',
              background: closeClubBusy ? '#f5b7b1' : '#fadbd8',
              color: '#922b21',
              fontWeight: 700,
              fontSize: '12px',
              cursor: closeClubBusy || presentCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Close club
          </button>
        </div>
        {closeClubMessage ? (
          <span style={{ fontSize: '12px', color: '#566573' }}>{closeClubMessage}</span>
        ) : null}
      </div>

      {closeClubModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-club-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            if (!closeClubBusy) setCloseClubModalOpen(false);
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '24px',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '400px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="close-club-dialog-title" style={{ marginTop: 0 }}>
              Close club
            </h3>
            <p style={{ fontSize: '14px', color: '#555' }}>
              Check out{' '}
              {presentCount == null ? 'all present members' : `${presentCount} present member(s)`}.
              {closeClubAt.trim()
                ? ` Checkout time: ${closeClubAt.replace('T', ' ')}.`
                : ' Checkout time: now.'}{' '}
              Enter your admin password to confirm.
            </p>
            {closeClubError ? (
              <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>
                {closeClubError}
              </div>
            ) : null}
            <input
              type="password"
              value={closeClubPassword}
              onChange={(e) => setCloseClubPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCloseClub();
                }
              }}
              placeholder="Password"
              autoFocus
              disabled={closeClubBusy}
              style={{ width: '100%', padding: '10px', marginBottom: '16px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setCloseClubModalOpen(false)}
                disabled={closeClubBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCloseClub()}
                disabled={closeClubBusy}
                style={{
                  background: '#922b21',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 14px',
                  fontWeight: 700,
                  cursor: closeClubBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {closeClubBusy ? 'Closing…' : 'Close club'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px 24px',
          alignItems: 'flex-end',
          marginBottom: '4px',
        }}
      >
        <div style={{ flex: '0 1 200px', maxWidth: '200px' }}>
          <label
            htmlFor="attendance-member-filter"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            Member
          </label>
          <input
            id="attendance-member-filter"
            type="search"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder="Filter by member name…"
            aria-label="Filter attendance by member name"
            style={{
              width: '100%',
              padding: '9px 11px',
              border: '1px solid #b9c7d8',
              borderRadius: '6px',
              backgroundColor: '#f8fbff',
              color: '#17324d',
              fontWeight: 600,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label
            htmlFor="attendance-date-from"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            From
          </label>
          <input
            id="attendance-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Filter attendance from date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <label
            htmlFor="attendance-date-to"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            To
          </label>
          <input
            id="attendance-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Filter attendance to date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <span
            id="attendance-status-filter-label"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            Status
          </span>
          <div
            role="group"
            aria-labelledby="attendance-status-filter-label"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px 14px',
              alignItems: 'center',
              minHeight: '38px',
              padding: '4px 0',
            }}
          >
            {(
              [
                { value: 'present' as const, label: 'Present' },
                { value: 'out' as const, label: 'Out' },
                { value: 'rejected' as const, label: 'Rejected' },
              ] as const
            ).map(({ value, label }) => {
              const checked = statusSelected.has(value);
              const onlyOne = statusSelected.size === 1 && checked;
              return (
                <label
                  key={value}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#17324d',
                    cursor: onlyOne ? 'default' : 'pointer',
                    userSelect: 'none',
                  }}
                  title={onlyOne ? 'At least one status must stay selected' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={onlyOne}
                    onChange={() => toggleStatus(value)}
                    aria-label={`Show ${label} visits`}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {error ? <div className="error-message" style={{ marginTop: '8px' }}>{error}</div> : null}
      {loading ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>Loading attendance…</div>
      ) : null}
      {!loading && visits.length === 0 && !error ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
          {filtersActive ? 'No visits matched the current filters.' : 'No visits recorded yet.'}
        </div>
      ) : null}

      {!loading && visits.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ width: 'max-content', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Check-in</th>
                <th style={thStyle}>Check-out</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Admission</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                return (
                  <tr key={v.id}>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMember({ memberId: v.memberId, memberName: v.memberName })
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#1a5276',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textAlign: 'left',
                          fontSize: 'inherit',
                        }}
                      >
                        {v.memberName} ({v.memberId})
                      </button>
                    </td>
                    <td style={tdStyle}>{formatWhen(v.checkInAt)}</td>
                    <td style={tdStyle}>
                      {v.checkOutAt && !v.rejectedAt ? formatWhen(v.checkOutAt) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <VisitStatus v={v} />
                    </td>
                    <td style={tdStyle}>
                      <VisitAdmission v={v} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedMember ? (
        <MemberAttendancePopup
          memberId={selectedMember.memberId}
          memberName={selectedMember.memberName}
          onClose={() => setSelectedMember(null)}
        />
      ) : null}
    </div>
  );
}
