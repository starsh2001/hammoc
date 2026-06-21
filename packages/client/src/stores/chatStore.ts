/**
 * Chat Store - Zustand store for real-time chat state
 * [Source: Story 4.2 - Task 1, Story 4.5 - Task 1, Story 4.6 - Task 2, Story 4.8 - Task 1]
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import type { PermissionMode, Attachment, ChatUsage, ProjectSettings, SubscriptionRateLimit, ApiHealthStatus, ThinkingEffort } from '@hammoc/shared';
import { getEffectiveContextLimit } from '@hammoc/shared';
import { getSocket } from '../services/socket';
import { useMessageStore } from './messageStore';
import { useChainStore } from './chainStore';
import { usePreferencesStore } from './preferencesStore';
import { debugLog } from '../utils/debugLogger';
import i18n from '../i18n';

/** Delay before showing "waiting" UI (ms) — both sender and passive viewers */
const STREAMING_UI_DELAY_MS = 1000;

// Story 27.3: Branch switch debounce timer — module-level to avoid circular import with useMessageTree
let branchSwitchTimer: ReturnType<typeof setTimeout> | null = null;
export function cancelBranchSwitchTimer() {
  if (branchSwitchTimer) {
    clearTimeout(branchSwitchTimer);
    branchSwitchTimer = null;
  }
}
export function scheduleBranchSwitchEmit(fn: () => void, ms: number) {
  cancelBranchSwitchTimer();
  branchSwitchTimer = setTimeout(() => {
    branchSwitchTimer = null;
    fn();
  }, ms);
}

/** Track the delay timeout so we can cancel if response arrives early */
let streamingDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;

/** Buffer for permission requests that arrive before their tool:call segment */
const pendingPermissionBuffer = new Map<string, string>();

/** Buffer for tool input updates that arrive before their tool:call segment */
const pendingInputBuffer = new Map<string, Record<string, unknown>>();


/** Streaming tool call state */
export interface StreamingToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  output?: string;
  startedAt?: number;
  duration?: number;
  /** Story 37.11 (AC4): true when this is a CLI grid screen-scrape (empty input until reload). */
  provisional?: boolean;
}

/** Interactive choice option */
export interface InteractiveChoice {
  label: string;
  description?: string;
  value: string;
}

/** Individual question in AskUserQuestion (supports up to 4 questions) */
export interface InteractiveQuestion {
  question: string;
  header: string;
  choices: InteractiveChoice[];
  multiSelect?: boolean;
}

/** Interactive segment status */
export type InteractiveStatus = 'waiting' | 'sending' | 'responded' | 'error';

/** Result error data (persisted across completeStreaming) */
export interface ResultErrorData {
  subtype: string;
  errors?: string[];
  totalCostUSD?: number;
  numTurns?: number;
  result: string;
}

/**
 * Streaming segment - discriminated union for text, tool, thinking, system, and interactive segments
 *
 * Story 37.11 (AC4): `provisional` on text/thinking/tool marks a CLI grid SCREEN-SCRAPE (the live
 * estimate) vs the file-parsed authoritative copy. The renderer dims a provisional card and shows a
 * color-independent `live` text badge; the turn-end authoritative reload clears the whole streaming
 * segment list, so the distinction disappears on completion. Unset everywhere else (SDK mode never
 * sets it; CLI file-drain / reload leave it unset).
 */
export type StreamingSegment =
  | { type: 'text'; content: string; provisional?: boolean; messageId?: string }
  | { type: 'thinking'; content: string; provisional?: boolean }
  | { type: 'system'; subtype: 'compact' | 'info' | 'abort'; message: string }
  | { type: 'tool'; toolCall: StreamingToolCall; status: 'pending' | 'completed' | 'error'; permissionId?: string; permissionStatus?: 'waiting' | 'approved' | 'denied'; provisional?: boolean }
  | {
      type: 'interactive';
      id: string;
      interactionType: 'permission' | 'question';
      toolCall?: StreamingToolCall;
      choices: InteractiveChoice[];
      questions?: InteractiveQuestion[];
      multiSelect?: boolean;
      status: InteractiveStatus;
      response?: string | string[] | Record<string, string | string[]>;
      errorMessage?: string;
    }
  | { type: 'task_notification'; taskId: string; status: 'completed' | 'failed' | 'stopped'; outputFile?: string; summary?: string; toolUseId?: string }
  | { type: 'tool_summary'; summary: string; precedingToolUseIds: string[] }
  | { type: 'result_error'; subtype: string; errors?: string[]; totalCostUSD?: number; numTurns?: number; result: string };

/** Type guard for text segments */
export function isTextSegment(seg: StreamingSegment): seg is Extract<StreamingSegment, { type: 'text' }> {
  return seg.type === 'text';
}

/** Type guard for thinking segments */
export function isThinkingSegment(seg: StreamingSegment): seg is Extract<StreamingSegment, { type: 'thinking' }> {
  return seg.type === 'thinking';
}

/** Type guard for tool segments */
export function isToolSegment(seg: StreamingSegment): seg is Extract<StreamingSegment, { type: 'tool' }> {
  return seg.type === 'tool';
}

/** Type guard for system segments */
export function isSystemSegment(
  seg: StreamingSegment
): seg is { type: 'system'; subtype: 'compact' | 'info' | 'abort'; message: string } {
  return seg.type === 'system';
}

/** Type guard for interactive segments */
export function isInteractiveSegment(
  seg: StreamingSegment
): seg is StreamingSegment & { type: 'interactive' } {
  return seg.type === 'interactive';
}

/** Type guard for task notification segments */
export function isTaskNotificationSegment(
  seg: StreamingSegment
): seg is StreamingSegment & { type: 'task_notification' } {
  return seg.type === 'task_notification';
}

/** Type guard for tool summary segments */
export function isToolSummarySegment(
  seg: StreamingSegment
): seg is StreamingSegment & { type: 'tool_summary' } {
  return seg.type === 'tool_summary';
}

/** Type guard for result error segments */
export function isResultErrorSegment(
  seg: StreamingSegment
): seg is StreamingSegment & { type: 'result_error' } {
  return seg.type === 'result_error';
}

