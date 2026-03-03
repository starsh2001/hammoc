// Epic 21: Project Board types (Story 21.1)

export type BoardItemType = 'issue' | 'story' | 'epic';
export type BoardItemStatus = 'Open' | 'Draft' | 'Approved' | 'InProgress' | 'Blocked' | 'Review' | 'Done' | 'Closed';

// Board column is a string to support custom column configurations
export type BoardColumn = string;

// Column definition for dynamic board configuration
export interface BoardColumnConfig {
  id: string;
  label: string;
  colorClass: string;
}

// Full board configuration (columns + status mapping)
export interface BoardConfig {
  columns: BoardColumnConfig[];
  statusToColumn: Record<BoardItemStatus, string>;
}

// Available colors for column customization
export const COLUMN_COLOR_PALETTE = [
  'border-t-gray-400',
  'border-t-indigo-400',
  'border-t-blue-400',
  'border-t-yellow-400',
  'border-t-emerald-500',
  'border-t-red-400',
  'border-t-purple-400',
  'border-t-pink-400',
  'border-t-orange-400',
  'border-t-teal-400',
] as const;

// Default 5-column board configuration
export const DEFAULT_BOARD_COLUMNS: BoardColumnConfig[] = [
  { id: 'Open', label: 'Open', colorClass: 'border-t-gray-400' },
  { id: 'ToDo', label: 'To Do', colorClass: 'border-t-indigo-400' },
  { id: 'Doing', label: 'Doing', colorClass: 'border-t-blue-400' },
  { id: 'Review', label: 'Review', colorClass: 'border-t-yellow-400' },
  { id: 'Close', label: 'Close', colorClass: 'border-t-emerald-500' },
];

export const DEFAULT_STATUS_TO_COLUMN: Record<BoardItemStatus, string> = {
  Open: 'Open',
  Draft: 'ToDo',
  Approved: 'ToDo',
  InProgress: 'Doing',
  Blocked: 'ToDo',
  Review: 'Review',
  Done: 'Close',
  Closed: 'Close',
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  columns: DEFAULT_BOARD_COLUMNS,
  statusToColumn: DEFAULT_STATUS_TO_COLUMN,
};

// Derived constants for backward compatibility
export const BOARD_COLUMN_ORDER: string[] = DEFAULT_BOARD_COLUMNS.map((c) => c.id);

export const STATUS_TO_COLUMN: Record<BoardItemStatus, string> = DEFAULT_STATUS_TO_COLUMN;

export const COLUMN_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_BOARD_COLUMNS.map((c) => [c.id, c.label]),
);

// All possible statuses (used for validation)
const ALL_STATUSES: BoardItemStatus[] = [
  'Open', 'Draft', 'Approved', 'InProgress', 'Blocked', 'Review', 'Done', 'Closed',
];

export function validateBoardConfig(config: BoardConfig): string[] {
  const errors: string[] = [];
  if (!config.columns || config.columns.length === 0) {
    errors.push('At least one column is required');
  }
  if (config.columns.length > 10) {
    errors.push('Maximum 10 columns allowed');
  }
  const columnIds = new Set(config.columns.map((c) => c.id));
  if (columnIds.size !== config.columns.length) {
    errors.push('Column IDs must be unique');
  }
  for (const col of config.columns) {
    if (!col.id || !col.id.trim()) {
      errors.push('Column ID cannot be empty');
    }
    if (!col.label || !col.label.trim()) {
      errors.push('Column label cannot be empty');
    }
  }
  for (const status of ALL_STATUSES) {
    const target = config.statusToColumn[status];
    if (!target || !columnIds.has(target)) {
      errors.push(`Status "${status}" maps to non-existent column "${target}"`);
    }
  }
  return errors;
}

export interface BoardItem {
  id: string;
  type: BoardItemType;
  title: string;
  status: BoardItemStatus;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  epicNumber?: number;
  storyProgress?: {
    total: number;
    done: number;
  };
  linkedStory?: string;
  linkedEpic?: string;
  externalRef?: string;
}

export interface BoardResponse {
  items: BoardItem[];
  config: BoardConfig;
}

export interface CreateIssueRequest {
  title: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  status?: 'Open' | 'InProgress' | 'Done' | 'Closed';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  linkedStory?: string;
  linkedEpic?: string;
}
