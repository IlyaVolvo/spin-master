import { useCallback, useRef } from 'react';

/** Ref + reset for Shift+range “last clicked” anchor in multi-select lists. */
export function useShiftRangeAnchor() {
  const anchorRef = useRef<number | null>(null);
  const resetAnchor = useCallback(() => {
    anchorRef.current = null;
  }, []);
  return { anchorRef, resetAnchor };
}
