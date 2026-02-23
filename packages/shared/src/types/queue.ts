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