interface ChatState {
  /** Whether Claude is currently generating a response */
  isStreaming: boolean;
  /** Current streaming session ID */
  streamingSessionId: string | null;
  /** Current streaming message ID */
  streamingMessageId: string | null;
  /** Ordered streaming segments (text/tool interleaved) */
  streamingSegments: StreamingSegment[];
  /** When streaming started */
  streamingStartedAt: Date | null;
  /** Which engine is running the current turn (sent by the server at session init / buffer-replay). */
  streamingEngineMode: 'sdk' | 'cli' | null;
  /**
   * Story 32.7: transient CLI-engine generation progress ("↓ N tokens · Ns" parsed
   * from the claude TUI spinner). Live-only — never persisted to messages or the
   * replay buffer; cleared when streaming starts/completes/aborts. null when no
   * progress signal is active (SDK mode never sets it).
   */
  generationProgress: { tokens: number; elapsedSeconds: number; thinking?: boolean } | null;
  /**
   * Story 36.2: CLI pre-generation phase (boot/inject window). Live-only, cleared
   * alongside generationProgress; null when no phase is active (SDK mode never sets it).
   */
  cliPhase: 'launching' | 'submitting' | 'waiting' | null;
  /**
   * Soft CLI screen-stall flag — true while the server reports the reconstructed CLI screen has
   * shown no change for the configured window (looks frozen). Advisory only; the UI offers a Stop.
   * Cleared alongside cliPhase. (CLI mode only; SDK never sets it.)
   */
  cliScreenStalled: boolean;
  /** True while the main response ended but background tasks are still pending. */
  backgroundWaiting: boolean;
  backgroundWaitingSince: number | null;
  backgroundPendingCount: number;
  /** Current permission mode for Agent SDK */
  permissionMode: PermissionMode;
  /** Current context usage data from last SDK response */
  contextUsage: ChatUsage | null;
  /** Subscription rate limit from OAuth polling (null for non-subscription users) */
  subscriptionRateLimit: SubscriptionRateLimit | null;
  /** Last result error (persisted after completeStreaming clears segments) */
  lastResultError: ResultErrorData | null;
  /** Selected model for next message */
  selectedModel: string;
  /** Selected thinking effort for next message */
  selectedEffort: ThinkingEffort | undefined;
  /** Actual model reported by SDK (from session init) */
  activeModel: string | null;
  /** Global thinking blocks expanded state (all blocks share this) */
  thinkingExpanded: boolean;
  /** Whether context compaction is in progress */
  isCompacting: boolean;
  /** Whether this session was taken over by another browser (locks UI until refresh) */
  isSessionLocked: boolean;
  /** Counter incremented only on normal streaming completion (not abort/error).
   *  Used by prompt chain to distinguish normal completion from error/abort. */
  streamCompleteCount: number;
  /** Project-level settings for override application */
  projectSettings: ProjectSettings | null;
  /** API health status from server polling */
  apiHealth: ApiHealthStatus | null;
  /** Whether a rewind operation is in progress */
  isRewinding: boolean;
  /** Last dryRun result for rewind confirmation dialog */
  lastDryRunResult: {
    filesChanged?: string[];
    insertions?: number;
    deletions?: number;
  } | null;
  /** Story 25.9: Whether a summarize operation is in progress */
  isSummarizing: boolean;
  /** Story 25.9: UUID of the message being summarized */
  summarizingMessageUuid: string | null;
  /** Story 25.9: Result of a completed summary generation */
  summaryResult: { messageUuid: string; summary: string } | null;
  /** UUID of the message currently being edited (inline edit form open) */
  editingMessageUuid: string | null;
  /** Story 25.11: forked session ID from session:forked event (triggers navigation) */
  forkedSessionId: string | null;
  /** Story 27.3: Whether the user is in branch viewer (read-only) mode */
  isBranchViewerMode: boolean;
  /** Story 27.3: Accumulated branch selections for multi-level navigation */
  viewerBranchSelections: Record<string, number>;
}

interface SendMessageOptions {
  /** Project working directory path */
  workingDirectory: string;
  /** Session ID for resuming existing session */
  sessionId?: string;
  /** Whether to resume an existing session */
  resume?: boolean;
  /** Image attachments */
  attachments?: Attachment[];
  /** Assistant UUID to branch from (Story 25.7) */
  resumeSessionAt?: string;
  /** User message UUID for file rewind (Story 25.7) */
  rewindToMessageUuid?: string;
  /** Expected total branch count after this edit */
  expectedBranchTotal?: number;
  /** Fork to a new session from the branch point (Story 25.11) */
  forkSession?: boolean;
}

