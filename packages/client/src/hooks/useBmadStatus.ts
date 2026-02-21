/**
 * useBmadStatus - BMad project status data fetching hook
 * [Source: Story 12.2 - Task 2]
 */

import { useState, useEffect, useCallback } from 'react';
import type { BmadStatusResponse } from '@bmad-studio/shared';
import { bmadStatusApi } from '../services/api/bmadStatus.js';
import { ApiError } from '../services/api/client.js';

export interface UseBmadStatusReturn {
  data: BmadStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useBmadStatus(projectSlug: string | undefined): UseBmadStatusReturn {
  const [data, setData] = useState<BmadStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !!projectSlug);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!projectSlug) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    bmadStatusApi
      .getStatus(projectSlug)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('BMad 프로젝트 현황을 불러오는 중 오류가 발생했습니다.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectSlug, retryCount]);

  return { data, isLoading, error, retry };
}
