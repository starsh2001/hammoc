/**
 * ProjectCardSkeleton - Skeleton loading state for ProjectCard
 * [Source: Story 3.2 - Task 4]
 */

export function ProjectCardSkeleton() {
  return (
    <div
      className="relative w-full bg-gray-50 dark:bg-[#2a3545] rounded-lg border border-gray-200 dark:border-[#354050] p-4 animate-pulse"
      role="presentation"
      aria-hidden="true"
    >
      {/* Path + BMad badge row */}
      <div className="flex items-center gap-1.5 pr-6 mb-1">
        <div className="h-3.5 bg-blue-100 dark:bg-blue-900 rounded w-10 flex-shrink-0" />
        <div className="h-3 bg-gray-200 dark:bg-[#253040] rounded w-40" />
      </div>

      {/* Project name */}
      <div className="h-5 bg-gray-200 dark:bg-[#253040] rounded w-3/5 pr-6 mb-2" />

      {/* Meta information: session count | last modified */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-gray-200 dark:bg-[#253040] rounded" />
          <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-6" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-gray-200 dark:bg-[#253040] rounded" />
          <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-16" />
        </div>
      </div>
    </div>
  );
}
