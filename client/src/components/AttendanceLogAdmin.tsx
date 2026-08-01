import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isAdmin } from '../utils/auth';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';
import { connectSocket, getSocket } from '../utils/socket';
import { MemberPlanScreen } from './players/MemberPlanScreen';

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

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 8px',
  fontSize: '11px',
  fontWeight: 700,
  color: '#3c7890',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  borderBottom: '1px solid #d8e8f0',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #eee',
  fontSize: '13px',
  color: '#17324d',
  verticalAlign: 'top',
  lineHeight: 1.35,
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const dateInputStyle: CSSProperties = {
  padding: '9px 11px',
  border: '1px solid #b9c7d8',
  borderRadius: '6px',
  backgroundColor: '#f8fbff',
  color: '#17324d',
  fontWeight: 600,
};

export default function AttendanceLogAdmin() {
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
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

  return (
    <div style={{ paddingBottom: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Attendance Log</h2>
        <p style={{ margin: '6px 0 0', color: '#666' }}>
          Check-in and check-out history, newest first. Includes rejected check-in attempts.
        </p>
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
        <div style={{ flex: '1 1 220px', maxWidth: '420px' }}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Club date</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Check-in</th>
                <th style={thStyle}>Check-out</th>
                <th style={thStyle}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const rejected = Boolean(v.rejectedAt);
                return (
                  <tr key={v.id}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>{v.clubDate}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(v.memberId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#1a5276',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textAlign: 'left',
                        }}
                      >
                        {v.memberName} ({v.memberId})
                      </button>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatWhen(v.checkInAt)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {rejected ? (
                        <span style={{ color: '#c0392b', fontWeight: 700 }}>Rejected</span>
                      ) : v.checkOutAt ? (
                        formatWhen(v.checkOutAt)
                      ) : (
                        <span style={{ color: '#1e8449', fontWeight: 700 }}>Present</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {rejected ? (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#922b21',
                            background: '#fadbd8',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}>
                            Rejected
                          </span>
                        ) : null}
                        {rejected && v.rejectionReason ? (
                          <span style={{ fontSize: '12px', color: '#922b21' }}>{v.rejectionReason}</span>
                        ) : null}
                        {!rejected && v.isCourtesy ? (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#9a7b0a',
                            background: '#fcf3cf',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}>
                            Courtesy{v.courtesyClearedAt ? ' (cleared)' : ''}
                          </span>
                        ) : null}
                        {!rejected && v.dailyPaymentApplied ? (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#1a5276',
                            background: '#d6eaf8',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}>
                            Charged
                          </span>
                        ) : null}
                        {!rejected && v.closedBy ? (
                          <span style={{ fontSize: '11px', color: '#888' }}>{v.closedBy}</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedMemberId != null ? (
        <MemberPlanScreen
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
        />
      ) : null}
    </div>
  );
}
