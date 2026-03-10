import { useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useCliStatusContext } from '../contexts/CliStatusContext';
import {
  ChecklistItem,
  ChecklistSkeletonList,
} from '../components/onboarding';
import { OnboardingErrorBoundary } from '../components/common/OnboardingErrorBoundary';
import { ToastContainer } from '../components/common/Toast';
import { OnboardingChecklistItem } from '../types/onboarding';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../hooks/useToast';

function OnboardingContent() {
  const navigate = useNavigate();
  const { cliStatus, isLoading, error, refetch, isReady } =
    useCliStatusContext();
  const logout = useAuthStore((state) => state.logout);
  const { toasts, showToast, removeToast } = useToast();
  const { t } = useTranslation('auth');

  const handleCopySuccess = useCallback(() => {
    showToast({ message: t('onboarding.copiedToast'), type: 'success' });
  }, [showToast, t]);

  const handleCopyError = useCallback(() => {
    showToast({ message: t('onboarding.copyErrorToast'), type: 'error' });
  }, [showToast, t]);

  // 필수 항목 완료 시 자동 이동 (AC5) - 부드러운 전환
  useEffect(() => {
    if (isReady) {
      // 약간의 딜레이로 사용자가 완료 상태를 인지할 수 있도록 함
      const timer = setTimeout(() => {
        navigate('/', { replace: true });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReady, navigate]);

  // 체크리스트 아이템 생성
  const checklistItems: OnboardingChecklistItem[] = useMemo(() => {
    if (!cliStatus) return [];

    return [
      {
        id: 'cli-installed',
        label: t('onboarding.checklist.cliInstalled.label'),
        status: cliStatus.cliInstalled ? 'complete' : 'incomplete',
        description: t('onboarding.checklist.cliInstalled.description'),
        command: cliStatus.setupCommands.install,
      },
      {
        id: 'authenticated',
        label: t('onboarding.checklist.authenticated.label'),
        status: cliStatus.authenticated ? 'complete' : 'incomplete',
        description: t('onboarding.checklist.authenticated.description'),
        command: cliStatus.setupCommands.login,
      },
      {
        id: 'api-key',
        label: t('onboarding.checklist.apiKey.label'),
        status: cliStatus.apiKeySet ? 'complete' : 'optional',
        description: t('onboarding.checklist.apiKey.description'),
        command: cliStatus.setupCommands.apiKey,
        isOptional: true,
      },
    ];
  }, [cliStatus, t]);

  // 뒤로가기 (로그아웃 후 로그인 페이지로) (AC6)
  const handleBack = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  // 상태 다시 확인 핸들러
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#1c2129] transition-colors duration-200">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-[#253040]">
        <button
          onClick={handleBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#263240] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#1c2129]"
          aria-label={t('onboarding.backButton')}
        >
          <ArrowLeft
            className="w-5 h-5 text-gray-600 dark:text-gray-300"
            aria-hidden="true"
          />
        </button>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t('onboarding.headerTitle')}
        </h1>
      </header>

      {/* Main Content */}
      <main
        className="flex-grow flex flex-col items-center justify-center p-6"
        role="main"
        aria-labelledby="onboarding-title"
      >
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h2
              id="onboarding-title"
              className="text-2xl font-bold text-gray-900 dark:text-white"
            >
              {t('onboarding.title')}
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              {t('onboarding.subtitle')}
            </p>
          </div>

          {/* Loading State - 스켈레톤 UI */}
          {isLoading && <ChecklistSkeletonList count={3} />}

          {/* Error State */}
          {error && (
            <div
              className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 animate-fadeIn"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Checklist - 애니메이션 적용 */}
          {!isLoading && cliStatus && (
            <div
              className="space-y-3 animate-fadeIn"
              role="list"
              aria-label={t('onboarding.checklist.ariaLabel')}
            >
              {checklistItems.map((item, index) => (
                <div
                  key={item.id}
                  className="animate-slideUp"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <ChecklistItem
                    item={item}
                    onCopySuccess={handleCopySuccess}
                    onCopyError={handleCopyError}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Refresh Button (AC4) */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#1c2129]"
            aria-label={isLoading ? t('onboarding.refreshLoadingAria') : t('onboarding.refreshAria')}
            aria-busy={isLoading}
          >
            <RefreshCw
              className={`w-4 h-4 transition-transform ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isLoading ? t('onboarding.refreshLoading') : t('onboarding.refreshButton')}
          </button>

          {/* CLI Error Message */}
          {cliStatus?.error && (
            <p
              className="text-sm text-center text-gray-500 dark:text-gray-300"
              role="status"
            >
              {cliStatus.error}
            </p>
          )}

          {/* 완료 안내 메시지 (isReady 시 표시) */}
          {isReady && (
            <div
              className="text-center text-green-600 dark:text-green-400 animate-fadeIn"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium">
                {t('onboarding.completionMessage')}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 토스트 알림 컨테이너 */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

/**
 * OnboardingPage - ErrorBoundary로 래핑된 최종 컴포넌트
 */
export function OnboardingPage() {
  return (
    <OnboardingErrorBoundary>
      <OnboardingContent />
    </OnboardingErrorBoundary>
  );
}
