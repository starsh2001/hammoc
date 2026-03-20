/**
 * Chat Store - Zustand store for real-time chat state
 * [Source: Story 4.2 - Task 1, Story 4.5 - Task 1, Story 4.6 - Task 2, Story 4.8 - Task 1]
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import type { PermissionMode, Attachment, ChatUsage, HistoryMessage, ProjectSettings, SubscriptionRateLimit, ApiHealthStatus } from '@hammoc/shared';
import { getSocket } from '../services/socket';
import { useMessageStore } from './messageStore';
import { useChainStore } from './chainStore';
import { usePreferencesStore } from './preferencesStore';
import { debugLog } from '../utils/debugLogger';
import i18n from '../i18n';

/** Delay before showing "waiting" UI (ms) — both sender and passive viewers */
const STREAMING_UI_DELAY_MS = 1000;

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

/** Streaming segment - discriminated union for text, tool, thinking, system, and interactive segments */
export type StreamingSegment =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'system'; subtype: 'compact' | 'info'; message: string }
  | { type: 'tool'; toolCall: StreamingToolCall; status: 'pending' | 'completed' | 'error'; permissionId?: string; permissionStatus?: 'waiting' | 'approved' | 'denied' }
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
export function isTextSegment(seg: StreamingSegment): seg is { type: 'text'; content: string } {
  return seg.type === 'text';
}

/** Type guard for thinking segments */
export function isThinkingSegment(seg: StreamingSegment): seg is { type: 'thinking'; content: string } {
  return seg.type === 'thinking';
}

/** Type guard for tool segments */
export function isToolSegment(
  seg: StreamingSegment
): seg is { type: 'tool'; toolCall: StreamingToolCall; status: 'pending' | 'completed' | 'error'; permissionId?: string; permissionStatus?: 'waiting' | 'approved' | 'denied' } {
  return seg.type === 'tool';
}

/** Type guard for system segments */
export function isSystemSegment(
  seg: StreamingSegment
): seg is { type: 'system'; subtype: 'compact' | 'info'; message: string } {
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
  /** Actual model reported by SDK (from session init) */
  activeModel: string | null;
  /** Global thinking blocks expanded state (all blocks share this) */
  thinkingExpanded: boolean;
  /** Whether context compaction is in progress */
  isCompacting: boolean;
  /** Whether this session was taken over by another browser (locks UI until refresh) */
  isSessionLocked: boolean;
  /** Whether segments are being held pending history fetch (post-completeStreaming) */
  segmentsPendingClear: boolean;
  /** Generation counter for segment clearing — prevents stale fetch callbacks from
   *  clearing segments that belong to a newer stream. Incremented on freeze and on
   *  new stream start. */
  segmentClearGeneration: number;
  /** Timestamp when streaming completed (cooldown guard for fetchMessages) */
  streamCompletedAt: number | null;
  /** Counter incremented only on normal streaming completion (not abort/error).
   *  Used by prompt chain to distinguish normal completion from error/abort. */
  streamCompleteCount: number;
  /** Project-level settings for override application */
  projectSettings: ProjectSettings | null;
  /** API health status from server polling */
  apiHealth: ApiHealthStatus | null;
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
}

