/**
 * ProjectBoardPage - Board tab main page with kanban/list views
 * [Source: Story 21.2 - Task 5]
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { LayoutList, Kanban, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { useBoard } from '../hooks/useBoard';
import { useIsMobile } from '../hooks/useIsMobile';
import { KanbanBoard } from '../components/board/KanbanBoard';
import { MobileKanbanBoard } from '../components/board/MobileKanbanBoard';
import { BoardListView } from '../components/board/BoardListView';
import { IssueFormDialog } from '../components/board/IssueFormDialog';
import type { CreateIssueRequest } from '@bmad-studio/shared';

export function ProjectBoardPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
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

  const handleCreateIssue = async (data: CreateIssueRequest) => {
    await createIssue(data);
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
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Board content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'kanban' ? (
          isMobile ? (
            <MobileKanbanBoard itemsByStatus={itemsByStatus} />
          ) : (
            <KanbanBoard itemsByStatus={itemsByStatus} />
          )
        ) : (
          <BoardListView itemsByStatus={itemsByStatus} isMobile={isMobile} />
        )}
      </div>

      <IssueFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateIssue}
      />
    </div>
  );
}
