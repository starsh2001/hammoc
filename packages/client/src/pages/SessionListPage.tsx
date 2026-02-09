/**
 * SessionListPage - Page component for displaying session list
 * [Source: Story 3.4 - Task 4]
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Plus, CheckSquare, Trash2, X, Eye, EyeOff, MoreVertical, Moon, Sun, Settings, LogOut } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useProjectStore } from '../stores/projectStore';
import { useAuthStore } from '../stores/authStore';
import { SettingsMenu } from '../components/SettingsMenu';
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
import { BrandLogo } from '../components/BrandLogo';
import { generateUUID } from '../utils/uuid';

const PULL_THRESHOLD = 80;

export function SessionListPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessions,
    isLoading,
    error,
    errorType,
    isRefreshing,
    fetchSessions,
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
  const [showSettings, setShowSettings] = useState(false);

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

  // Get original project path for display
  const projectDisplayName = useMemo(() => {
    const project = projects.find((p) => p.projectSlug === projectSlug);
    return project?.originalPath || projectSlug || '';
  }, [projects, projectSlug]);

  // Compute empty session IDs
  const emptySessionIds = useMemo(
    () => sessions.filter((s) => !s.firstPrompt || s.messageCount === 0).map((s) => s.sessionId),
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
      fetchSessions(projectSlug);
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
      setRefreshing(true);
      await fetchSessions(projectSlug);
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
      <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              aria-label="뒤로 가기"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <BrandLogo />
            <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700" />
            <h1 className="flex-1 min-w-0 text-base font-semibold truncate text-gray-900 dark:text-white">{projectDisplayName}</h1>
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
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={selectionMode ? handleExitSelectionMode : handleBack}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
            aria-label={selectionMode ? '선택 취소' : '뒤로 가기'}
          >
            {selectionMode ? <X className="w-6 h-6" /> : <ArrowLeft className="w-6 h-6" />}
          </button>

          {selectionMode ? (
            <>
              {/* Selection mode header */}
              <span className="text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                {selectedIds.size}개 선택됨
              </span>
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                {selectedIds.size < sessions.length ? (
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors whitespace-nowrap"
                  >
                    모두 선택
                  </button>
                ) : (
                  <button
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors whitespace-nowrap"
                  >
                    선택 해제
                  </button>
                )}
                <button
                  onClick={handleBatchDeleteRequest}
                  disabled={selectedIds.size === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  삭제
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Normal mode header */}
              <BrandLogo />
              <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700" />
              <h1 className="flex-1 min-w-0 text-base font-semibold truncate text-gray-900 dark:text-white">{projectDisplayName}</h1>
              <div className="flex items-center gap-2">
                {/* New session button - wide screen only, leftmost */}
                <button
                  onClick={handleNewSession}
                  className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-600 text-gray-900 dark:text-white text-sm rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  새 세션
                </button>

                {/* Wide screen: inline buttons */}
                <button
                  onClick={handleToggleIncludeEmpty}
                  className={`hidden sm:block p-2 rounded-lg transition-colors ${
                    includeEmpty
                      ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  aria-label={includeEmpty ? '빈 세션 숨기기' : '빈 세션 표시'}
                  title={includeEmpty ? '빈 세션 숨기기' : '빈 세션 표시'}
                >
                  {includeEmpty ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
                {includeEmpty && emptySessionIds.length > 0 && (
                  <button
                    onClick={handleEmptyDeleteRequest}
                    className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 transition-colors whitespace-nowrap"
                    title={`빈 세션 ${emptySessionIds.length}개 삭제`}
                  >
                    <Trash2 className="w-4 h-4" />
                    빈 세션 삭제
                  </button>
                )}
                {sessions.length > 0 && (
                  <button
                    onClick={handleEnterSelectionMode}
                    className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                    aria-label="선택 모드"
                  >
                    <CheckSquare className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing}
                  className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 text-gray-700 dark:text-gray-300"
                  aria-label="새로고침"
                >
                  <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <ThemeToggleButton className="hidden sm:block" />
                <div className="relative hidden sm:block">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    aria-label="설정 메뉴"
                    aria-expanded={showSettings}
                    aria-haspopup="menu"
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <Settings className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <SettingsMenu
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                    onLogout={handleLogout}
                  />
                </div>

                {/* Narrow screen: overflow menu */}
                <div className="relative sm:hidden" ref={overflowMenuRef}>
                  <button
                    onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                    aria-label="메뉴"
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
                        새 세션
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                      <button
                        role="menuitem"
                        onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        {theme === 'dark' ? '라이트 모드' : '다크 모드'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { handleToggleIncludeEmpty(); setOverflowMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        {includeEmpty ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {includeEmpty ? '빈 세션 숨기기' : '빈 세션 표시'}
                      </button>
                      {includeEmpty && emptySessionIds.length > 0 && (
                        <button
                          role="menuitem"
                          onClick={() => { handleEmptyDeleteRequest(); setOverflowMenuOpen(false); }}
                          className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          빈 세션 삭제 ({emptySessionIds.length})
                        </button>
                      )}
                      {sessions.length > 0 && (
                        <button
                          role="menuitem"
                          onClick={() => { handleEnterSelectionMode(); setOverflowMenuOpen(false); }}
                          className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <CheckSquare className="w-4 h-4" />
                          선택 모드
                        </button>
                      )}
                      <button
                        role="menuitem"
                        onClick={() => { handleRefresh(); setOverflowMenuOpen(false); }}
                        disabled={isLoading || isRefreshing}
                        className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        새로고침
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                      <button
                        role="menuitem"
                        onClick={() => { handleLogout(); setOverflowMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        로그아웃
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
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
          </div>
        )}
      </div>

      {/* Individual delete confirmation modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="세션 삭제"
        message="이 세션을 삭제하시겠습니까? 세션 파일이 영구적으로 삭제됩니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Batch delete confirmation modal */}
      <ConfirmModal
        isOpen={showBatchDeleteConfirm}
        title="세션 일괄 삭제"
        message={`선택한 ${selectedIds.size}개 세션을 삭제하시겠습니까? 세션 파일이 영구적으로 삭제됩니다.`}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleBatchDeleteConfirm}
        onCancel={handleBatchDeleteCancel}
      />

      {/* Empty sessions delete confirmation modal */}
      <ConfirmModal
        isOpen={showEmptyDeleteConfirm}
        title="빈 세션 삭제"
        message={`빈 세션 ${emptySessionIds.length}개를 삭제하시겠습니까? 세션 파일이 영구적으로 삭제됩니다.`}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleEmptyDeleteConfirm}
        onCancel={handleEmptyDeleteCancel}
      />
    </div>
  );
}
