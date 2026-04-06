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
import { resolveBadge } from '../components/board/constants';

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
  const [legacyCount, setLegacyCount] = useState(0);
  const [isMigrating, setIsMigrating] = useState(false);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (projectSlug) {
      boardApi.legacyIssueCount(projectSlug).then((r) => setLegacyCount(r.count)).catch(() => {});
    }
  }, [projectSlug]);

  const handleMigrateIssues = useCallback(async () => {
    if (!projectSlug || isMigrating) return;
    setIsMigrating(true);
    try {
      await boardApi.migrateIssues(projectSlug);
      setLegacyCount(0);
      refresh();
    } catch {
      setActionErrorWithClear(t('errors.migrationFailed'));
    } finally {
      setIsMigrating(false);
    }
  }, [projectSlug, isMigrating, refresh]);

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
      await boardApi.updateIssue(projectSlug, item.id, { status: 'In Progress' });
      const sessionId = generateUUID();
      const issueFile = item.externalRef || `docs/issues/${item.id}.md`;
      const prompt = `%quick-fix-issue ${issueFile}`;
      const params = new URLSearchParams({ task: prompt });
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
      const issueFile = item.externalRef || `docs/issues/${item.id}.md`;
      const snippetName = targetType === 'story' ? 'promote-to-story' : 'promote-to-epic';
      const prompt = `%${snippetName} ${issueFile}`;
      const params = new URLSearchParams({ task: prompt });

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

  // Change issue/story status (In Progress → Ready for Review, Ready for Done → Done, etc.)
  const handleIssueStatusChange = useCallback(async (item: BoardItem, status: string) => {
    if (!projectSlug) return;
    try {
      if (item.type === 'story') {
        await boardApi.updateStoryStatus(projectSlug, item.id, status);
      } else {
        await boardApi.updateIssue(projectSlug, item.id, { status });
      }
      await refresh();
    } catch {
      setActionErrorWithClear(t('errors.updateStatusFailed'));
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

  // Workflow action — uses resolved badge ID for branching
  const handleWorkflowAction = useCallback(async (item: BoardItem) => {
    if (!projectSlug) return;
    const sessionId = generateUUID();
    const badge = resolveBadge(item);
    let task = '';

    // Issue workflow actions
    if (item.type === 'issue') {
      const issueFile = item.externalRef || `docs/issues/${item.id}.md`;

      if (badge.id === 'in-progress') {
        task = `%quick-fix-issue ${issueFile}`;
      } else {
        return;
      }

      const params = new URLSearchParams({ task });
      navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
      return;
    }

    // Story workflow actions
    if (item.type !== 'story') return;
    const storyNum = item.id.replace(/^story-/, '');

    if (badge.id === 'draft') {
      task = `%validate-story ${storyNum}`;
    } else if (badge.id === 'approved') {
      try {
        await boardApi.updateStoryStatus(projectSlug, item.id, 'In Progress');
      } catch {
        setActionErrorWithClear(t('errors.updateStatusFailed'));
        return;
      }
      task = `%develop-story ${storyNum}`;
    } else if (badge.id === 'in-progress') {
      task = `%develop-story ${storyNum}`;
    } else if (badge.id === 'qa-passed' || badge.id === 'qa-waived') {
      task = `%mark-done ${storyNum}`;
    } else if (badge.id === 'qa-failed' || badge.id === 'qa-concerns') {
      task = `%apply-qa-fixes ${storyNum}`;
    } else if (badge.id === 'qa-fixed' || badge.id === 'ready-for-review' || badge.id === 'ready-for-done') {
      task = `%qa-review ${storyNum}`;
    } else {
      return;
    }

    const params = new URLSearchParams({ task });
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  }, [projectSlug, navigate, t, setActionErrorWithClear]);

  // Validate only — validate story without fix, approve after user fixes
  const handleValidateOnly = useCallback((item: BoardItem) => {
    if (!projectSlug || item.type !== 'story') return;
    const sessionId = generateUUID();
    const storyNum = item.id.replace(/^story-/, '');
    const params = new URLSearchParams({
      task: `%validate-story ${storyNum}`,
    });
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  }, [projectSlug, navigate, t]);

  // Validate and fix — validate draft story then fix all issues
  const handleValidateAndFix = useCallback((item: BoardItem) => {
    if (!projectSlug || item.type !== 'story') return;
    const sessionId = generateUUID();
    const storyNum = item.id.replace(/^story-/, '');
    const params = new URLSearchParams({
      task: `%validate-and-fix ${storyNum}`,
    });
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  }, [projectSlug, navigate, t]);

  // Commit and complete — commit changes then update status to Done
  const handleCommitAndComplete = useCallback((item: BoardItem) => {
    if (!projectSlug) return;
    const sessionId = generateUUID();
    const storyNum = item.id.replace(/^story-/, '');
    const task = `%commit-and-done ${storyNum}`;
    const params = new URLSearchParams({ task });
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  }, [projectSlug, navigate]);

  // QA review for stories (re-request)
  const handleRequestQAReview = useCallback((item: BoardItem) => {
    if (!projectSlug || item.type !== 'story') return;
    const sessionId = generateUUID();
    const storyNum = item.id.replace(/^story-/, '');
    const params = new URLSearchParams({
      task: `%qa-review ${storyNum}`,
    });
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  }, [projectSlug, navigate]);

  // Create next story for an epic
  const handleCreateNextStory = useCallback((item: BoardItem) => {
    if (!projectSlug || item.type !== 'epic') return;
    const sessionId = generateUUID();
    const epicNum = item.epicNumber ?? item.id.replace(/^epic-/, '');
    const params = new URLSearchParams({
      task: `%draft-story ${epicNum}`,
    });
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

  // Card action callbacks
  const cardCallbacks = {
    onQuickFix: handleQuickFix,
    onPromote: handlePromote,
    onEdit: handleEditIssue,
    onClose: handleCloseIssue,
    onReopen: handleReopenIssue,
    onDelete: handleDeleteIssue,
    onWorkflowAction: handleWorkflowAction,
    onValidateAndFixAction: handleValidateAndFix,
    onValidateOnlyAction: handleValidateOnly,
    onViewEpicStories: handleViewEpicStories,
    onCreateNextStory: handleCreateNextStory,
    onRequestQAReview: handleRequestQAReview,
    onIssueStatusChange: handleIssueStatusChange,
    onCommitAndComplete: handleCommitAndComplete,
    onCardClick: handleCardClick,
  };

  // Loading skeleton
  if (isLoading && items.length === 0) {
    return (
      <div className="p-4 h-full flex flex-col animate-pulse">
        {/* Toolbar skeleton: view toggle buttons + settings + add button */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gray-200 dark:bg-[#253040] rounded-lg" />
            <div className="w-9 h-9 bg-gray-200 dark:bg-[#253040] rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gray-200 dark:bg-[#253040] rounded-lg" />
            <div className="h-8 w-20 bg-blue-200 dark:bg-blue-900/30 rounded-lg" />
          </div>
        </div>

        {/* Kanban columns skeleton */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {Array.from({ length: isMobile ? 1 : 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-72 space-y-3">
              {/* Column header */}
              <div className="flex items-center gap-2 p-2">
                <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-[#253040] rounded" />
                <div className="h-4 w-6 bg-gray-200 dark:bg-[#253040] rounded-full" />
              </div>
              {/* Cards */}
              {Array.from({ length: 2 }).map((_, j) => (
                <div
                  key={j}
                  className="p-3 bg-gray-50 dark:bg-[#263240] rounded-lg border border-gray-300 dark:border-[#3a4d5e] space-y-2"
                >
                  <div className="h-4 w-3/4 bg-gray-200 dark:bg-[#253040] rounded" />
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-12 bg-gray-200 dark:bg-[#253040] rounded-full" />
                    <div className="h-3 w-16 bg-gray-200 dark:bg-[#253040] rounded" />
                  </div>
                </div>
              ))}
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
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#253040]'
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
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#253040]'
            }`}
            aria-label={t('view.list')}
            aria-pressed={viewMode === 'list'}
          >
            <LayoutList className="w-5 h-5" />
          </button>

          {/* Visible columns stepper (kanban mode only) */}
          {viewMode === 'kanban' && !isMobile && (
            <div className="flex items-center gap-1 ml-2 border-l border-gray-300 dark:border-[#3a4d5e] pl-2">
              <button
                onClick={() => setVisibleColumns(visibleColumns - 1)}
                disabled={visibleColumns <= 2}
                className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#253040] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label={t('view.lessColumns')}
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-[1.5rem] text-center tabular-nums">
                {visibleColumns}
              </span>
              <button
                onClick={() => setVisibleColumns(visibleColumns + 1)}
                disabled={visibleColumns >= boardConfig.columns.length}
                className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#253040] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#253040] transition-colors"
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

      {/* Legacy issue migration banner */}
      {legacyCount > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm flex items-center justify-between">
          <span>{t('migration.legacyIssues', { count: legacyCount })}</span>
          <button
            onClick={handleMigrateIssues}
            disabled={isMigrating}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
          >
            {isMigrating ? t('migration.migrating') : t('migration.migrate')}
          </button>
        </div>
      )}

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
