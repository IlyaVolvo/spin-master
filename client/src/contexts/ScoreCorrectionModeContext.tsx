import React, { createContext, useContext } from 'react';
import { useControlKeyHeld } from '../hooks/useControlKeyHeld';
import { isOrganizer } from '../utils/auth';

interface ScoreCorrectionModeContextValue {
  activeChecked: boolean;
  completedChecked: boolean;
}

const ScoreCorrectionModeContext = createContext<ScoreCorrectionModeContextValue>({
  activeChecked: false,
  completedChecked: false,
});

export function ScoreCorrectionModeProvider({
  children,
  activeChecked,
  completedChecked,
}: {
  children: React.ReactNode;
  activeChecked: boolean;
  completedChecked: boolean;
}) {
  return (
    <ScoreCorrectionModeContext.Provider value={{ activeChecked, completedChecked }}>
      {children}
    </ScoreCorrectionModeContext.Provider>
  );
}

/** Ctrl held is equivalent to both section edit toggles being on. */
export function useScoreCorrectionModeActive(tournamentStatus?: string): boolean {
  const { activeChecked, completedChecked } = useContext(ScoreCorrectionModeContext);
  const controlKeyHeld = useControlKeyHeld();
  const organizer = isOrganizer();
  if (!organizer) return false;

  const sectionChecked =
    tournamentStatus === 'COMPLETED' ? completedChecked : activeChecked;
  return controlKeyHeld || sectionChecked;
}
