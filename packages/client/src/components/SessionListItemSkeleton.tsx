/**
 * SessionListItemSkeleton - Skeleton loading component for session list items
 * [Source: Story 3.4 - Task 4]
 */

export function SessionListItemSkeleton() {
  return (
    <div className="w-full p-4 bg-gray-50 dark:bg-[#263240] rounded-lg border border-gray-300 dark:border-[#3a4d5e] animate-pulse">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Name badge + session ID row */}
          <div className="flex items-baseline gap-1.5 mb-1">
            <div className="h-4 bg-blue-100 dark:bg-blue-900/40 rounded w-16 flex-shrink-0" />
            <div className="h-3 bg-gray-200 dark:bg-[#253040] rounded w-24" />
          </div>

          {/* First prompt title */}
          <div className="h-5 bg-gray-200 dark:bg-[#253040] rounded w-3/4 mb-2" />

          {/* Meta info: status dot + message count | time */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full" />
              <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-16" />
            </div>
            <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-14" />
          </div>
        </div>
      </div>
    </div>
  );
}
