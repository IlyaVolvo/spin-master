import { useEffect, useState } from 'react';

/** Tracks whether the Control key is currently held (resets on window blur). */
export function useControlKeyHeld(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      setHeld(e.ctrlKey);
    };
    const onBlur = () => setHeld(false);

    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return held;
}
