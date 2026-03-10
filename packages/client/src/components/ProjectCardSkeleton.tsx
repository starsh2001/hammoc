/**
 * ProjectCardSkeleton - Skeleton loading state for ProjectCard
 * [Source: Story 3.2 - Task 4]
 */

export function ProjectCardSkeleton() {
  return (
    <div
      className="bg-gray-50 dark:bg-[#263240] rounded-lg border border-gray-200 dark:border-[#253040] p-4 animate-pulse"
      role="presentation"
      aria-hidden="true"
    >
      {/* Project path skeleton */}
      <div className="h-5 bg-gray-200 dark:bg-[#253040] rounded w-3/4 mb-3" />

      {/* BMad badge skeleton (optional) */}
      <div className="h-5 bg-gray-200 dark:bg-[#253040] rounded w-16 mb-4" />

      {/* Meta information skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-20" />
        <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-24" />
      </div>
    </div>
  );
}
