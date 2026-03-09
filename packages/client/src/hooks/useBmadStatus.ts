/**
 * useBmadStatus - BMad project status data fetching hook
 * [Source: Story 12.2 - Task 2]
 *
 * Uses a module-level cache so HMR remounts don't flash a loading skeleton.
 */

import { useState, useEffect, useCallback } from 'react';
import type { BmadStatusResponse } from '@hammoc/shared';
import i18n from '../i18n';
import { bmadStatusApi } from '../services/api/bmadStatus.js';
import { ApiError } from '../services/api/client.js';

export interface UseBmadStatusReturn {
  data: BmadStatusResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  retry: () => void;
}

// Module-level cache survives HMR remounts (Vite preserves module state).
const cache = new Map<string, BmadStatusResponse>();

export function useBmadStatus(projectSlug: string | undefined): UseBmadStatusReturn {
  const cached = projectSlug ? cache.get(projectSlug) ?? null : null;
  const [data, setData] = useState<BmadStatusResponse | null>(cached);
  const [isLoading, setIsLoading] = useState<boolean>(() => !!projectSlug && !cached);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!projectSlug) return;

    let cancelled = false;
    // Only show loading skeleton on first load (no cached data).
    // On HMR / retry, stale data stays visible while revalidating.
    const hasCachedData = cache.has(projectSlug);
    if (!hasCachedData) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    bmadStatusApi
      .getStatus(projectSlug)
      .then((res) => {
        if (!cancelled) {
          cache.set(projectSlug, res);
          setData(res);
          setIsLoading(false);
          setIsRefreshing(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(i18n.t('notification:bmadStatus.loadError'));
          }
          setIsLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectSlug, retryCount]);

  return { data, isLoading, isRefreshing, error, retry };
}
