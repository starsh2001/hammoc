/**
 * ProjectBoardPage - Board tab main page with kanban/list views
 * [Source: Story 21.2 - Task 5, Story 21.3 - Task 5]
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutList, Kanban, Plus, RefreshCw, AlertCircle, Settings, Minus } from 'lucide-react';
import type { BoardItem, CreateIssueRequest, UpdateIssueRequest } from '@hammoc/shared';
import { useBoard } from '../hooks/useBoard';
import { useIsMobile } from '../hooks/useIsMobile';
import { useFileStore } from '../stores/fileStore';
import { KanbanBoard } from '../components/board/KanbanBoard';
import { MobileKanbanBoard } from '../components/board/MobileKanbanBoard';
import { BoardListView } from '../components/board/BoardListView';
import { IssueFormDialog } from '../components/board/IssueFormDialog';
import { IssueEditDialog } from '../components/board/IssueEditDialog';
import { EpicStoriesDialog } from '../components/board/EpicStoriesDialog';
import { BoardConfigDialog } from '../components/board/BoardConfigDialog';
import { boardApi } from '../services/api/board.js';
import { generateUUID } from '../utils/uuid.js';

export function ProjectBoardPage() {
  const { t } = useTranslation('board');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const {
    viewMode,
    visibleColumns,
    isLoading,
    error,
    itemsByColumn,
    items,
    boardConfig,
    setViewMode,
    setVisibleColumns,
    createIssue,
    updateBoardConfig,
    resetBoardConfig,
    refresh,
  } = useBoard(projectSlug);
  const isMobile = useIsMobile();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingIssue, setEditingIssue] = useState<BoardItem | null>(null);
  const [epicDialogData, setEpicDialogData] = useState<{ epic: BoardItem; stories: BoardItem[] } | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

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

  const handleCreateIssue = async (data: CreateIssueRequest, files?: File[]) => {
    const item = await createIssue(data);
    if (item && files && files.length > 0 && projectSlug) {
      for (const file of files) {
        try {
          await boardApi.uploadAttachment(projectSlug, item.id, file);
        } catch {
          // Individual upload failures don't block issue creation
        }
      }
      await refresh();
    }
  };

  // Quick action: mark issue Done and navigate to dev session with issue filename
  const handleQuickFix = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'Done' });
      const sessionId = generateUUID();
      const issueFile = item.externalRef || `docs/issues/${item.id}.md`;
      const desc = item.description
        ? (item.description.length > 500 ? item.description.slice(0, 500) + t('truncated') : item.description)
        : t('noDescription');
      const prompt = `${t('workflow.quickFixIntro')}\n\n# ${item.title}\n\n${desc}\n\n${t('issue.severityLabel')} ${item.severity || t('promote.none')}\n${t('issue.typeLabel')} ${item.issueType || t('promote.none')}\n\n${t('workflow.issueFileLabel')} ${issueFile}`;
      const params = new URLSearchParams({ agent: '/BMad:agents:dev', task: prompt });
      navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
    } catch {
      setActionErrorWithClear(t('errors.updateStatusFailed'));
    }
  }, [projectSlug, navigate, setActionErrorWithClear]);

  // Promote issue to story or epic
  const handlePromote = useCallback(async (item: BoardItem, targetType: 'story' | 'epic') => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'Promoted' });
      const sessionId = generateUUID();
      const desc = item.description
        ? (item.description.length > 500 ? item.description.slice(0, 500) + t('truncated') : item.description)
        : t('promote.none');
      const taskName = targetType === 'story' ? '*create-brownfield-story' : '*create-brownfield-epic';
      const taskWithContext = `${taskName}\n\n## ${t('promote.originalIssueHeader', { id: item.id })}\n**${t('issue.titlePlain')}**: ${item.title}\n**${t('issue.description')}**: ${desc}\n**${t('issue.severity')}**: ${item.severity || t('promote.none')}\n**${t('issue.type')}**: ${item.issueType || t('promote.none')}`;
      const params = new URLSearchParams({ agent: '/BMad:agents:pm', task: taskWithContext });
      navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
    } catch {
      setActionErrorWithClear(t('errors.promoteFailed'));
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
      setActionErrorWithClear(t('errors.editFailed'));
      throw new Error('update failed');
    }
  }, [projectSlug, refresh, setActionErrorWithClear]);

  // Close issue
  const handleCloseIssue = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'Closed' });
      await refresh();
    } catch {
      setActionErrorWithClear(t('errors.closeFailed'));
    }
  }, [projectSlug, refresh, setActionErrorWithClear]);

  // Re-open a closed issue
  const handleReopenIssue = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    try {
      await boardApi.updateIssue(projectSlug, item.id, { status: 'Open' });
      await refresh();
    } catch {
      setActionErrorWithClear(t('errors.reopenFailed'));
    }
  }, [projectSlug, refresh, setActionErrorWithClear]);

  // Delete issue
  const handleDeleteIssue = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    if (!window.confirm(t('issue.deleteConfirm', { title: item.title }))) return;
    try {
      await boardApi.deleteIssue(projectSlug, item.id);
      await refresh();
    } catch {
      setActionErrorWithClear(t('errors.deleteFailed'));
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
        task = `*qa-gate ${storyNum}`;
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
    const allItems = Object.values(itemsByColumn).flat();
    const epicStories = allItems.filter(
      (i) => i.type === 'story' && i.epicNumber === item.epicNumber,
    );
    setEpicDialogData({ epic: item, stories: epicStories });
  }, [itemsByColumn]);

  // Card click: issues open edit dialog, stories/epics open file in editor
  const handleCardClick = useCallback((item: BoardItem) => {
    if (item.type === 'issue') {
      setEditingIssue(item);
      return;
    }
    if (item.type === 'epic') {
      handleViewEpicStories(item);
      return;
    }
    if (!projectSlug || !item.filePath) return;
    useFileStore.getState().openFileInEditor(projectSlug, item.filePath);
  }, [projectSlug, handleViewEpicStories]);

  // Normalize story status (fix non-standard statuses like "Ready for Done")
  const handleNormalizeStatus = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    const storyNum = item.id.replace(/^story-/, '');
    try {
      await boardApi.normalizeStoryStatus(projectSlug, storyNum);
      await refresh();
    } catch {
      setActionErrorWithClear(t('errors.normalizeStatusFailed'));
    }
  }, [projectSlug, refresh, setActionErrorWithClear]);

  // Card action callbacks
  const cardCallbacks = {
    onQuickFix: handleQuickFix,
    onPromote: handlePromote,
    onEdit: handleEditIssue,
    onClose: handleCloseIssue,
    onReopen: handleReopenIssue,
    onDelete: handleDeleteIssue,
    onWorkflowAction: handleWorkflowAction,
    onViewEpicStories: handleViewEpicStories,
    onNormalizeStatus: handleNormalizeStatus,
    onCardClick: handleCardClick,
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
          {t('common:button.retry')}
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
          {t('empty.message')}
        </p>
        <button
          onClick={() => setIsFormOpen(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('issue.add')}
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
            aria-label={t('view.kanban')}
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
            aria-label={t('view.list')}
            aria-pressed={viewMode === 'list'}
          >
            <LayoutList className="w-5 h-5" />
          </button>

          {/* Visible columns stepper (kanban mode only) */}
          {viewMode === 'kanban' && !isMobile && (
            <div className="flex items-center gap-1 ml-2 border-l border-gray-200 dark:border-gray-700 pl-2">
              <button
                onClick={() => setVisibleColumns(visibleColumns - 1)}
                disabled={visibleColumns <= 2}
                className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label={t('view.lessColumns')}
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[1.5rem] text-center tabular-nums">
                {visibleColumns}
              </span>
              <button
                onClick={() => setVisibleColumns(visibleColumns + 1)}
                disabled={visibleColumns >= boardConfig.columns.length}
                className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label={t('view.moreColumns')}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('config.title')}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-1.5 text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('issue.add')}
          </button>
        </div>
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
            <MobileKanbanBoard itemsByColumn={itemsByColumn} boardConfig={boardConfig} {...cardCallbacks} />
          ) : (
            <KanbanBoard itemsByColumn={itemsByColumn} boardConfig={boardConfig} visibleColumns={visibleColumns} {...cardCallbacks} />
          )
        ) : (
          <BoardListView itemsByColumn={itemsByColumn} boardConfig={boardConfig} isMobile={isMobile} {...cardCallbacks} />
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
        projectSlug={projectSlug}
        onClose={() => setEditingIssue(null)}
        onSubmit={handleEditSubmit}
      />

      <EpicStoriesDialog
        open={!!epicDialogData}
        epic={epicDialogData?.epic ?? null}
        stories={epicDialogData?.stories ?? []}
        onClose={() => setEpicDialogData(null)}
      />

      <BoardConfigDialog
        open={isConfigOpen}
        config={boardConfig}
        onClose={() => setIsConfigOpen(false)}
        onSave={async (config) => {
          await updateBoardConfig(config);
          setIsConfigOpen(false);
        }}
        onReset={async () => {
          await resetBoardConfig();
          setIsConfigOpen(false);
        }}
      />
    </div>
  );
}
