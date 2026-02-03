/**
 * ProjectCard - Displays a single project card
 * [Source: Story 3.2 - Task 3]
 */

import { MessageSquare, Clock } from 'lucide-react';
import type { ProjectInfo } from '@bmad-studio/shared';
import { formatRelativeTime, formatProjectPath } from '../utils/formatters';

interface ProjectCardProps {
  project: ProjectInfo;
  onClick: (projectSlug: string) => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const handleClick = () => {
    onClick(project.projectSlug);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      aria-label={`프로젝트: ${formatProjectPath(project.originalPath)}, 세션 ${project.sessionCount}개`}
    >
      {/* Project Path */}
      <h3 className="font-medium text-gray-900 dark:text-white truncate mb-2">
        {formatProjectPath(project.originalPath)}
      </h3>

      {/* BMad Badge */}
      {project.isBmadProject && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 mb-3">
          BMad
        </span>
      )}

      {/* Meta Information */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
        {/* Session Count */}
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          <span>{project.sessionCount}</span>
        </div>

        {/* Last Modified */}
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span>{formatRelativeTime(project.lastModified)}</span>
        </div>
      </div>
    </button>
  );
}
