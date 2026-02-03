/**
 * useClickOutside Hook
 * Detect clicks outside of a specified element
 * [Source: Story 2.4 - Task 6]
 */

import { RefObject, useEffect } from 'react';

/**
 * Hook to detect clicks outside of a referenced element
 * @param ref - Ref to the element to detect outside clicks for
 * @param handler - Callback function to call when outside click is detected
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void
): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      // Ignore if ref is not set or click is inside the element
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    };

    // Handle both mouse and touch events for mobile support
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
