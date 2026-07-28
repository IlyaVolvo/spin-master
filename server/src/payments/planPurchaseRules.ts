/** Trial plan families are admin-only (by familyKey or display name). */
export function isTrialPlanFamily(
  familyKey: string | null | undefined,
  name?: string | null,
): boolean {
  const key = (familyKey || '').trim().toLowerCase();
  const label = (name || '').trim().toLowerCase();
  return key === 'trial' || key.includes('trial') || label === 'trial' || label.includes('trial');
}

export function planAllowsMemberPurchase(opts: {
  hasCurrent: boolean;
  hasFuture: boolean;
  autoRenewEnabled: boolean;
  hasPendingPayment?: boolean;
}): boolean {
  if (opts.hasFuture) return false;
  if (opts.hasPendingPayment) return false;
  if (opts.hasCurrent && opts.autoRenewEnabled) return false;
  return true;
}

export function describePurchaseBlockReason(opts: {
  hasCurrent: boolean;
  hasFuture: boolean;
  autoRenewEnabled: boolean;
  hasPendingPayment?: boolean;
}): string | null {
  if (opts.hasPendingPayment) return 'A payment is already in progress.';
  if (opts.hasFuture) return 'A next plan is already queued.';
  if (opts.hasCurrent && opts.autoRenewEnabled) {
    return 'Auto-renew is on — the next period renews automatically.';
  }
  return null;
}
