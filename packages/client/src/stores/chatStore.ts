/**
 * Chat Store - Zustand store for real-time chat state
 * [Source: Story 4.2 - Task 1, Story 4.5 - Task 1, Story 4.6 - Task 2, Story 4.8 - Task 1]
 */

import { create } from 'zustand';
import type { PermissionMode, Attachment, ChatUsage } from '@bmad-studio/shared';
import { getSocket } from '../services/socket';
import { useMessageStore } from './messageStore';

/** Delay before showing "waiting" UI (ms) - gives a natural "reading" feel */
const STREAMING_UI_DELAY_MS = 600;

/** Track the delay timeout so we can cancel if response arrives early */
let streamingDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;

/** Streaming tool call state */
export interface StreamingToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  output?: string;
}

/** Streaming segment - discriminated union for text and tool segments */
export type StreamingSegment =
  | { type: 'text'; content: string }
  | { type: 'tool'; toolCall: StreamingToolCall; status: 'pending' | 'completed' | 'error' };

/** Type guard for text segments */
export function isTextSegment(seg: StreamingSegment): seg is { type: 'text'; content: string } {
  return seg.type === 'text';
}

/** Type guard for tool segments */
export function isToolSegment(
  seg: StreamingSegment
): seg is { type: 'tool'; toolCall: StreamingToolCall; status: 'pending' | 'completed' | 'error' } {
  return seg.type === 'tool';
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
  /** Session ID from most recently completed streaming (for new session navigation) */
  completedSessionId: string | null;
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
  /** Add a streaming tool call segment */
  addStreamingToolCall: (toolCall: StreamingToolCall) => void;
  /** Update a streaming tool call's input */
  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>) => void;
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
  /** Clear completed session ID after navigation */
  clearCompletedSessionId: () => void;
  /** Update streaming sessionId without resetting segments (for late sessionId arrival) */
  updateStreamingSessionId: (sessionId: string) => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  isStreaming: false,
  streamingSessionId: null,
  streamingMessageId: null,
  streamingSegments: [],
  streamingStartedAt: null,
  completedSessionId: null,
  permissionMode: 'default',
  contextUsage: null,

  // Actions
  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  sendMessage: (content: string, options: SendMessageOptions) => {
    const socket = getSocket();
    const { workingDirectory, sessionId, resume, attachments } = options;

    // Clear any existing delay timeout
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    // Set isStreaming true immediately (disables input), but delay the visual "waiting" UI
    set({ isStreaming: true });

    // Show "waiting" UI after a short delay (natural "reading" feel)
    streamingDelayTimeoutId = setTimeout(() => {
      const state = get();
      // Only show if still streaming and no segments received yet
      if (state.isStreaming && state.streamingSegments.length === 0 && !state.streamingSessionId) {
        set({
          streamingSessionId: sessionId || 'pending',
          streamingMessageId: 'pending',
          streamingSegments: [],
          streamingStartedAt: new Date(),
        });
      }
      streamingDelayTimeoutId = null;
    }, STREAMING_UI_DELAY_MS);

    // Emit chat:send event to server
    socket.emit('chat:send', {
      content,
      workingDirectory,
      sessionId,
      resume,
      permissionMode: get().permissionMode,
      // Convert Attachment[] to ImageAttachment[] (strip File objects for serialization)
      images: attachments?.map(a => ({
        mimeType: a.mimeType,
        data: a.data,
        name: a.name,
      })),
    });
  },

  startStreaming: (sessionId: string, messageId: string) => {
    // Cancel delay timeout if response arrived early
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    set({
      isStreaming: true,
      streamingSessionId: sessionId,
      streamingMessageId: messageId,
      streamingSegments: [],
      streamingStartedAt: new Date(),
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

  addStreamingToolCall: (toolCall: StreamingToolCall) => {
    const segments = get().streamingSegments;
    // Avoid duplicates
    if (segments.some((seg) => seg.type === 'tool' && seg.toolCall.id === toolCall.id)) return;
    // Add tool segment (previous text segment is automatically "closed")
    set({
      streamingSegments: [...segments, { type: 'tool', toolCall, status: 'pending' }],
    });
  },

  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>) => {
    const segments = get().streamingSegments;
    const updated = segments.map((seg) =>
      seg.type === 'tool' && seg.toolCall.id === toolCallId
        ? { ...seg, toolCall: { ...seg.toolCall, input } }
        : seg
    );
    set({ streamingSegments: updated });
  },

  updateStreamingToolCall: (toolCallId: string, result: string, isError?: boolean) => {
    const segments = get().streamingSegments;
    const updated = segments.map((seg) =>
      seg.type === 'tool' && seg.toolCall.id === toolCallId
        ? {
            ...seg,
            toolCall: { ...seg.toolCall, output: result },
            status: isError ? 'error' as const : 'completed' as const,
          }
        : seg
    );
    set({ streamingSegments: updated });
  },

  completeStreaming: () => {
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    // Save sessionId before clearing (for new session navigation)
    const currentSessionId = get().streamingSessionId;

    // Clear streaming state only — message persistence is handled by
    // fetchMessages() in handleComplete (useStreaming.ts), which replaces
    // messageStore.messages with authoritative server data.
    set({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
      completedSessionId: currentSessionId,
    });
  },

  abortStreaming: () => {
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }
    set({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
    });
  },

  abortResponse: () => {
    const state = get();
    if (!state.isStreaming) return;

    // Clear delay timeout
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }

    // Notify server to abort SDK request
    const socket = getSocket();
    socket.emit('chat:abort');

    // Preserve text content from segments with abort marker
    const textContent = state.streamingSegments
      .filter((seg): seg is { type: 'text'; content: string } => seg.type === 'text')
      .map((seg) => seg.content)
      .join('');

    if (textContent.trim()) {
      useMessageStore.getState().addMessages([{
        id: `aborted-${Date.now()}`,
        type: 'assistant',
        content: textContent + '\n\n*[중단됨]*',
        timestamp: new Date().toISOString(),
      }]);
    }

    // Clear streaming state
    set({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
    });
  },

  setPermissionMode: (mode: PermissionMode) => set({ permissionMode: mode }),

  setContextUsage: (usage: ChatUsage) => set({ contextUsage: usage }),

  resetContextUsage: () => set({ contextUsage: null }),

  clearCompletedSessionId: () => set({ completedSessionId: null }),

  updateStreamingSessionId: (sessionId: string) => set({ streamingSessionId: sessionId }),
}));
