/**
 * useThrottle Hook - Throttles a value with leading + trailing edges
 *
 * Unlike debounce (which delays until input stops), throttle provides:
 * - Leading edge: first change renders immediately (no delay)
 * - Trailing edge: after the interval, renders the latest accumulated value
 *
 * This prevents the "burst rendering" problem where continuous updates
 * never trigger a render (debounce keeps resetting its timer).
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Throttle a rapidly-changing value so it updates at most once per interval.
 * @param value The value to throttle
 * @param interval Throttle interval in milliseconds (0 for immediate passthrough)
 * @returns The throttled value
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Immediate passthrough when interval is 0
    if (interval === 0) {
      setThrottledValue(value);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= interval) {
      // Enough time has passed — update immediately (leading edge)
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      // Schedule trailing edge update
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
        timeoutRef.current = null;
      }, interval - elapsed);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, interval]);

  return throttledValue;
}
