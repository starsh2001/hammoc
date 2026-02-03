/**
 * SessionListPage - Page component for displaying session list
 * [Source: Story 3.4 - Task 4]
 */

import { useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Plus } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { SessionListItem } from '../components/SessionListItem';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { SessionListItemSkeleton } from '../components/SessionListItemSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useSkeletonCount } from '../hooks/useSkeletonCount';

const PULL_THRESHOLD = 80;

export function SessionListPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const {
    sessions,
    isLoading,
    error,
    errorType,
    isRefreshing,
    fetchSessions,
    setRefreshing,
  } = useSessionStore();
  const skeletonCount = useSkeletonCount(5);

  // Fetch sessions on mount or when projectSlug changes
  useEffect(() => {
    if (projectSlug) {
      fetchSessions(projectSlug);
    }
  }, [projectSlug, fetchSessions]);

  const handleRefresh = useCallback(async () => {
    if (projectSlug) {
      setRefreshing(true);
      await fetchSessions(projectSlug, true);
    }
  }, [projectSlug, fetchSessions, setRefreshing]);

  // Pull-to-refresh hook
  const { containerRef, pullDistance, isRefreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: PULL_THRESHOLD,
    disabled: isLoading || !!error,
  });

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleNewSession = useCallback(() => {
    navigate(`/project/${projectSlug}/session/new`);
  }, [navigate, projectSlug]);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      navigate(`/project/${projectSlug}/session/${sessionId}`);
    },
    [navigate, projectSlug]
  );

  // Error state rendering
  if (error && errorType !== 'none') {
    return (
      <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              aria-label="뒤로 가기"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold truncate text-gray-900 dark:text-white">{projectSlug}</h1>
            <ThemeToggleButton />
          </div>
        </header>

        <ErrorState
          errorType={errorType}
          onRetry={errorType !== 'not_found' ? handleRefresh : undefined}
          onNavigateBack={errorType === 'not_found' ? handleBack : undefined}
        />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header with actions */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
            aria-label="뒤로 가기"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold truncate text-gray-900 dark:text-white">{projectSlug}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <button
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 text-gray-700 dark:text-gray-300"
              aria-label="새로고침"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleNewSession}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              새 세션
            </button>
          </div>
        </div>
      </header>

      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={PULL_THRESHOLD}
        isRefreshing={isPullRefreshing}
      />

      {/* Content area with ref for pull-to-refresh */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {/* Loading state */}
        {isLoading && !isRefreshing && (
          <div className="p-4 space-y-3" aria-label="로딩 중" role="status">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <SessionListItemSkeleton key={index} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <EmptyState
            title="세션이 없습니다"
            description="새 세션을 시작하여 Claude와 대화하세요."
            actionLabel="새 세션 시작"
            onAction={handleNewSession}
          />
        )}

        {/* Session list */}
        {!isLoading && sessions.length > 0 && (
          <div className="p-4 space-y-3">
            {sessions.map((session) => (
              <SessionListItem
                key={session.sessionId}
                session={session}
                onClick={handleSessionClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
