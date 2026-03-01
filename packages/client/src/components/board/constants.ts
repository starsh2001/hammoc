/**
 * Board shared constants
 * [Source: Story 21.2 - QA recommendation]
 */

import type { BoardItemStatus } from '@bmad-studio/shared';

export const BOARD_COLUMNS: BoardItemStatus[] = [
  'Open', 'Draft', 'Approved', 'InProgress', 'Review', 'Done', 'Closed',
];

export const STATUS_LABEL: Record<BoardItemStatus, string> = {
  Open: 'Open',
  Draft: 'Draft',
  Approved: 'Approved',
  InProgress: 'In Progress',
  Review: 'Review',
  Done: 'Done',
  Closed: 'Closed',
};
