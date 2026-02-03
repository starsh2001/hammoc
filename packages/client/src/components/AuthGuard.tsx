/**
 * AuthGuard - Protected route wrapper with CLI status check
 * [Source: Story 2.2 - Task 8, Story 2.6 - Task 5]
 *
 * 역할:
 * 1. 사용자 인증 확인 -> 미인증 시 /login으로 리다이렉트
 * 2. CLI 상태 확인 -> 미설정 시 /onboarding으로 리다이렉트
 * 3. CLI 상태를 Context로 제공 -> 하위 컴포넌트에서 재사용
 */

import { useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api/client';
import type { CLIStatusResponse } from '@bmad-studio/shared';
import { CliStatusProvider } from '../contexts/CliStatusContext';
import { LoadingSpinner } from './LoadingSpinner';

/** Cache validity duration in milliseconds (5 minutes) */
const CLI_STATUS_CACHE_DURATION_MS = 5 * 60 * 1000;

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore();
  const location = useLocation();

  // CLI 상태 관리
  const [cliStatus, setCliStatus] = useState<CLIStatusResponse | null>(null);
  const [cliLoading, setCLILoading] = useState(true);
  const [cliError, setCLIError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Cache timestamp for CLI status
  const cliStatusCachedAtRef = useRef<number | null>(null);

  // CLI 상태 조회 함수 (재사용 가능)
  const fetchCliStatus = useCallback(async (forceRefresh = false) => {
    // Check if cache is valid
    if (
      !forceRefresh &&
      cliStatus &&
      cliStatusCachedAtRef.current &&
      Date.now() - cliStatusCachedAtRef.current < CLI_STATUS_CACHE_DURATION_MS
    ) {
      // Use cached data
      setCLILoading(false);
      return;
    }

    setCLILoading(true);
    setCLIError(null);
    try {
      const status = await api.get<CLIStatusResponse>('/cli-status');
      setCliStatus(status);
      cliStatusCachedAtRef.current = Date.now();
      const needsSetup = !status.cliInstalled || !status.authenticated;
      setNeedsOnboarding(needsSetup);
    } catch (err) {
      setCLIError(err instanceof Error ? err.message : 'CLI 상태 확인 실패');
      setNeedsOnboarding(true); // 에러 시 안전하게 Onboarding으로
    } finally {
      setCLILoading(false);
    }
  }, [cliStatus]);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 인증 상태 변경 또는 경로 변경 시 CLI 상태 확인
  useEffect(() => {
    if (isAuthenticated && !authLoading && location.pathname !== '/onboarding') {
      fetchCliStatus();
    } else if (location.pathname === '/onboarding') {
      // Onboarding 페이지에서는 로딩 완료 상태로 설정
      setCLILoading(false);
    }
  }, [isAuthenticated, authLoading, location.pathname, fetchCliStatus]);

  // 1. 인증 로딩 중
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // 2. 미인증 → 로그인 페이지
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. CLI 상태 확인 중 (Onboarding 페이지가 아닌 경우에만)
  if (cliLoading && location.pathname !== '/onboarding') {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"
        role="status"
        aria-label="로딩 중"
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            CLI 상태 확인 중...
          </p>
        </div>
      </div>
    );
  }

  // 4. Onboarding 필요 → Onboarding 페이지 (현재 경로가 아닌 경우)
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // 5. CLI 상태를 Context로 제공하여 하위 컴포넌트에서 재사용
  const cliStatusValue = {
    cliStatus,
    isLoading: cliLoading,
    error: cliError,
    refetch: fetchCliStatus,
    isReady: cliStatus?.cliInstalled === true && cliStatus?.authenticated === true,
  };

  return (
    <CliStatusProvider value={cliStatusValue}>{children}</CliStatusProvider>
  );
}
