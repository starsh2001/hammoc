/**
 * useSkeletonCount - Hook to calculate dynamic skeleton count based on viewport height
 * [Source: Story 3.4 - Task 4]
 */

import { useState, useEffect } from 'react';

const SKELETON_ITEM_HEIGHT = 76; // px (padding 16*2 + content ~44)
const HEADER_HEIGHT = 56; // px

export function useSkeletonCount(defaultCount = 5): number {
  const [count, setCount] = useState(defaultCount);

  useEffect(() => {
    const calculateCount = () => {
      const availableHeight = window.innerHeight - HEADER_HEIGHT;
      const calculatedCount = Math.ceil(availableHeight / SKELETON_ITEM_HEIGHT);
      // Min 3, max 10
      setCount(Math.min(Math.max(calculatedCount, 3), 10));
    };

    calculateCount();
    window.addEventListener('resize', calculateCount);
    return () => window.removeEventListener('resize', calculateCount);
  }, []);

  return count;
}
