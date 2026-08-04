import { useCallback, useRef, useState } from 'react';

/**
 * Double-submit guard for mutating UI actions.
 * Ref blocks a second click before React re-renders; `busy` drives disabled UI.
 */
export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const runBusy = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, runBusy };
}
