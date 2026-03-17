/**
 * AuthGuard - Protected route wrapper with CLI status check
 * [Source: Story 2.2 - Task 8, Story 2.6 - Task 5]
 *
 * 역할:
 * 1. 사용자 인증 확인 -> 미인증 시 /login으로 리다이렉트
 * 2. CLI 상태 확인 -> 미설정 시 /onboarding으로 리다이렉트
 * 3. CLI 상태를 Context로 제공 -> 하위 컴포넌트에서 재사용
 */

import { useEffect, useState, useCallback, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api, ApiError } from '../services/api/client';
import type { CLIStatusResponse } from '@hammoc/shared';
import { CliStatusProvider } from '../contexts/CliStatusContext';
import { LoadingSpinner } from './LoadingSpinner';

interface AuthGuardProps {
  children: ReactNode;
}

// Module-level flag (persists across component remounts)
let hasFetchedCliStatus = false;
let cachedCliStatus: CLIStatusResponse | null = null;

// Restore from sessionStorage on page reload (avoids redundant CLI checks)
const SESSION_CACHE_KEY = 'cli-status-cache';
const SESSION_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function loadCachedCliStatus(): CLIStatusResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const { status, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > SESSION_CACHE_MAX_AGE_MS) return null;
    // Only trust cache if CLI was ready (don't cache failure states)
    if (status?.authenticated || status?.apiKeySet) return status;
    return null;
  } catch {
    return null;
  }
}

function saveCachedCliStatus(status: CLIStatusResponse): void {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ status, timestamp: Date.now() }));
  } catch { /* quota exceeded etc. */ }
}

// Try restoring on module load
const restoredStatus = loadCachedCliStatus();
if (restoredStatus) {
  hasFetchedCliStatus = true;
  cachedCliStatus = restoredStatus;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { t } = useTranslation('common');
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore();
  const location = useLocation();

  // CLI 상태 관리
  const [cliStatus, setCliStatus] = useState<CLIStatusResponse | null>(cachedCliStatus);
  const [cliLoading, setCLILoading] = useState(!hasFetchedCliStatus);
  const [cliError, setCLIError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // CLI 상태 조회 함수 (재사용 가능)
  const fetchCliStatus = useCallback(async (forceRefresh = false) => {
    // Skip if already fetched (unless force refresh)
    if (!forceRefresh && hasFetchedCliStatus) {
      return;
    }

    setCLILoading(true);
    setCLIError(null);

    // Retry up to 2 times on network errors (server may not be ready yet)
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const status = await api.get<CLIStatusResponse>('/cli-status');
        console.log('[AuthGuard] CLI status response:', status);
        setCliStatus(status);
        cachedCliStatus = status;
        hasFetchedCliStatus = true;
        saveCachedCliStatus(status);
        // Only require onboarding if neither authenticated nor API key is set.
        // cliInstalled can be false due to PATH issues even when CLI is actually present.
        const needsSetup = !status.authenticated && !status.apiKeySet;
        setNeedsOnboarding(needsSetup);
        setCLILoading(false);
        return;
      } catch (err) {
        console.error('[AuthGuard] CLI status fetch failed (attempt', attempt + 1, '):', err);

        // 401 = session expired → force re-check auth (will redirect to login)
        if (err instanceof ApiError && err.status === 401) {
          console.warn('[AuthGuard] Session expired during CLI status check, re-checking auth');
          setCLILoading(false);
          useAuthStore.getState().recheckAuth();
          return;
        }

        if (attempt < MAX_RETRIES) {
          // Wait before retrying
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        // All retries exhausted — show error but don't redirect to onboarding
        // for transient network failures (e.g. server just restarted)
        setCLIError(err instanceof Error ? err.message : t('error.cliStatusFailed'));
        setNeedsOnboarding(false);
        setCLILoading(false);
      }
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 인증 완료 후 CLI 상태 확인 (앱 시작 시 한 번만)
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#1c2129]">
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
        className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1c2129]"
        role="status"
        aria-label={t('loading')}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-500 dark:text-gray-300">
            {t('cliStatusChecking')}
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
    isReady: cliStatus?.authenticated === true || cliStatus?.apiKeySet === true,
  };

  return (
    <CliStatusProvider value={cliStatusValue}>{children}</CliStatusProvider>
  );
}
