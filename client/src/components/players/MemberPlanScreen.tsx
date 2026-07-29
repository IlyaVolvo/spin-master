import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { isAdmin } from '../../utils/auth';
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
  };
  current: EntitlementView | null;
  future: EntitlementView | null;
  purchaseCreditCents: number;
  autoRenewEnabled: boolean;
  autoRenewFamilyKey: string | null;
  futureReimburseCents: number;
  canPurchase: boolean;
  pendingPayment: { id: number; status: string; amountCents: number; purpose: string } | null;
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

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function entitlementDetail(e: EntitlementView): string {
  if (e.type === 'VISIT_PACK') {
    return `${e.visitsRemaining ?? 0}/${e.visitsTotal ?? '?'} visits`;
  }
  const to = e.validTo ? new Date(e.validTo).toLocaleDateString() : '—';
  const from = new Date(e.validFrom).toLocaleDateString();
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
    return 'Auto-renew is on for the current plan — Extend for Future is unavailable.';
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
  const [startDate, setStartDate] = useState(todayYmdLocal);
  const paymentAbortRef = useRef<AbortController | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      paymentAbortRef.current?.abort();
      paymentAbortRef.current = null;
    };
  }, []);

  const handleClose = () => {
    closedRef.current = true;
    paymentAbortRef.current?.abort();
    paymentAbortRef.current = null;
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
      setCreditDraft(String((nextSummary.purchaseCreditCents || 0) / 100));
      setSelectedFamilyKey((prev) => {
        if (prev && nextPlans.some((p) => p.familyKey === prev)) return prev;
        return nextPlans[0]?.familyKey || '';
      });
      if (opts?.applyPendingHighlight && nextSummary.pendingPayment) {
        setPurchaseLineState('pending');
        setStatusTarget(nextSummary.current ? 'future' : 'current');
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
  const canPurchase = summary?.canPurchase === true;
  const blockReason = summary ? purchaseBlockReason(summary) : null;
  const actionLabel = hasCurrent ? 'Extend for Future' : 'Purchase';
  const showStartDate =
    !hasCurrent && selectedPlan?.kind === 'TIME' && canPurchase;

  useEffect(() => {
    if (showStartDate && !startDate) {
      setStartDate(todayYmdLocal());
    }
  }, [showStartDate, startDate]);

  const purchase = async () => {
    if (!summary || !selectedPlan || !canPurchase) return;
    if (showStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError('Choose a valid plan start date');
      return;
    }
    const target: 'current' | 'future' = hasCurrent ? 'future' : 'current';
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
      const res = await api.post('/payments/checkout', {
        memberId,
        familyKey: selectedPlan.familyKey,
        kind: 'plan',
        autoRenew: summary.autoRenewEnabled,
        ...(showStartDate ? { startDate } : {}),
      });
      const paymentId = Number(res.data?.paymentId);
      if (!paymentId) {
        throw new Error('No payment id returned');
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
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('Enter a valid credit amount');
        return;
      }
      await api.post(`/club/members/${memberId}/plan/credit`, {
        purchaseCreditCents: Math.round(dollars * 100),
      });
      setMessage('Credit updated');
      await load({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to set credit'));
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
    if (enabled && summary.future) {
      setError('Auto-renew cannot be enabled while a future plan is queued');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.patch(`/club/members/${memberId}/plan/auto-renew`, {
        enabled,
        familyKey: summary.current.familyKey || summary.autoRenewFamilyKey || undefined,
      });
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
  const purchasePanelTone: PurchaseLineState =
    purchaseLineState !== 'idle'
      ? purchaseLineState
      : summary?.pendingPayment
        ? 'pending'
        : 'idle';

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
          <h3 style={{ margin: 0 }}>Plan — {name}</h3>
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
              {' · '}
              Credit: {formatMoney(summary.purchaseCreditCents)}
            </p>

            <section style={{ marginTop: '14px' }}>
              <h4 style={{ margin: '0 0 6px' }}>Current plan</h4>
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
                      cursor: busy || summary.future ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      opacity: summary.future ? 0.55 : 1,
                    }}
                    title={
                      summary.future
                        ? 'Auto-renew is unavailable while a future plan is queued'
                        : 'Auto-renew this plan when it ends'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={summary.autoRenewEnabled && !summary.future}
                      disabled={busy || Boolean(summary.future)}
                      onChange={(e) => void toggleAutoRenew(e.target.checked)}
                    />
                    Auto-renew
                  </label>
                  <EntitlementLine entitlement={summary.current} tone={currentTone} />
                </div>
              ) : purchasePanelTone === 'pending' && statusTarget === 'current' ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#546e7a',
                    ...statusPanelStyle('pending'),
                  }}
                >
                  Purchase pending…
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>None</p>
              )}
              {summary.current && summary.future && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#666' }}>
                  Auto-renew is off while a future plan is selected.
                </p>
              )}
            </section>

            <section style={{ marginTop: '12px' }}>
              <h4 style={{ margin: '0 0 6px' }}>Next plan</h4>
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
              ) : purchasePanelTone === 'pending' && statusTarget === 'future' ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#546e7a',
                    ...statusPanelStyle('pending'),
                  }}
                >
                  Extension pending…
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>None</p>
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

            {admin && (
              <section style={{ marginTop: '14px' }}>
                <h4 style={{ margin: '0 0 6px' }}>Admin credit</h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={creditDraft}
                    onChange={(e) => setCreditDraft(e.target.value)}
                    style={{ width: '100px', padding: '6px' }}
                    disabled={busy}
                  />
                  <button type="button" disabled={busy} onClick={() => void saveCredit()}>
                    Set credit ($)
                  </button>
                </div>
              </section>
            )}

            <section style={{ marginTop: '18px' }}>
              <h4 style={{ margin: '0 0 6px' }}>{hasCurrent ? 'Extend for Future' : 'Purchase'}</h4>
              {blockReason && (
                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#a65b00' }}>{blockReason}</p>
              )}

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  transition: 'background-color 0.2s ease',
                  opacity: canPurchase || purchasePanelTone !== 'idle' ? 1 : 0.65,
                  ...statusPanelStyle(purchasePanelTone),
                  border:
                    purchasePanelTone === 'idle'
                      ? '1px solid #ccc'
                      : statusPanelStyle(purchasePanelTone).border,
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Plan
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
                  </p>
                )}

                {showStartDate && (
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      First day
                    </span>
                    <input
                      type="date"
                      value={startDate}
                      min={todayYmdLocal()}
                      disabled={busy}
                      onChange={(e) => setStartDate(e.target.value || todayYmdLocal())}
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
                  className={purchasePanelTone === 'idle' ? 'success' : undefined}
                  disabled={busy || (!canPurchase && purchasePanelTone === 'idle') || !selectedPlan}
                  onClick={() => void purchase()}
                  style={purchaseButtonStyle(purchasePanelTone, busy)}
                >
                  {busy && purchasePanelTone === 'pending'
                    ? 'Processing…'
                    : purchasePanelTone === 'failed'
                      ? 'Failed — retry'
                      : purchasePanelTone === 'confirmed'
                        ? 'Purchased'
                        : actionLabel}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default MemberPlanScreen;
