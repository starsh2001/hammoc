/**
 * ProjectSessionsPage - Session list view within project tab layout
 * Reuses session store and SessionListItem but without its own header
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, CheckSquare, Trash2, X, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { BackgroundRefreshIndicator } from '../components/BackgroundRefreshIndicator';
import { useQueueStore } from '../stores/queueStore';
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
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessions,
    isLoading,
    error,
    isRefreshing,
    fetchSessions,
    setRefreshing,
    deleteSession,
    deleteSessions,
    renameSession,
    includeEmpty,
    setIncludeEmpty,
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

  // Compute empty session IDs
  const emptySessionIds = useMemo(
    () => sessions.filter((s) => !s.firstPrompt || s.messageCount === 0).map((s) => s.sessionId),
    [sessions]
  );

  // Fetch sessions
  useEffect(() => {
    if (projectSlug) {
      fetchSessions(projectSlug);
    }
  }, [projectSlug, fetchSessions, location.key, includeEmpty]);

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
      await fetchSessions(projectSlug);
    }
  }, [projectSlug, fetchSessions]);

  const { containerRef, pullDistance, isRefreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: PULL_THRESHOLD,
    disabled: isLoading || !!error,
  });

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
      <div className="sticky top-0 z-[5] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-2">
          {selectionMode ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400"
                  aria-label="선택 취소"
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedIds.size}개 선택됨
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={selectedIds.size < sessions.length ? handleSelectAll : () => setSelectedIds(new Set())}
                  className="px-3 py-1.5 text-xs rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  {selectedIds.size < sessions.length ? '모두 선택' : '선택 해제'}
                </button>
                <button
                  onClick={() => setShowBatchDeleteConfirm(true)}
                  disabled={selectedIds.size === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  삭제
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
                새 세션
              </button>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 ml-2" />
              <button
                onClick={() => setIncludeEmpty(!includeEmpty)}
                className={`p-1.5 rounded-lg transition-colors ${
                  includeEmpty
                    ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
                aria-label={includeEmpty ? '빈 세션 숨기기' : '빈 세션 표시'}
                title={includeEmpty ? '빈 세션 숨기기' : '빈 세션 표시'}
              >
                {includeEmpty ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              {includeEmpty && emptySessionIds.length > 0 && (
                <button
                  onClick={() => setShowEmptyDeleteConfirm(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-600 text-red-700 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  빈 세션 삭제
                </button>
              )}
              {sessions.length > 0 && (
                <button
                  onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
                  aria-label="선택 모드"
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 text-gray-500 dark:text-gray-400"
                aria-label="새로고침"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Pull-to-refresh */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={PULL_THRESHOLD}
        isRefreshing={isPullRefreshing}
      />

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {isLoading && !isRefreshing && (
          <div className="p-4 space-y-3" aria-label="로딩 중" role="status">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <SessionListItemSkeleton key={index} />
            ))}
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <EmptyState
            title="세션이 없습니다"
            description="새 세션을 시작하여 Claude와 대화하세요."
            actionLabel="새 세션 시작"
            onAction={handleNewSession}
          />
        )}

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
                isQueueActive={queueLockedSessionId === session.sessionId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="세션 삭제"
        message="이 세션을 삭제하시겠습니까? 세션 파일이 영구적으로 삭제됩니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        isOpen={showBatchDeleteConfirm}
        title="세션 일괄 삭제"
        message={`선택한 ${selectedIds.size}개 세션을 삭제하시겠습니까?`}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleBatchDeleteConfirm}
        onCancel={() => setShowBatchDeleteConfirm(false)}
      />
      <ConfirmModal
        isOpen={showEmptyDeleteConfirm}
        title="빈 세션 삭제"
        message={`빈 세션 ${emptySessionIds.length}개를 삭제하시겠습니까?`}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleEmptyDeleteConfirm}
        onCancel={() => setShowEmptyDeleteConfirm(false)}
      />
    </>
  );
}
