/**
 * usePullToRefresh - Custom hook for pull-to-refresh gesture support
 * [Source: Story 3.4 - Task 4]
 *
 * Uses refs for touch state to keep event listeners stable and avoid
 * re-registration on every state change, which can block scrolling on mobile.
 */

import { useRef, useEffect, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // Pull distance threshold (default: 80px)
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for touch state - keeps event handlers stable
  const startY = useRef(0);
  const isPullingRef = useRef(false);
  const isGestureLockedRef = useRef(false); // true once direction is determined
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Dead zone: ignore small movements to distinguish scroll from pull gesture
  const DEAD_ZONE = 15;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the actual scrollable ancestor (the containerRef element itself
    // may not scroll if a parent handles overflow instead)
    const findScrollParent = (el: HTMLElement): HTMLElement => {
      let parent = el.parentElement;
      while (parent && parent !== document.documentElement) {
        const { overflowY } = getComputedStyle(parent);
        if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return document.documentElement;
    };

    const scrollTarget = container.scrollHeight > container.clientHeight ? container : findScrollParent(container);

    // Non-passive touchmove handler — only added dynamically during pull gesture
    // to avoid blocking normal scroll in all directions
    const handlePullMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;

      // If scrolled or finger moving up, cancel pull
      if (scrollTarget.scrollTop > 0 || distance <= 0) {
        isPullingRef.current = false;
        isGestureLockedRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        container.removeEventListener('touchmove', handlePullMove);
        return;
      }

      // Dead zone: don't activate pull until finger moves past threshold
      if (!isGestureLockedRef.current) {
        if (distance < DEAD_ZONE) return;
        isGestureLockedRef.current = true;
      }

      // Apply resistance (diminishing returns)
      const adjustedDistance = distance - DEAD_ZONE;
      const resistedDistance = Math.min(adjustedDistance * 0.5, threshold * 1.5);
      pullDistanceRef.current = resistedDistance;
      setPullDistance(resistedDistance);
      e.preventDefault();
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (disabled || isRefreshingRef.current) return;
      if (scrollTarget.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      isPullingRef.current = true;
      isGestureLockedRef.current = false;
      // Attach non-passive handler only when pull is possible (at top)
      container.addEventListener('touchmove', handlePullMove, { passive: false });
    };

    const handleTouchEnd = async () => {
      container.removeEventListener('touchmove', handlePullMove);
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      isGestureLockedRef.current = false;

      if (pullDistanceRef.current >= threshold && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(threshold);

        try {
          await onRefreshRef.current();
        } finally {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handlePullMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, threshold]);

  return { containerRef, isPulling: pullDistance > 0, pullDistance, isRefreshing };
}
