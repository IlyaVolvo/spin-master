import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isAdmin } from '../utils/auth';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';
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
};

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
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

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
      if (onlyPresent) params.present = '1';
      api
        .get('/club/admin/visits', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setVisits(Array.isArray(res.data?.visits) ? res.data.visits : []);
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
  }, [memberFilter, dateFrom, dateTo, onlyPresent]);

  if (!isAdmin()) {
    return <div className="card error-message">Admin access required</div>;
  }

  const filtersActive = Boolean(memberFilter.trim() || dateFrom || dateTo || onlyPresent);

  return (
    <div style={{ paddingBottom: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Attendance Log</h2>
        <p style={{ margin: '6px 0 0', color: '#666' }}>
          Check-in and check-out history, newest first. Filter by member name, date range, or currently present only.
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
          <div style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}>
            Presence
          </div>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: '38px',
            }}
          >
            <input
              type="checkbox"
              checked={onlyPresent}
              onChange={(e) => setOnlyPresent(e.target.checked)}
              aria-label="Show only currently present members"
            />
            Only Present
          </label>
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
              {visits.map((v) => (
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
                      {v.memberName}
                    </button>
                    <div style={{ color: '#666', fontSize: '12px' }}>#{v.memberId}</div>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatWhen(v.checkInAt)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {v.checkOutAt ? formatWhen(v.checkOutAt) : (
                      <span style={{ color: '#1e8449', fontWeight: 700 }}>Present</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {v.isCourtesy ? (
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
                      {v.dailyPaymentApplied ? (
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
                      {v.closedBy ? (
                        <span style={{ fontSize: '11px', color: '#888' }}>{v.closedBy}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
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
