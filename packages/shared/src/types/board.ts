// Epic 21: Project Board types (Story 21.1)

export type BoardItemType = 'issue' | 'story' | 'epic';
export type BoardItemStatus = 'Open' | 'Draft' | 'Approved' | 'InProgress' | 'Blocked' | 'Review' | 'Done' | 'Closed' | 'Promoted';

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
  /** Custom raw-status → BoardItemStatus mappings (e.g. "Complete" → "Done") */
  customStatusMappings?: Record<string, BoardItemStatus>;
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
  Promoted: 'Close',
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  columns: DEFAULT_BOARD_COLUMNS,
  statusToColumn: DEFAULT_STATUS_TO_COLUMN,
};

// All possible statuses (used for validation)
const ALL_STATUSES: BoardItemStatus[] = [
  'Open', 'Draft', 'Approved', 'InProgress', 'Blocked', 'Review', 'Done', 'Closed', 'Promoted',
];

// Required column IDs that cannot be removed
export const REQUIRED_COLUMN_IDS = ['Open', 'Close'] as const;

export function validateBoardConfig(config: unknown): string[] {
  const errors: string[] = [];

  // Shape guard: ensure config is a well-formed object
  if (typeof config !== 'object' || config === null) {
    return ['Board config must be an object'];
  }
  const cfg = config as Record<string, unknown>;

  if (!Array.isArray(cfg.columns)) {
    return ['Board config must have a columns array'];
  }
  if (typeof cfg.statusToColumn !== 'object' || cfg.statusToColumn === null || Array.isArray(cfg.statusToColumn)) {
    return ['Board config must have a statusToColumn object'];
  }

  const columns = cfg.columns as BoardColumnConfig[];
  const statusToColumn = cfg.statusToColumn as Record<string, string>;

  if (columns.length === 0) {
    errors.push('At least one column is required');
  }
  if (columns.length > 10) {
    errors.push('Maximum 10 columns allowed');
  }
  const columnIds = new Set(columns.map((c) => c.id));
  if (columnIds.size !== columns.length) {
    errors.push('Column IDs must be unique');
  }
  for (const requiredId of REQUIRED_COLUMN_IDS) {
    if (!columnIds.has(requiredId)) {
      errors.push(`Required column "${requiredId}" is missing`);
    }
  }
  for (const col of columns) {
    if (!col.id || typeof col.id !== 'string' || !col.id.trim()) {
      errors.push('Column ID cannot be empty');
    }
    if (!col.label || typeof col.label !== 'string' || !col.label.trim()) {
      errors.push('Column label cannot be empty');
    }
  }
  for (const status of ALL_STATUSES) {
    const target = statusToColumn[status];
    if (!target || !columnIds.has(target)) {
      errors.push(`Status "${status}" maps to non-existent column "${target}"`);
    }
  }

  // Validate customStatusMappings if present
  const allStatusSet = new Set<string>(ALL_STATUSES);
  if (cfg.customStatusMappings != null) {
    if (typeof cfg.customStatusMappings !== 'object' || Array.isArray(cfg.customStatusMappings)) {
      errors.push('customStatusMappings must be an object');
    } else {
      const csm = cfg.customStatusMappings as Record<string, string>;
      for (const [rawKey, target] of Object.entries(csm)) {
        if (!rawKey.trim()) {
          errors.push('Custom status mapping key cannot be empty');
        }
        if (!allStatusSet.has(target)) {
          errors.push(`Custom status mapping "${rawKey}" targets invalid status "${target}"`);
        }
      }
    }
  }

  return errors;
}

export interface IssueAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadAttachmentResponse {
  attachment: IssueAttachment;
}

export interface BoardItem {
  id: string;
  type: BoardItemType;
  title: string;
  status: BoardItemStatus;
  /** Original status from story file when it differs from the mapped status */
  rawStatus?: string;
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
  /** Project-relative path to the source file (story/epic markdown) */
  filePath?: string;
  attachments?: IssueAttachment[];
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
  status?: 'Open' | 'InProgress' | 'Done' | 'Closed' | 'Promoted';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  linkedStory?: string;
  linkedEpic?: string;
}
