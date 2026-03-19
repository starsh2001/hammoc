/**
 * EmptyState - Reusable empty state component
 * [Source: Story 3.4 - Task 4]
 */

import { MessageSquare, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  /** Icon to display (default: MessageSquare) */
  icon?: LucideIcon;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Action button text (hidden if not provided) */
  actionLabel?: string;
  /** Action button click handler */
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon = MessageSquare,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="text-center py-6 md:py-12 px-4" role="status" aria-label={title}>
      <Icon
        className="w-10 h-10 md:w-16 md:h-16 mx-auto text-gray-400 dark:text-gray-500 mb-3 md:mb-4"
        aria-hidden="true"
      />
      <p className="text-base md:text-lg font-medium text-gray-900 dark:text-white mb-1 md:mb-2">
        {title}
      </p>
      <p className="text-sm md:text-base text-gray-500 dark:text-gray-300 mb-3 md:mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#1c2129]"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
