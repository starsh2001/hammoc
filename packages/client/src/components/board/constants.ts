/**
 * Board shared constants
 * [Source: Story 21.2 - QA recommendation]
 */

import type { BoardItemStatus } from '@hammoc/shared';

export const STATUS_LABEL: Record<BoardItemStatus, string> = {
  Open: 'Open',
  Draft: 'Draft',
  Approved: 'Approved',
  InProgress: 'In Progress',
  Blocked: 'Blocked',
  Review: 'Review',
  Done: 'Done',
  Closed: 'Closed',
  Promoted: 'Promoted',
};

export const STATUS_BADGE_COLOR: Record<BoardItemStatus, string> = {
  Open: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  Approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  InProgress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Closed: 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400',
  Promoted: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};
