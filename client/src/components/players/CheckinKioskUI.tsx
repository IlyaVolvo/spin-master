import { useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import { formatPlayerName } from '../../utils/nameFormatter';
import { getErrorMessage } from '../../utils/errorHandler';
import { getSystemConfig, subscribeToSystemConfig } from '../../utils/systemConfig';
import { storeCheckinPaymentUnlock } from '../../utils/checkinPaymentUnlock';
import { formatClubDate } from '../../utils/clubDateTime';
import {
  type CheckInOption,
  checkInExecuteIntent,
  defaultCheckInOption,
  shouldShowCheckInSelector,
} from '../../utils/checkInOptions';
import { CheckInOptionSelect } from '../CheckInOptionSelect';

export type CheckinMemberStatus = {
  present: boolean;
  visitedToday: boolean;
  lastCheckInAt: string | null;
  eventTournamentId?: number | null;
  eventName?: string | null;
};

export type CheckinStatusMap = Record<number, CheckinMemberStatus>;

export type CheckinTodayStatusSnapshot = {
  clubDate: string;
  version: number;
  members: CheckinStatusMap;
};

export type ClubVisitUpdatedEvent = {
  memberId: number;
  action?: string;
  clubDate?: string | null;
  version?: number;
  present?: boolean;
  visitedToday?: boolean;
  lastCheckInAt?: string | null;
  eventTournamentId?: number | null;
  eventName?: string | null;
};

type EntitlementSummary = {
  type: string;
  visitsRemaining: number | null;
  validTo: string | null;
} | null;

/** @deprecated Prefer CheckInOption from utils/checkInOptions */
export type EventCheckInOption = {
  tournamentId: number;
  name: string | null;
  tournamentDate?: string | null;
  eventPriceCents?: number | null;
  mode?: 'event_check_in' | 'register_and_pay';
  clubChargeWaived?: boolean;
  clubChargeWarning?: string | null;
};

export type { CheckInOption } from '../../utils/checkInOptions';

type PinToggleResponse = {
  action: 'CHECK_IN' | 'CHECK_OUT' | 'PAYMENT_REQUIRED' | 'EVENT_REGISTERED';
  warning?: string | null;
  message?: string;
  charged?: boolean;
  courtesy?: boolean;
  canPay?: boolean;
  paymentLoginAvailable?: boolean;
  paymentInProgress?: boolean;
  checkInBlocked?: boolean;
  checkInWarning?: string | null;
  entitlement?: EntitlementSummary;
  member?: { firstName: string; lastName: string };
  visit?: { eventTournamentId?: number | null } | null;
  usedEventCheckIn?: boolean;
};

function formatEntitlementLine(entitlement: EntitlementSummary): string | null {
  if (!entitlement) return null;
  if (entitlement.type === 'VISIT_PACK' && entitlement.visitsRemaining != null) {
    return `${entitlement.visitsRemaining} visit(s) remaining`;
  }
  if (entitlement.validTo) {
    const d = new Date(entitlement.validTo);
    if (!Number.isNaN(d.getTime())) {
      return `Plan valid until ${formatClubDate(entitlement.validTo)}`;
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

  if (data.action === 'EVENT_REGISTERED') {
    return (
      data.message ||
      'Event registration completed. Club check-in may still require a plan or visit payment.'
    );
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
  const eventAdmission =
    data.usedEventCheckIn === true ||
    (data.visit?.eventTournamentId != null && Number(data.visit.eventTournamentId) > 0);
  if (data.courtesy) {
    parts.push(`${name} checked in (courtesy).`);
  } else if (eventAdmission) {
    parts.push(`${name} checked in (event admission).`);
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

export async function fetchCheckinTodayStatus(): Promise<CheckinTodayStatusSnapshot> {
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
      eventTournamentId:
        row.eventTournamentId != null && Number.isInteger(Number(row.eventTournamentId))
          ? Number(row.eventTournamentId)
          : null,
      eventName: typeof row.eventName === 'string' ? row.eventName : null,
    };
  }
  return {
    clubDate: typeof res.data?.clubDate === 'string' ? res.data.clubDate : '',
    version: Number.isFinite(Number(res.data?.version)) ? Number(res.data.version) : 0,
    members: map,
  };
}

/** Cheap out-of-band probe; full today-status only when version/clubDate drift. */
export async function fetchCheckinTodayStatusVersion(): Promise<{
  clubDate: string;
  version: number;
}> {
  const res = await api.get('/club/kiosk/today-status/version');
  return {
    clubDate: typeof res.data?.clubDate === 'string' ? res.data.clubDate : '',
    version: Number.isFinite(Number(res.data?.version)) ? Number(res.data.version) : 0,
  };
}

/** Apply a club:visitUpdated patch; returns null if a full refresh is required. */
export function applyClubVisitUpdatedPatch(
  map: CheckinStatusMap,
  event: ClubVisitUpdatedEvent,
  currentClubDate: string,
): CheckinStatusMap | null {
  if (event.clubDate && currentClubDate && event.clubDate !== currentClubDate) {
    return null;
  }
  const memberId = Number(event.memberId);
  if (!Number.isInteger(memberId) || memberId < 1) return map;

  const prev = map[memberId] ?? {
    present: false,
    visitedToday: false,
    lastCheckInAt: null,
    eventTournamentId: null,
    eventName: null,
  };
  const next: CheckinMemberStatus = { ...prev };

  if (typeof event.present === 'boolean') {
    next.present = event.present;
  }
  if (typeof event.visitedToday === 'boolean') {
    next.visitedToday = event.visitedToday;
  }
  if (event.lastCheckInAt !== undefined) {
    next.lastCheckInAt =
      typeof event.lastCheckInAt === 'string' ? event.lastCheckInAt : null;
  }
  if (event.eventTournamentId !== undefined) {
    next.eventTournamentId = event.eventTournamentId;
  }
  if (event.eventName !== undefined) {
    next.eventName = event.eventName;
  }
  if (!next.present) {
    next.eventTournamentId = null;
    next.eventName = null;
  }

  // Drop members with no presence signal so presentCount stays accurate.
  if (!next.present && !next.visitedToday && !next.lastCheckInAt) {
    const { [memberId]: _removed, ...rest } = map;
    return rest;
  }

  return { ...map, [memberId]: next };
}

type CheckinKioskToolbarProps = {
  presentCount: number;
  presentOnly: boolean;
  onPresentOnlyChange: (next: boolean) => void;
  filtersCollapsed?: boolean;
  onToggleFiltersCollapsed?: () => void;
  onRefresh?: () => void;
};

export function CheckinKioskToolbar({
  presentCount,
  presentOnly,
  onPresentOnlyChange,
  filtersCollapsed = false,
  onToggleFiltersCollapsed,
  onRefresh,
}: CheckinKioskToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        marginBottom: '10px',
        position: 'relative',
        minHeight: '36px',
      }}
    >
      {onToggleFiltersCollapsed && (
        <button
          type="button"
          onClick={onToggleFiltersCollapsed}
          style={{
            padding: '5px 10px',
            fontSize: '13px',
            backgroundColor: '#e8e8e8',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            minWidth: '32px',
            zIndex: 1,
          }}
          title={filtersCollapsed ? 'Expand filters' : 'Collapse filters'}
        >
          {filtersCollapsed ? '▼' : '▲'}
        </button>
      )}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#333',
            letterSpacing: 'normal',
            textTransform: 'none',
          }}
        >
          {presentCount} player{presentCount !== 1 ? 's' : ''} in attendance
        </div>
        <label
          htmlFor="presentOnlyFilter"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            fontWeight: 'bold',
            fontSize: '13px',
            backgroundColor: presentOnly ? '#d6eaf8' : '#e8e8e8',
            borderRadius: '4px',
            cursor: 'pointer',
            border: presentOnly ? '1px solid #1a5276' : '1px solid transparent',
            boxSizing: 'border-box',
          }}
        >
          <input
            id="presentOnlyFilter"
            type="checkbox"
            checked={presentOnly}
            onChange={(e) => onPresentOnlyChange(e.target.checked)}
            style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }}
          />
          Present
        </label>
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="button-filter"
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            fontSize: '14px',
            fontWeight: 'bold',
            borderRadius: '4px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            zIndex: 1,
          }}
          title="Refresh all data from server"
        >
          ↻
        </button>
      )}
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
  /** Open the member Plan/Payment screen (e.g. after a rejected check-in). */
  onOpenPayment?: (memberId: number) => void;
};

