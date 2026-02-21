import { useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { BmadEpicStatus } from '@bmad-studio/shared';

interface EpicProgressCardProps {
  epics: BmadEpicStatus[];
}

const STATUS_STYLES: Record<string, string> = {
  Done: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  Draft: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  Approved: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'In Progress': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  Blocked: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

function getStatusStyle(status: string): string {
  return STATUS_STYLES[status] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
}

export function EpicProgressCard({ epics }: EpicProgressCardProps) {
  const [expandedEpics, setExpandedEpics] = useState<Set<number>>(new Set());

  const toggleEpic = (epicNumber: number) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicNumber)) {
        next.delete(epicNumber);
      } else {
        next.add(epicNumber);
      }
      return next;
    });
  };

  return (
    <div
      role="region"
      aria-label="에픽 진행률"
      className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">에픽 진행률</h2>
      </div>
      <div className="space-y-2 text-sm">
        {epics.map((epic) => {
          const doneCount = epic.stories.filter((s) => s.status === 'Done').length;
          const totalCount = epic.stories.length;
          const isExpanded = expandedEpics.has(epic.number);
          const hasStories = totalCount > 0;

          return (
            <div key={epic.number}>
              {/* Epic row */}
              {hasStories ? (
                <div
                  onClick={() => toggleEpic(epic.number)}
                  className="flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded transition-colors cursor-pointer px-1 py-0.5"
                >
                  <span className="text-gray-700 dark:text-gray-300 truncate mr-2">
                    {epic.number}. {epic.name}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {doneCount}/{totalCount}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className="text-gray-700 dark:text-gray-300 truncate mr-2">
                    {epic.number}. {epic.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">스토리 미작성</span>
                </div>
              )}

              {/* Progress bar */}
              {totalCount > 0 && (
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-1 mx-1">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
                    style={{ width: `${(doneCount / totalCount) * 100}%` }}
                  />
                </div>
              )}

              {/* Expanded story details */}
              {isExpanded && hasStories && (
                <div className="mt-2 ml-4 space-y-1">
                  {epic.stories.map((story) => (
                    <div key={story.file} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{story.file}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusStyle(story.status)}`}>
                        {story.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {epics.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">에픽이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