interface ChatActions {
  /** Set streaming state */
  setStreaming: (streaming: boolean) => void;
  /** Send message via WebSocket */
  sendMessage: (content: string, options: SendMessageOptions) => void;
  /** Start streaming a new message */
  startStreaming: (sessionId: string, messageId: string) => void;
  /** Append content to the current streaming text segment */
  appendStreamingContent: (content: string) => void;
  /** Append content to the current streaming thinking segment */
  addStreamingThinking: (content: string) => void;
  /** Add a streaming tool call segment */
  addStreamingToolCall: (toolCall: StreamingToolCall) => void;
  /** Update a streaming tool call's input. Set buffer=true to queue the update if the segment doesn't exist yet. */
  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>, buffer?: boolean) => void;
  /** Update a streaming tool call result and status */
  updateStreamingToolCall: (toolCallId: string, result: string, isError?: boolean) => void;
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
  addSystemSegment: (message: string, subtype?: 'compact' | 'info') => void;
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
  /** Reset permission mode to user's default preference */
  resetPermissionMode: () => void;
  /** Set active model reported by SDK */
  setActiveModel: (model: string | null) => void;
  /** Toggle all thinking blocks expanded/collapsed */
  toggleThinkingExpanded: () => void;
  /** Set project settings for override application */
  setProjectSettings: (settings: ProjectSettings | null) => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  isStreaming: false,
  streamingSessionId: null,
  streamingMessageId: null,
  streamingSegments: [],
  streamingStartedAt: null,
  lastResultError: null,
  selectedModel: '',
  activeModel: null,
  thinkingExpanded: false,
  isCompacting: false,
  isSessionLocked: false,
  segmentsPendingClear: false,
  segmentClearGeneration: 0,
  streamCompletedAt: null,
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

  // Actions
  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  sendMessage: (content: string, options: SendMessageOptions) => {
    const socket = getSocket();
    const { workingDirectory, sessionId, resume, attachments } = options;

    const msgState = useMessageStore.getState();
    debugLog.state('sendMessage', {
      content: content.slice(0, 50),
      sessionId,
      resume,
      currentMsgCount: msgState.messages.length,
      currentMsgTypes: msgState.messages.map(m => m.type),
      segmentCount: get().streamingSegments.length,
      segmentsPendingClear: get().segmentsPendingClear,
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
      lastResultError: null,
      segmentsPendingClear: false,
      segmentClearGeneration: get().segmentClearGeneration + 1,
      streamCompletedAt: null,
    });
  },

  appendStreamingContent: (content: string) => {
    // Ignore empty strings to prevent unnecessary empty segments
    if (!content) return;

    const segments = get().streamingSegments;
    const lastSegment = segments[segments.length - 1];

    if (lastSegment?.type === 'text') {
      // Append to existing text segment
      const updated = [...segments];
      updated[updated.length - 1] = {
        type: 'text',
        content: lastSegment.content + content,
      };
      set({ streamingSegments: updated });
    } else {
      // Create new text segment (first segment or after tool segment)
      set({ streamingSegments: [...segments, { type: 'text', content }] });
    }
  },

  addStreamingThinking: (content: string) => {
    if (!content) return;

    const segments = get().streamingSegments;
    const lastSegment = segments[segments.length - 1];

    if (lastSegment?.type === 'thinking') {
      // Append to existing thinking segment
      const updated = [...segments];
      updated[updated.length - 1] = {
        type: 'thinking',
        content: lastSegment.content + content,
      };
      set({ streamingSegments: updated });
    } else {
      // Create new thinking segment
      set({ streamingSegments: [...segments, { type: 'thinking', content }] });
    }
  },

  addStreamingToolCall: (toolCall: StreamingToolCall) => {
    const segments = get().streamingSegments;
    // Avoid duplicates
    if (segments.some((seg) => seg.type === 'tool' && seg.toolCall.id === toolCall.id)) return;
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
    set({
      ...(get().isCompacting && { isCompacting: false }),
      streamingSegments: [
        ...segments,
        {
          type: 'tool',
          toolCall: { ...toolCall, ...(bufferedInput && { input: bufferedInput }), startedAt: toolCall.startedAt ?? Date.now() },
          status: 'pending',
          ...(bufferedPermissionId && { permissionId: bufferedPermissionId, permissionStatus: 'waiting' as const }),
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

  updateStreamingToolCall: (toolCallId: string, result: string, isError?: boolean) => {
    const segments = get().streamingSegments;
    const updated = segments.map((seg) => {
      if (seg.type !== 'tool' || seg.toolCall.id !== toolCallId) return seg;
      const duration = seg.toolCall.startedAt ? Date.now() - seg.toolCall.startedAt : undefined;
      return {
        ...seg,
        toolCall: { ...seg.toolCall, output: result, duration },
        status: isError ? 'error' as const : 'completed' as const,
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

    // Keep segments visible (segmentsPendingClear) while the caller fetches
    // authoritative history from the server. The server API merges JSONL +
    // completedBuffer so messages are available even before JSONL flush.
    // Increment segmentClearGeneration so the fetch callback can target this
    // specific freeze — a newer stream's startStreaming will bump it again.
    set({
      isStreaming: false,
      isCompacting: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingStartedAt: null,
      segmentsPendingClear: true,
      segmentClearGeneration: get().segmentClearGeneration + 1,
      streamCompletedAt: Date.now(),
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
      segmentsPendingClear: false,
      streamCompletedAt: Date.now(),
    });
  },

  abortResponse: () => {
    const state = get();
    if (!state.isStreaming) return;

    pendingPermissionBuffer.clear();
    pendingInputBuffer.clear();

    // Clear delay timeout
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    // Notify server to abort SDK request (server also clears prompt chain)
    const socket = getSocket();
    socket.emit('chat:abort');

    // Immediately clear local chain state so UI reflects the stop
    useChainStore.getState().clearChainItems();

    // Mark pending tool segments as aborted (stop spinners/timers)
    const finalSegments = state.streamingSegments.map((seg) => {
      if (seg.type === 'tool' && seg.status === 'pending') {
        return {
          ...seg,
          status: 'error' as const,
          toolCall: { ...seg.toolCall, output: i18n.t('notification:chat.aborted') },
        };
      }
      return seg;
    });

    // Freeze segments and fetch authoritative history from server.
    set({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: finalSegments,
      streamingStartedAt: null,
      segmentsPendingClear: true,
      segmentClearGeneration: get().segmentClearGeneration + 1,
      streamCompletedAt: Date.now(),
    });

    // Fetch history + clear segments (same flow as completeStreaming callers)
    const gen = get().segmentClearGeneration;
    const { currentProjectSlug, currentSessionId } = useMessageStore.getState();
    if (currentProjectSlug && currentSessionId) {
      useMessageStore.getState().fetchMessages(currentProjectSlug, currentSessionId, { silent: true, force: true }).then(() => {
        get().clearStreamingSegments(gen);
      }).catch(() => {
        // On fetch failure, keep segments visible
      });
    } else {
      get().clearStreamingSegments(gen);
    }
  },

  setPermissionMode: (mode: PermissionMode) => {
    set({ permissionMode: mode });
    // Always persist the actual mode as lastPermissionMode so that switching
    // to 'latest' in the future correctly restores the most recently used mode.
    usePreferencesStore.getState().updatePreference('lastPermissionMode', mode);
    // Notify server for SDK update and broadcast to other viewers
    const rawPolicy = usePreferencesStore.getState().preferences.permissionSyncPolicy;
    const syncPolicy = rawPolicy === 'always' ? 'always' : 'streaming'; // normalize legacy 'never'
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

  clearStreamingSegments: (forGeneration?: number) => {
    const prev = get();
    // If a generation is specified, only clear if it matches the current generation.
    // This prevents stale fetch callbacks from clearing segments of a newer stream.
    if (forGeneration !== undefined && forGeneration !== prev.segmentClearGeneration) return;
    debugLog.state('clearStreamingSegments', {
      clearedSegmentCount: prev.streamingSegments.length,
      segmentTypes: prev.streamingSegments.map(s => s.type),
      msgCount: useMessageStore.getState().messages.length,
      isStreaming: prev.isStreaming,
      wasPending: prev.segmentsPendingClear,
      generation: forGeneration,
      currentGeneration: prev.segmentClearGeneration,
    });
    pendingPermissionBuffer.clear();
    pendingInputBuffer.clear();
    set({ streamingSegments: [], segmentsPendingClear: false });
  },

  updateStreamingSessionId: (sessionId: string) => set({ streamingSessionId: sessionId }),

  addSystemSegment: (message: string, subtype: 'compact' | 'info' = 'compact') => {
    const segments = get().streamingSegments;
    // Don't auto-set isCompacting here — callers (handleCompact) manage it
    // conditionally based on whether real content has already arrived
    set({
      streamingSegments: [...segments, { type: 'system', subtype, message }],
    });
  },

  addInteractiveSegment: (segment) => {
    const segments = get().streamingSegments;
    // Avoid duplicates by ID
    if (segments.some((seg) => seg.type === 'interactive' && seg.id === segment.id)) return;
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
      segmentsPendingClear: false,
      segmentClearGeneration: get().segmentClearGeneration + 1,
    });
  },

  setSelectedModel: (model: string) => set({ selectedModel: model }),

  resetSelectedModel: () => {
    const projectSettings = get().projectSettings;
    const globalDefault = usePreferencesStore.getState().preferences.defaultModel || '';
    const effectiveDefault = projectSettings?.modelOverride ?? globalDefault;
    set({ selectedModel: effectiveDefault });
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
