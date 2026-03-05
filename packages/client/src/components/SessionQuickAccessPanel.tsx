/**
 * SessionQuickAccessPanel Component
 * Content-only panel for quick session switching (rendered inside QuickPanel)
 * [Source: Story 5.7 - Task 2, Story 19.1 - Task 4]
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Loader2 } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { formatRelativeTime } from '../utils/formatters';

interface SessionQuickAccessPanelProps {
  projectSlug: string;
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
}

export function SessionQuickAccessPanel({
  projectSlug,
  currentSessionId,
  onSelectSession,
}: SessionQuickAccessPanelProps) {
  const { t } = useTranslation('chat');
  const { sessions, isLoading, isLoadingMore, hasMore, fetchSessions, loadMoreSessions } = useSessionStore();

  // Fetch sessions on mount (mount = panel open, since QuickPanel conditionally renders content)
  useEffect(() => {
    fetchSessions(projectSlug, { limit: 20 });
  }, [projectSlug, fetchSessions]);

  return (
    <div className="flex flex-col h-full">
      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8" data-testid="loading-indicator">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden="true" />
            <span className="sr-only">{t('sessionQuickAccess.loading')}</span>
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8" data-testid="empty-state">
            {t('sessionQuickAccess.empty')}
          </p>
        ) : (
          <>
            {sessions.map((session) => {
              const isCurrent = session.sessionId === currentSessionId;
              return (
                <button
                  key={session.sessionId}
                  onClick={() => onSelectSession(session.sessionId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${isCurrent
                      ? 'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20 border-gray-200 dark:border-gray-700'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400'
                    }`}
                  data-testid={`session-item-${session.sessionId}`}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    {session.name && (
                      <span className="flex-shrink-0 inline-block text-[11px] leading-tight font-medium px-1.5 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 max-w-[40%] truncate">
                        {session.name}
                      </span>
                    )}
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {session.firstPrompt || '(빈 세션)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="relative flex h-2 w-2" title={session.isStreaming ? t('sessionQuickAccess.streaming') : t('sessionQuickAccess.waiting')}>
                      {session.isStreaming && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${session.isStreaming ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" aria-hidden="true" />
                      {session.messageCount}
                    </span>
                    <span>{formatRelativeTime(session.modified)}</span>
                  </div>
                </button>
              );
            })}
            {hasMore && (
              <button
                onClick={() => loadMoreSessions(projectSlug)}
                disabled={isLoadingMore}
                className="w-full py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="load-more-sessions"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    {t('sessionQuickAccess.loading')}
                  </>
                ) : (
                  t('sessionQuickAccess.loadMore')
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
