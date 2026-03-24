/**
 * SessionQuickAccessPanel Component
 * Content-only panel for quick session switching (rendered inside QuickPanel)
 * Includes search functionality for finding sessions without leaving chat
 * [Source: Story 5.7 - Task 2, Story 19.1 - Task 4, Story 23.3 - Task 2]
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Loader2, Search, X } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { formatRelativeTime } from '../utils/formatters';

interface SessionQuickAccessPanelProps {
  projectSlug: string;
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  /** Auto-focus search input on mount (mobile only — desktop preserves chat focus) */
  autoFocusSearch?: boolean;
}

export function SessionQuickAccessPanel({
  projectSlug,
  currentSessionId,
  onSelectSession,
  autoFocusSearch = false,
}: SessionQuickAccessPanelProps) {
  const { t } = useTranslation('chat');
  const {
    sessions,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMoreSessions,
    searchSessions,
    clearSearch,
    fetchSessions,
    resetSearchState,
    searchQuery,
    isSearching,
  } = useSessionStore();

  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const projectSlugRef = useRef(projectSlug);
  projectSlugRef.current = projectSlug;

  // On mount / projectSlug change: reset local input and refresh sessions.
  // Uses skipIfFresh to avoid redundant fetches when panel is reopened quickly.
  useEffect(() => {
    setInputValue('');
    clearTimeout(debounceRef.current);
    const { searchQuery: sq } = useSessionStore.getState();
    if (sq) {
      // Active search exists — clear it and re-fetch
      clearSearch(projectSlug);
    } else {
      // No search — just refresh, skip if data is fresh
      fetchSessions(projectSlug, { limit: 20, skipIfFresh: true });
    }
  }, [projectSlug, clearSearch, fetchSessions]);

  // On unmount: reset search state without triggering a fetch
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      resetSearchState();
    };
  }, []); // empty deps = cleanup only on unmount

  const handleSearchChange = (value: string) => {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        searchSessions(projectSlug, value.trim(), false);
      }, 300);
    } else {
      clearSearch(projectSlug);
    }
  };

  const handleClearSearch = () => {
    setInputValue('');
    clearTimeout(debounceRef.current);
    clearSearch(projectSlug);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && inputValue) {
      e.stopPropagation();
      handleClearSearch();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-4 pt-3 pb-2" role="search">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('session.searchPlaceholder')}
            className="w-full pl-8 pr-7 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-gray-100 dark:bg-[#263240] border border-gray-300 dark:border-[#3a4d5e] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label={t('session.searchPlaceholder')}
            autoFocus={autoFocusSearch}
            data-testid="search-input"
          />
          {inputValue && (
            <button
              onClick={handleClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              aria-label={t('session.clearSearch')}
              data-testid="clear-search-button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2" aria-live="polite">
        {isLoading || isSearching ? (
          <div className="flex items-center gap-2 justify-center py-8 text-sm text-gray-500 dark:text-gray-300" data-testid="loading-indicator">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>{isSearching ? t('session.searching') : t('loadingStatus')}</span>
          </div>
        ) : sessions.length === 0 && searchQuery ? (
          <p className="text-center text-gray-500 dark:text-gray-300 py-8" data-testid="search-no-results">
            {t('session.searchNoResults')}
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-300 py-8" data-testid="empty-state">
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
                      ? 'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20 border-gray-300 dark:border-[#3a4d5e]'
                      : 'border-gray-300 dark:border-[#3a4d5e] hover:border-blue-500 dark:hover:border-blue-400'
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
                      {session.firstPrompt || t('sessionListItem.emptySession')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-300">
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
                className="w-full py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-[#263240]/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
