/**
 * ProjectSessionsPage - Session list view within project tab layout
 * Reuses session store and SessionListItem but without its own header
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, CheckSquare, Trash2, X, Eye, EyeOff, RefreshCw, Loader2, Search } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { BackgroundRefreshIndicator } from '../components/BackgroundRefreshIndicator';
import { useQueueStore } from '../stores/queueStore';
import { getSocket } from '../services/socket';
import { SessionListItem } from '../components/SessionListItem';
import { SessionListItemSkeleton } from '../components/SessionListItemSkeleton';
import { EmptyState } from '../components/EmptyState';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { ConfirmModal } from '../components/ConfirmModal';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useSkeletonCount } from '../hooks/useSkeletonCount';
import { generateUUID } from '../utils/uuid';

const PULL_THRESHOLD = 80;

export function ProjectSessionsPage() {
  const { t } = useTranslation('chat');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessions,
    isLoading,
    error,
    isRefreshing,
    isLoadingMore,
    hasMore,
    fetchSessions,
    loadMoreSessions,
    deleteSession,
    deleteSessions,
    renameSession,
    includeEmpty,
    setIncludeEmpty,
    searchQuery,
    searchContent,
    isSearching,
    searchSessions,
    clearSearch,
    setSearchContent,
  } = useSessionStore();
  const queueLockedSessionId = useQueueStore((s) => (s.isRunning || s.isPaused) ? s.lockedSessionId : null);
  const skeletonCount = useSkeletonCount(5);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showEmptyDeleteConfirm, setShowEmptyDeleteConfirm] = useState(false);

  // Search state
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Compute empty session IDs
  const emptySessionIds = useMemo(
    () => sessions.filter((s) => !s.firstPrompt || s.messageCount === 0).map((s) => s.sessionId),
    [sessions]
  );

  // Join project room so session:stream-change events are received in real-time.
  // Handles initial connection failure with retry and auto-rejoin on reconnect.
  useEffect(() => {
    if (!projectSlug) return;
    let socket: ReturnType<typeof getSocket> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    const joinRoom = () => { socket?.emit('project:join', projectSlug); };

    function tryConnect() {
      try {
        socket = getSocket();
        joinRoom();
        socket.on('connect', joinRoom);
      } catch {
        if (++retryCount < MAX_RETRIES) {
          retryTimer = setTimeout(tryConnect, 200);
        }
      }
    }
    tryConnect();

    return () => {
      clearTimeout(retryTimer);
      if (socket) {
        socket.off('connect', joinRoom);
        socket.emit('project:leave', projectSlug);
      }
    };
  }, [projectSlug]);

  // Clear search and fetch sessions on mount/navigation/projectSlug change
  const includeEmptyInitialRef = useRef(true);

  useEffect(() => {
    if (projectSlug) {
      clearTimeout(debounceRef.current);
      setLocalSearchQuery('');
      clearSearch(projectSlug);
    }
    includeEmptyInitialRef.current = true;
  }, [projectSlug, clearSearch, location.key]);

  // Re-fetch when includeEmpty toggles (skip initial mount to avoid double-fetch)
  useEffect(() => {
    if (includeEmptyInitialRef.current) {
      includeEmptyInitialRef.current = false;
      return;
    }
    if (projectSlug) {
      fetchSessions(projectSlug, { limit: 20 });
    }
  }, [includeEmpty, projectSlug, fetchSessions]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Exit selection mode on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectionMode) {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode]);

  const handleRefresh = useCallback(async () => {
    if (projectSlug) {
      await fetchSessions(projectSlug, { limit: 20 });
    }
  }, [projectSlug, fetchSessions]);

  const { containerRef, pullDistance, isRefreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: PULL_THRESHOLD,
    disabled: isLoading || !!error,
  });

  // Search input handler with 300ms debounce
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearchQuery(value);
    clearTimeout(debounceRef.current);
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        if (projectSlug) {
          searchSessions(projectSlug, value.trim(), searchContent);
        }
      }, 300);
    } else if (projectSlug) {
      clearSearch(projectSlug);
    }
  }, [projectSlug, searchContent, searchSessions, clearSearch]);

  // Content search toggle handler
  const handleSearchContentToggle = useCallback(() => {
    const newValue = !searchContent;
    setSearchContent(newValue);
    if (localSearchQuery.trim() && projectSlug) {
      clearTimeout(debounceRef.current);
      searchSessions(projectSlug, localSearchQuery.trim(), newValue);
    }
  }, [searchContent, setSearchContent, localSearchQuery, projectSlug, searchSessions]);

  const handleClearSearch = useCallback(() => {
    setLocalSearchQuery('');
    clearTimeout(debounceRef.current);
    if (projectSlug) {
      clearSearch(projectSlug);
    }
  }, [projectSlug, clearSearch]);

  const handleRetrySearch = useCallback(() => {
    if (projectSlug && searchQuery) {
      searchSessions(projectSlug, searchQuery, searchContent);
    }
  }, [projectSlug, searchQuery, searchContent, searchSessions]);

  const handleNewSession = useCallback(() => {
    const newSessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${newSessionId}`);
  }, [navigate, projectSlug]);

  const handleSessionClick = useCallback(
    (sessionId: string) => navigate(`/project/${projectSlug}/session/${sessionId}`),
    [navigate, projectSlug]
  );

  const handleRenameSession = useCallback((sessionId: string, name: string | null) => {
    if (projectSlug) renameSession(projectSlug, sessionId, name);
  }, [projectSlug, renameSession]);

  const handleDeleteRequest = useCallback((sessionId: string) => setDeleteTarget(sessionId), []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !projectSlug) return;
    await deleteSession(projectSlug, deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, projectSlug, deleteSession]);

  const handleToggleSelect = useCallback((sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(sessions.map((s) => s.sessionId)));
  }, [sessions]);

  const handleBatchDeleteConfirm = useCallback(async () => {
    if (!projectSlug || selectedIds.size === 0) return;
    setShowBatchDeleteConfirm(false);
    await deleteSessions(projectSlug, [...selectedIds]);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [projectSlug, selectedIds, deleteSessions]);

  const handleEmptyDeleteConfirm = useCallback(async () => {
    if (!projectSlug || emptySessionIds.length === 0) return;
    setShowEmptyDeleteConfirm(false);
    await deleteSessions(projectSlug, emptySessionIds);
  }, [projectSlug, emptySessionIds, deleteSessions]);

  return (
    <>
      {/* Session toolbar */}
      <div className="sticky top-0 z-[5] bg-white dark:bg-[#1c2129] border-b border-gray-300 dark:border-[#3a4d5e]">
        <div className="flex items-center justify-between px-4 py-2">
          {selectionMode ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#253040] rounded-lg text-gray-600 dark:text-gray-300"
                  aria-label={t('session.exitSelection')}
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {t('session.selectedCount', { count: selectedIds.size })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={selectedIds.size < sessions.length ? handleSelectAll : () => setSelectedIds(new Set())}
                  className="px-3 py-1.5 text-xs rounded-lg hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-600 dark:text-gray-300"
                >
                  {selectedIds.size < sessions.length ? t('session.selectAll') : t('session.deselectAll')}
                </button>
                <button
                  onClick={() => setShowBatchDeleteConfirm(true)}
                  disabled={selectedIds.size === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('session.delete')}
                </button>
              </div>
            </>
          ) : (
            <>
            <BackgroundRefreshIndicator isRefreshing={isRefreshing} className="ml-1" />
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={handleNewSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white text-xs font-medium rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('session.newSession')}
              </button>
              <div className="w-px h-5 bg-gray-200 dark:bg-[#253040] ml-2" />
              <button
                onClick={() => setIncludeEmpty(!includeEmpty)}
                className={`p-1.5 rounded-lg transition-colors ${
                  includeEmpty
                    ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                    : 'hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300'
                }`}
                aria-label={includeEmpty ? t('session.hideEmpty') : t('session.showEmpty')}
                title={includeEmpty ? t('session.hideEmpty') : t('session.showEmpty')}
              >
                {includeEmpty ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              {includeEmpty && emptySessionIds.length > 0 && (
                <button
                  onClick={() => setShowEmptyDeleteConfirm(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('session.deleteEmpty')}
                </button>
              )}
              {sessions.length > 0 && (
                <button
                  onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#253040] rounded-lg text-gray-500 dark:text-gray-300"
                  aria-label={t('session.selectionMode')}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#253040] rounded-lg disabled:opacity-50 text-gray-500 dark:text-gray-300"
                aria-label={t('session.refresh')}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      {!selectionMode && (
        <div className="px-4 pt-3 pb-1 bg-white dark:bg-[#1c2129]">
          <div role="search" className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={localSearchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('session.searchPlaceholder')}
              aria-label={t('session.searchPlaceholder')}
              className="w-full pl-10 pr-9 py-2 text-sm bg-gray-100 dark:bg-[#263240] border border-gray-300 dark:border-[#3a4d5e] rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {localSearchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                aria-label={t('session.clearSearch')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {localSearchQuery.trim() && (
            <div className="mt-2 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={searchContent}
                  onChange={handleSearchContentToggle}
                  className="rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
                />
                {t('session.searchContent')}
              </label>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {searchContent ? t('session.searchContentCap') : t('session.searchContentHint')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pull-to-refresh */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={PULL_THRESHOLD}
        isRefreshing={isPullRefreshing}
      />

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-auto" aria-live="polite">
        {/* Search loading state */}
        {isSearching && (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-500 dark:text-gray-300" role="status">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>{t('session.searching')}</span>
          </div>
        )}

        {/* Search error state */}
        {!isSearching && error && searchQuery && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500 dark:text-gray-300">
            <p className="text-sm">{t('session.searchError')}</p>
            <button
              onClick={handleRetrySearch}
              className="px-4 py-2 text-sm bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500 transition-colors"
            >
              {t('session.refresh')}
            </button>
          </div>
        )}

        {!isSearching && isLoading && !isRefreshing && (
          <div className="p-4 space-y-3" aria-label={t('session.loading')} role="status">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <SessionListItemSkeleton key={index} />
            ))}
          </div>
        )}

        {/* Search no results */}
        {!isSearching && !isLoading && sessions.length === 0 && searchQuery && !error && (
          <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-300">
            <p className="text-sm">{t('session.searchNoResults')}</p>
          </div>
        )}

        {/* Empty state (no search active) */}
        {!isSearching && !isLoading && sessions.length === 0 && !searchQuery && !error && (
          <EmptyState
            title={t('session.empty.title')}
            description={t('session.empty.description')}
            actionLabel={t('session.empty.action')}
            onAction={handleNewSession}
          />
        )}

        {!isSearching && !isLoading && sessions.length > 0 && (
          <div className="p-4 space-y-3">
            {sessions.map((session) => (
              <SessionListItem
                key={session.sessionId}
                session={session}
                agentInfo={null}
                onClick={handleSessionClick}
                onDelete={handleDeleteRequest}
                onRename={handleRenameSession}
                selectionMode={selectionMode}
                selected={selectedIds.has(session.sessionId)}
                onToggleSelect={handleToggleSelect}
                isEditing={editingSessionId === session.sessionId}
                onEditStart={(id) => setEditingSessionId(id)}
                onEditEnd={() => setEditingSessionId(null)}
                isQueueActive={queueLockedSessionId === session.sessionId}
              />
            ))}
            {hasMore && projectSlug && (
              <button
                onClick={() => loadMoreSessions(projectSlug, { limit: 20 })}
                disabled={isLoadingMore}
                className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-[#263240]/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="load-more-sessions"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    {t('session.loadingMore')}
                  </>
                ) : (
                  t('session.loadMore')
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={t('session.confirmDelete.title')}
        message={t('session.confirmDelete.message')}
        confirmText={t('session.confirmDelete.confirm')}
        cancelText={t('session.confirmDelete.cancel')}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        isOpen={showBatchDeleteConfirm}
        title={t('session.confirmBatchDelete.title')}
        message={t('session.confirmBatchDelete.message', { count: selectedIds.size })}
        confirmText={t('session.confirmDelete.confirm')}
        cancelText={t('session.confirmDelete.cancel')}
        variant="danger"
        onConfirm={handleBatchDeleteConfirm}
        onCancel={() => setShowBatchDeleteConfirm(false)}
      />
      <ConfirmModal
        isOpen={showEmptyDeleteConfirm}
        title={t('session.confirmEmptyDelete.title')}
        message={t('session.confirmEmptyDelete.message', { count: emptySessionIds.length })}
        confirmText={t('session.confirmDelete.confirm')}
        cancelText={t('session.confirmDelete.cancel')}
        variant="danger"
        onConfirm={handleEmptyDeleteConfirm}
        onCancel={() => setShowEmptyDeleteConfirm(false)}
      />
    </>
  );
}
