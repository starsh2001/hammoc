import { useEffect, useRef } from 'react';

/**
 * Module-level flag to prevent overlays from interfering with each other.
 * When an overlay closes programmatically (X button, Escape) and calls
 * history.back(), the resulting popstate event should NOT trigger other
 * overlays to close.
 */
let _programmaticBack = false;

/** Auto-incrementing ID so each pushState gets a unique overlay identifier. */
let _nextOverlayId = 0;

/**
 * Intercepts browser back/forward navigation for overlay management.
 * - Open:    pushState adds an overlay history entry (with unique ID)
 * - Back:    popstate closes the overlay; forward entry remains for reopen
 * - Forward: popstate reopens the overlay ONLY if the entry's ID matches
 * - Normal close (X, Escape): history.back() removes the entry cleanly
 */
export function useOverlayBackHandler(
  isOpen: boolean,
  onClose: () => void,
  onReopen?: () => void,
) {
  const isOpenRef = useRef(isOpen);
  const stateRef = useRef<'idle' | 'pushed' | 'popped'>('idle');
  /** The unique ID of the history entry this overlay last pushed. */
  const myIdRef = useRef<number | null>(null);
  isOpenRef.current = isOpen;

  // Persistent popstate listener (survives open/close toggles)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // Skip popstate events triggered by another overlay's programmatic close
      if (_programmaticBack) return;

      if (
        e.state?.__overlayId === myIdRef.current &&
        !isOpenRef.current &&
        onReopen
      ) {
        // Forward into THIS overlay's entry while closed → reopen
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
        const id = ++_nextOverlayId;
        myIdRef.current = id;
        window.history.pushState({ __overlay: true, __overlayId: id }, '');
        stateRef.current = 'pushed';
      }
    } else if (stateRef.current === 'pushed') {
      // Closed normally (X, Escape) — remove the overlay entry
      stateRef.current = 'idle';
      _programmaticBack = true;
      window.history.back();
      // Reset flag after the popstate event from this back() is processed.
      // The reset listener is registered after all overlay handlers (which were
      // registered earlier during mount), so it fires last — ensuring all
      // handlers see the flag as true before it's cleared.
      const reset = () => {
        _programmaticBack = false;
        window.removeEventListener('popstate', reset);
      };
      window.addEventListener('popstate', reset);
    }
    // If 'popped' (closed via back), the forward entry stays for reopen
  }, [isOpen]);
}