export function CheckinPinModal({
  memberId,
  memberName,
  action,
  freeReentry,
  onClose,
  onSuccess,
  onOpenPayment,
}: PinModalProps) {
  const [scorePin, setScorePin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinLength, setPinLength] = useState(() => getSystemConfig().authPolicy.pinLength);
  const [phase, setPhase] = useState<'pin' | 'pay_offer' | 'rejected' | 'member_password'>('pin');
  const [passwordReturnPhase, setPasswordReturnPhase] = useState<'pay_offer' | 'rejected'>('rejected');
  const [resultMessage, setResultMessage] = useState('');
  const [paymentLoginAvailable, setPaymentLoginAvailable] = useState(false);
  const [memberPassword, setMemberPassword] = useState('');
  const [eventOptions, setEventOptions] = useState<CheckInOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const selectedOption = eventOptions.find((e) => e.id === selectedOptionId) || null;
  const showSelector = shouldShowCheckInSelector(eventOptions);
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return subscribeToSystemConfig((config) => {
      setPinLength(config.authPolicy.pinLength);
    });
  }, []);

  useEffect(() => {
    if (action !== 'CHECK_IN') {
      setEventOptions([]);
      setSelectedOptionId(null);
      return;
    }
    let cancelled = false;
    api.get<{ options?: CheckInOption[] }>('/club/event-checkin-options', { params: { memberId } })
      .then((res) => {
        if (cancelled) return;
        const options = Array.isArray(res.data?.options) ? res.data.options : [];
        setEventOptions(options);
        setSelectedOptionId(defaultCheckInOption(options)?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setEventOptions([]);
          setSelectedOptionId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, action]);

  useEffect(() => {
    if (phase === 'member_password' || (phase === 'rejected' && paymentLoginAvailable)) {
      passwordRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [phase, paymentLoginAvailable]);

  const finish = (message: string) => {
    onSuccess(message);
  };

  const requestMemberPassword = (from: 'pay_offer' | 'rejected') => {
    setPasswordReturnPhase(from);
    setMemberPassword('');
    setError('');
    setPhase('member_password');
  };

  const goToPayment = (message: string) => {
    if (onOpenPayment) {
      onOpenPayment(memberId);
      return;
    }
    finish(message);
  };

  const authorizeAndOpenPayment = async () => {
    if (!memberPassword.trim()) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/member/authorize-checkin-payment', {
        password: memberPassword,
        memberId,
      });
      const unlockToken = typeof res.data?.unlockToken === 'string' ? res.data.unlockToken : '';
      const expiresAt = Number(res.data?.expiresAt) || Date.now() + 15 * 60 * 1000;
      if (unlockToken) {
        storeCheckinPaymentUnlock(memberId, unlockToken, expiresAt);
      }
      goToPayment(resultMessage);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Invalid password'));
    } finally {
      setLoading(false);
    }
  };

  const enterPaymentRequired = (message: string, loginAvailable: boolean) => {
    setResultMessage(message);
    setPaymentLoginAvailable(loginAvailable);
    setMemberPassword('');
    setError('');
    setPhase('rejected');
  };

  const submit = async () => {
    if (!scorePin.trim()) {
      setError('Enter your PIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const intent = checkInExecuteIntent(selectedOption);

      if (intent?.type === 'buy_plan' || (!intent && selectedOption?.kind === 'buy_plan')) {
        const verify = await api.post('/club/pin-verify', {
          memberId,
          scorePin: scorePin.trim(),
        });
        enterPaymentRequired(
          'No active plan. Purchase a plan to check in, or choose an event when available.',
          verify.data?.paymentLoginAvailable === true,
        );
        return;
      }

      const body: {
        memberId: number;
        scorePin: string;
        eventTournamentId?: number;
        eventMode?: string;
      } = {
        memberId,
        scorePin: scorePin.trim(),
      };
      if (intent?.type === 'event_check_in' || intent?.type === 'register_and_pay') {
        body.eventTournamentId = intent.tournamentId;
        body.eventMode = intent.type;
      }
      const res = await api.post('/club/pin-toggle', body);
      const data = res.data as PinToggleResponse;
      const message = formatPinToggleMessage(data);
      if (data.action === 'EVENT_REGISTERED') {
        finish(message);
      } else if (data.action === 'PAYMENT_REQUIRED') {
        enterPaymentRequired(message, data.paymentLoginAvailable === true);
      } else if (data.canPay || data.courtesy) {
        setResultMessage(message);
        setPaymentLoginAvailable(data.paymentLoginAvailable === true);
        setPhase('pay_offer');
      } else {
        finish(message);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: PinToggleResponse & { error?: string } } };
      if (axiosErr.response?.status === 402 && axiosErr.response.data) {
        const data = axiosErr.response.data;
        const message = formatPinToggleMessage(data);
        enterPaymentRequired(message, data.paymentLoginAvailable === true);
      } else {
        setError(getErrorMessage(err, 'Check-in failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const submitEventRegister = async (tournamentId: number) => {
    if (!scorePin.trim()) {
      setError('Enter your PIN first, then choose an event');
      setPhase('pin');
      return;
    }
    setSelectedOptionId(`event:${tournamentId}`);
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/club/pin-toggle', {
        memberId,
        scorePin: scorePin.trim(),
        eventTournamentId: tournamentId,
        eventMode: 'register_and_pay',
      });
      const data = res.data as PinToggleResponse;
      const message = formatPinToggleMessage(data);
      if (data.action === 'EVENT_REGISTERED' || data.action === 'CHECK_IN') {
        finish(message);
      } else if (data.action === 'PAYMENT_REQUIRED') {
        enterPaymentRequired(message, data.paymentLoginAvailable === true);
      } else {
        finish(message);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Event registration failed'));
    } finally {
      setLoading(false);
    }
  };

  const registerEventOptions = eventOptions.filter(
    (e) => e.kind === 'register_and_pay' && e.actionable,
  );

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
            {action === 'CHECK_IN' && showSelector && (
              <CheckInOptionSelect
                options={eventOptions}
                valueId={selectedOptionId}
                onChange={setSelectedOptionId}
                disabled={loading}
              />
            )}
            {action === 'CHECK_IN' && !showSelector && selectedOption?.kind === 'buy_plan' && (
              <p style={{ fontSize: '13px', color: '#856404', marginTop: 0 }}>
                No covered admission available. Enter PIN to buy a plan.
              </p>
            )}
            {selectedOption?.kind === 'register_and_pay' && selectedOption.actionable && (
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#555' }}>
                Desk will record the event fee as cash when you confirm PIN check-in.
              </p>
            )}
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
                {loading
                  ? '…'
                  : selectedOption?.kind === 'buy_plan'
                    ? 'Continue to Buy a plan'
                    : selectedOption?.kind === 'register_and_pay'
                      ? 'Register & check in'
                      : label}
              </button>
            </div>
          </>
        )}

        {phase === 'rejected' && (
          <>
            <h3 style={{ marginTop: 0, color: '#c0392b' }}>Check-in blocked</h3>
            <p style={{ fontSize: '14px', color: '#333', lineHeight: 1.45 }}>{resultMessage}</p>
            {error && <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
            {paymentLoginAvailable ? (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px',
                  backgroundColor: '#eaf2f8',
                  border: '1px solid #aed6f1',
                  borderRadius: '4px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a5276', marginBottom: '8px' }}>
                  Pay for regular admission
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#555' }}>
                  Enter your login password to open plan / visit payment.
                </p>
                <input
                  ref={passwordRef}
                  type="password"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void authorizeAndOpenPayment();
                    }
                  }}
                  placeholder="Password"
                  autoComplete="current-password"
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', fontSize: '16px' }}
                />
                <button
                  type="button"
                  className="success"
                  disabled={loading}
                  onClick={() => void authorizeAndOpenPayment()}
                  style={{ width: '100%' }}
                >
                  {loading ? '…' : 'Continue to payment'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#666' }}>
                Online club admission payment is unavailable because this member does not have a login email and password.
              </p>
            )}
            {registerEventOptions.length > 0 && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px',
                  backgroundColor: '#f5eef8',
                  border: '1px solid #d7bde2',
                  borderRadius: '4px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#6c3483', marginBottom: '8px' }}>
                  Or register for a planned event
                </div>
                {registerEventOptions.map((event) => {
                  const price =
                    event.eventPriceCents != null
                      ? `$${(event.eventPriceCents / 100).toFixed(2)}`
                      : '';
                  return (
                    <div key={event.id} style={{ marginBottom: '8px' }}>
                      <button
                        type="button"
                        className="success"
                        disabled={loading}
                        onClick={() => void submitEventRegister(event.tournamentId!)}
                        style={{ width: '100%' }}
                      >
                        {loading
                          ? '…'
                          : `Register & pay ${event.name || `Event #${event.tournamentId}`}${price ? ` (${price})` : ''}`}
                      </button>
                      {event.clubChargeWarning && (
                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#856404' }}>
                          {event.clubChargeWarning}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => finish(resultMessage)} disabled={loading}>
                Close
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
              {paymentLoginAvailable
                ? 'You can purchase a plan now, or continue without paying.'
                : 'Online payment is unavailable because this member does not have a login email and password.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => finish(resultMessage)}>
                Not now
              </button>
              {paymentLoginAvailable && (
                <button
                  type="button"
                  className="success"
                  onClick={() => requestMemberPassword('pay_offer')}
                >
                  Pay now
                </button>
              )}
            </div>
          </>
        )}

        {phase === 'member_password' && (
          <>
            <h3 style={{ marginTop: 0 }}>Member password required</h3>
            <p style={{ fontSize: '14px', color: '#555' }}>
              {memberName}, enter your login password to continue to payment.
            </p>
            {error && <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
            <input
              ref={passwordRef}
              type="password"
              value={memberPassword}
              onChange={(e) => setMemberPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void authorizeAndOpenPayment();
                }
              }}
              placeholder="Password"
              autoComplete="current-password"
              style={{ width: '100%', padding: '10px', marginBottom: '16px', boxSizing: 'border-box', fontSize: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setMemberPassword('');
                  setError('');
                  setPhase(passwordReturnPhase);
                }}
                disabled={loading}
              >
                Back
              </button>
              <button
                type="button"
                className="success"
                onClick={() => void authorizeAndOpenPayment()}
                disabled={loading}
              >
                {loading ? '…' : 'Continue'}
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
  eventAdmission?: boolean;
  eventName?: string | null;
  onClick: () => void;
};

export function CheckinRowButton({
  present,
  visitedToday,
  eventAdmission = false,
  eventName = null,
  onClick,
}: RowButtonProps) {
  if (present) {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        {eventAdmission && (
          <span
            title={eventName?.trim() ? `Event admission: ${eventName.trim()}` : 'Event admission'}
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              color: '#6c3483',
              backgroundColor: '#f5eef8',
              border: '1px solid #d7bde2',
              borderRadius: '4px',
              padding: '1px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            Event
          </span>
        )}
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
      </div>
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
