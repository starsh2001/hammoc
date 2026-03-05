/**
 * SessionListPage - Page component for displaying session list
 * [Source: Story 3.4 - Task 4]
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Plus, CheckSquare, Trash2, X, Eye, EyeOff, MoreVertical, Moon, Sun, Settings, LogOut, Loader2 } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useProjectStore } from '../stores/projectStore';
import { BackgroundRefreshIndicator } from '../components/BackgroundRefreshIndicator';
import { useAuthStore } from '../stores/authStore';
import { SessionListItem } from '../components/SessionListItem';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { SessionListItemSkeleton } from '../components/SessionListItemSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { ConfirmModal } from '../components/ConfirmModal';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useSkeletonCount } from '../hooks/useSkeletonCount';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTheme } from '../hooks/useTheme';
import { useWebSocket } from '../hooks/useWebSocket';
import { BrandLogo } from '../components/BrandLogo';
import { ConnectionStatusIndicator } from '../components/ConnectionStatusIndicator';
import { generateUUID } from '../utils/uuid';



const PULL_THRESHOLD = 80;

export function SessionListPage() {
  const { t } = useTranslation('chat');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessions,
    isLoading,
    error,
    errorType,
    isRefreshing,
    isLoadingMore,
    hasMore,
    fetchSessions,
    loadMoreSessions,
    setRefreshing,
    deleteSession,
    deleteSessions,
    renameSession,
    includeEmpty,
    setIncludeEmpty,
  } = useSessionStore();
  const { projects, fetchProjects } = useProjectStore();
  const { logout } = useAuthStore();
  const skeletonCount = useSkeletonCount(5);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // single session delete
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showEmptyDeleteConfirm, setShowEmptyDeleteConfirm] = useState(false);

  // Overflow menu state (narrow screens)
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  useClickOutside(overflowMenuRef, () => setOverflowMenuOpen(false));
  const { connectionStatus, reconnectAttempt, lastError, connect } = useWebSocket();

  // Get original project path for display
  const projectFullPath = useMemo(() => {
    const project = projects.find((p) => p.projectSlug === projectSlug);
    return project?.originalPath || projectSlug || '';
  }, [projects, projectSlug]);

  const projectDirName = useMemo(() => {
    const parts = projectFullPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || projectFullPath;
  }, [projectFullPath]);

  // Compute empty session IDs
  const emptySessionIds = useMemo(
    () => sessions.filter((s) => s.messageCount === 0).map((s) => s.sessionId),
    [sessions]
  );

  // Fetch projects if not loaded (for direct URL navigation)
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  // Fetch sessions on mount, navigation, projectSlug or includeEmpty changes
  useEffect(() => {
    if (projectSlug) {
      fetchSessions(projectSlug, { limit: 20 });
    }
  }, [projectSlug, fetchSessions, location.key, includeEmpty]);

  // Exit selection mode on ESC key
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

  // Pull-to-refresh hook
  const { containerRef, pullDistance, isRefreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: PULL_THRESHOLD,
    disabled: isLoading || !!error,
  });

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleNewSession = useCallback(() => {
    const newSessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${newSessionId}`);
  }, [navigate, projectSlug]);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      navigate(`/project/${projectSlug}/session/${sessionId}`);
    },
    [navigate, projectSlug]
  );

  // Rename session
  const handleRenameSession = useCallback((sessionId: string, name: string | null) => {
    if (projectSlug) {
      renameSession(projectSlug, sessionId, name);
    }
  }, [projectSlug, renameSession]);

  // Individual delete: show confirm modal
  const handleDeleteRequest = useCallback((sessionId: string) => {
    setDeleteTarget(sessionId);
  }, []);

  // Confirm individual delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !projectSlug) return;
    await deleteSession(projectSlug, deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, projectSlug, deleteSession]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  // Selection mode handlers
  const handleEnterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = useCallback((sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(sessions.map((s) => s.sessionId)));
  }, [sessions]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Batch delete: show confirm modal
  const handleBatchDeleteRequest = useCallback(() => {
    if (selectedIds.size > 0) {
      setShowBatchDeleteConfirm(true);
    }
  }, [selectedIds.size]);

  // Confirm batch delete
  const handleBatchDeleteConfirm = useCallback(async () => {
    if (!projectSlug || selectedIds.size === 0) return;
    setShowBatchDeleteConfirm(false);
    await deleteSessions(projectSlug, [...selectedIds]);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [projectSlug, selectedIds, deleteSessions]);

  const handleBatchDeleteCancel = useCallback(() => {
    setShowBatchDeleteConfirm(false);
  }, []);

  // Toggle include empty sessions
  const handleToggleIncludeEmpty = useCallback(() => {
    setIncludeEmpty(!includeEmpty);
  }, [includeEmpty, setIncludeEmpty]);

  // Delete empty sessions
  const handleEmptyDeleteRequest = useCallback(() => {
    if (emptySessionIds.length > 0) {
      setShowEmptyDeleteConfirm(true);
    }
  }, [emptySessionIds.length]);

  const handleEmptyDeleteConfirm = useCallback(async () => {
    if (!projectSlug || emptySessionIds.length === 0) return;
    setShowEmptyDeleteConfirm(false);
    await deleteSessions(projectSlug, emptySessionIds);
  }, [projectSlug, emptySessionIds, deleteSessions]);

  const handleEmptyDeleteCancel = useCallback(() => {
    setShowEmptyDeleteConfirm(false);
  }, []);

  // Error state rendering
  if (error && errorType !== 'none') {
    return (
      <div className="h-dvh flex flex-col bg-white dark:bg-gray-900">
        {/* Header */}
        <header className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3 min-h-16">
            <div className="flex items-center min-w-0 flex-1">
              <button
                onClick={handleBack}
                className="p-2 -ml-2 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                aria-label={t('session.back')}
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <BrandLogo />
              <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-3" />
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold truncate text-gray-900 dark:text-white">{projectDirName}</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{projectFullPath}</p>
              </div>
            </div>
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
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-900">
      {/* Header with actions */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3 min-h-16">
          <div className="flex items-center min-w-0 flex-1">
            <button
              onClick={selectionMode ? handleExitSelectionMode : handleBack}
              className="p-2 -ml-2 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              aria-label={selectionMode ? t('session.exitSelection') : t('session.back')}
            >
              {selectionMode ? <X className="w-6 h-6" /> : <ArrowLeft className="w-6 h-6" />}
            </button>

          {selectionMode ? (
              <span className="text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                {t('session.selectedCount', { count: selectedIds.size })}
              </span>
          ) : (
            <>
              <BrandLogo />
              <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-3" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold truncate text-gray-900 dark:text-white">{projectDirName}</h1>
                  <BackgroundRefreshIndicator isRefreshing={isRefreshing} />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{projectFullPath}</p>
              </div>
            </>
          )}
          </div>

          {/* Right side: Actions */}
          <div className="flex items-center gap-1 ml-4">
          {!selectionMode && (
            <ConnectionStatusIndicator
              status={connectionStatus}
              reconnectAttempt={reconnectAttempt}
              lastError={lastError}
              onReconnect={connect}
              compact
            />
          )}
          {selectionMode ? (
            <>
              {selectedIds.size < sessions.length ? (
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors whitespace-nowrap"
                >
                  {t('session.selectAll')}
                </button>
              ) : (
                <button
                  onClick={handleDeselectAll}
                  className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors whitespace-nowrap"
                >
                  {t('session.deselectAll')}
                </button>
              )}
              <button
                onClick={handleBatchDeleteRequest}
                disabled={selectedIds.size === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                {t('session.delete')}
              </button>
            </>
          ) : (
            <>
              {/* New session button - wide screen only */}
              <button
                onClick={handleNewSession}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-600 text-gray-900 dark:text-white text-sm rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {t('session.newSession')}
              </button>

              <button
                onClick={handleToggleIncludeEmpty}
                className={`hidden sm:block p-2 rounded-lg transition-colors ${
                  includeEmpty
                    ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                aria-label={includeEmpty ? t('session.hideEmpty') : t('session.showEmpty')}
                title={includeEmpty ? t('session.hideEmpty') : t('session.showEmpty')}
              >
                {includeEmpty ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
              {includeEmpty && emptySessionIds.length > 0 && (
                <button
                  onClick={handleEmptyDeleteRequest}
                  className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 transition-colors whitespace-nowrap"
                  title={t('session.deleteEmptyCount', { count: emptySessionIds.length })}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('session.deleteEmpty')}
                </button>
              )}
              {sessions.length > 0 && (
                <button
                  onClick={handleEnterSelectionMode}
                  className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                  aria-label={t('session.selectionMode')}
                >
                  <CheckSquare className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 text-gray-700 dark:text-gray-300"
                aria-label={t('session.refresh')}
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <ThemeToggleButton className="hidden sm:block" />
              <button
                onClick={() => navigate('/settings')}
                aria-label={t('session.settings')}
                className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                <Settings className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                onClick={handleLogout}
                aria-label={t('session.logout')}
                className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 transition-colors"
              >
                <LogOut className="w-5 h-5" aria-hidden="true" />
              </button>

              {/* Narrow screen: overflow menu */}
              <div className="relative sm:hidden" ref={overflowMenuRef}>
                <button
                  onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                  aria-label={t('session.menu')}
                  aria-expanded={overflowMenuOpen}
                  aria-haspopup="menu"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                {overflowMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1"
                  >
                    <button
                      role="menuitem"
                      onClick={() => { handleNewSession(); setOverflowMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {t('session.newSession')}
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button
                      role="menuitem"
                      onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      {theme === 'dark' ? t('session.lightMode') : t('session.darkMode')}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { handleToggleIncludeEmpty(); setOverflowMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      {includeEmpty ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      {includeEmpty ? t('session.hideEmpty') : t('session.showEmpty')}
                    </button>
                    {includeEmpty && emptySessionIds.length > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => { handleEmptyDeleteRequest(); setOverflowMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t('session.deleteEmptyCount', { count: emptySessionIds.length })}
                      </button>
                    )}
                    {sessions.length > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => { handleEnterSelectionMode(); setOverflowMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <CheckSquare className="w-4 h-4" />
                        {t('session.selectionMode')}
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => { handleRefresh(); setOverflowMenuOpen(false); }}
                      disabled={isLoading || isRefreshing}
                      className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {t('session.refresh')}
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button
                      role="menuitem"
                      onClick={() => { navigate('/settings'); setOverflowMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      {t('session.settings')}
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button
                      role="menuitem"
                      onClick={() => { handleLogout(); setOverflowMenuOpen(false); }}
                      className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('session.logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
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
      <div ref={containerRef} className="flex-1 overflow-auto overscroll-contain">
        {/* Loading state */}
        {isLoading && !isRefreshing && (
          <div className="p-4 space-y-3" aria-label={t('session.loading')} role="status">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <SessionListItemSkeleton key={index} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <EmptyState
            title={t('session.empty.title')}
            description={t('session.empty.description')}
            actionLabel={t('session.empty.action')}
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
              />
            ))}
            {hasMore && projectSlug && (
              <button
                onClick={() => loadMoreSessions(projectSlug, { limit: 20 })}
                disabled={isLoadingMore}
                className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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

      {/* Individual delete confirmation modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={t('session.confirmDelete.title')}
        message={t('session.confirmDelete.message')}
        confirmText={t('session.confirmDelete.confirm')}
        cancelText={t('session.confirmDelete.cancel')}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Batch delete confirmation modal */}
      <ConfirmModal
        isOpen={showBatchDeleteConfirm}
        title={t('session.confirmBatchDelete.title')}
        message={t('session.confirmBatchDelete.message', { count: selectedIds.size })}
        confirmText={t('session.confirmDelete.confirm')}
        cancelText={t('session.confirmDelete.cancel')}
        variant="danger"
        onConfirm={handleBatchDeleteConfirm}
        onCancel={handleBatchDeleteCancel}
      />

      {/* Empty sessions delete confirmation modal */}
      <ConfirmModal
        isOpen={showEmptyDeleteConfirm}
        title={t('session.confirmEmptyDelete.title')}
        message={t('session.confirmEmptyDelete.message', { count: emptySessionIds.length })}
        confirmText={t('session.confirmDelete.confirm')}
        cancelText={t('session.confirmDelete.cancel')}
        variant="danger"
        onConfirm={handleEmptyDeleteConfirm}
        onCancel={handleEmptyDeleteCancel}
      />
    </div>
  );
}
