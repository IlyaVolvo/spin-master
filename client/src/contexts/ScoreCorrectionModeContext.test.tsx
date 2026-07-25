import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ScoreCorrectionModeProvider,
  useScoreCorrectionModeActive,
} from './ScoreCorrectionModeContext';

vi.mock('../hooks/useControlKeyHeld', () => ({
  useControlKeyHeld: () => false,
}));

vi.mock('../utils/auth', () => ({
  isOrganizer: () => true,
}));

function wrapper(activeChecked: boolean, completedChecked: boolean) {
  return ({ children }: { children: React.ReactNode }) => (
    <ScoreCorrectionModeProvider activeChecked={activeChecked} completedChecked={completedChecked}>
      {children}
    </ScoreCorrectionModeProvider>
  );
}

describe('ScoreCorrectionModeContext', () => {
  it('uses section checkbox for active tournaments', () => {
    const { result } = renderHook(() => useScoreCorrectionModeActive('ACTIVE'), {
      wrapper: wrapper(true, false),
    });
    expect(result.current).toBe(true);
  });

  it('uses section checkbox for completed tournaments', () => {
    const { result } = renderHook(() => useScoreCorrectionModeActive('COMPLETED'), {
      wrapper: wrapper(false, true),
    });
    expect(result.current).toBe(true);
  });

  it('does not cross-apply section checkboxes', () => {
    const { result } = renderHook(() => useScoreCorrectionModeActive('COMPLETED'), {
      wrapper: wrapper(true, false),
    });
    expect(result.current).toBe(false);
  });
});
