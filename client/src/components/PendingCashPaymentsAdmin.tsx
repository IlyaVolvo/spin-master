import { useEffect, useState, type CSSProperties } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';

type PendingPaymentRow = {
  id: number;
  memberId: number;
  memberName: string;
  amountCents: number;
  listAmountCents: number;
  creditAppliedCents: number;
  purpose: string;
  planLabel: string | null;
  effectiveDate: string | null;
  provider: string;
  status: string;
  recordedAt: string;
  externalRef: string | null;
};

function formatMoney(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function formatEffectiveDate(ymd: string | null): string {
  if (!ymd) return '—';
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
  whiteSpace: 'normal',
  lineHeight: 1.25,
  maxWidth: '110px',
};

const tdStyle: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #eee',
  fontSize: '13px',
  color: '#17324d',
  verticalAlign: 'top',
  lineHeight: 1.35,
};

type PendingCashPaymentsAdminProps = {
  onOpenMember?: (memberId: number) => void;
};

/** Admin queue: clear or reject PENDING cash payments. */
export function PendingCashPaymentsAdmin({ onOpenMember }: PendingCashPaymentsAdminProps = {}) {
  const [payments, setPayments] = useState<PendingPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/club/admin/payments/pending', { params: { provider: 'cash' } });
      setPayments(Array.isArray(res.data?.payments) ? res.data.payments : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load pending cash payments'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const clearPayment = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/club/admin/payments/${id}/clear`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to clear payment'));
    } finally {
      setBusyId(null);
    }
  };

  /** Reject = discard pending cash; no entitlement is granted. */
  const rejectPayment = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/club/admin/payments/${id}/cancel`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reject payment'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div style={{ padding: '8px 0', color: '#666', fontSize: '13px' }}>Loading cash queue…</div>;
  }

  return (
    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
      {error && <div className="error-message" style={{ marginBottom: '8px' }}>{error}</div>}
      {payments.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#888' }}>No pending cash payments.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Plan</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Credit applied</th>
                <th style={thStyle}>Cash paid</th>
                <th style={thStyle}>Effective date</th>
                <th style={{ ...thStyle, textAlign: 'right', maxWidth: 'none' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                      {onOpenMember ? (
                        <button
                          type="button"
                          onClick={() => onOpenMember(p.memberId)}
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
                      ) : (
                        p.memberName
                      )}
                    </div>
                    <div style={{ color: '#666', fontSize: '12px' }}>#{p.memberId}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                      {p.planLabel || p.purpose || 'Payment'}
                    </div>
                    {p.planLabel && p.purpose && p.purpose !== p.planLabel ? (
                      <div style={{ color: '#666', fontSize: '12px', wordBreak: 'break-word' }}>
                        {p.purpose}
                      </div>
                    ) : null}
                    <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                      Requested {new Date(p.recordedAt).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatMoney(p.listAmountCents ?? p.amountCents)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {formatMoney(p.creditAppliedCents ?? 0)}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatMoney(p.amountCents)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'normal' }}>
                    {formatEffectiveDate(p.effectiveDate)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void clearPayment(p.id)}
                        style={{ padding: '4px 10px', fontWeight: 600, minWidth: '72px' }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void rejectPayment(p.id)}
                        title="Reject this pending cash payment. No plan is granted."
                        style={{ padding: '4px 10px', minWidth: '72px' }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={() => void load()} style={{ marginTop: '10px', fontSize: '12px' }}>
        Refresh
      </button>
    </div>
  );
}