interface ChatActions {
  /** Set streaming state */
  setStreaming: (streaming: boolean) => void;
  /** Send message via WebSocket */
  sendMessage: (content: string, options: SendMessageOptions) => void;
  /** Start streaming a new message */
  startStreaming: (sessionId: string, messageId: string) => void;
  /** Append content to the current streaming text segment. Story 37.11: `provisional` marks a CLI grid screen-scrape (dimmed + live-badged). */
  appendStreamingContent: (content: string, provisional?: boolean, messageId?: string) => void;
  /** Append content to the current streaming thinking segment. Story 37.11: `provisional` per above. */
  addStreamingThinking: (content: string, provisional?: boolean) => void;
  /** Add a streaming tool call segment */
  addStreamingToolCall: (toolCall: StreamingToolCall) => void;
  /** Update a streaming tool call's input. Set buffer=true to queue the update if the segment doesn't exist yet. */
  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>, buffer?: boolean) => void;
  /** Update a streaming tool call result and status. Story 37.11: `provisional` keeps the card live-badged (grid flip). */
  updateStreamingToolCall: (toolCallId: string, result: string, isError?: boolean, provisional?: boolean) => void;
  /** Complete streaming: convert segments to HistoryMessages and clear state */
  completeStreaming: () => void;
  /** Abort streaming and clear state */
  abortStreaming: () => void;
  /** Abort response: user-initiated abort with server notification and message preservation */
  abortResponse: () => void;
  /** Set permission mode */
  setPermissionMode: (mode: PermissionMode) => void;
  /** Update context usage from server */
  setContextUsage: (usage: ChatUsage) => void;
  /** Reset context usage (on session change) */
  resetContextUsage: () => void;
  /** Update subscription rate limit from polling */
  setSubscriptionRateLimit: (rateLimit: SubscriptionRateLimit) => void;
  /** Update API health status from server */
  setApiHealth: (health: ApiHealthStatus) => void;
  /** Clear leftover streaming segments (on session switch) */
  clearStreamingSegments: (forGeneration?: number) => void;
  /** Update streaming sessionId without resetting segments (for late sessionId arrival) */
  updateStreamingSessionId: (sessionId: string) => void;
  /** Add a system segment (e.g., context compaction notification, info messages) */
  addSystemSegment: (message: string, subtype?: 'compact' | 'info' | 'abort') => void;
  /** Add an interactive segment (permission request or AskUserQuestion) */
  addInteractiveSegment: (segment: {
    id: string;
    interactionType: 'permission' | 'question';
    toolCall?: StreamingToolCall;
    choices: InteractiveChoice[];
    questions?: InteractiveQuestion[];
    multiSelect?: boolean;
  }) => void;
  /** Respond to an interactive segment (update status + emit via WebSocket) */
  respondToInteractive: (
    segmentId: string,
    response: { approved: boolean; value?: string | string[] | Record<string, string | string[]> }
  ) => void;
  /** Set permission request on a tool segment */
  setToolPermission: (toolCallId: string, permissionId: string) => void;
  /** Respond to a tool permission (approve/deny) and emit via WebSocket */
  respondToolPermission: (toolCallId: string, approved: boolean) => void;
  /** Update a tool call's elapsed time from tool_progress event */
  updateToolProgress: (toolUseId: string, elapsedTimeSeconds: number) => void;
  /** Add a task notification segment */
  addTaskNotification: (data: { taskId: string; status: 'completed' | 'failed' | 'stopped'; outputFile?: string; summary?: string; toolUseId?: string }) => void;
  /** Add a tool summary segment */
  addToolSummary: (summary: string, precedingToolUseIds: string[]) => void;
  /** Add a result error segment and persist it */
  addResultError: (data: ResultErrorData) => void;
  /** Start optimistic streaming delay (for passive viewers receiving user:message) */
  startStreamingDelay: (sessionId: string) => void;
  /** Restore streaming state for background stream reconnection */
  restoreStreaming: (sessionId: string) => void;
  /** Set model for next message */
  setSelectedModel: (model: string) => void;
  /** Reset selected model to user's default preference */
  resetSelectedModel: () => void;
  /** Set thinking effort for next message */
  setSelectedEffort: (effort: ThinkingEffort | undefined) => void;
  /** Reset selected effort to user's default preference */
  resetSelectedEffort: () => void;
  /** Reset permission mode to user's default preference */
  resetPermissionMode: () => void;
  /** Set active model reported by SDK */
  setActiveModel: (model: string | null) => void;
  /** Toggle all thinking blocks expanded/collapsed */
  toggleThinkingExpanded: () => void;
  /** Set project settings for override application */
  setProjectSettings: (settings: ProjectSettings | null) => void;
  /** Emit session:rewind-files event to server */
  rewindFiles: (sessionId: string, workingDirectory: string, messageUuid: string, dryRun?: boolean) => void;
  /** Set isRewinding state */
  setIsRewinding: (isRewinding: boolean) => void;
  /** Story 32.7: set/clear the transient CLI generation-progress signal (null clears) */
  setGenerationProgress: (progress: { tokens: number; elapsedSeconds: number; thinking?: boolean } | null) => void;
  /** Story 36.2: set/clear the CLI pre-generation phase (null = phase done / hand off to progress) */
  setCliPhase: (phase: 'launching' | 'submitting' | 'waiting' | null) => void;
  /** Set/clear the soft CLI screen-stall flag (from the cli:screen-stall signal). */
  setCliScreenStalled: (stalled: boolean) => void;
  /** Set/clear the background-waiting state (main response done, background tasks pending). */
  setBackgroundWaiting: (waiting: boolean, pendingCount: number) => void;
  /** Set last dryRun result for confirmation dialog */
  setLastDryRunResult: (result: ChatState['lastDryRunResult']) => void;
  /** Clear last dryRun result (dialog close/cancel) */
  clearLastDryRunResult: () => void;
  /** Story 25.9: Set summarizing state */
  setSummarizing: (isSummarizing: boolean, messageUuid?: string | null) => void;
  /** Story 25.9: Set summary result */
  setSummaryResult: (result: ChatState['summaryResult']) => void;
  /** Story 25.9: Clear summary result */
  clearSummaryResult: () => void;
  /** Set the UUID of the message currently being edited */
  setEditingMessageUuid: (uuid: string | null) => void;
  /** Story 25.11: set forked session ID (triggers navigation) */
  setForkedSessionId: (id: string) => void;
  /** Story 25.11: clear forked session ID */
  clearForkedSessionId: () => void;
  /** Story 27.3: Enter branch viewer mode */
  enterBranchViewer: () => void;
  /** Story 27.3: Exit branch viewer mode */
  exitBranchViewer: (skipEmit?: boolean) => void;
  /** Story 27.3: Accumulate branch selection for multi-level navigation */
  updateViewerSelection: (selectionKey: string, newIndex: number) => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  isStreaming: false,
  streamingSessionId: null,
  streamingMessageId: null,
  streamingSegments: [],
  streamingStartedAt: null,
  streamingEngineMode: null,
  generationProgress: null,
  cliPhase: null,
  cliScreenStalled: false,
  backgroundWaiting: false,
  backgroundWaitingSince: null,
  backgroundPendingCount: 0,
  lastResultError: null,
  selectedModel: '',
  // Seed from cached preferences so a fresh chatStore (page reload, first mount) immediately
  // reflects the user's saved default. Without this, selectedEffort starts as undefined and
  // the model selector falls back to the SDK default (e.g. XHigh on Opus 4.7+) until something
  // explicitly calls resetSelectedEffort. preferencesStore.init() also re-syncs after the
  // server fetch completes — see usePreferencesStore.init.
  selectedEffort: usePreferencesStore.getState().preferences.defaultEffort,
  activeModel: null,
  thinkingExpanded: false,
  isCompacting: false,
  isSessionLocked: false,
  streamCompleteCount: 0,
  projectSettings: null,
  permissionMode: (() => {
    const prefs = usePreferencesStore.getState().preferences;
    if (prefs.permissionMode === 'latest') return prefs.lastPermissionMode ?? 'default';
    return prefs.permissionMode ?? 'default';
  })(),
  contextUsage: null,
  subscriptionRateLimit: null,
  apiHealth: null,
  isRewinding: false,
  lastDryRunResult: null,
  isSummarizing: false,
  summarizingMessageUuid: null,
  summaryResult: null,
  editingMessageUuid: null,
  forkedSessionId: null,
  isBranchViewerMode: false,
  viewerBranchSelections: {},

  // Actions
  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  sendMessage: (content: string, options: SendMessageOptions) => {
    const socket = getSocket();
    const { workingDirectory, sessionId, resume, attachments, resumeSessionAt, rewindToMessageUuid, expectedBranchTotal, forkSession } = options;

    const msgState = useMessageStore.getState();
    debugLog.state('sendMessage', {
      content: content.slice(0, 50),
      sessionId,
      resume,
      currentMsgCount: msgState.messages.length,
      currentMsgTypes: msgState.messages.map(m => m.type),
      segmentCount: get().streamingSegments.length,
    });

    // Clear any existing delay timeout
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    // Clear stale segments from previous response
    if (get().streamingSegments.length > 0) {
      set({ streamingSegments: [] });
    }
    // Set isStreaming true immediately (disables input), but delay the visual "waiting" UI.
    // If server responds (session:created/resumed) before the delay, startStreaming cancels it.
    // For /compact command, set isCompacting immediately. For auto-compaction,
    // the compact_boundary event will set isCompacting when it actually occurs.
    const isCompactCommand = content.trim() === '/compact';
    set({ isStreaming: true, isCompacting: isCompactCommand });

    // Show "waiting" UI after delay (optimistic — before server confirms)
    streamingDelayTimeoutId = setTimeout(() => {
      const state = get();
      if (state.isStreaming && state.streamingSegments.length === 0 && !state.streamingSessionId) {
        set({
          streamingSessionId: sessionId ?? 'pending',
          streamingMessageId: 'pending',
          streamingSegments: [],
          streamingStartedAt: new Date(),
        });
      }
      streamingDelayTimeoutId = null;
    }, STREAMING_UI_DELAY_MS);

    // Project override application (Story 10.3)
    const projectSettings = get().projectSettings;
    const effectivePermissionMode = projectSettings?.permissionModeOverride ?? get().permissionMode;

    // Pre-check (Story 37.14): when auto-compact is OFF, block sending past the model's usable context so
    // the user explicitly /compacts or switches models. When auto-compact is ON, DON'T block here — let the
    // message through so claude's own auto-compact (CLI) / the server's overflow recovery (SDK: auto /compact
    // + retry) runs, honoring the setting's promise to "keep the session going instead of stalling".
    // Previously this fired REGARDLESS of the setting, so an overflowing turn was killed here and nothing
    // ever got the chance to compact (the user saw only the warning, with no message sent to the server).
    const contextUsage = get().contextUsage;
    const autoCompactEnabled = usePreferencesStore.getState().preferences.autoCompactEnabled ?? true;
    if (contextUsage && resume && !autoCompactEnabled) {
      const maxCtx = contextUsage.contextWindow;
      if (maxCtx > 0) {
        const currentTokens = contextUsage.inputTokens + contextUsage.cacheCreationInputTokens + contextUsage.cacheReadInputTokens;
        const effectiveLimit = getEffectiveContextLimit(maxCtx);
        if (currentTokens > effectiveLimit) {
          const currentK = Math.round(currentTokens / 1000);
          const maxK = Math.round(effectiveLimit / 1000);
          toast.error(
            i18n.t('chat:contextOverflow', {
              current: `${currentK}K`,
              max: `${maxK}K`,
              defaultValue: `Context (${currentK}K tokens) exceeds model limit (${maxK}K). Run /compact or switch to a larger model.`,
            }),
          );
          set({ isStreaming: false, isCompacting: false });
          if (streamingDelayTimeoutId) {
            clearTimeout(streamingDelayTimeoutId);
            streamingDelayTimeoutId = null;
          }
          return;
        }
      }
    }

    // Emit chat:send event to server
    socket.emit('chat:send', {
      content,
      workingDirectory,
      sessionId,
      resume,
      permissionMode: effectivePermissionMode,
      ...(() => {
        const globalDefault = usePreferencesStore.getState().preferences.defaultModel || '';
        const effectiveDefault = projectSettings?.modelOverride ?? globalDefault;
        const model = get().selectedModel || effectiveDefault;
        return model ? { model } : {};
      })(),
      // Convert Attachment[] to ImageAttachment[] (strip File objects for serialization)
      images: attachments?.map(a => ({
        mimeType: a.mimeType,
        data: a.data,
        name: a.name,
      })),
      ...(get().selectedEffort ? { effort: get().selectedEffort } : {}),
      ...(resumeSessionAt ? { resumeSessionAt } : {}),
      ...(forkSession ? { forkSession: true } : {}),
      ...(rewindToMessageUuid ? { rewindToMessageUuid } : {}),
      ...(expectedBranchTotal ? { expectedBranchTotal } : {}),
    });
  },

  startStreaming: (sessionId: string, messageId: string) => {
    debugLog.state('startStreaming', {
      sessionId,
      messageId,
      hadDelayTimeout: !!streamingDelayTimeoutId,
      msgCount: useMessageStore.getState().messages.length,
    });
    // Cancel delay timeout if response arrived early
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    // Dismiss session-locked toast if it was showing (from another-client takeover)
    if (get().isSessionLocked) {
      toast.dismiss('session-locked');
    }

    set({
      isStreaming: true,
      isSessionLocked: false,
      streamingSessionId: sessionId,
      streamingMessageId: messageId,
      streamingSegments: [],
      streamingStartedAt: new Date(),
      generationProgress: null,
      cliPhase: null,
      cliScreenStalled: false,
      backgroundWaiting: false,
      backgroundWaitingSince: null,
      backgroundPendingCount: 0,
      lastResultError: null,
    });
  },

  appendStreamingContent: (content: string, provisional?: boolean, messageId?: string) => {
    // Ignore empty strings to prevent unnecessary empty segments
    if (!content) return;

    const segments = get().streamingSegments;

    // Story 37.11 (progressive finalize): `provisional` is TRI-STATE — `true` = a live screen-scraped
    // chunk (grow + live badge), `false` = the FILE-parsed CANONICAL for this block has arrived → REPLACE
    // the oldest still-provisional text segment (swap the live literal for the canonical markdown and drop
    // the badge — the user's "정본으로 교체"), `undefined` = a fresh authoritative block (grid never caught
    // it) → append as before. The server only sends `false` when the kind-sequence confirms this canonical
    // lines up with that provisional, so a mis-binding can't swap the wrong block (the reload backstops).
    if (provisional === false) {
      const idx = segments.findIndex((s) => s.type === 'text' && (s as { provisional?: boolean }).provisional === true);
      if (idx >= 0) {
        let sectionStart = 0;
        for (let i = idx - 1; i >= 0; i--) {
          const s = segments[i];
          if ((s.type === 'text' || s.type === 'thinking') && !(s as { provisional?: boolean }).provisional) { sectionStart = i + 1; break; }
        }
        const updated = segments
          .map((s, i) => (i === idx ? { type: 'text' as const, content } : s))
          .filter((s, i) => !(i >= sectionStart && i < idx && s.type === 'tool' && (s as { provisional?: boolean }).provisional === true));
        debugLog.cliLog('seg-text-finalize', { idx, len: content.length });
        set({ streamingSegments: updated });
        return;
      }
    }

    const lastSegment = segments[segments.length - 1];
    const lastId = lastSegment && (lastSegment as { messageId?: string }).messageId;
    if (lastSegment?.type === 'text' && (!messageId || !lastId || messageId === lastId)) {
      const updated = [...segments];
      updated[updated.length - 1] = {
        type: 'text',
        content: lastSegment.content + content,
        ...(provisional ? { provisional: true } : {}),
        ...(messageId ? { messageId } : {}),
      };
      debugLog.cliLog('seg-text-append', { segIdx: segments.length - 1, addedLen: content.length });
      set({ streamingSegments: updated });
    } else {
      debugLog.cliLog('seg-text-new', { segIdx: segments.length, len: content.length, provisional: !!provisional, messageId });
      set({ streamingSegments: [...segments, { type: 'text', content, ...(provisional ? { provisional: true } : {}), ...(messageId ? { messageId } : {}) }] });
    }
  },

  addStreamingThinking: (content: string, provisional?: boolean) => {
    if (!content) return;

    const segments = get().streamingSegments;

    // Story 37.11 (progressive finalize): `provisional === false` = the canonical thinking for this block
    // arrived → REPLACE the oldest still-provisional thinking segment (drop the live badge). `true` = live
    // grow, `undefined` = fresh authoritative block. See `appendStreamingContent` for the full contract.
    if (provisional === false) {
      const idx = segments.findIndex((s) => s.type === 'thinking' && (s as { provisional?: boolean }).provisional === true);
      if (idx >= 0) {
        let sectionStart = 0;
        for (let i = idx - 1; i >= 0; i--) {
          const s = segments[i];
          if ((s.type === 'text' || s.type === 'thinking') && !(s as { provisional?: boolean }).provisional) { sectionStart = i + 1; break; }
        }
        const updated = segments
          .map((s, i) => (i === idx ? { type: 'thinking' as const, content } : s))
          .filter((s, i) => !(i >= sectionStart && i < idx && s.type === 'tool' && (s as { provisional?: boolean }).provisional === true));
        debugLog.cliLog('seg-thinking-finalize', { idx, len: content.length });
        set({ streamingSegments: updated });
        return;
      }
    }

    const lastSegment = segments[segments.length - 1];
    if (lastSegment?.type === 'thinking') {
      const updated = [...segments];
      updated[updated.length - 1] = {
        type: 'thinking',
        content: lastSegment.content + content,
        ...(provisional ? { provisional: true } : {}),
      };
      debugLog.cliLog('seg-thinking-append', { segIdx: segments.length - 1, addedLen: content.length });
      set({ streamingSegments: updated });
    } else {
      debugLog.cliLog('seg-thinking-new', { segIdx: segments.length, len: content.length, provisional: !!provisional });
      set({ streamingSegments: [...segments, { type: 'thinking', content, ...(provisional ? { provisional: true } : {}) }] });
    }
  },

  addStreamingToolCall: (toolCall: StreamingToolCall) => {
    // Lifecycle guard: a stream that has already completed must not gain new live cards.
    // CLI mode watches the session JSONL by polling, so a turn's final tool block can be
    // re-emitted a beat AFTER the completion signal (stream:complete-messages →
    // completeStreaming) has already swapped in the authoritative reload and cleared
    // streamingSegments. Such a late tool:call would land in the now-empty live-segment
    // area, which always renders BELOW the message list — an orphan tool card stuck under
    // the last answer until the session is re-entered ("뒤로 갔다 오면 재정렬"). The reload
    // already contains this tool in its correct position, so dropping the late live card is
    // the correct, lossless fix. The reveal helpers run this mutate at execution time, after
    // completeStreaming may have flipped the flag.
    if (!get().isStreaming) return;
    const segments = get().streamingSegments;
    // Story 37.11 (progressive finalize): a NON-provisional tool call FINALIZES the OLDEST still-provisional
    // tool card in place — swap the friendly/name-only screen card for the real name + input and drop the
    // live badge, KEEPING its id (the screen result-flip rode the provisional id). Bound by ORDER per kind
    // (the server sends the Nth canonical tool to finalize the Nth provisional), robust to the screen↔file
    // block-order difference. No provisional tool waiting ⇒ fall through and create it (grid-behind backstop).
    if (!toolCall.provisional) {
      let idx = segments.findIndex((s) => s.type === 'tool' && (s as { provisional?: boolean }).provisional === true && s.toolCall.id === toolCall.id);
      if (idx < 0) idx = segments.findIndex((s) => s.type === 'tool' && (s as { provisional?: boolean }).provisional === true);
      if (idx >= 0) {
        const seg = segments[idx];
        if (seg.type === 'tool') {
          const updated = [...segments];
          updated[idx] = { ...seg, toolCall: { ...seg.toolCall, name: toolCall.name, input: toolCall.input } };
          delete (updated[idx] as { provisional?: boolean }).provisional;
          debugLog.cliLog('seg-tool-finalize', { idx, id: toolCall.id, name: toolCall.name });
          set({ streamingSegments: updated });
        }
        return;
      }
    }
    if (segments.some((seg) => seg.type === 'tool' && seg.toolCall.id === toolCall.id)) {
      debugLog.cliLog('seg-tool-dedup', { id: toolCall.id, name: toolCall.name });
      return;
    }
    // Check if a permission request arrived before this tool segment
    const bufferedPermissionId = pendingPermissionBuffer.get(toolCall.id);
    if (bufferedPermissionId) {
      pendingPermissionBuffer.delete(toolCall.id);
    }
    // Check if a tool input update arrived before this tool segment
    // (e.g. ExitPlanMode's enriched input with 'plan' field from permission:request)
    const bufferedInput = pendingInputBuffer.get(toolCall.id);
    if (bufferedInput) {
      pendingInputBuffer.delete(toolCall.id);
    }
    // Add tool segment with startedAt timestamp (previous text segment is automatically "closed")
    // If a buffered permission exists, attach it immediately
    // If a buffered input exists, merge it (enriched input takes precedence)
    // Clear isCompacting — tool call arrival means real response content is flowing
    debugLog.cliLog('seg-tool-new', { segIdx: segments.length, id: toolCall.id, name: toolCall.name, provisional: !!toolCall.provisional });
    set({
      ...(get().isCompacting && { isCompacting: false }),
      streamingSegments: [
        ...segments,
        {
          type: 'tool',
          toolCall: { ...toolCall, ...(bufferedInput && { input: bufferedInput }), startedAt: toolCall.startedAt ?? Date.now() },
          status: 'pending',
          ...(bufferedPermissionId && { permissionId: bufferedPermissionId, permissionStatus: 'waiting' as const }),
          ...(toolCall.provisional ? { provisional: true } : {}),
        },
      ],
    });
  },

  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>, buffer?: boolean) => {
    const segments = get().streamingSegments;
    const found = segments.some(
      (seg) => seg.type === 'tool' && seg.toolCall.id === toolCallId
    );
    if (!found) {
      // Only buffer when explicitly requested (permission:request path).
      // tool:input-update deltas for skipped tools (e.g. AskUserQuestion) should be dropped.
      if (buffer) {
        pendingInputBuffer.set(toolCallId, input);
      }
      return;
    }
    const updated = segments.map((seg) =>
      seg.type === 'tool' && seg.toolCall.id === toolCallId
        ? { ...seg, toolCall: { ...seg.toolCall, input } }
        : seg
    );
    set({ streamingSegments: updated });
  },

  updateStreamingToolCall: (toolCallId: string, result: string, isError?: boolean, provisional?: boolean) => {
    const segments = get().streamingSegments;
    const updated = segments.map((seg) => {
      if (seg.type !== 'tool' || seg.toolCall.id !== toolCallId) return seg;
      const duration = seg.toolCall.startedAt ? Date.now() - seg.toolCall.startedAt : undefined;
      return {
        ...seg,
        toolCall: { ...seg.toolCall, output: result, duration },
        status: isError ? 'error' as const : 'completed' as const,
        // Story 37.11 (AC4) + 37.20 FIX: a PROVISIONAL grid result (the screen flip) keeps the card
        // live-badged ONLY while it is STILL provisional (not yet finalized) — it must not finalize
        // early. But it must NOT RE-badge a card the canonical onToolUse already finalized (badge
        // dropped at L670): the common server order is canonical-USE BEFORE the screen-flip RESULT, so
        // an unconditional re-apply re-stuck completed tools on the live "잠정" badge. Gate on the card
        // still being provisional. An authoritative result (SDK / file-drain) leaves the flag as-is.
        ...(provisional && (seg as { provisional?: boolean }).provisional === true ? { provisional: true } : {}),
        // Auto-resolve stale permission on reconnect replay: if the tool
        // completed, the permission must have been handled already.
        ...(seg.permissionStatus === 'waiting' && {
          permissionStatus: (isError ? 'denied' : 'approved') as 'denied' | 'approved',
        }),
      };
    });
    set({ streamingSegments: updated });
  },

  completeStreaming: () => {
    const prev = get();
    // Guard: skip if already stopped (e.g. abortResponse ran first)
    if (!prev.isStreaming) return;
    debugLog.state('completeStreaming', {
      sessionId: prev.streamingSessionId,
      messageId: prev.streamingMessageId,
      segmentCount: prev.streamingSegments.length,
      msgCount: useMessageStore.getState().messages.length,
    });
    pendingPermissionBuffer.clear();
    pendingInputBuffer.clear();
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    set({
      isStreaming: false,
      isCompacting: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
      streamingEngineMode: null,
      generationProgress: null,
      cliPhase: null,
      cliScreenStalled: false,
      backgroundWaiting: false,
      backgroundWaitingSince: null,
      backgroundPendingCount: 0,
      streamCompleteCount: get().streamCompleteCount + 1,
    });
  },

  abortStreaming: () => {
    const prev = get();
    debugLog.state('abortStreaming', {
      sessionId: prev.streamingSessionId,
      segmentCount: prev.streamingSegments.length,
      msgCount: useMessageStore.getState().messages.length,
    });
    pendingPermissionBuffer.clear();
    pendingInputBuffer.clear();
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }
    set({
      isStreaming: false,
      isCompacting: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
      streamingEngineMode: null,
      generationProgress: null,
      cliPhase: null,
      cliScreenStalled: false,
      backgroundWaiting: false,
      backgroundWaitingSince: null,
      backgroundPendingCount: 0,
    });
  },

  abortResponse: () => {
    const state = get();
    if (!state.isStreaming) return;

    // Notify server to abort SDK request. Server will broadcast
    // stream:detached { reason: 'user-abort' } to ALL sockets,
    // then stream:complete-messages { aborted: true } with confirmed data.
    const socket = getSocket();
    socket.emit('chat:abort');

    // Immediately clear local chain state so UI reflects the stop
    useChainStore.getState().clearChainItems();
  },

  setPermissionMode: (mode: PermissionMode) => {
    set({ permissionMode: mode });
    // Always persist the actual mode as lastPermissionMode so that switching
    // to 'latest' in the future correctly restores the most recently used mode.
    usePreferencesStore.getState().updatePreference('lastPermissionMode', mode);
    // Notify server for SDK update and broadcast to other viewers
    const rawPolicy = usePreferencesStore.getState().preferences.permissionSyncPolicy;
    const syncPolicy = rawPolicy === 'streaming' ? 'streaming' : 'always'; // normalize legacy 'never'
    if (syncPolicy === 'streaming' && !get().isStreaming) return;
    // 'always' → always emit; 'streaming' + isStreaming → emit for SDK update
    const socket = getSocket();
    const projectSlug = useMessageStore.getState().currentProjectSlug ?? undefined;
    socket.emit('permission:mode-change', { mode, projectSlug });
  },

  setContextUsage: (usage: ChatUsage) => set({ contextUsage: usage }),

  resetContextUsage: () => set({ contextUsage: null }),

  setSubscriptionRateLimit: (rateLimit: SubscriptionRateLimit) => set({ subscriptionRateLimit: rateLimit }),

  setApiHealth: (health: ApiHealthStatus) => set({ apiHealth: health }),

  clearStreamingSegments: () => {
    debugLog.state('clearStreamingSegments', {
      clearedSegmentCount: get().streamingSegments.length,
      msgCount: useMessageStore.getState().messages.length,
    });
    pendingPermissionBuffer.clear();
    pendingInputBuffer.clear();
    set({ streamingSegments: [], streamingStartedAt: null, streamingEngineMode: null });
  },

  updateStreamingSessionId: (sessionId: string) => set({ streamingSessionId: sessionId }),

  addSystemSegment: (message: string, subtype: 'compact' | 'info' | 'abort' = 'compact') => {
    const segments = get().streamingSegments;
    // Don't auto-set isCompacting here — callers (handleCompact) manage it
    // conditionally based on whether real content has already arrived
    set({
      streamingSegments: [...segments, { type: 'system', subtype, message }],
    });
  },

  addInteractiveSegment: (segment) => {
    const segments = get().streamingSegments;
    if (segments.some((seg) => seg.type === 'interactive' && seg.id === segment.id)) {
      debugLog.cliLog('seg-interactive-dedup', { id: segment.id, type: segment.interactionType });
      return;
    }
    debugLog.cliLog('seg-interactive-new', { segIdx: segments.length, id: segment.id, type: segment.interactionType, toolName: segment.toolCall?.name, choiceCount: segment.choices?.length, questionCount: segment.questions?.length });
    set({
      streamingSegments: [
        ...segments,
        {
          type: 'interactive',
          id: segment.id,
          interactionType: segment.interactionType,
          toolCall: segment.toolCall,
          choices: segment.choices,
          questions: segment.questions,
          multiSelect: segment.multiSelect,
          status: 'waiting',
        },
      ],
    });
  },

  setToolPermission: (toolCallId: string, permissionId: string) => {
    const segments = get().streamingSegments;
    const idx = segments.findIndex(
      (seg) => seg.type === 'tool' && seg.toolCall.id === toolCallId
    );
    debugLog.state('setToolPermission', {
      toolCallId,
      permissionId,
      foundIdx: idx,
      segmentToolIds: segments
        .filter(s => s.type === 'tool')
        .map(s => (s as { type: 'tool'; toolCall: { id: string } }).toolCall.id),
    });
    if (idx === -1) {
      // Buffer the permission — tool:call segment hasn't arrived yet (race condition)
      pendingPermissionBuffer.set(toolCallId, permissionId);
      return;
    }
    const updated = [...segments];
    const seg = updated[idx];
    if (seg.type === 'tool') {
      updated[idx] = { ...seg, permissionId, permissionStatus: 'waiting' as const };
      set({ streamingSegments: updated });
    }
  },

  respondToolPermission: (toolCallId: string, approved: boolean) => {
    const socket = getSocket();
    const segments = get().streamingSegments;
    const idx = segments.findIndex(
      (seg) => seg.type === 'tool' && seg.toolCall.id === toolCallId
    );
    if (idx === -1) return;
    const seg = segments[idx];
    if (seg.type !== 'tool' || !seg.permissionId) return;

    // Emit permission:respond
    socket.emit('permission:respond', {
      requestId: seg.permissionId,
      approved,
      interactionType: 'permission' as const,
    });

    // Update permission status
    const updated = [...segments];
    updated[idx] = { ...seg, permissionStatus: approved ? 'approved' as const : 'denied' as const };
    set({ streamingSegments: updated });
  },

  respondToInteractive: (segmentId, response) => {
    const socket = getSocket();
    const segments = get().streamingSegments;

    // Find the interactive segment
    const segIndex = segments.findIndex(
      (seg) => seg.type === 'interactive' && seg.id === segmentId
    );
    if (segIndex === -1) return;

    const seg = segments[segIndex];
    if (seg.type !== 'interactive') return;

    // Set to 'sending' state
    const updated = [...segments];
    updated[segIndex] = { ...seg, status: 'sending' as InteractiveStatus };
    set({ streamingSegments: updated });

    // Check WebSocket connection
    if (!socket.connected) {
      const errorSegments = [...get().streamingSegments];
      const errorSeg = errorSegments[segIndex];
      if (errorSeg?.type === 'interactive') {
        errorSegments[segIndex] = {
          ...errorSeg,
          status: 'error' as InteractiveStatus,
          errorMessage: i18n.t('notification:streaming.disconnectedRetry'),
        };
        set({ streamingSegments: errorSegments });
      }
      return;
    }

    // Emit permission:respond
    socket.emit('permission:respond', {
      requestId: segmentId,
      approved: response.approved,
      interactionType: seg.interactionType,
      response: response.value,
    });

    // Set to 'responded' state
    const respondedSegments = [...get().streamingSegments];
    const respondedSeg = respondedSegments[segIndex];
    if (respondedSeg?.type === 'interactive') {
      respondedSegments[segIndex] = {
        ...respondedSeg,
        status: 'responded' as InteractiveStatus,
        response: response.value ?? (response.approved ? i18n.t('chat:interactive.approved') : i18n.t('chat:interactive.rejected')),
      };
      set({ streamingSegments: respondedSegments });
    }
  },

  updateToolProgress: (toolUseId: string, elapsedTimeSeconds: number) => {
    const segments = get().streamingSegments;
    const updated = segments.map((seg) => {
      if (seg.type !== 'tool' || seg.toolCall.id !== toolUseId) return seg;
      // Sync startedAt so ToolTimer shows correct elapsed time
      const syntheticStartedAt = Date.now() - (elapsedTimeSeconds * 1000);
      return {
        ...seg,
        toolCall: { ...seg.toolCall, startedAt: syntheticStartedAt },
      };
    });
    set({ streamingSegments: updated });
  },

  addTaskNotification: (data) => {
    const segments = get().streamingSegments;
    set({
      streamingSegments: [
        ...segments,
        {
          type: 'task_notification' as const,
          taskId: data.taskId,
          status: data.status,
          outputFile: data.outputFile,
          summary: data.summary,
          toolUseId: data.toolUseId,
        },
      ],
    });
  },

  addToolSummary: (summary: string, precedingToolUseIds: string[]) => {
    const segments = get().streamingSegments;
    set({
      streamingSegments: [
        ...segments,
        { type: 'tool_summary' as const, summary, precedingToolUseIds },
      ],
    });
  },

  startStreamingDelay: (sessionId: string) => {
    // Optimistic streaming delay for passive viewers — mirrors sendMessage's delay.
    // Sets isStreaming immediately (disables input) and shows visual indicator after delay.
    // If startStreaming is called before the delay fires (from session:resumed), it cancels it.
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
    }
    set({ isStreaming: true });
    streamingDelayTimeoutId = setTimeout(() => {
      const state = get();
      if (state.isStreaming && state.streamingSegments.length === 0 && !state.streamingSessionId) {
        set({
          streamingSessionId: sessionId ?? 'pending',
          streamingMessageId: 'pending',
          streamingSegments: [],
          streamingStartedAt: new Date(),
        });
      }
      streamingDelayTimeoutId = null;
    }, STREAMING_UI_DELAY_MS);
  },

  restoreStreaming: (sessionId: string) => {
    debugLog.state('DEDUP restoreStreaming called', {
      sessionId,
      prevSessionId: get().streamingSessionId,
      prevIsStreaming: get().isStreaming,
      prevSegmentCount: get().streamingSegments.length,
      msgCount: useMessageStore.getState().messages.length,
      msgTypes: useMessageStore.getState().messages.map(m => m.type),
    });
    debugLog.state('restoreStreaming', {
      sessionId,
      prevSessionId: get().streamingSessionId,
      prevSegmentCount: get().streamingSegments.length,
      msgCount: useMessageStore.getState().messages.length,
    });
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }
    // Dismiss session-locked toast if it was showing
    if (get().isSessionLocked) {
      toast.dismiss('session-locked');
    }
    set({
      isStreaming: true,
      isSessionLocked: false,
      streamingSessionId: sessionId,
      streamingMessageId: 'restoring',
      streamingSegments: [],
      streamingStartedAt: new Date(),
      lastResultError: null,
      // Clear the soft CLI screen-stall flag on restore so a value carried over from before a
      // reconnect / tab-switch can't linger. The server re-sends the CURRENT flag on session:join
      // (only when actually stalled), so a genuine ongoing stall reappears and a resolved one stays gone.
      cliScreenStalled: false,
      backgroundWaiting: false,
      backgroundWaitingSince: null,
      backgroundPendingCount: 0,
    });
  },

  setSelectedModel: (model: string) => set({ selectedModel: model }),

  resetSelectedModel: () => {
    const projectSettings = get().projectSettings;
    const globalDefault = usePreferencesStore.getState().preferences.defaultModel || '';
    const effectiveDefault = projectSettings?.modelOverride ?? globalDefault;
    set({ selectedModel: effectiveDefault });
  },

  setSelectedEffort: (effort: ThinkingEffort | undefined) => set({ selectedEffort: effort }),

  resetSelectedEffort: () => {
    const defaultEffort = usePreferencesStore.getState().preferences.defaultEffort;
    set({ selectedEffort: defaultEffort });
  },

  resetPermissionMode: () => {
    const projectSettings = get().projectSettings;
    if (projectSettings?.permissionModeOverride) {
      set({ permissionMode: projectSettings.permissionModeOverride });
      return;
    }
    const prefs = usePreferencesStore.getState().preferences;
    if (prefs.permissionMode === 'latest') {
      // 'latest': keep last-used mode (or fall back to stored lastPermissionMode)
      const last = prefs.lastPermissionMode ?? get().permissionMode;
      set({ permissionMode: last });
    } else {
      set({ permissionMode: prefs.permissionMode ?? 'default' });
    }
  },

  setActiveModel: (model: string | null) => set({ activeModel: model }),

  toggleThinkingExpanded: () => set((state) => ({ thinkingExpanded: !state.thinkingExpanded })),

  setProjectSettings: (settings: ProjectSettings | null) => set({ projectSettings: settings }),

  rewindFiles: (sessionId: string, workingDirectory: string, messageUuid: string, dryRun?: boolean) => {
    // Allow the actual rewind call (dryRun=false) even when isRewinding is
    // still true from the preceding dryRun — the guard only blocks new
    // independent rewind requests, not the confirmation step.
    if (get().isRewinding && dryRun) return;
    set({ isRewinding: true });
    const socket = getSocket();
    socket.emit('session:rewind-files', { sessionId, workingDirectory, messageUuid, dryRun });
  },

  setIsRewinding: (isRewinding: boolean) => set({ isRewinding }),

  setGenerationProgress: (progress) => set({ generationProgress: progress }),

  setCliPhase: (phase) => set({ cliPhase: phase }),

  setCliScreenStalled: (stalled) => set({ cliScreenStalled: stalled }),

  setBackgroundWaiting: (waiting, pendingCount) => set({
    backgroundWaiting: waiting,
    backgroundWaitingSince: waiting ? (get().backgroundWaitingSince ?? Date.now()) : null,
    backgroundPendingCount: pendingCount,
  }),

  setLastDryRunResult: (result: ChatState['lastDryRunResult']) => set({ lastDryRunResult: result }),

  clearLastDryRunResult: () => set({ lastDryRunResult: null }),

  // Story 25.9: Summarize actions
  setSummarizing: (isSummarizing: boolean, messageUuid?: string | null) =>
    set({ isSummarizing, summarizingMessageUuid: messageUuid ?? null }),
  setSummaryResult: (result: ChatState['summaryResult']) => set({ summaryResult: result }),
  clearSummaryResult: () => set({ summaryResult: null }),
  setEditingMessageUuid: (uuid: string | null) => set({ editingMessageUuid: uuid }),
  setForkedSessionId: (id: string) => set({ forkedSessionId: id }),
  clearForkedSessionId: () => set({ forkedSessionId: null }),

  enterBranchViewer: () => {
    const { isStreaming, isCompacting } = get();
    if (isStreaming || isCompacting) return;
    set({ isBranchViewerMode: true, viewerBranchSelections: {} });
  },
  exitBranchViewer: (skipEmit?: boolean) => {
    set({ isBranchViewerMode: false, viewerBranchSelections: {} });
    cancelBranchSwitchTimer();
    if (!skipEmit) {
      const socket = getSocket();
      const sessionId = useMessageStore.getState().currentSessionId;
      if (socket && sessionId) {
        socket.emit('messages:switch-branch', { sessionId, branchSelections: {} });
      }
    }
  },
  updateViewerSelection: (selectionKey: string, newIndex: number) => {
    set((state) => ({
      viewerBranchSelections: { ...state.viewerBranchSelections, [selectionKey]: newIndex },
    }));
  },

  addResultError: (data: ResultErrorData) => {
    const segments = get().streamingSegments;
    set({
      lastResultError: data,
      streamingSegments: [
        ...segments,
        {
          type: 'result_error' as const,
          subtype: data.subtype,
          errors: data.errors,
          totalCostUSD: data.totalCostUSD,
          numTurns: data.numTurns,
          result: data.result,
        },
      ],
    });
  },
}));
