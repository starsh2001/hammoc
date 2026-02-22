import { useState } from 'react';
import { BarChart3, ChevronDown, FileText } from 'lucide-react';
import type { BmadEpicStatus } from '@bmad-studio/shared';

import { useFileStore } from '../../stores/fileStore.js';

interface EpicProgressCardProps {
  epics: BmadEpicStatus[];
  projectSlug?: string;
  storyBasePath?: string;
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

export function EpicProgressCard({ epics, projectSlug, storyBasePath }: EpicProgressCardProps) {
  const [expandedEpics, setExpandedEpics] = useState<Set<number>>(new Set());
  const openFile = useFileStore((s) => s.requestFileNavigation);

  const handleOpenStory = (fileName: string) => {
    if (!projectSlug || !storyBasePath) return;
    openFile(projectSlug, `${storyBasePath}/${fileName}`);
  };

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
          const writtenCount = epic.stories.length;
          const planned = epic.plannedStories ?? writtenCount;
          const barTotal = Math.max(planned, writtenCount);
          const isExpanded = expandedEpics.has(epic.number);
          const hasContent = writtenCount > 0 || planned > 0;

          return (
            <div key={epic.number}>
              {/* Epic row */}
              {hasContent ? (
                <div
                  onClick={() => toggleEpic(epic.number)}
                  className="flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded transition-colors cursor-pointer px-1 py-0.5"
                >
                  <span className="text-gray-700 dark:text-gray-300 truncate mr-2">
                    {epic.number}. {epic.name}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {doneCount}/{planned}
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
                  <span className="text-xs text-gray-400 dark:text-gray-500">스토리 미정의</span>
                </div>
              )}

              {/* Progress bar */}
              {barTotal > 0 && (
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-1 mx-1">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
                    style={{ width: `${(doneCount / barTotal) * 100}%` }}
                  />
                </div>
              )}

              {/* Expanded story details */}
              {isExpanded && hasContent && (
                <div className="mt-2 ml-4 space-y-1">
                  {writtenCount > 0 ? (
                    epic.stories.map((story) => {
                      const storyNum = story.file.match(/^(\d+\.\d+)/)?.[1];
                      const displayName = story.title ? `${storyNum}. ${story.title}` : story.file;
                      return (
                      <div key={story.file} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{displayName}</span>
                          {projectSlug && storyBasePath && (
                            <button
                              onClick={() => handleOpenStory(story.file)}
                              className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                              title={story.file}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusStyle(story.status)}`}>
                          {story.status}
                        </span>
                      </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      PRD에 {planned}개 스토리 예정 — 아직 작성된 스토리 파일 없음
                    </p>
                  )}
                  {writtenCount > 0 && planned > writtenCount && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      + {planned - writtenCount}개 스토리 미작성
                    </p>
                  )}
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
