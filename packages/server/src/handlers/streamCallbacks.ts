/**
 * Shared stream callback builder for sendMessageWithCallbacks.
 * Used by both browser handleChatSend (websocket.ts) and queue executePrompt (queueService.ts).
 *
 * onError, onActivity, and canUseTool are intentionally excluded —
 * they differ fundamentally between browser and queue paths.
 */

import type {
  StreamCallbacks,
  StreamChunk,
  TrackedToolCall,
  ToolResult,
  CompactMetadata,
  TaskNotificationData,
  SessionMetadata,
  ChatResponse,
} from '@hammoc/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('streamCallbacks');

// ---- Dependency interfaces (injected, not imported — avoids circular deps) ----

export interface StreamRef {
  sessionId: string;
  sockets: { size: number };
}

export interface QueueProgress {
  current: number;
  total: number;
}

export interface NotificationRef {
  shouldNotify(socketCount: number): boolean;
  notifyComplete(sessionId: string, lastContent?: string, queueProgress?: QueueProgress): void;
  notifyError(sessionId: string, error: string): void;
}

// ---- Public API ----

export interface CallbackBuilderDeps {
  emit: (event: string, data: unknown) => void;
  stream: StreamRef;
  isResuming: boolean;
  rekeyStream: (newSessionId: string) => void;
  broadcastStreamChange: (sessionId: string, active: boolean) => void;
  notificationService: NotificationRef;
  /** Initial sessionId before SDK resolves the actual one (used as fallback in emit payloads) */
  initialSessionId?: string;
  /** Story 25.7: branch point UUID for edit — included in session:resumed so clients can truncate */
  resumeSessionAt?: string;
  /** Returns current queue progress when running inside queue executor */
  getQueueProgress?: () => QueueProgress | undefined;
  /** Story 25.11: when true, emit 'session:forked' instead of 'session:created'/'session:resumed' */
  isFork?: boolean;
}

export interface CallbackBuilderHooks {
  /** Called after SDK resolves session ID. Browser: disk write. Queue: state update. */
  onSessionIdResolved?: (sid: string) => void;
  /** Called before emitting text chunk. Queue: chunks.push() for marker detection. */
  onTextChunkReceived?: (chunk: StreamChunk) => void;
  /** Activity signal per callback. Browser: resetTimeout(). Queue: omitted. */
  onCallbackActivity?: (source: string) => void;
}

export interface SessionIdRef {
  current: string | undefined;
}

export interface BuildResult {
  callbacks: StreamCallbacks;
  sessionIdRef: SessionIdRef;
}

export function buildStreamCallbacks(
  deps: CallbackBuilderDeps,
  hooks?: CallbackBuilderHooks,
): BuildResult {
  const { emit, stream, isResuming, resumeSessionAt, rekeyStream, broadcastStreamChange, notificationService, isFork } = deps;
  const activity = hooks?.onCallbackActivity;
  const sessionIdRef: SessionIdRef = { current: deps.initialSessionId };

  const callbacks: StreamCallbacks = {
    onSessionInit: (sid: string, metadata: SessionMetadata) => {
      log.debug(`Session initialized: ${sid} (model: ${metadata?.model ?? 'unknown'})`);
      sessionIdRef.current = sid;

      rekeyStream(sid);

      if (isFork) {
        if (!deps.initialSessionId) {
          log.warn('session:forked emitted without originalSessionId — fork request may be missing sessionId');
        }
        emit('session:forked', { sessionId: sid, originalSessionId: deps.initialSessionId || sid, model: metadata?.model });
      } else if (isResuming) {
        emit('session:resumed', { sessionId: sid, model: metadata?.model, ...(resumeSessionAt ? { resumeSessionAt } : {}) });
      } else {
        emit('session:created', { sessionId: sid, model: metadata?.model });
      }

      broadcastStreamChange(sid, true);
      hooks?.onSessionIdResolved?.(sid);
    },

    onTextChunk: (chunk: StreamChunk) => {
      activity?.('onTextChunk');
      hooks?.onTextChunkReceived?.(chunk);
      emit('message:chunk', {
        sessionId: sessionIdRef.current || chunk.sessionId,
        messageId: chunk.messageId,
        content: chunk.content,
        done: chunk.done,
      });
    },

    onThinking: (content: string) => {
      activity?.('onThinking');
      emit('thinking:chunk', { content });
    },

    onToolUse: (toolCall: TrackedToolCall) => {
      activity?.('onToolUse');
      log.debug(`onToolUse: tool=${toolCall.name}, id=${toolCall.id}`);
      emit('tool:call', {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
        startedAt: Date.now(),
      });
    },

    onToolInputUpdate: (toolCallId: string, input: Record<string, unknown>) => {
      activity?.('onToolInputUpdate');
      emit('tool:input-update', { toolCallId, input });
    },

    onToolResult: (toolCallId: string, result: ToolResult) => {
      activity?.('onToolResult');
      log.debug(`onToolResult: id=${toolCallId}, success=${result.success}`);
      emit('tool:result', { toolCallId, result });
    },

    onCompact: (metadata: CompactMetadata) => {
      activity?.('onCompact');
      emit('system:compact', metadata);
    },

    onToolProgress: (toolUseId: string, elapsedTimeSeconds: number, toolName: string) => {
      activity?.('onToolProgress');
      emit('tool:progress', { toolUseId, elapsedTimeSeconds, toolName });
    },

    onTaskNotification: (data: TaskNotificationData) => {
      activity?.('onTaskNotification');
      emit('system:task-notification', data);
    },

    onToolUseSummary: (summary: string, precedingToolUseIds: string[]) => {
      activity?.('onToolUseSummary');
      emit('tool:summary', { summary, precedingToolUseIds });
    },

    onAssistantUsage: (usage) => {
      emit('assistant:usage', usage);
    },

    onContextEstimate: (estimatedTokens, contextWindow) => {
      emit('context:estimate', { estimatedTokens, contextWindow });
    },

    onResultError: (data) => {
      emit('result:error', data);
    },

    onComplete: (response: ChatResponse) => {
      emit('message:complete', {
        id: response.id,
        sessionId: sessionIdRef.current || response.sessionId,
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        usage: response.usage,
      });

      if (response.usage) {
        emit('context:usage', response.usage);
      }

      if (notificationService.shouldNotify(stream.sockets.size)) {
        notificationService.notifyComplete(stream.sessionId, response.content, deps.getQueueProgress?.());
      }
    },

    // onError: intentionally omitted — callers provide their own
    // onActivity: intentionally omitted — browser-only
  };

  return { callbacks, sessionIdRef };
}
