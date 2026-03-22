export interface QueueItem {
  /** Prompt text (empty string for non-prompt items) */
  prompt: string;
  /** @new: whether to start a new session */
  isNewSession: boolean;
  /** @pause: whether this is a breakpoint */
  isBreakpoint?: boolean;
  /** @save: session name to save */
  saveSessionName?: string;
  /** @load: session name to load */
  loadSessionName?: string;
  /** @( ... @): whether this is a multiline block */
  isMultiline?: boolean;
  /** @model: model name to use */
  modelName?: string;
  /** @delay: delay in milliseconds */
  delayMs?: number;
}

export interface QueueParseWarning {
  /** Line number (1-based) */
  line: number;
  /** Warning message */
  message: string;
}

export interface QueueParseResult {
  /** Parsed queue items */
  items: QueueItem[];
  /** Parse warnings */
  warnings: QueueParseWarning[];
}

// Story 15.2: Queue execution types

export interface QueueExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  /** Queue finished successfully (persists until dismissed) */
  isCompleted: boolean;
  /** Queue finished with error (persists until dismissed) */
  isErrored: boolean;
  currentIndex: number;
  totalItems: number;
  pauseReason?: string;
  lockedSessionId: string | null;
  currentModel?: string;
  /** Last error from the most recent queue run (persists after run ends) */
  lastError?: { itemIndex: number; error: string } | null;
  /** Queue items (included during active execution for page re-entry) */
  items?: QueueItem[];
  /** Map of itemIndex -> sessionId for completed items (for session links) */
  completedSessionIds?: Record<number, string>;
  /** True when another client is editing the pending items as script */
  isEditing?: boolean;
  /** True when pause has been requested but current item is still executing */
  isPauseRequested?: boolean;
  /** True when waiting for user input (permission/question) — distinct from isPaused */
  isWaitingForInput?: boolean;
}

export interface QueueItemsUpdatedEvent {
  items: QueueItem[];
  totalItems: number;
  currentIndex: number;
}

export interface QueueProgressEvent {
  currentIndex: number;
  totalItems: number;
  status: 'running' | 'paused' | 'completed' | 'error' | 'aborted';
  pauseReason?: string;
  sessionId: string;
  /** True when pause has been requested but current item is still executing */
  isPauseRequested?: boolean;
  /** True when waiting for user input (permission/question) */
  isWaitingForInput?: boolean;
}

export interface QueueItemCompleteEvent {
  itemIndex: number;
  sessionId: string;
  markerDetected?: 'QUEUE_STOP' | 'QUEUE_PASS';
}

export interface QueueErrorEvent {
  itemIndex: number;
  error: string;
  sessionId: string;
}

// Story 15.5: Queue template types

/** A story number extracted from PRD or story files (e.g. "1.1", "BE-1.1", "BS-1") */
export interface QueueStoryInfo {
  /** Full story number string, e.g. "1.1", "BE-1.1", "BS-1" */
  storyNum: string;
  /** Epic number/key, e.g. 1, "BE-1", "BS" */
  epicNum: number | string;
  /** Story number within epic, e.g. 1 */
  storyIndex: number;
  /** Optional story title if extracted */
  title?: string;
}

/** Saved queue template */
export interface QueueTemplate {
  id: string;          // UUID
  name: string;        // User-given name
  template: string;    // Template text with {story_num} placeholders
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
