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
    <div className="text-center py-12" role="status" aria-label={title}>
      <Icon
        className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4"
        aria-hidden="true"
      />
      <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
        {title}
      </p>
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
