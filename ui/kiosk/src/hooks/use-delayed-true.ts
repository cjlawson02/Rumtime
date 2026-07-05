import { useEffect, useRef, useState } from 'react';

/** Returns true after `delayMs` while `active` stays true. Resets when inactive. */
export function useDelayedTrue(active: boolean, delayMs: number): boolean {
  const [value, setValue] = useState(false);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;

    const timer = window.setTimeout(() => {
      if (activeRef.current) setValue(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      setValue(false);
    };
  }, [active, delayMs]);

  return active && value;
}
