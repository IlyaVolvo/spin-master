import { useEffect, useRef, useState, type CSSProperties } from 'react';
import api from '../utils/api';
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

export function PaymentsMemberLookup({
  openMemberId = null,
  onOpenMemberConsumed,
}: PaymentsMemberLookupProps) {
  const [memberFilter, setMemberFilter] = useState('');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (openMemberId == null || !Number.isFinite(openMemberId)) return;
    setSelectedMemberId(openMemberId);
    onOpenMemberConsumed?.();
  }, [openMemberId, onOpenMemberConsumed]);

  useEffect(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      const q = memberFilter.trim();
      api
        .get('/club/admin/payments', { params: q ? { q } : {} })
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

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [memberFilter]);

  return (
    <div style={{ marginTop: '8px' }}>
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
          maxWidth: '420px',
          padding: '9px 11px',
          border: '1px solid #b9c7d8',
          borderRadius: '6px',
          backgroundColor: '#f8fbff',
          color: '#17324d',
          fontWeight: 600,
          boxSizing: 'border-box',
        }}
      />

      {error ? <div className="error-message" style={{ marginTop: '8px' }}>{error}</div> : null}
      {loading ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>Loading payments…</div>
      ) : null}
      {!loading && payments.length === 0 && !error ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
          {memberFilter.trim() ? 'No payments matched that member name.' : 'No payments yet.'}
        </div>
      ) : null}

      {!loading && payments.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Plan / purpose</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Provider</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>
                    {new Date(p.recordedAt).toLocaleString()}
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
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{p.status}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>{p.provider}</td>
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
