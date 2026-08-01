const STORAGE_PREFIX = 'checkin_payment_unlock_';

export function storeCheckinPaymentUnlock(memberId: number, unlockToken: string, expiresAt: number): void {
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${memberId}`,
      JSON.stringify({ unlockToken, expiresAt }),
    );
  } catch {
    // sessionStorage may be unavailable
  }
}

export function getCheckinPaymentUnlockToken(memberId: number): string | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${memberId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { unlockToken?: string; expiresAt?: number };
    if (
      typeof parsed.unlockToken !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    ) {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${memberId}`);
      return null;
    }
    return parsed.unlockToken;
  } catch {
    return null;
  }
}

export function clearCheckinPaymentUnlock(memberId: number): void {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${memberId}`);
  } catch {
    // ignore
  }
}
