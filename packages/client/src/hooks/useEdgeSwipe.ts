/**
 * useEdgeSwipe - Detect edge swipe gestures on mobile to open/close the quick panel
 *
 * Swipe from left edge → open panel
 * Swipe from right edge → open panel
 * Swipe toward an edge while panel is open → close panel
 */

import { useEffect, useRef } from 'react';

interface EdgeSwipeOptions {
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** Whether edge swipe should be active (typically isMobile) */
  enabled: boolean;
  /** Called when user swipes from an edge to open the panel (direction = swipe origin edge) */
  onOpen: (from: 'left' | 'right') => void;
  /** Called when user swipes toward the edge to close the panel (direction = swipe destination edge) */
  onClose: (toward: 'left' | 'right') => void;
}

/** Width of the edge detection zone (px) */
const EDGE_THRESHOLD = 24;
/** Minimum horizontal distance to qualify as a swipe (px) */
const MIN_SWIPE_DISTANCE = 50;
/** Maximum vertical distance — beyond this it's a scroll, not a swipe (px) */
const MAX_VERTICAL_DRIFT = 80;
export function useEdgeSwipe({ isOpen, enabled, onOpen, onClose }: EdgeSwipeOptions) {
  const touchState = useRef<{
    x: number;
    y: number;
    fromEdge: 'left' | 'right' | null;
    identifier: number | null;
  }>({
    x: 0,
    y: 0,
    fromEdge: null,
    identifier: null,
  });

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore multi-touch starts (pinch/zoom)
      if (e.touches.length > 1) {
        touchState.current.identifier = null;
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const x = touch.clientX;
      const screenWidth = window.innerWidth;

      let fromEdge: 'left' | 'right' | null = null;
      if (x <= EDGE_THRESHOLD) {
        fromEdge = 'left';
      } else if (x >= screenWidth - EDGE_THRESHOLD) {
        fromEdge = 'right';
      }

      touchState.current = {
        x,
        y: touch.clientY,
        fromEdge,
        identifier: touch.identifier,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Match the tracked touch by identifier
      const trackId = touchState.current.identifier;
      if (trackId === null) return;

      let touch: Touch | undefined;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === trackId) {
          touch = e.changedTouches[i];
          break;
        }
      }
      if (!touch) return;

      // Reset tracked identifier
      touchState.current.identifier = null;

      const dx = touch.clientX - touchState.current.x;
      const dy = Math.abs(touch.clientY - touchState.current.y);

      // Ignore vertical scrolls
      if (dy > MAX_VERTICAL_DRIFT) return;

      const absDx = Math.abs(dx);
      if (absDx < MIN_SWIPE_DISTANCE) return;

      if (!isOpen) {
        // Open gesture: must start from an edge and swipe inward
        const { fromEdge } = touchState.current;
        if (fromEdge === 'left' && dx > 0) {
          onOpen('left');
        } else if (fromEdge === 'right' && dx < 0) {
          onOpen('right');
        }
      } else {
        // Close gesture: swipe must end near an edge
        const endX = touch.clientX;
        const screenWidth = window.innerWidth;
        const CLOSE_EDGE = 60;
        if (endX <= CLOSE_EDGE) {
          onClose('left');
        } else if (endX >= screenWidth - CLOSE_EDGE) {
          onClose('right');
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, isOpen, onOpen, onClose]);
}
