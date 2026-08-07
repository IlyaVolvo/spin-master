import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api';
import { clubTodayYmd, formatClubDate, formatClubDateTime } from '../../utils/clubDateTime';
import { getErrorMessage } from '../../utils/errorHandler';
import { isAdmin, getMember } from '../../utils/auth';
import {
  clearCheckinPaymentUnlock,
  getCheckinPaymentUnlockToken,
} from '../../utils/checkinPaymentUnlock';
import { waitForPaymentUpdate } from '../../utils/waitForPaymentUpdate';

type EntitlementView = {
  id: number;
  type: string;
  status: string;
  label: string | null;
  validFrom: string;
  validTo: string | null;
  visitsRemaining: number | null;
  visitsTotal: number | null;
  amountPaidCents: number;
  familyKey: string | null;
  planSegment: string | null;
};

type PlanSummary = {
  member: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    segment: string;
    courtesySuspended?: boolean;
  };
  current: EntitlementView | null;
  future: EntitlementView | null;
  purchaseCreditCents: number;
  autoRenewEnabled: boolean;
  autoRenewFamilyKey: string | null;
  futureReimburseCents: number;
  canPurchase: boolean;
  onlinePayConsent?: boolean;
  effectiveCanPayOnline?: boolean;
  inTrial?: boolean;
  trialEndsOn?: string | null;
  trialPlanStartsOn?: string | null;
  pendingPayment: {
    id: number;
    status: string;
    amountCents: number;
    listAmountCents?: number;
    creditAppliedCents?: number;
    purpose: string;
    provider?: string;
  } | null;
  payments?: Array<{
    id: number;
    recordedAt: string;
    amountCents: number;
    listAmountCents?: number;
    creditAppliedCents?: number;
    status: string;
    provider: string;
    purpose: string;
  }>;
};

type PricedPlan = {
  familyKey: string;
  name: string;
  kind: string;
  segment: string;
  listAmountCents: number;
  creditPreviewCents: number;
  chargePreviewCents: number;
  visitCount: number | null;
  durationUnit: string | null;
  durationValue: number | null;
};

type PurchaseLineState = 'idle' | 'pending' | 'confirmed' | 'failed';

/** Dark label like Ledger/Admin, but only as wide as the text. */
const planSectionLabelStyle: React.CSSProperties = {
  display: 'inline-block',
  margin: 0,
  padding: '6px 10px',
  backgroundColor: '#2c3e50',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: '14px',
  lineHeight: 1.3,
};

