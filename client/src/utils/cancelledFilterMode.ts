export type CancelledFilterMode = 'hidden' | 'included' | 'only';

const STORAGE_KEY = 'tournaments_cancelledFilter';
const LEGACY_KEY = 'tournaments_showCancelledTournaments';

export function loadCancelledFilterMode(): CancelledFilterMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'hidden' || stored === 'included' || stored === 'only') {
    return stored;
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy !== null) {
    return legacy === 'true' ? 'included' : 'hidden';
  }
  return 'hidden';
}

export function saveCancelledFilterMode(mode: CancelledFilterMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  localStorage.removeItem(LEGACY_KEY);
}

/** hidden → included (click) or only (shift+click); only → hidden (click); included → hidden or only. */
export function nextCancelledFilterMode(
  current: CancelledFilterMode,
  shiftKey: boolean,
): CancelledFilterMode {
  if (current === 'only') return 'hidden';
  if (current === 'hidden') return shiftKey ? 'only' : 'included';
  return shiftKey ? 'only' : 'hidden';
}

export function cancelledFilterToTriState(mode: CancelledFilterMode): 'off' | 'on' | 'partial' {
  if (mode === 'included') return 'on';
  if (mode === 'only') return 'partial';
  return 'off';
}
