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
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (disabled || isRefreshingRef.current) return;
      if (container.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      isPullingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || disabled) return;

      // If container scrolled during this gesture, cancel pull
      if (container.scrollTop > 0) {
        isPullingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;

      if (distance <= 0) {
        // Finger moving up = scrolling down, not a pull gesture
        isPullingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      // Apply resistance (diminishing returns)
      const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
      pullDistanceRef.current = resistedDistance;
      setPullDistance(resistedDistance);
      e.preventDefault();
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

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
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, threshold]);

  return { containerRef, isPulling: pullDistance > 0, pullDistance, isRefreshing };
}
