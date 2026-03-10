/**
 * SessionListItemSkeleton - Skeleton loading component for session list items
 * [Source: Story 3.4 - Task 4]
 */

export function SessionListItemSkeleton() {
  return (
    <div className="w-full p-4 bg-gray-50 dark:bg-[#263240] rounded-lg border border-gray-200 dark:border-[#253040] animate-pulse">
      {/* First prompt skeleton */}
      <div className="h-5 bg-gray-200 dark:bg-[#253040] rounded w-3/4 mb-3" />

      {/* Meta info skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-24" />
        <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-20" />
      </div>
    </div>
  );
}
