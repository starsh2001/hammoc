// Epic 21: Project Board types (Story 21.1)

export type BoardItemType = 'issue' | 'story' | 'epic';

// Column definition for dynamic board configuration
export interface BoardColumnConfig {
  id: string;
  label: string;
  colorClass: string;
}

// Full board configuration (columns + badge-to-column mapping)
// badgeToColumn maps resolved badge IDs to column IDs (N:1)
export interface BoardConfig {
  columns: BoardColumnConfig[];
  badgeToColumn: Record<string, string>;
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
const DEFAULT_BOARD_COLUMNS: BoardColumnConfig[] = [
  { id: 'Open', label: 'Open', colorClass: 'border-t-gray-400' },
  { id: 'ToDo', label: 'To Do', colorClass: 'border-t-indigo-400' },
  { id: 'Doing', label: 'Doing', colorClass: 'border-t-blue-400' },
  { id: 'Review', label: 'Review', colorClass: 'border-t-yellow-400' },
  { id: 'Close', label: 'Close', colorClass: 'border-t-emerald-500' },
];

// Maps badge IDs to column IDs
const DEFAULT_BADGE_TO_COLUMN: Record<string, string> = {
  'open': 'Open',
  'draft': 'ToDo',
  'approved': 'ToDo',
  'in-progress': 'Doing',
  'blocked': 'ToDo',
  'ready-for-review': 'Review',
  'qa-failed': 'Doing',
  'qa-concerns': 'Doing',
  'qa-passed': 'Review',
  'qa-waived': 'Review',
  'qa-fixed': 'Review',
  'ready-for-done': 'Review',
  'done': 'Close',
  'closed': 'Close',
  'promoted': 'Close',
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  columns: DEFAULT_BOARD_COLUMNS,
  badgeToColumn: DEFAULT_BADGE_TO_COLUMN,
};

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
  if (typeof cfg.badgeToColumn !== 'object' || cfg.badgeToColumn === null || Array.isArray(cfg.badgeToColumn)) {
    return ['Board config must have a badgeToColumn object'];
  }

  const columns = cfg.columns as BoardColumnConfig[];
  const badgeToColumn = cfg.badgeToColumn as Record<string, string>;

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
  // Validate that all badgeToColumn targets point to existing columns
  for (const [badge, target] of Object.entries(badgeToColumn)) {
    if (!target || !columnIds.has(target)) {
      errors.push(`Badge "${badge}" maps to non-existent column "${target}"`);
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
  /** Raw status string from the source file (e.g. 'Ready for Review', 'Draft', etc.) */
  status: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  epicNumber?: number | string;
  storyProgress?: {
    total: number;
    done: number;
  };
  linkedStory?: string;
  linkedEpic?: string;
  externalRef?: string;
  /** Latest QA gate decision: 'PASS' | 'CONCERNS' | 'FAIL' | 'WAIVED' */
  gateResult?: string;
  /** Project-relative path to the source file (story/epic markdown) */
  filePath?: string;
  attachments?: IssueAttachment[];
  /** File modification time (epoch ms) — used for sorting recently updated items */
  updatedAt?: number;
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
  status?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  linkedStory?: string;
  linkedEpic?: string;
}
