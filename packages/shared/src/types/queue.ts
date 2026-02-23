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
  currentIndex: number;
  totalItems: number;
  pauseReason?: string;
  lockedSessionId: string | null;
  currentModel?: string;
}

export interface QueueProgressEvent {
  currentIndex: number;
  totalItems: number;
  status: 'running' | 'paused' | 'completed' | 'error';
  pauseReason?: string;
  sessionId: string;
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
