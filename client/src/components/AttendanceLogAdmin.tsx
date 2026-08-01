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
};

type StatusFilter = 'all' | 'present' | 'rejected';

type MemberAttendanceTarget = {
  memberId: number;
  memberName: string;
};

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

function visitStatusSummary(v: VisitRow): {
  label: string;
  tooltip: string;
  color: string;
  background: string;
} {
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
    if (v.isCourtesy) bits.push(v.courtesyClearedAt ? 'Courtesy (cleared)' : 'Courtesy');
    if (v.dailyPaymentApplied) bits.push('Charged');
    return {
      label: 'Present',
      tooltip: bits.join(' · '),
      color: '#1e8449',
      background: '#d5f5e3',
    };
  }
  const bits: string[] = ['Checked out'];
  if (v.closedBy) bits.push(`Closed by ${v.closedBy}`);
  if (v.isCourtesy) bits.push(v.courtesyClearedAt ? 'Courtesy (cleared)' : 'Courtesy');
  if (v.dailyPaymentApplied) bits.push('Charged');
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [presentCount, setPresentCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberAttendanceTarget | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
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
      if (statusFilter !== 'all') params.status = statusFilter;
      api
        .get('/club/admin/visits', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          const rows: VisitRow[] = Array.isArray(res.data?.visits) ? res.data.visits : [];
          const filtered =
            statusFilter === 'present'
              ? rows.filter((v) => !v.rejectedAt && !v.checkOutAt)
              : statusFilter === 'rejected'
                ? rows.filter((v) => Boolean(v.rejectedAt))
                : rows;
          setVisits(filtered);
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
  }, [memberFilter, dateFrom, dateTo, statusFilter, refreshToken]);

  if (!isAdmin()) {
    return <div className="card error-message">Admin access required</div>;
  }

  const filtersActive = Boolean(memberFilter.trim() || dateFrom || dateTo || statusFilter !== 'all');
  const presentLabel =
    presentCount == null
      ? 'Attendance Log'
      : `Attendance Log (${presentCount} Present)`;

  return (
    <div style={{ paddingBottom: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2
          style={{ margin: 0, display: 'inline-block', cursor: 'help' }}
          title="Check-in and check-out history, newest first. Includes rejected check-in attempts. Click a member for their attendance history."
        >
          {presentLabel}
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px 24px',
          alignItems: 'flex-end',
          marginBottom: '4px',
        }}
      >
        <div style={{ flex: '0 1 180px', maxWidth: '180px' }}>
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
          <label
            htmlFor="attendance-status-filter"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            Status
          </label>
          <select
            id="attendance-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter attendance by status"
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#333',
              fontSize: '13px',
              fontWeight: 400,
              fontFamily: 'inherit',
              minWidth: '150px',
              minHeight: '38px',
            }}
          >
            <option value="all">All</option>
            <option value="present">Only Present</option>
            <option value="rejected">Only Rejected</option>
          </select>
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
