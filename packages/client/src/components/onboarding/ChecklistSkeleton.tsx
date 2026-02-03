/**
 * ChecklistItem 로딩 스켈레톤 컴포넌트
 * 체크리스트 로딩 중 사용자에게 시각적 피드백 제공
 */
export function ChecklistSkeleton() {
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 animate-pulse"
      role="status"
      aria-label="로딩 중"
    >
      {/* 아이콘 스켈레톤 */}
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
      </div>
      <div className="flex-grow space-y-2">
        {/* 제목 스켈레톤 */}
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        {/* 설명 스켈레톤 */}
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        {/* 명령어 스켈레톤 */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-grow h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
      <span className="sr-only">체크리스트 항목 로딩 중...</span>
    </div>
  );
}

interface ChecklistSkeletonListProps {
  count?: number;
}

/**
 * 여러 개의 ChecklistSkeleton을 렌더링
 */
export function ChecklistSkeletonList({ count = 3 }: ChecklistSkeletonListProps) {
  return (
    <div className="space-y-3" role="status" aria-label="체크리스트 로딩 중">
      {Array.from({ length: count }).map((_, index) => (
        <ChecklistSkeleton key={index} />
      ))}
    </div>
  );
}
