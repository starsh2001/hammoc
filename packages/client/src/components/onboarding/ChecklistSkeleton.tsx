/**
 * ChecklistItem loading skeleton component
 * Provides visual feedback during checklist loading
 */
import { useTranslation } from 'react-i18next';

export function ChecklistSkeleton() {
  const { t } = useTranslation('common');
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-lg border border-gray-300 dark:border-[#3a4d5e] bg-white dark:bg-[#263240] animate-pulse"
      role="status"
      aria-label={t('onboarding.loadingAria')}
    >
      {/* Icon skeleton */}
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-5 h-5 bg-gray-200 dark:bg-[#253040] rounded-full" />
      </div>
      <div className="flex-grow space-y-2">
        {/* Title skeleton */}
        <div className="h-5 bg-gray-200 dark:bg-[#253040] rounded w-1/3" />
        {/* Description skeleton */}
        <div className="h-4 bg-gray-200 dark:bg-[#253040] rounded w-2/3" />
        {/* Command skeleton */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-grow h-10 bg-gray-200 dark:bg-[#253040] rounded" />
          <div className="w-10 h-10 bg-gray-200 dark:bg-[#253040] rounded" />
        </div>
      </div>
      <span className="sr-only">{t('onboarding.loadingText')}</span>
    </div>
  );
}

interface ChecklistSkeletonListProps {
  count?: number;
}

/**
 * Render multiple ChecklistSkeleton items
 */
export function ChecklistSkeletonList({ count = 3 }: ChecklistSkeletonListProps) {
  const { t } = useTranslation('common');
  return (
    <div className="space-y-3" role="status" aria-label={t('onboarding.listLoadingAria')}>
      {Array.from({ length: count }).map((_, index) => (
        <ChecklistSkeleton key={index} />
      ))}
    </div>
  );
}
