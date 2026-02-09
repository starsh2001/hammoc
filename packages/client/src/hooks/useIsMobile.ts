/**
 * Detects mobile viewport based on Tailwind `md:` breakpoint (768px).
 * Uses `window.matchMedia('(max-width: 767px)')` with real-time change listener.
 * SSR-safe: returns `false` when `window` is undefined.
 *
 * @returns `true` if viewport width < 768px (mobile), `false` otherwise (desktop)
 */

import { useState, useEffect } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(MOBILE_QUERY);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}
