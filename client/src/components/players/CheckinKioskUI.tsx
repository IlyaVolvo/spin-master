import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api';
import { formatPlayerName, type NameDisplayOrder } from '../../utils/nameFormatter';
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
};

export function CheckinKioskBanner({ presentCount }: CheckinKioskBannerProps) {
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
          Find your name, then enter your PIN.
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1b5e20', whiteSpace: 'nowrap' }}>
        Present: {presentCount}
      </div>
    </div>
  );
}

type PresentPanelMember = {
  id: number;
  firstName: string;
  lastName: string;
  rating: number | null;
};

type CheckinPresentPanelProps = {
  members: PresentPanelMember[];
  statusByMember: CheckinStatusMap;
  nameDisplayOrder: NameDisplayOrder;
};

export function CheckinPresentPanel({
  members,
  statusByMember,
  nameDisplayOrder,
}: CheckinPresentPanelProps) {
  const [sortBy, setSortBy] = useState<'name' | 'rating'>('name');
  const [collapsed, setCollapsed] = useState(false);

  const present = useMemo(() => {
    const list = members.filter((m) => statusByMember[m.id]?.present === true);
    const sorted = [...list];
    if (sortBy === 'rating') {
      sorted.sort((a, b) => {
        const ar = a.rating;
        const br = b.rating;
        if (ar == null && br == null) {
          return formatPlayerName(a.firstName, a.lastName, nameDisplayOrder).localeCompare(
            formatPlayerName(b.firstName, b.lastName, nameDisplayOrder),
          );
        }
        if (ar == null) return 1;
        if (br == null) return -1;
        if (br !== ar) return br - ar;
        return formatPlayerName(a.firstName, a.lastName, nameDisplayOrder).localeCompare(
          formatPlayerName(b.firstName, b.lastName, nameDisplayOrder),
        );
      });
    } else {
      sorted.sort((a, b) =>
        formatPlayerName(a.firstName, a.lastName, nameDisplayOrder).localeCompare(
          formatPlayerName(b.firstName, b.lastName, nameDisplayOrder),
        ),
      );
    }
    return sorted;
  }, [members, statusByMember, sortBy, nameDisplayOrder]);

  return (
    <div
      style={{
        marginBottom: '12px',
        padding: '12px 14px',
        border: '1px solid #d8e8f0',
        borderRadius: '6px',
        background: '#f8fbff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: collapsed ? 0 : '8px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '14px',
            color: '#17324d',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '12px', color: '#1a5276' }}>
            {collapsed ? '▶' : '▼'}
          </span>
          Checked in now ({present.length})
        </button>
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: '#666' }}>Sort:</span>
            <button
              type="button"
              onClick={() => setSortBy('name')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: sortBy === 'name' ? '1px solid #1a5276' : '1px solid #ccc',
                background: sortBy === 'name' ? '#d6eaf8' : '#fff',
                fontWeight: sortBy === 'name' ? 700 : 500,
                cursor: 'pointer',
                color: '#17324d',
              }}
            >
              Name
            </button>
            <button
              type="button"
              onClick={() => setSortBy('rating')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: sortBy === 'rating' ? '1px solid #1a5276' : '1px solid #ccc',
                background: sortBy === 'rating' ? '#d6eaf8' : '#fff',
                fontWeight: sortBy === 'rating' ? 700 : 500,
                cursor: 'pointer',
                color: '#17324d',
              }}
            >
              Rating
            </button>
          </div>
        ) : null}
      </div>
      {!collapsed ? (
        present.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#888' }}>No one is checked in right now.</div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '4px 16px',
              maxHeight: '180px',
              overflowY: 'auto',
            }}
          >
            {present.map((m) => (
              <li
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '4px 0',
                  fontSize: '13px',
                  color: '#17324d',
                  borderBottom: '1px solid #eef3f7',
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {formatPlayerName(m.firstName, m.lastName, nameDisplayOrder)}
                </span>
                <span style={{ color: '#666', whiteSpace: 'nowrap' }}>
                  {m.rating != null ? m.rating : '—'}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
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
  const [phase, setPhase] = useState<'pin' | 'pay_offer'>('pin');
  const [resultMessage, setResultMessage] = useState('');
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
      setError('Enter your PIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/club/pin-toggle', { memberId, scorePin: scorePin.trim() });
      const data = res.data as PinToggleResponse;
      const message = formatPinToggleMessage(data);
      if (data.canPay || data.courtesy || data.action === 'PAYMENT_REQUIRED') {
        setResultMessage(message);
        setPhase('pay_offer');
      } else {
        finish(message);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: PinToggleResponse & { error?: string } } };
      if (axiosErr.response?.status === 402 && axiosErr.response.data) {
        const data = axiosErr.response.data;
        const message = formatPinToggleMessage(data);
        setResultMessage(message);
        setPhase('pay_offer');
      } else {
        setError(getErrorMessage(err, 'Check-in failed'));
      }
    } finally {
      setLoading(false);
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
      onClick={() => !loading && onClose()}
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
              {memberName} — enter your PIN
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
              placeholder="PIN"
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
              Purchases cannot be started from check-in. Use the Plan page after a full login, or ask an
              administrator to record cash payment.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => finish(resultMessage + ' Settle via Plan page or staff.')}
              >
                OK
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