function planSlotLabelStyle(active: boolean): React.CSSProperties {
  return {
    ...planSectionLabelStyle,
    marginBottom: '6px',
    backgroundColor: active ? '#2c3e50' : '#c5ced6',
    color: active ? '#ffffff' : '#2c3e50',
  };
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function entitlementDetail(e: EntitlementView): string {
  if (e.type === 'VISIT_PACK') {
    return `${e.visitsRemaining ?? 0}/${e.visitsTotal ?? '?'} visits`;
  }
  const to = e.validTo ? formatClubDate(e.validTo) : '—';
  const from = formatClubDate(e.validFrom);
  return `${from} → ${to}`;
}

function EntitlementLine({
  entitlement,
  tone = 'idle',
}: {
  entitlement: EntitlementView;
  tone?: PurchaseLineState;
}) {
  const name = entitlement.label || entitlement.type;
  const detail = entitlementDetail(entitlement);
  const color =
    tone === 'failed' ? '#c0392b' : tone === 'confirmed' ? '#1b5e20' : tone === 'pending' ? '#455a64' : '#333';
  return (
    <span style={{ color, fontSize: '14px' }}>
      <strong style={{ fontWeight: 700 }}>{name}</strong>
      <span style={{ fontWeight: 400 }}> — {detail}</span>
    </span>
  );
}

function purchaseBlockReason(summary: PlanSummary): string | null {
  if (summary.pendingPayment) return 'A payment is already in progress.';
  if (summary.future) return 'A next plan is already queued.';
  if (summary.current && summary.autoRenewEnabled) {
    return 'Auto-renew is on for the current plan — turn it off to choose a future plan.';
  }
  return null;
}

function statusPanelStyle(state: PurchaseLineState): React.CSSProperties {
  if (state === 'pending') {
    return { background: '#eceff1', border: '1px solid #cfd8dc' };
  }
  if (state === 'confirmed') {
    return { background: '#e8f5e9', border: '1px solid #c8e6c9' };
  }
  if (state === 'failed') {
    return { background: '#fdecea', border: '1px solid #f5c6cb' };
  }
  return { background: 'transparent', border: '1px solid transparent' };
}

function purchaseButtonStyle(state: PurchaseLineState, busy: boolean): React.CSSProperties {
  if (state === 'failed') {
    return {
      background: '#c0392b',
      color: '#fff',
      border: '1px solid #a93226',
      opacity: busy ? 0.85 : 1,
    };
  }
  if (state === 'pending') {
    return {
      background: '#78909c',
      color: '#fff',
      border: '1px solid #607d8b',
      opacity: busy ? 0.85 : 1,
    };
  }
  if (state === 'confirmed') {
    return {
      background: '#2e7d32',
      color: '#fff',
      border: '1px solid #1b5e20',
    };
  }
  return {};
}

/** Visual tone for a plan row: in-flight status wins; otherwise owned plans stay light green. */
function planRowTone(opts: {
  slot: 'current' | 'future';
  hasPlan: boolean;
  statusTarget: 'current' | 'future' | null;
  purchaseLineState: PurchaseLineState;
  pendingPayment: boolean;
}): PurchaseLineState {
  if (opts.statusTarget === opts.slot) {
    if (opts.purchaseLineState === 'pending') return 'pending';
    if (opts.purchaseLineState === 'failed') return 'failed';
    if (opts.purchaseLineState === 'confirmed') return 'confirmed';
  }
  if (opts.pendingPayment && opts.statusTarget === opts.slot) return 'pending';
  if (opts.hasPlan) return 'confirmed';
  return 'idle';
}

export type MemberPlanScreenProps = {
  memberId: number;
  onClose: () => void;
};

export function MemberPlanScreen({ memberId, onClose }: MemberPlanScreenProps) {
  const admin = isAdmin();
  const selfMemberId = getMember()?.id;
  const adminActingOnBehalf =
    admin && selfMemberId != null && Number(selfMemberId) !== Number(memberId);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [plans, setPlans] = useState<PricedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFamilyKey, setSelectedFamilyKey] = useState('');
  const [creditDraft, setCreditDraft] = useState('');
  const [purchaseLineState, setPurchaseLineState] = useState<PurchaseLineState>('idle');
  const [purchaseLineLabel, setPurchaseLineLabel] = useState('');
  /** Which plan row reflects the in-flight / last purchase outcome */
  const [statusTarget, setStatusTarget] = useState<'current' | 'future' | null>(null);
  const [startDate, setStartDate] = useState(clubTodayYmd);
  const [payMethod, setPayMethod] = useState<'cash' | 'online'>('cash');
  const paymentAbortRef = useRef<AbortController | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      paymentAbortRef.current?.abort();
      paymentAbortRef.current = null;
      clearCheckinPaymentUnlock(memberId);
    };
  }, [memberId]);

  const handleClose = () => {
    closedRef.current = true;
    paymentAbortRef.current?.abort();
    paymentAbortRef.current = null;
    clearCheckinPaymentUnlock(memberId);
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close uses latest onClose via render
  }, [onClose]);

  const load = useCallback(async (opts?: { silent?: boolean; applyPendingHighlight?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(''); 
    try {
      const [planRes, pricedRes] = await Promise.all([
        api.get(`/club/members/${memberId}/plan`),
        api.get(`/payments/plans/for-member/${memberId}`),
      ]);
      const nextSummary = planRes.data as PlanSummary;
      const nextPlans: PricedPlan[] = Array.isArray(pricedRes.data?.plans)
        ? pricedRes.data.plans
        : [];
      setSummary(nextSummary);
      setPlans(nextPlans);
      setCreditDraft('');
      const actingOnBehalf =
        isAdmin() &&
        getMember()?.id != null &&
        Number(getMember()?.id) !== Number(memberId);
      const buyingCurrent = !nextSummary.current && !nextSummary.inTrial;
      const canCash =
        isAdmin() &&
        nextSummary.canPurchase === true &&
        (actingOnBehalf || buyingCurrent);
      setPayMethod(
        actingOnBehalf
          ? 'cash'
          : nextSummary.effectiveCanPayOnline
            ? 'online'
            : canCash
              ? 'cash'
              : 'online',
      );
      setSelectedFamilyKey((prev) => {
        if (prev && nextPlans.some((p) => p.familyKey === prev)) return prev;
        return nextPlans[0]?.familyKey || '';
      });
      if (opts?.applyPendingHighlight && nextSummary.pendingPayment) {
        setPurchaseLineState('pending');
        const pendingAsFuture = Boolean(nextSummary.current) || Boolean(nextSummary.inTrial);
        setStatusTarget(pendingAsFuture ? 'future' : 'current');
        setPurchaseLineLabel(
          `${nextSummary.pendingPayment.purpose || 'Payment'} · ${formatMoney(nextSummary.pendingPayment.amountCents)} (pending)`,
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load plan'));
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [memberId]);

  useEffect(() => {
    void load({ applyPendingHighlight: true });
  }, [load]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.familyKey === selectedFamilyKey) || null,
    [plans, selectedFamilyKey],
  );

  const hasCurrent = Boolean(summary?.current);
  const inTrial = summary?.inTrial === true;
  const canPurchase = summary?.canPurchase === true;
  const blockReason = summary ? purchaseBlockReason(summary) : null;
  const trialStartsOn = summary?.trialPlanStartsOn || null;
  const trialEndsOnLabel = summary?.trialEndsOn || null;
  /** Cash: available to everyone who can purchase. Online: not when admin acts on behalf. */
  const canPayCash = canPurchase;
  const canPayOnline =
    summary?.effectiveCanPayOnline === true && !adminActingOnBehalf;
  const hasEmail = Boolean(summary?.member.email?.trim());

  const purchasePanelTone: PurchaseLineState =
    purchaseLineState !== 'idle'
      ? purchaseLineState
      : summary?.pendingPayment
        ? 'pending'
        : 'idle';

  /** Where a new purchase can be started (picker). In-flight status uses statusTarget separately. */
  const idlePurchaseSlot: 'current' | 'future' | null = inTrial
    ? 'future'
    : !hasCurrent
      ? 'current'
      : summary && !summary.autoRenewEnabled && !summary.future
        ? 'future'
        : null;
  /** Only show Extend when Future purchase is actually available. */
  const canExtendForFuture =
    canPurchase &&
    purchasePanelTone === 'idle' &&
    idlePurchaseSlot === 'future' &&
    plans.length > 0;
  const actionLabel = canExtendForFuture
    ? inTrial
      ? 'Purchase for after trial'
      : 'Extend for Future'
    : 'Purchase';
  const showStartDate =
    !hasCurrent && !inTrial && selectedPlan?.kind === 'TIME' && canPurchase;
  const showPurchasePicker =
    canPurchase &&
    purchasePanelTone === 'idle' &&
    idlePurchaseSlot != null &&
    plans.length > 0;
  const purchaseStatusSlot: 'current' | 'future' | null =
    purchasePanelTone !== 'idle'
      ? statusTarget ??
        (summary?.pendingPayment
          ? hasCurrent || inTrial
            ? 'future'
            : 'current'
          : null)
      : null;
  /** Active slot for purchase UI (picker or in-flight status). */
  const purchaseSlot: 'current' | 'future' | null = showPurchasePicker
    ? idlePurchaseSlot
    : purchaseStatusSlot;

  const futureSlotLockedReason = (() => {
    if (summary?.future) return null;
    if (canExtendForFuture) return null;
    if (purchaseStatusSlot === 'future') return null;
    if (!hasCurrent && !inTrial) {
      return 'Future plan is unavailable until a current plan is in place.';
    }
    if (hasCurrent && summary?.autoRenewEnabled) {
      return 'Turn off Auto-renew to select a future plan.';
    }
    if (summary?.pendingPayment) return 'A payment is already in progress.';
    return null;
  })();

  useEffect(() => {
    if (showStartDate && !startDate) {
      setStartDate(clubTodayYmd());
    }
  }, [showStartDate, startDate]);

  useEffect(() => {
    if (adminActingOnBehalf && canPayCash) {
      if (payMethod !== 'cash') setPayMethod('cash');
      return;
    }
    if (canPayCash && !canPayOnline) {
      if (payMethod !== 'cash') setPayMethod('cash');
      return;
    }
    if (!canPayCash && canPayOnline) {
      if (payMethod !== 'online') setPayMethod('online');
      return;
    }
    if (!canPayCash && !canPayOnline && payMethod === 'cash') {
      setPayMethod('online');
    }
  }, [adminActingOnBehalf, canPayOnline, canPayCash, payMethod]);

  const saveOnlineConsent = async (enabled: boolean) => {
    if (!hasEmail || adminActingOnBehalf) return;
    if (!enabled && summary?.autoRenewEnabled) {
      setError('Turn off Auto-renew before disabling online pay');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.patch(`/players/${memberId}`, { onlinePayConsent: enabled });
      await load({ silent: true });
      setMessage(enabled ? 'Online pay consent saved' : 'Online pay consent cleared');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update consent'));
    } finally {
      setBusy(false);
    }
  };

  const saveCourtesyEnabled = async (enabled: boolean) => {
    if (!admin) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/club/admin/members/${memberId}/courtesy-suspend`, {
        suspended: !enabled,
      });
      await load({ silent: true });
      setMessage(enabled ? 'Courtesy check-in enabled' : 'Courtesy check-in suspended');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update courtesy setting'));
    } finally {
      setBusy(false);
    }
  };

  const purchase = async () => {
    if (!summary || !selectedPlan || !canPurchase) return;
    if (payMethod === 'online' && !canPayOnline) {
      setError('Online payment requires email and consent');
      return;
    }
    if (payMethod === 'cash' && !canPayCash) {
      setError('Cash payment is not available right now');
      return;
    }
    if (showStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError('Choose a valid plan start date');
      return;
    }
    const target: 'current' | 'future' =
      idlePurchaseSlot === 'current' || idlePurchaseSlot === 'future'
        ? idlePurchaseSlot
        : hasCurrent || inTrial
          ? 'future'
          : 'current';
    setStatusTarget(target);
    setBusy(true);
    setError('');
    setMessage('');
    setPurchaseLineState('pending');
    setPurchaseLineLabel(
      `${selectedPlan.name} · ${formatMoney(selectedPlan.chargePreviewCents)} (pending)`,
    );
    const abort = new AbortController();
    paymentAbortRef.current?.abort();
    paymentAbortRef.current = abort;
    try {
      const paymentUnlockToken = getCheckinPaymentUnlockToken(memberId);
      const res = await api.post('/payments/checkout', {
        memberId,
        familyKey: selectedPlan.familyKey,
        kind: 'plan',
        method: payMethod,
        autoRenew: summary.autoRenewEnabled && payMethod === 'online',
        ...(showStartDate ? { startDate } : {}),
        ...(paymentUnlockToken ? { paymentUnlockToken } : {}),
      });
      const paymentId = Number(res.data?.paymentId);
      if (!paymentId) {
        throw new Error('No payment id returned');
      }

      if (payMethod === 'cash' || res.data?.providerId === 'cash') {
        if (closedRef.current || abort.signal.aborted) return;
        if (res.data?.confirmedImmediately) {
          setPurchaseLineState('confirmed');
          setPurchaseLineLabel(
            `${selectedPlan.name} · ${formatMoney(selectedPlan.chargePreviewCents)} (PAID)`,
          );
          setMessage(
            adminActingOnBehalf
              ? 'Cash recorded as paid on the member’s behalf. Plan updated.'
              : 'Cash payment recorded as paid. Plan updated.',
          );
          await load({ silent: true });
          return;
        }
        setPurchaseLineState('pending');
        setPurchaseLineLabel(
          `${selectedPlan.name} · ${formatMoney(selectedPlan.chargePreviewCents)} (awaiting admin)`,
        );
        setMessage(
          'Cash selected — payment is PENDING until an administrator clears it at the desk.',
        );
        await load({ silent: true });
        return;
      }

      const settled = await waitForPaymentUpdate({
        paymentId,
        timeoutMs: 90_000,
        signal: abort.signal,
        onStatus: (s) => {
          if (closedRef.current) return;
          if (s === 'PENDING') {
            setPurchaseLineState('pending');
            setPurchaseLineLabel(
              `${selectedPlan.name} · ${formatMoney(selectedPlan.chargePreviewCents)} (pending)`,
            );
          }
        },
      });
      if (closedRef.current || abort.signal.aborted) return;
      if (settled.status === 'SUCCEEDED') {
        setPurchaseLineState('confirmed');
        setPurchaseLineLabel(
          `${selectedPlan.name} · ${formatMoney(settled.amountCents)} (confirmed)`,
        );
        setMessage('Payment confirmed. Plan updated.');
      } else if (settled.status === 'PENDING') {
        setPurchaseLineState('pending');
        setMessage('Payment still pending. This line stays grey until confirmed.');
      } else {
        setPurchaseLineState('failed');
        setPurchaseLineLabel(`${selectedPlan.name} (${settled.status.toLowerCase()})`);
        setError(`Payment ${settled.status.toLowerCase()}`);
      }
      await load({ silent: true });
    } catch (err) {
      if (closedRef.current || abort.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setPurchaseLineState('failed');
      setError(getErrorMessage(err, 'Checkout failed'));
    } finally {
      if (paymentAbortRef.current === abort) {
        paymentAbortRef.current = null;
      }
      if (!closedRef.current) {
        setBusy(false);
      }
    }
  };

  const saveCredit = async () => {
    setBusy(true);
    setError('');
    try {
      const dollars = Number(creditDraft);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError('Enter a positive credit amount to add');
        return;
      }
      await api.post(`/club/members/${memberId}/plan/credit`, {
        purchaseCreditCents: Math.round(dollars * 100),
      });
      setMessage(`Added ${formatMoney(Math.round(dollars * 100))} credit`);
      setCreditDraft('');
      await load({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add credit'));
    } finally {
      setBusy(false);
    }
  };

  const reimburseFuture = async () => {
    if (!window.confirm('Reimburse the future plan proportionally and remove it?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/club/members/${memberId}/plan/reimburse-future`);
      setMessage(`Reimbursed ${formatMoney(res.data?.reimbursedCents || 0)} to credit`);
      await load({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Reimburse failed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoRenew = async (enabled: boolean) => {
    if (!summary?.current) return;
    if (adminActingOnBehalf) {
      setError('Only the member can change auto-renew');
      return;
    }
    // Block only when a Future plan is already queued (selected and paid).
    if (enabled && summary.future) {
      setError('Auto-renew cannot be enabled while a future plan is queued');
      return;
    }
    if (enabled && !summary.onlinePayConsent) {
      setError('Enable “I consent to pay online” before turning on Auto-renew');
      return;
    }
    if (enabled && !summary.effectiveCanPayOnline) {
      setError('Auto-renew requires an email address and online pay consent');
      return;
    }
    // Prefer current entitlement family; server also resolves from current if omitted.
    const familyKey =
      summary.current.familyKey || summary.autoRenewFamilyKey || undefined;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/club/members/${memberId}/plan/auto-renew`, {
        enabled,
        ...(enabled && familyKey ? { familyKey } : {}),
      });
      setMessage(enabled ? 'Auto-renew enabled' : 'Auto-renew turned off');
      await load({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update auto-renew'));
    } finally {
      setBusy(false);
    }
  };

  const name = summary
    ? `${summary.member.firstName} ${summary.member.lastName}`.trim()
    : `Member #${memberId}`;

  const currentTone = planRowTone({
    slot: 'current',
    hasPlan: Boolean(summary?.current),
    statusTarget,
    purchaseLineState,
    pendingPayment: Boolean(summary?.pendingPayment),
  });
  const futureTone = planRowTone({
    slot: 'future',
    hasPlan: Boolean(summary?.future),
    statusTarget,
    purchaseLineState,
    pendingPayment: Boolean(summary?.pendingPayment),
  });

  const renderPurchaseStatus = (slot: 'current' | 'future') => {
    const label =
      purchaseLineLabel ||
      (purchasePanelTone === 'pending'
        ? 'Payment pending…'
        : purchasePanelTone === 'failed'
          ? 'Payment failed'
          : purchasePanelTone === 'confirmed'
            ? 'Payment confirmed'
            : 'Processing…');
    return (
      <div
        style={{
          padding: '10px 12px',
          borderRadius: '6px',
          fontSize: '14px',
          color:
            purchasePanelTone === 'failed'
              ? '#c0392b'
              : purchasePanelTone === 'confirmed'
                ? '#1e7e34'
                : '#546e7a',
          ...statusPanelStyle(purchasePanelTone === 'idle' ? 'pending' : purchasePanelTone),
        }}
      >
        <strong style={{ fontWeight: 700 }}>
          {slot === 'future' ? 'Future plan' : 'Current plan'}
        </strong>
        <span style={{ fontWeight: 400 }}>
          {' · '}
          {label}
        </span>
        {purchasePanelTone === 'pending' && (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#666' }}>
            Awaiting payment confirmation. See Ledger for PENDING → PAID.
          </p>
        )}
      </div>
    );
  };

  const renderPurchasePanel = () => (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        transition: 'background-color 0.2s ease',
        ...statusPanelStyle(purchasePanelTone),
        border:
          purchasePanelTone === 'idle'
            ? '1px solid #ccc'
            : statusPanelStyle(purchasePanelTone).border,
      }}
    >
      {inTrial && (
        <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#1a5276', fontWeight: 600 }}>
          This plan will be in effect after the trial
          {trialStartsOn ? ` (from ${trialStartsOn})` : ' ends'}
          {trialEndsOnLabel ? ` — trial ends ${trialEndsOnLabel}` : ''}.
        </p>
      )}
      {blockReason && purchasePanelTone === 'idle' && (
        <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#a65b00' }}>{blockReason}</p>
      )}
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
        Select plan
      </label>
      <select
        value={selectedFamilyKey}
        disabled={busy || !canPurchase || plans.length === 0}
        onChange={(e) => setSelectedFamilyKey(e.target.value)}
        style={{
          width: '100%',
          padding: '8px',
          fontSize: '14px',
          marginBottom: '8px',
          fontWeight: 700,
          color:
            purchasePanelTone === 'failed'
              ? '#c0392b'
              : purchasePanelTone === 'confirmed'
                ? '#1e7e34'
                : purchasePanelTone === 'pending'
                  ? '#455a64'
                  : undefined,
          background:
            purchasePanelTone === 'failed'
              ? '#fdecea'
              : purchasePanelTone === 'confirmed'
                ? '#e8f5e9'
                : purchasePanelTone === 'pending'
                  ? '#eceff1'
                  : undefined,
        }}
      >
        {plans.length === 0 && <option value="">No plans available</option>}
        {plans.map((p) => (
          <option key={p.familyKey} value={p.familyKey}>
            {p.name}
            {` — ${formatMoney(p.chargePreviewCents)}`}
            {p.creditPreviewCents > 0
              ? ` (after ${formatMoney(p.creditPreviewCents)} credit)`
              : ''}
          </option>
        ))}
      </select>

      {selectedPlan && (
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '12px',
            color:
              purchasePanelTone === 'failed'
                ? '#c0392b'
                : purchasePanelTone === 'confirmed'
                  ? '#1e7e34'
                  : '#555',
          }}
        >
          <strong style={{ fontWeight: 700 }}>{selectedPlan.name}</strong>
          <span style={{ fontWeight: 400 }}>
            {' · '}
            {selectedPlan.kind}
            {selectedPlan.kind === 'VISIT' && selectedPlan.visitCount != null
              ? ` · ${selectedPlan.visitCount} visits`
              : ''}
            {' · '}priced for segment {selectedPlan.segment}
            {' · '}list {formatMoney(selectedPlan.listAmountCents)}
          </span>
          {inTrial && (
            <span style={{ display: 'block', marginTop: '6px', fontWeight: 600, color: '#1a5276' }}>
              Takes effect after trial
              {trialStartsOn ? ` on ${trialStartsOn}` : ''}.
            </span>
          )}
        </p>
      )}

      <div style={{ marginBottom: '10px', fontSize: '13px' }}>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Payment method</span>
        {canPayCash && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginRight: '14px',
            }}
            title={
              adminActingOnBehalf
                ? 'Record cash as paid immediately on this member’s behalf'
                : 'Pay at the desk — stays PENDING until an administrator clears it'
            }
          >
            <input
              type="radio"
              name="payMethod"
              checked={payMethod === 'cash'}
              disabled={busy || !canPurchase}
              onChange={() => setPayMethod('cash')}
            />
            Cash (paid now)
          </label>
        )}
        {canPayOnline && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Pay with the active online provider"
          >
            <input
              type="radio"
              name="payMethod"
              checked={payMethod === 'online'}
              disabled={busy || !canPurchase}
              onChange={() => setPayMethod('online')}
            />
            Pay online
          </label>
        )}
        {!canPayCash && !canPayOnline && (
          <p style={{ margin: 0, fontSize: '12px', color: '#a65b00' }}>
            {hasEmail
              ? 'Enable “I consent to pay online” to pay online, or choose cash when available.'
              : 'Add an email and consent to pay online, or pay cash at the desk.'}
          </p>
        )}
      </div>

      {showStartDate && (
        <label style={{ display: 'block', fontSize: '13px', marginBottom: '10px' }}>
          <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>
            First day
          </span>
          <input
            type="date"
            value={startDate}
            min={clubTodayYmd()}
            disabled={busy}
            onChange={(e) => setStartDate(e.target.value || clubTodayYmd())}
            style={{ padding: '8px', fontSize: '14px' }}
          />
        </label>
      )}

      {purchaseLineLabel && (
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '13px',
            color:
              purchasePanelTone === 'failed'
                ? '#c0392b'
                : purchasePanelTone === 'confirmed'
                  ? '#1e7e34'
                  : '#546e7a',
          }}
        >
          <strong style={{ fontWeight: 700 }}>
            {purchaseLineLabel.split(' · ')[0] || purchaseLineLabel}
          </strong>
          {purchaseLineLabel.includes(' · ') && (
            <span style={{ fontWeight: 400 }}>
              {' · '}
              {purchaseLineLabel.split(' · ').slice(1).join(' · ')}
            </span>
          )}
        </p>
      )}

      {busy && purchasePanelTone === 'pending' && (
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#666' }}>
          Payment is processing. You can close this screen anytime — confirmation finishes in the background.
        </p>
      )}

      <button
        type="button"
        className={purchasePanelTone === 'confirmed' ? 'success' : undefined}
        disabled={
          busy ||
          (!canPurchase && purchasePanelTone === 'idle') ||
          !selectedPlan ||
          (payMethod === 'cash' ? !canPayCash : !canPayOnline)
        }
        onClick={() => void purchase()}
        style={
          purchasePanelTone === 'idle'
            ? undefined
            : purchaseButtonStyle(purchasePanelTone, busy)
        }
      >
        {busy && purchasePanelTone === 'pending'
          ? 'Processing…'
          : purchasePanelTone === 'failed'
            ? 'Failed — retry'
            : purchasePanelTone === 'confirmed'
              ? 'Purchased'
              : `${actionLabel} · ${payMethod === 'cash' ? 'Cash' : 'Online'}`}
      </button>
    </div>
  );

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
      onClick={handleClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          margin: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ ...planSectionLabelStyle, fontSize: '16px' }}>Plan — {name}</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            Close
          </button>
        </div>

        {loading && !summary && <p style={{ color: '#666' }}>Loading…</p>}
        {error && <div style={{ color: '#c0392b', marginTop: '10px', fontSize: '14px' }}>{error}</div>}
        {message && <div style={{ color: '#1e8449', marginTop: '10px', fontSize: '14px' }}>{message}</div>}

        {summary && (
          <>
            <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#555' }}>
              Pricing segment: <strong>{summary.member.segment || 'Regular'}</strong>
            </p>
            {inTrial && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: '#eaf2f8',
                  border: '1px solid #a9cce3',
                  color: '#1a5276',
                  fontSize: '13px',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ display: 'block', marginBottom: '4px' }}>Trial in effect</strong>
                Free trial
                {trialEndsOnLabel ? ` through ${trialEndsOnLabel}` : ''}. Any plan you buy now is queued
                as a <strong>future plan</strong> and will only take effect
                {trialStartsOn ? (
                  <>
                    {' '}
                    starting <strong>{trialStartsOn}</strong> (the day after trial ends)
                  </>
                ) : (
                  ' after the trial period ends'
                )}
                . It does not start while the trial is still active.
              </div>
            )}

            {hasEmail && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '12px',
                  fontSize: '13px',
                  cursor:
                    busy ||
                    adminActingOnBehalf ||
                    (summary.autoRenewEnabled && summary.onlinePayConsent === true)
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: adminActingOnBehalf ? 0.45 : 1,
                  color: adminActingOnBehalf ? '#888' : undefined,
                }}
                title={
                  adminActingOnBehalf
                    ? 'Online consent can only be set by the member. Admin can record cash only.'
                    : summary.autoRenewEnabled && summary.onlinePayConsent === true
                      ? 'Turn off Auto-renew before disabling online pay'
                      : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={summary.onlinePayConsent === true}
                  disabled={
                    busy ||
                    adminActingOnBehalf ||
                    (summary.autoRenewEnabled && summary.onlinePayConsent === true)
                  }
                  onChange={(e) => void saveOnlineConsent(e.target.checked)}
                />
                I consent to pay online
              </label>
            )}

            <section style={{ marginTop: '14px' }}>
              <h4 style={planSlotLabelStyle(Boolean(summary.current))}>Current plan</h4>
              {summary.current ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '14px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    ...statusPanelStyle(currentTone),
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexShrink: 0,
                      marginTop: '1px',
                      cursor:
                        busy ||
                        adminActingOnBehalf ||
                        summary.future ||
                        (!summary.autoRenewEnabled && !summary.onlinePayConsent)
                          ? 'not-allowed'
                          : 'pointer',
                      fontSize: '13px',
                      opacity:
                        adminActingOnBehalf ||
                        summary.future ||
                        (!summary.autoRenewEnabled && !summary.onlinePayConsent)
                          ? 0.55
                          : 1,
                    }}
                    title={
                      adminActingOnBehalf
                        ? 'Only the member can change auto-renew'
                        : summary.future
                          ? 'Auto-renew is unavailable while a future plan is queued (selected and paid)'
                          : !summary.autoRenewEnabled && !summary.onlinePayConsent
                            ? 'Enable “I consent to pay online” first'
                            : summary.autoRenewEnabled
                              ? 'Auto-renew is on — uncheck to choose a future plan instead'
                              : 'Auto-renew this plan when it ends'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={summary.autoRenewEnabled && !summary.future}
                      disabled={
                        busy ||
                        adminActingOnBehalf ||
                        Boolean(summary.future) ||
                        (!summary.autoRenewEnabled && !summary.onlinePayConsent)
                      }
                      onChange={(e) => void toggleAutoRenew(e.target.checked)}
                    />
                    Auto-renew
                  </label>
                  <EntitlementLine entitlement={summary.current} tone={currentTone} />
                </div>
              ) : showPurchasePicker && idlePurchaseSlot === 'current' ? (
                renderPurchasePanel()
              ) : purchaseSlot === 'current' ? (
                renderPurchaseStatus('current')
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>None</p>
              )}
              {summary.current && summary.future && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#666' }}>
                  Auto-renew is off while a future plan is queued.
                </p>
              )}
            </section>

            <section
              style={{
                marginTop: '12px',
                opacity:
                  summary.future || canExtendForFuture || purchaseSlot === 'future'
                    ? 1
                    : 0.5,
              }}
            >
              <h4 style={planSlotLabelStyle(Boolean(summary.future))}>Future plan</h4>
              {summary.future ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    ...statusPanelStyle(futureTone),
                  }}
                >
                  <EntitlementLine entitlement={summary.future} tone={futureTone} />
                </div>
              ) : canExtendForFuture ? (
                renderPurchasePanel()
              ) : purchaseSlot === 'future' ? (
                renderPurchaseStatus('future')
              ) : (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: '#f4f6f7',
                    border: '1px solid #e0e4e8',
                    color: '#7f8c8d',
                    fontSize: '13px',
                  }}
                >
                  {futureSlotLockedReason || 'None'}
                </div>
              )}
              {admin && summary.future && (
                <button
                  type="button"
                  style={{ marginTop: '8px' }}
                  disabled={busy}
                  onClick={() => void reimburseFuture()}
                >
                  Reimburse next (~{formatMoney(summary.futureReimburseCents)})
                </button>
              )}
            </section>

            <section style={{ marginTop: '12px' }}>
              <h4 style={{ margin: '0 0 6px' }}>Current credit</h4>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#2c3e50' }}>
                {formatMoney(summary.purchaseCreditCents)}
              </p>
            </section>

            <hr
              style={{
                margin: '16px 0',
                border: 'none',
                borderTop: '1px solid #d0d7de',
              }}
            />

            {admin && (
              <section style={{ marginTop: '18px' }}>
                <div
                  style={{
                    marginLeft: '-20px',
                    marginRight: '-20px',
                    marginBottom: '10px',
                    padding: '10px 20px',
                    backgroundColor: '#2c3e50',
                    color: '#ffffff',
                  }}
                >
                  <h4 style={{ margin: 0, color: '#ffffff', fontWeight: 600 }}>Admin</h4>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={creditDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') {
                        setCreditDraft('');
                        return;
                      }
                      const n = Number(v);
                      if (!Number.isFinite(n) || n < 0) return;
                      setCreditDraft(v);
                    }}
                    placeholder="0.00"
                    style={{ width: '100px', padding: '6px' }}
                    disabled={busy}
                    aria-label="Amount to add to credit"
                  />
                  <button type="button" disabled={busy} onClick={() => void saveCredit()}>
                    Add Credit
                  </button>
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '12px',
                    fontSize: '13px',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={summary.member.courtesySuspended !== true}
                    disabled={busy}
                    onChange={(e) => void saveCourtesyEnabled(e.target.checked)}
                  />
                  Courtesy check-in enabled
                </label>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
                  Add Credit increases the balance. Default courtesy is on; uncheck to suspend.
                </p>
              </section>
            )}

            <section style={{ marginTop: '18px' }}>
              <div
                style={{
                  marginLeft: '-20px',
                  marginRight: '-20px',
                  marginBottom: '10px',
                  padding: '10px 20px',
                  backgroundColor: '#2c3e50',
                  color: '#ffffff',
                }}
              >
                <h4 style={{ margin: 0, color: '#ffffff', fontWeight: 600 }}>Ledger</h4>
              </div>
              {!summary.payments || summary.payments.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>No entries yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {summary.payments.map((p) => (
                    <li
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '10px',
                        padding: '4px 0',
                        borderBottom: '1px solid #f0f0f0',
                        fontSize: '12px',
                        lineHeight: 1.35,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>
                          {formatMoney(p.amountCents)}
                          {' · '}
                          {p.status === 'SUCCEEDED' ? 'PAID' : p.status}
                        </span>
                        <span style={{ color: '#666' }}> · {p.provider}</span>
                        {p.purpose ? (
                          <span style={{ color: '#555' }}> · {p.purpose}</span>
                        ) : null}
                        {(p.creditAppliedCents ?? 0) > 0 ? (
                          <span style={{ color: '#666' }}>
                            {' · '}credit {formatMoney(p.creditAppliedCents ?? 0)}
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          color: '#888',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          fontSize: '11px',
                        }}
                      >
                        {formatClubDateTime(p.recordedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default MemberPlanScreen;
