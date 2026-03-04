import { useEffect, useRef } from 'react';

/**
 * Intercepts browser back/forward navigation for overlay management.
 * - Open:    pushState adds an overlay history entry
 * - Back:    popstate closes the overlay; forward entry remains for reopen
 * - Forward: popstate reopens the overlay (if onReopen provided)
 * - Normal close (X, Escape): history.back() removes the entry cleanly
 */
export function useOverlayBackHandler(
  isOpen: boolean,
  onClose: () => void,
  onReopen?: () => void,
) {
  const isOpenRef = useRef(isOpen);
  const stateRef = useRef<'idle' | 'pushed' | 'popped'>('idle');
  isOpenRef.current = isOpen;

  // Persistent popstate listener (survives open/close toggles)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.__overlay && !isOpenRef.current && onReopen) {
        // Forward into overlay state while closed → reopen
        stateRef.current = 'pushed';
        onReopen();
      } else if (isOpenRef.current && stateRef.current === 'pushed') {
        // Back from overlay state → close
        stateRef.current = 'popped';
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose, onReopen]);

  // Push/pop history entry when overlay opens/closes
  useEffect(() => {
    if (isOpen) {
      if (stateRef.current !== 'pushed') {
        window.history.pushState({ __overlay: true }, '');
        stateRef.current = 'pushed';
      }
    } else if (stateRef.current === 'pushed') {
      // Closed normally (X, Escape) — remove the overlay entry
      stateRef.current = 'idle';
      window.history.back();
    }
    // If 'popped' (closed via back), the forward entry stays for reopen
  }, [isOpen]);
}
