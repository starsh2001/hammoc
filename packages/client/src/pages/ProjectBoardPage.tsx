/**
 * ProjectBoardPage - Board tab main page with kanban/list views
 * [Source: Story 21.2 - Task 5, Story 21.3 - Task 5]
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutList, Kanban, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import type { BoardItem, CreateIssueRequest, UpdateIssueRequest } from '@bmad-studio/shared';
import { useBoard } from '../hooks/useBoard';
import { useIsMobile } from '../hooks/useIsMobile';
import { KanbanBoard } from '../components/board/KanbanBoard';
import { MobileKanbanBoard } from '../components/board/MobileKanbanBoard';
import { BoardListView } from '../components/board/BoardListView';
import { IssueFormDialog } from '../components/board/IssueFormDialog';
import { IssueEditDialog } from '../components/board/IssueEditDialog';
import { EpicStoriesDialog } from '../components/board/EpicStoriesDialog';
import { boardApi } from '../services/api/board.js';
import { generateUUID } from '../utils/uuid.js';

export function ProjectBoardPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const {
    viewMode,
    isLoading,
    error,
    itemsByStatus,
    items,
    setViewMode,
    createIssue,
    refresh,
  } = useBoard(projectSlug);
  const isMobile = useIsMobile();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingIssue, setEditingIssue] = useState<BoardItem | null>(null);
  const [epicDialogData, setEpicDialogData] = useState<{ epic: BoardItem; stories: BoardItem[] } | null>(null);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const setActionErrorWithClear = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setActionError(msg);
    errorTimerRef.current = setTimeout(() => setActionError(null), 5000);
  }, []);

  const handleCreateIssue = async (data: CreateIssueRequest) => {
    await createIssue(data);
  };

  // Quick fix: update status to InProgress, navigate to dev session
  const handleQuickFix = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'InProgress' });
      const sessionId = generateUUID();
      const desc = item.description
        ? (item.description.length > 500 ? item.description.slice(0, 500) + '...(잘림)' : item.description)
        : '(설명 없음)';
      const prompt = `다음 이슈를 해결해 주세요:\n\n# ${item.title}\n\n${desc}\n\n심각도: ${item.severity || '없음'}\n타입: ${item.issueType || '없음'}`;
      const params = new URLSearchParams({ agent: '/BMad:agents:dev', task: prompt });
      navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
    } catch {
      setActionErrorWithClear('이슈 상태 변경에 실패했습니다.');
    }
  }, [projectSlug, navigate, setActionErrorWithClear]);

  // Promote issue to story or epic
  const handlePromote = useCallback(async (item: BoardItem, targetType: 'story' | 'epic') => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'Done' });
      const sessionId = generateUUID();
      const desc = item.description
        ? (item.description.length > 500 ? item.description.slice(0, 500) + '...(잘림)' : item.description)
        : '없음';
      const taskName = targetType === 'story' ? '*create-brownfield-story' : '*create-brownfield-epic';
      const taskWithContext = `${taskName}\n\n## 원본 이슈 (ID: ${item.id})\n**제목**: ${item.title}\n**설명**: ${desc}\n**심각도**: ${item.severity || '없음'}\n**타입**: ${item.issueType || '없음'}`;
      const params = new URLSearchParams({ agent: '/BMad:agents:pm', task: taskWithContext });
      navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
    } catch {
      setActionErrorWithClear('승격 처리에 실패했습니다.');
    }
  }, [projectSlug, navigate, setActionErrorWithClear]);

  // Edit issue
  const handleEditIssue = useCallback((item: BoardItem) => {
    setEditingIssue(item);
  }, []);

  const handleEditSubmit = useCallback(async (issueId: string, data: UpdateIssueRequest) => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, issueId, data);
      await refresh();
      setEditingIssue(null);
    } catch {
      setActionErrorWithClear('이슈 수정에 실패했습니다.');
      throw new Error('update failed');
    }
  }, [projectSlug, refresh, setActionErrorWithClear]);

  // Close issue
  const handleCloseIssue = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    if (!window.confirm('이 이슈를 닫으시겠습니까?')) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'Closed' });
      await refresh();
    } catch {
      setActionErrorWithClear('이슈 닫기에 실패했습니다.');
    }
  }, [projectSlug, refresh, setActionErrorWithClear]);

  // Story workflow action
  const handleWorkflowAction = useCallback((item: BoardItem) => {
    if (!projectSlug) return;
    const storyNum = item.id.replace(/^story-/, '');
    const sessionId = generateUUID();
    let agent = '';
    let task = '';

    switch (item.status) {
      case 'Draft':
        agent = '/BMad:agents:sm';
        task = `*story-checklist ${storyNum}`;
        break;
      case 'Approved':
        agent = '/BMad:agents:dev';
        task = `*develop-story ${storyNum}`;
        break;
      case 'InProgress':
        agent = '/BMad:agents:qa';
        task = `*gate ${storyNum}`;
        break;
      case 'Review':
        agent = '/BMad:agents:dev';
        task = `*review-qa ${storyNum}`;
        break;
      default:
        return;
    }

    const params = new URLSearchParams({ agent, task });
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  }, [projectSlug, navigate]);

  // View epic stories
  const handleViewEpicStories = useCallback((item: BoardItem) => {
    const allItems = Object.values(itemsByStatus).flat();
    const epicStories = allItems.filter(
      (i) => i.type === 'story' && i.epicNumber === item.epicNumber,
    );
    setEpicDialogData({ epic: item, stories: epicStories });
  }, [itemsByStatus]);

  // Card action callbacks
  const cardCallbacks = {
    onQuickFix: handleQuickFix,
    onPromote: handlePromote,
    onEdit: handleEditIssue,
    onClose: handleCloseIssue,
    onWorkflowAction: handleWorkflowAction,
    onViewEpicStories: handleViewEpicStories,
  };

  // Loading skeleton
  if (isLoading && items.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: isMobile ? 1 : 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-72 space-y-3">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error && items.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[300px] text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          다시 시도
        </button>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[300px] text-center">
        <Kanban className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          보드에 항목이 없습니다. 이슈를 추가해 보세요.
        </p>
        <button
          onClick={() => setIsFormOpen(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          이슈 추가
        </button>
        <IssueFormDialog
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleCreateIssue}
        />
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('kanban')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'kanban'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
            aria-label="칸반 뷰"
            aria-pressed={viewMode === 'kanban'}
          >
            <Kanban className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
            aria-label="리스트 뷰"
            aria-pressed={viewMode === 'list'}
          >
            <LayoutList className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={() => setIsFormOpen(true)}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-1.5 text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          이슈 추가
        </button>
      </div>

      {/* Error banner (when items exist but refresh fails) */}
      {(error || actionError) && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionError || error}
        </div>
      )}

      {/* Board content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'kanban' ? (
          isMobile ? (
            <MobileKanbanBoard itemsByStatus={itemsByStatus} {...cardCallbacks} />
          ) : (
            <KanbanBoard itemsByStatus={itemsByStatus} {...cardCallbacks} />
          )
        ) : (
          <BoardListView itemsByStatus={itemsByStatus} isMobile={isMobile} {...cardCallbacks} />
        )}
      </div>

      <IssueFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateIssue}
      />

      <IssueEditDialog
        open={!!editingIssue}
        issue={editingIssue}
        onClose={() => setEditingIssue(null)}
        onSubmit={handleEditSubmit}
      />

      <EpicStoriesDialog
        open={!!epicDialogData}
        epic={epicDialogData?.epic ?? null}
        stories={epicDialogData?.stories ?? []}
        onClose={() => setEpicDialogData(null)}
      />
    </div>
  );
}
