import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api/client';
import type { CLIStatusResponse } from '@bmad-studio/shared';

interface UseCliStatusOptions {
  skip?: boolean; // true일 경우 자동 fetch 건너뜀
  pollingInterval?: number; // 자동 폴링 간격 (ms), 최소 30000 권장
}

interface UseCliStatusResult {
  cliStatus: CLIStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isReady: boolean; // 필수 항목 모두 완료 여부
}

/**
 * CLI 상태를 조회하고 관리하는 커스텀 훅
 *
 * 사용 시나리오:
 * 1. AuthGuard 내부에서 직접 사용 (Context로 제공)
 * 2. CliStatusContext가 없는 환경에서 독립적으로 사용 (fallback)
 *
 * @param options.skip - true일 경우 자동 fetch 건너뜀 (Context에서 상태 받을 때)
 * @param options.pollingInterval - 자동 폴링 간격 (ms), 설정 시 주기적으로 상태 확인
 *
 * @example
 * // 기본 사용 (수동 새로고침만)
 * const { cliStatus, refetch } = useCliStatus();
 *
 * @example
 * // 30초 간격 자동 폴링
 * const { cliStatus } = useCliStatus({ pollingInterval: 30000 });
 */
export function useCliStatus(options?: UseCliStatusOptions): UseCliStatusResult {
  const [cliStatus, setCliStatus] = useState<CLIStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(!options?.skip);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasDataRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    // Only show loading when there's no cached status.
    if (!hasDataRef.current) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const status = await api.get<CLIStatusResponse>('/cli-status');
      hasDataRef.current = true;
      setCliStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CLI 상태 확인 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 초기 fetch
  useEffect(() => {
    if (!options?.skip) {
      fetchStatus();
    }
  }, [fetchStatus, options?.skip]);

  // 자동 폴링 (Optional Enhancement)
  useEffect(() => {
    if (options?.pollingInterval && !options?.skip) {
      // 최소 간격 검증 (서버 부하 방지)
      const interval = Math.max(options.pollingInterval, 30000);

      pollingRef.current = setInterval(() => {
        fetchStatus();
      }, interval);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [options?.pollingInterval, options?.skip, fetchStatus]);

  // 필수 항목: cliInstalled && authenticated (apiKeySet은 선택)
  const isReady =
    cliStatus?.cliInstalled === true && cliStatus?.authenticated === true;

  return {
    cliStatus,
    isLoading,
    error,
    refetch: fetchStatus,
    isReady,
  };
}
