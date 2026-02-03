/**
 * Chat Store - Zustand store for real-time chat state
 * [Source: Story 4.2 - Task 1, Story 4.5 - Task 1, Story 4.6 - Task 2]
 */

import { create } from 'zustand';
import { getSocket } from '../services/socket';

/** Delay before showing "waiting" UI (ms) - gives a natural "reading" feel */
const STREAMING_UI_DELAY_MS = 600;

/** Track the delay timeout so we can cancel if response arrives early */
let streamingDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;

/** Streaming message state */
export interface StreamingMessageState {
  sessionId: string;
  messageId: string;
  content: string;
  startedAt: Date;
}

/** Streaming tool call state */
export interface StreamingToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'pending' | 'completed';
}

interface ChatState {
  /** Whether Claude is currently generating a response */
  isStreaming: boolean;
  /** Current streaming message state */
  streamingMessage: StreamingMessageState | null;
  /** Streaming tool calls (shown during streaming) */
  streamingToolCalls: StreamingToolCall[];
}

interface SendMessageOptions {
  /** Project working directory path */
  workingDirectory: string;
  /** Session ID for resuming existing session */
  sessionId?: string;
  /** Whether to resume an existing session */
  resume?: boolean;
}

interface ChatActions {
  /** Set streaming state */
  setStreaming: (streaming: boolean) => void;
  /** Send message via WebSocket */
  sendMessage: (content: string, options: SendMessageOptions) => void;
  /** Start streaming a new message */
  startStreaming: (sessionId: string, messageId: string) => void;
  /** Append content to the current streaming message */
  appendStreamingContent: (content: string) => void;
  /** Add a streaming tool call */
  addStreamingToolCall: (toolCall: StreamingToolCall) => void;
  /** Update a streaming tool call's input */
  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>) => void;
  /** Mark a streaming tool call as completed */
  completeStreamingToolCall: (toolCallId: string) => void;
  /** Complete streaming and clear state */
  completeStreaming: () => void;
  /** Abort streaming and clear state */
  abortStreaming: () => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  isStreaming: false,
  streamingMessage: null,
  streamingToolCalls: [],

  // Actions
  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  sendMessage: (content: string, options: SendMessageOptions) => {
    const socket = getSocket();
    const { workingDirectory, sessionId, resume } = options;

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
      // Only show if still streaming and no content received yet
      if (state.isStreaming && !state.streamingMessage) {
        set({
          streamingMessage: {
            sessionId: sessionId || 'pending',
            messageId: 'pending',
            content: '',
            startedAt: new Date(),
          },
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
      streamingMessage: {
        sessionId,
        messageId,
        content: '',
        startedAt: new Date(),
      },
    });
  },

  appendStreamingContent: (content: string) => {
    const state = get();
    if (!state.streamingMessage) return;

    set({
      streamingMessage: {
        ...state.streamingMessage,
        content: state.streamingMessage.content + content,
      },
    });
  },

  addStreamingToolCall: (toolCall: StreamingToolCall) => {
    const state = get();
    // Avoid duplicates
    if (state.streamingToolCalls.some((tc) => tc.id === toolCall.id)) return;
    set({
      streamingToolCalls: [...state.streamingToolCalls, toolCall],
    });
  },

  updateStreamingToolCallInput: (toolCallId: string, input: Record<string, unknown>) => {
    const state = get();
    set({
      streamingToolCalls: state.streamingToolCalls.map((tc) =>
        tc.id === toolCallId ? { ...tc, input } : tc
      ),
    });
  },

  completeStreamingToolCall: (toolCallId: string) => {
    const state = get();
    set({
      streamingToolCalls: state.streamingToolCalls.map((tc) =>
        tc.id === toolCallId ? { ...tc, status: 'completed' } : tc
      ),
    });
  },

  completeStreaming: () => {
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }
    set({
      isStreaming: false,
      streamingMessage: null,
      streamingToolCalls: [],
    });
  },

  abortStreaming: () => {
    if (streamingDelayTimeoutId) {
      clearTimeout(streamingDelayTimeoutId);
      streamingDelayTimeoutId = null;
    }
    set({
      isStreaming: false,
      streamingMessage: null,
      streamingToolCalls: [],
    });
  },
}));
