import { useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import { formatPlayerName } from '../../utils/nameFormatter';
import { getErrorMessage } from '../../utils/errorHandler';
import { getSystemConfig, subscribeToSystemConfig } from '../../utils/systemConfig';

export type CheckinMemberStatus = {
  present: boolean;
  visitedToday: boolean;
  lastCheckInAt: string | null;
};

export type CheckinStatusMap = Record<number, CheckinMemberStatus>;

type EntitlementSummary = {
  type: string;
  visitsRemaining: number | null;
  validTo: string | null;
} | null;

type PinToggleResponse = {
  action: 'CHECK_IN' | 'CHECK_OUT' | 'PAYMENT_REQUIRED';
  warning?: string | null;
  message?: string;
  charged?: boolean;
  courtesy?: boolean;
  canPay?: boolean;
  paymentInProgress?: boolean;
  entitlement?: EntitlementSummary;
  member?: { firstName: string; lastName: string };
};

type PresentMember = {
  memberId: number;
  firstName: string;
  lastName: string;
  lastCheckInAt: string;
};

function formatEntitlementLine(entitlement: EntitlementSummary): string | null {
  if (!entitlement) return null;
  if (entitlement.type === 'VISIT_PACK' && entitlement.visitsRemaining != null) {
    return `${entitlement.visitsRemaining} visit(s) remaining`;
  }
  if (entitlement.validTo) {
    const d = new Date(entitlement.validTo);
    if (!Number.isNaN(d.getTime())) {
      return `Plan valid until ${d.toLocaleDateString()}`;
    }
  }
  return null;
}

export function formatPinToggleMessage(data: PinToggleResponse): string {
  const name = data.member
    ? formatPlayerName(data.member.firstName, data.member.lastName)
    : 'Member';
  const bannerOn = getSystemConfig().payments?.reminders?.checkInBannerEnabled !== false;

  if (data.action === 'PAYMENT_REQUIRED') {
    return data.message || data.warning || 'Payment required before check-in.';
  }

  if (data.action === 'CHECK_OUT') {
    const parts = [`${name} checked out.`];
    const entitlementLine = formatEntitlementLine(data.entitlement ?? null);
    if (entitlementLine) parts.push(entitlementLine);
    if (data.warning && bannerOn) parts.push(data.warning);
    return parts.join(' ');
  }

  // CHECK_IN
  const parts: string[] = [];
  if (data.courtesy) {
    parts.push(`${name} checked in (courtesy).`);
  } else if (data.charged === false) {
    parts.push(`${name} checked in — free re-entry (already checked in today).`);
  } else {
    parts.push(`${name} checked in.`);
  }
  if (data.paymentInProgress) {
    parts.push('Payment in progress.');
  }
  const entitlementLine = formatEntitlementLine(data.entitlement ?? null);
  if (entitlementLine) parts.push(entitlementLine);
  if (data.warning && bannerOn) parts.push(data.warning);
  return parts.join(' ');
}

export async function fetchCheckinTodayStatus(): Promise<CheckinStatusMap> {
  const res = await api.get('/club/kiosk/today-status');
  const members = Array.isArray(res.data?.members) ? res.data.members : [];
  const map: CheckinStatusMap = {};
  for (const row of members) {
    const id = Number(row.memberId);
    if (!Number.isInteger(id)) continue;
    map[id] = {
      present: row.present === true,
      visitedToday: row.visitedToday === true,
      lastCheckInAt: typeof row.lastCheckInAt === 'string' ? row.lastCheckInAt : null,
    };
  }
  return map;
}

type CheckinKioskBannerProps = {
  presentCount: number;
  onOpenPresent: () => void;
};

export function CheckinKioskBanner({ presentCount, onOpenPresent }: CheckinKioskBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 14px',
        marginBottom: '10px',
        background: '#e8f5e9',
        border: '1px solid #a5d6a7',
        borderRadius: '6px',
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#1b5e20' }}>
          Club check-in / check-out
        </div>
        <div style={{ fontSize: '13px', color: '#2e7d32', marginTop: '2px' }}>
          Find your name, then enter your score PIN.
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenPresent}
        style={{
          padding: '8px 14px',
          fontSize: '14px',
          fontWeight: 700,
          backgroundColor: '#27ae60',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Present ({presentCount})
      </button>
    </div>
  );
}

type PresentPopupProps = {
  open: boolean;
  onClose: () => void;
};

export function CheckinPresentPopup({ open, onClose }: PresentPopupProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [present, setPresent] = useState<PresentMember[]>([]);
  const [visitedTodayIds, setVisitedTodayIds] = useState<Set<number>>(new Set());
  const [presentCount, setPresentCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get('/club/kiosk/present')
      .then((res) => {
        if (cancelled) return;
        setPresent(Array.isArray(res.data?.present) ? res.data.present : []);
        setPresentCount(Number(res.data?.presentCount) || 0);
        const ids = Array.isArray(res.data?.visitedTodayIds) ? res.data.visitedTodayIds : [];
        setVisitedTodayIds(new Set(ids.map((id: unknown) => Number(id)).filter((n: number) => Number.isInteger(n))));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, 'Failed to load present members'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

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
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '480px', width: '100%', margin: 0, maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Present now ({presentCount})</h3>
        <p style={{ color: '#666', fontSize: '13px', marginTop: 0 }}>
          Sorted by last check-in today. ✓ means checked in at least once today.
        </p>
        {loading && <div style={{ color: '#666' }}>Loading…</div>}
        {error && <div style={{ color: '#c0392b', marginBottom: '10px' }}>{error}</div>}
        {!loading && !error && present.length === 0 && (
          <div style={{ color: '#666' }}>No one is checked in right now.</div>
        )}
        {!loading && present.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
            {present.map((m) => (
              <li
                key={m.memberId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #eee',
                  fontSize: '14px',
                }}
              >
                <span>
                  {visitedTodayIds.has(m.memberId) ? '✓ ' : ''}
                  {formatPlayerName(m.firstName, m.lastName)}
                </span>
                <span style={{ color: '#888', fontSize: '12px' }}>
                  {m.lastCheckInAt ? new Date(m.lastCheckInAt).toLocaleTimeString() : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type PinModalProps = {
  memberId: number;
  memberName: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  freeReentry: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

type PlanOption = { familyKey: string; name: string; kind: string };

export function CheckinPinModal({
  memberId,
  memberName,
  action,
  freeReentry,
  onClose,
  onSuccess,
}: PinModalProps) {
  const [scorePin, setScorePin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinLength, setPinLength] = useState(() => getSystemConfig().authPolicy.pinLength);
  const [phase, setPhase] = useState<'pin' | 'pay_offer' | 'pick_plan'>('pin');
  const [resultMessage, setResultMessage] = useState('');
  const [canPay, setCanPay] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return subscribeToSystemConfig((config) => {
      setPinLength(config.authPolicy.pinLength);
    });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const finish = (message: string) => {
    onSuccess(message);
  };

  const submit = async () => {
    if (!scorePin.trim()) {
      setError('Enter your score PIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/club/pin-toggle', { memberId, scorePin: scorePin.trim() });
      const data = res.data as PinToggleResponse;
      const message = formatPinToggleMessage(data);
      if (data.canPay || data.courtesy) {
        setResultMessage(message);
        setCanPay(data.canPay === true);
        setPhase('pay_offer');
      } else {
        finish(message);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: PinToggleResponse & { error?: string } } };
      if (axiosErr.response?.status === 402 && axiosErr.response.data) {
        const data = axiosErr.response.data;
        const message = formatPinToggleMessage(data);
        if (data.canPay) {
          setResultMessage(message);
          setCanPay(true);
          setPhase('pay_offer');
        } else {
          setError(message);
        }
      } else {
        setError(getErrorMessage(err, 'Check-in failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPlansAndPay = async () => {
    setCheckoutLoading(true);
    setError('');
    try {
      const res = await api.get('/payments/plans');
      const list = Array.isArray(res.data?.plans) ? res.data.plans : [];
      setPlans(
        list.map((p: { familyKey: string; name: string; kind: string }) => ({
          familyKey: p.familyKey,
          name: p.name,
          kind: p.kind,
        })),
      );
      setPhase('pick_plan');
    } catch (err) {
      // Plans endpoint may require auth — kiosk session should work
      setError(getErrorMessage(err, 'Could not load plans'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const startCheckout = async (familyKey: string) => {
    setCheckoutLoading(true);
    setError('');
    try {
      const res = await api.post('/payments/checkout', { memberId, familyKey, kind: 'plan' });
      const msg = res.data?.confirmedImmediately
        ? `${resultMessage} Payment confirmed (${res.data.providerId || 'provider'}).`
        : `${resultMessage} Checkout started. ${res.data?.instructions || 'Complete payment outside the app.'}`;
      finish(msg);
    } catch (err) {
      setError(getErrorMessage(err, 'Checkout failed'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const label = action === 'CHECK_OUT' ? 'Check-out' : freeReentry ? 'Check-in (free re-entry)' : 'Check-in';

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
        padding: '20px',
      }}
      onClick={() => !loading && !checkoutLoading && onClose()}
    >
      <div
        className="card"
        style={{ maxWidth: '420px', width: '100%', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'pin' && (
          <>
            <h3 style={{ marginTop: 0 }}>{label}</h3>
            <p style={{ color: '#555', fontSize: '14px' }}>
              {memberName} — enter score PIN
              {pinLength ? ` (${pinLength} digits)` : ''}
            </p>
            {error && <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={scorePin}
              onChange={(e) => setScorePin(e.target.value.replace(/\D/g, '').slice(0, pinLength || 8))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Score PIN"
              style={{ width: '100%', padding: '10px', marginBottom: '16px', boxSizing: 'border-box', fontSize: '18px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="button" className="success" onClick={() => void submit()} disabled={loading}>
                {loading ? '…' : label}
              </button>
            </div>
          </>
        )}

        {phase === 'pay_offer' && (
          <>
            <h3 style={{ marginTop: 0 }}>Payment</h3>
            <p style={{ fontSize: '14px', color: '#333' }}>{resultMessage}</p>
            {error && <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
            <p style={{ fontSize: '13px', color: '#666' }}>
              {canPay
                ? 'Pay now with an active plan, or defer and settle later.'
                : 'Add an email on the member profile to enable payment.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {canPay && (
                <button
                  type="button"
                  className="success"
                  disabled={checkoutLoading}
                  onClick={() => void loadPlansAndPay()}
                >
                  {checkoutLoading ? '…' : 'Pay now'}
                </button>
              )}
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={() => finish(resultMessage + (canPay ? ' Payment deferred.' : ''))}
              >
                {canPay ? 'Defer payment' : 'OK'}
              </button>
            </div>
          </>
        )}

        {phase === 'pick_plan' && (
          <>
            <h3 style={{ marginTop: 0 }}>Choose a plan</h3>
            {error && <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', overflow: 'auto' }}>
              {plans.length === 0 && <div style={{ color: '#666' }}>No active plans configured.</div>}
              {plans.map((p) => (
                <button
                  key={p.familyKey}
                  type="button"
                  disabled={checkoutLoading}
                  onClick={() => void startCheckout(p.familyKey)}
                  style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {p.name} <span style={{ color: '#888', fontSize: '12px' }}>({p.kind})</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setPhase('pay_offer')} disabled={checkoutLoading}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type RowButtonProps = {
  present: boolean;
  visitedToday: boolean;
  onClick: () => void;
};

export function CheckinRowButton({ present, visitedToday, onClick }: RowButtonProps) {
  if (present) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: '6px 10px',
          fontSize: '13px',
          fontWeight: 600,
          backgroundColor: '#7f8c8d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Check-out
      </button>
    );
  }

  const freeReentry = visitedToday;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 10px',
        fontSize: '13px',
        fontWeight: 600,
        backgroundColor: freeReentry ? '#27ae60' : '#3498db',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      title={freeReentry ? 'Free re-entry (already checked in today)' : 'Check in'}
    >
      Check-in
    </button>
  );
}
