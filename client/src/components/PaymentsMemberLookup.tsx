import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import api from '../utils/api';
import { formatClubDateTime } from '../utils/clubDateTime';
import { getErrorMessage } from '../utils/errorHandler';
import { MemberPlanScreen } from './players/MemberPlanScreen';

type PaymentRow = {
  id: number;
  memberId: number;
  memberName: string;
  amountCents: number;
  listAmountCents: number;
  creditAppliedCents: number;
  purpose: string;
  planLabel: string | null;
  effectiveDate?: string | null;
  provider: string;
  status: string;
  recordedAt: string;
};

type PaymentsMemberLookupProps = {
  /** When set, opens that member’s plan screen once */
  openMemberId?: number | null;
  onOpenMemberConsumed?: () => void;
};

function formatMoney(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function formatEffectiveDate(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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

const dateInputStyle: CSSProperties = {
  padding: '9px 11px',
  border: '1px solid #b9c7d8',
  borderRadius: '6px',
  backgroundColor: '#f8fbff',
  color: '#17324d',
  fontWeight: 600,
};

export function PaymentsMemberLookup({
  openMemberId = null,
  onOpenMemberConsumed,
}: PaymentsMemberLookupProps) {
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPaid, setShowPaid] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (openMemberId == null || !Number.isFinite(openMemberId)) return;
    setSelectedMemberId(openMemberId);
    onOpenMemberConsumed?.();
  }, [openMemberId, onOpenMemberConsumed]);

  const loadPayments = useCallback(() => {
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
      api
        .get('/club/admin/payments', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setPayments(Array.isArray(res.data?.payments) ? res.data.payments : []);
          setError('');
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setPayments([]);
          setError(getErrorMessage(err, 'Failed to load payments'));
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, memberFilter.trim() ? 250 : 0);
  }, [memberFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadPayments();
    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (p.status === 'SUCCEEDED') return showPaid;
      if (p.status === 'PENDING') return showPending;
      // Other statuses (FAILED / CANCELLED) only when both filters are on
      return showPaid && showPending;
    });
  }, [payments, showPaid, showPending]);

  const togglePaid = () => {
    if (showPaid && !showPending) return;
    setShowPaid((v) => !v);
  };

  const togglePending = () => {
    if (showPending && !showPaid) return;
    setShowPending((v) => !v);
  };

  const clearPayment = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/club/admin/payments/${id}/clear`);
      loadPayments();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to clear payment'));
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayment = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/club/admin/payments/${id}/cancel`);
      loadPayments();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reject payment'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
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
            htmlFor="member-payments-filter"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            Member
          </label>
          <input
            id="member-payments-filter"
            type="search"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder="Filter by member name…"
            aria-label="Filter payments by member name"
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
            htmlFor="payments-date-from"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            From
          </label>
          <input
            id="payments-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Filter payments from date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <label
            htmlFor="payments-date-to"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            To
          </label>
          <input
            id="payments-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Filter payments to date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <div style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}>
            Status
          </div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', minHeight: '38px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPaid}
                onChange={togglePaid}
                aria-label="Show paid payments"
              />
              Paid
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPending}
                onChange={togglePending}
                aria-label="Show pending payments"
              />
              Pending
            </label>
          </div>
        </div>
        <button type="button" onClick={() => loadPayments()} style={{ fontSize: '12px', marginBottom: '2px' }}>
          Refresh
        </button>
      </div>

      {error ? <div className="error-message" style={{ marginTop: '8px' }}>{error}</div> : null}
      {loading ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>Loading payments…</div>
      ) : null}
      {!loading && filteredPayments.length === 0 && !error ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
          {memberFilter.trim() || dateFrom || dateTo || !showPaid || !showPending
            ? 'No payments matched the current filters.'
            : 'No payments yet.'}
        </div>
      ) : null}

      {!loading && filteredPayments.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Plan / purpose</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Provider</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => {
                const effective = formatEffectiveDate(p.effectiveDate);
                const isCashPending = p.status === 'PENDING' && p.provider === 'cash';
                return (
                  <tr key={p.id}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>
                      {formatClubDateTime(p.recordedAt)}
                    </td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(p.memberId)}
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
                        {p.memberName}
                      </button>
                      <div style={{ color: '#666', fontSize: '12px' }}>#{p.memberId}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{p.planLabel || p.purpose || 'Payment'}</div>
                      {p.planLabel && p.purpose && p.purpose !== p.planLabel ? (
                        <div style={{ color: '#666', fontSize: '12px' }}>{p.purpose}</div>
                      ) : null}
                      {effective ? (
                        <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                          Effective {effective}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatMoney(p.amountCents)}
                      {(p.creditAppliedCents ?? 0) > 0 ? (
                        <div style={{ color: '#666', fontSize: '11px', fontWeight: 500 }}>
                          list {formatMoney(p.listAmountCents ?? p.amountCents)} · credit{' '}
                          {formatMoney(p.creditAppliedCents)}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>{p.provider}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.status === 'SUCCEEDED' ? (
                        <span style={{ fontWeight: 700, color: '#17324d' }}>Paid</span>
                      ) : isCashPending ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'row', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            disabled={busyId === p.id}
                            onClick={() => void clearPayment(p.id)}
                            style={{ padding: '4px 10px', fontWeight: 600 }}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            disabled={busyId === p.id}
                            onClick={() => void rejectPayment(p.id)}
                            title="Reject this pending cash payment. No plan is granted."
                            style={{ padding: '4px 10px' }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#666' }}>{p.status}</span>
                      )}
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
