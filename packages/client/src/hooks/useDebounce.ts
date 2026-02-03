/**
 * useDebounce Hook - Debounces a value with configurable delay
 * [Source: Story 4.5 - Task 3]
 *
 * Features:
 * - Generic type support
 * - Configurable delay
 * - Immediate return when delay is 0
 * - Proper cleanup on unmount
 */

import { useState, useEffect } from 'react';

/**
 * Debounce a value by a specified delay
 * @param value The value to debounce
 * @param delay Delay in milliseconds (0 for immediate return)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // If delay is 0, update immediately
    if (delay === 0) {
      setDebouncedValue(value);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
