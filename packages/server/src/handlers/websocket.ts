/**
 * WebSocket Handler for Socket.io
 * Story 1.4: WebSocket Server Setup
 * Story 1.5: Chat event handler with streaming
 * Story 4.6: Timeout handling and error management
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { existsSync } from 'fs';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  TrackedToolCall,
  ToolResult,
  CompactMetadata,
  TaskNotificationData,
  PermissionMode,
  ImageAttachment,
  PermissionRequest,
} from '@bmad-studio/shared';
import { ERROR_CODES, IMAGE_CONSTRAINTS } from '@bmad-studio/shared';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { ChatService } from '../services/chatService.js';
import { SessionService } from '../services/sessionService.js';
import { parseSDKError, AbortedError } from '../utils/errors.js';
import { createSessionMiddleware } from '../middleware/session.js';
import { config } from '../config/index.js';
import { notificationService } from '../services/notificationService.js';
import { preferencesService } from '../services/preferencesService.js';
import { getOrCreateQueueService } from '../controllers/queueController.js';

let io: SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
let connectedClients = 0;

// --- ActiveStream: Background streaming with reconnect support ---

type SocketType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface PendingPermission {
  resolve: (result: { approved: boolean; response?: string | string[] | Record<string, string | string[]> }) => void;
  interactionType: 'permission' | 'question';
}

interface ActiveStream {
  sessionId: string;
  sockets: Set<SocketType>;
  abortController: AbortController;
  buffer: Array<{ event: string; data: unknown }>;
  pendingPermissions: Map<string, PendingPermission>;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  chatService?: ChatService;
}

// Primary maps: sessionId → ActiveStream, socketId → sessionId
const activeStreams = new Map<string, ActiveStream>();
const socketToSession = new Map<string, string>();

let permissionRequestCounter = 0;

/** Create a buffered emit function that buffers and broadcasts to all connected sockets */
function createStreamEmit(stream: ActiveStream) {
  return (event: string, data: unknown) => {
    stream.buffer.push({ event, data });
    for (const sock of stream.sockets) {
      if (sock.connected) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sock.emit as any)(event, data);
      }
    }
  };
}

/** Get session IDs of all currently running active streams */
export function getActiveStreamSessionIds(): string[] {
  return [...activeStreams.entries()]
    .filter(([, stream]) => stream.status === 'running')
    .map(([key]) => key);
}

/** Clean up a stream from all maps */
function cleanupStream(streamKey: string) {
  activeStreams.delete(streamKey);
  for (const [sockId, sessId] of socketToSession.entries()) {
    if (sessId === streamKey) socketToSession.delete(sockId);
  }
}

/**
 * Create a headless ActiveStream (no attached socket) for queue execution.
 * Returns a buffered emit function and a broadcast function for project room delivery.
 * The stream is registered in activeStreams so session:join/reconnect works.
 */
export function createHeadlessStream(
  sessionId: string,
  abortController: AbortController
): {
  stream: ActiveStream;
  emit: (event: string, data: unknown) => void;
} {
  const stream: ActiveStream = {
    sessionId,
    sockets: new Set(),
    abortController,
    buffer: [],
    pendingPermissions: new Map(),
    status: 'running',
    startedAt: Date.now(),
  };
  activeStreams.set(sessionId, stream);

  const emit = createStreamEmit(stream);

  return { stream, emit };
}

/**
 * Re-key a stream when SDK assigns a different sessionId than the initial key.
 * Updates activeStreams map and socketToSession references.
 */
export function rekeyStream(stream: ActiveStream, newSessionId: string): void {
  if (stream.sessionId === newSessionId) return;
  activeStreams.delete(stream.sessionId);
  stream.sessionId = newSessionId;
  activeStreams.set(newSessionId, stream);
  for (const sock of stream.sockets) {
    socketToSession.set(sock.id, newSessionId);
  }
}

/**
 * Mark a stream as completed and broadcast stream-change.
 * Cleans up from activeStreams map.
 */
export function finalizeStream(sessionId: string): void {
  const stream = activeStreams.get(sessionId);
  if (stream) {
    stream.status = 'completed';
    cleanupStream(sessionId);
  }
  io.emit('session:stream-change', { sessionId, active: false });
}

/**
 * Broadcast session:stream-change to all connected clients.
 * Used by queue service to signal stream start/end.
 */
export function broadcastStreamChange(sessionId: string, active: boolean): void {
  io.emit('session:stream-change', { sessionId, active });
}

/**
 * Initialize Socket.io server with the HTTP server
 * @param httpServer - HTTP server instance from Express
 * @returns Socket.io server instance
 * [Source: Story 2.5 - Task 4]
 */
export async function initializeWebSocket(
  httpServer: HttpServer
): Promise<SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>> {
  io = new SocketIOServer(httpServer, {
    cors: config.websocket.cors,
    maxHttpBufferSize: 100 * 1024 * 1024, // 100MB for base64 image payloads
  });

  // Session middleware for WebSocket (Story 2.5 - Task 4)
  const sessionMiddleware = await createSessionMiddleware();

  // Parse session from cookie for Socket.io connections
  io.use((socket, next) => {
    // Express middleware adapter for Socket.io
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionMiddleware(socket.request as any, {} as any, next as any);
  });

  // Authentication middleware (Story 2.5 - Task 4)
  io.use((socket, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (socket.request as any).session;

    if (session?.authenticated) {
      return next();
    }

    return next(new Error('Unauthorized'));
  });

  io.on('connection', (socket) => {
    connectedClients++;
    console.log(`Client connected. Total: ${connectedClients}`);

    // Handle chat:send event — background streaming with reconnect support
    // TODO(Story 15.4): Add session lock check here — reject if queue is running for this session.
    // Use getOrCreateQueueService(projectSlug).lockedSessionId to check.
    // Requires projectSlug in chat:send data or reverse-lookup from sessionId.
    socket.on('chat:send', async (data) => {
      const abortController = new AbortController();
      const streamKey = data.sessionId || `pending-${socket.id}`;

      // Abort existing active stream for same session — notify all watchers
      const existingStream = activeStreams.get(streamKey);
      if (existingStream && existingStream.status === 'running') {
        for (const sock of existingStream.sockets) {
          if (sock.id !== socket.id) {
            sock.emit('stream:detached', { sessionId: streamKey, reason: 'another-client' });
            socketToSession.delete(sock.id);
          }
        }
        existingStream.abortController.abort('another-client');
      }

      // Collect all sockets viewing this session (from persistent session room)
      const initialSockets = new Set<SocketType>([socket]);
      const roomSockets = io.sockets.adapter.rooms.get(`session:${streamKey}`);
      if (roomSockets) {
        for (const socketId of roomSockets) {
          const roomSocket = io.sockets.sockets.get(socketId) as SocketType | undefined;
          if (roomSocket && roomSocket.id !== socket.id) {
            initialSockets.add(roomSocket);
          }
        }
      }

      const stream: ActiveStream = {
        sessionId: streamKey,
        sockets: initialSockets,
        abortController,
        buffer: [],
        pendingPermissions: new Map(),
        status: 'running',
        startedAt: Date.now(),
      };
      activeStreams.set(streamKey, stream);
      for (const sock of initialSockets) {
        socketToSession.set(sock.id, streamKey);
      }

      try {
        await handleChatSend(stream, data, abortController);
      } finally {
        stream.status = 'completed';
        const endedSessionId = stream.sessionId;
        // Only cleanup if this stream is still the active one for this session.
        // A replacement stream (from another chat:send) may have already taken over
        // the same key — deleting it would be a race condition.
        if (activeStreams.get(endedSessionId) === stream) {
          cleanupStream(endedSessionId);
          io.emit('session:stream-change', { sessionId: endedSessionId, active: false });
        }
      }
    });

    // Handle permission:respond event — route to ActiveStream (covers both normal chat and queue)
    socket.on('permission:respond', (data) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;
      const stream = activeStreams.get(sessionId);
      if (stream?.pendingPermissions.has(data.requestId)) {
        stream.pendingPermissions.get(data.requestId)!.resolve({ approved: data.approved, response: data.response });
        stream.pendingPermissions.delete(data.requestId);
        // Broadcast the actual resolution to all OTHER viewers so their
        // tool/interactive cards can show the correct approve/deny state
        for (const sock of stream.sockets) {
          if (sock.id !== socket.id) {
            sock.emit('permission:resolved', {
              requestId: data.requestId,
              approved: data.approved,
              interactionType: data.interactionType,
            });
          }
        }
      } else {
        // Permission already resolved by another viewer — notify sender
        socket.emit('permission:already-resolved', { requestId: data.requestId });
      }
    });

    // Handle chat:abort event — find stream and abort, notify all viewers
    socket.on('chat:abort', () => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;
      const stream = activeStreams.get(sessionId);
      if (stream && stream.status === 'running') {
        // Emit abort notification to all connected viewers BEFORE triggering abort.
        // This ensures passive viewers (who didn't initiate the abort) also
        // receive a completion signal, preventing them from being stuck in isStreaming=true.
        for (const sock of stream.sockets) {
          sock.emit('stream:detached', { sessionId, reason: 'user-abort' });
        }
        stream.abortController.abort('user-abort');
      }
    });

    // Handle permission:mode-change — update SDK permission mode during active stream
    socket.on('permission:mode-change', async (data) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;
      const stream = activeStreams.get(sessionId);
      if (!stream?.chatService || stream.status !== 'running') return;
      try {
        await stream.chatService.setPermissionMode(data.mode);
        console.log(`[websocket] Permission mode changed to "${data.mode}" for session ${sessionId}`);
      } catch (err) {
        console.error('[websocket] Failed to change permission mode:', err);
      }
    });

    // Handle session:join event — attach socket to active running stream (broadcast)
    // Also joins a persistent Socket.io room so future streams auto-include this socket.
    socket.on('session:join', (sessionId: string) => {
      // Detach this socket from any previously-attached stream to prevent
      // events from the old stream leaking to a different session's listeners
      const prevSessionId = socketToSession.get(socket.id);
      if (prevSessionId && prevSessionId !== sessionId) {
        const prevStream = activeStreams.get(prevSessionId);
        if (prevStream) {
          prevStream.sockets.delete(socket);
        }
        socketToSession.delete(socket.id);
        socket.leave(`session:${prevSessionId}`);
      }

      // Join persistent session room (survives beyond ActiveStream lifecycle)
      socket.join(`session:${sessionId}`);

      const stream = activeStreams.get(sessionId);

      if (!stream || stream.status !== 'running') {
        socket.emit('stream:status', { active: false, sessionId });
        return;
      }

      // Add socket to broadcast set (multiple browsers can watch simultaneously)
      stream.sockets.add(socket);
      socketToSession.set(socket.id, sessionId);

      // Notify this client that stream is active, then replay entire buffer
      socket.emit('stream:status', { active: true, sessionId });
      for (const entry of stream.buffer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (socket.emit as any)(entry.event, entry.data);
      }
    });

    // Handle session:leave event — detach socket from current stream and session room
    // (client navigating away from a session while streaming continues in background)
    socket.on('session:leave', (sessionId: string) => {
      const prevSessionId = socketToSession.get(socket.id);
      if (prevSessionId) {
        const prevStream = activeStreams.get(prevSessionId);
        if (prevStream) {
          prevStream.sockets.delete(socket);
        }
        socketToSession.delete(socket.id);
      }
      // Use prevSessionId as fallback — client may send empty string when
      // the sessionId is not available at unmount time (e.g., ChatPage cleanup)
      const roomSessionId = sessionId || prevSessionId;
      if (roomSessionId) {
        socket.leave(`session:${roomSessionId}`);
      }
    });

    // Handle session:list event
    socket.on('session:list', async (data) => {
      await handleSessionList(socket, data);
    });

    // Handle project:join/leave — room for queue event delivery (Story 15.2)
    socket.on('project:join', (projectSlug: string) => {
      socket.join(`project:${projectSlug}`);
    });
    socket.on('project:leave', (projectSlug: string) => {
      socket.leave(`project:${projectSlug}`);
    });

    // Handle queue events via WebSocket (Story 15.2)
    socket.on('queue:start', async (data) => {
      const { items, sessionId, projectSlug, permissionMode } = data;
      socket.join(`project:${projectSlug}`);
      const queueService = getOrCreateQueueService(projectSlug);
      if (queueService.isRunning) {
        socket.emit('error', { code: 'QUEUE_ALREADY_RUNNING', message: 'Queue is already running for this project' });
        return;
      }
      queueService.start(items, projectSlug, sessionId, permissionMode).catch((err) => {
        console.error('[websocket] Queue execution error:', err);
      });
    });
    socket.on('queue:pause', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      if (qs.isRunning) qs.pause();
    });
    socket.on('queue:resume', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      if (qs.isRunning) qs.resume().catch(() => {});
    });
    socket.on('queue:abort', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      if (qs.isRunning) qs.abort();
    });

    // Disconnect: detach socket from stream, DON'T abort or deny permissions
    socket.on('disconnect', () => {
      const sessionId = socketToSession.get(socket.id);
      if (sessionId) {
        const stream = activeStreams.get(sessionId);
        if (stream) {
          stream.sockets.delete(socket);
        }
        socketToSession.delete(socket.id);
      }
      connectedClients--;
      console.log(`Client disconnected. Total: ${connectedClients}`);
    });
  });

  return io;
}

/**
 * Get the Socket.io server instance
 * @throws Error if Socket.io is not initialized
 * @returns Socket.io server instance
 */
export function getIO(): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

/**
 * Get the current number of connected clients
 * @returns Number of connected clients
 */
export function getConnectedClientsCount(): number {
  return connectedClients;
}

/**
 * Validate image attachments
 * Story 5.5: Image Attachment
 */
function validateImages(images: ImageAttachment[]): { valid: boolean; error?: string } {
  if (images.length > IMAGE_CONSTRAINTS.MAX_COUNT) {
    return { valid: false, error: `이미지는 최대 ${IMAGE_CONSTRAINTS.MAX_COUNT}개까지 첨부할 수 있습니다.` };
  }

  for (const img of images) {
    if (!(IMAGE_CONSTRAINTS.ACCEPTED_TYPES as readonly string[]).includes(img.mimeType)) {
      return { valid: false, error: `지원되지 않는 이미지 형식입니다: ${img.mimeType}` };
    }
    // base64 size approximation: base64 length * 0.75 ≈ original bytes
    const sizeBytes = Math.ceil(img.data.length * 0.75);
    if (sizeBytes > IMAGE_CONSTRAINTS.MAX_SIZE_BYTES) {
      return { valid: false, error: `이미지 크기가 10MB를 초과합니다: ${img.name}` };
    }
  }

  return { valid: true };
}

/**
 * Check if error message indicates a session not found error
 */
function isSessionNotFoundError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('session not found') ||
    message.includes('session does not exist') ||
    message.includes('invalid session') ||
    message.includes('no such session')
  );
}

/**
 * Handle chat:send event from client
 * Processes user message through ChatService and streams response back
 * All emit calls are buffered via createStreamEmit for reconnect support.
 */
async function handleChatSend(
  stream: ActiveStream,
  data: { content: string; workingDirectory: string; sessionId?: string; resume?: boolean; permissionMode?: PermissionMode; model?: string; images?: ImageAttachment[] },
  abortController: AbortController
): Promise<void> {
  const emit = createStreamEmit(stream);
  const { content, workingDirectory, sessionId, resume, permissionMode, model, images } = data;

  // Validate images if present (Story 5.5)
  if (images && images.length > 0) {
    const validation = validateImages(images);
    if (!validation.valid) {
      emit('error', {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: validation.error!,
      });
      return;
    }
  }

  // Validate workingDirectory exists
  console.log(`[websocket] chat:send workingDirectory="${workingDirectory}", sessionId="${sessionId}", resume=${resume}`);
  if (!workingDirectory || !existsSync(workingDirectory)) {
    console.error(`[websocket] Invalid workingDirectory: "${workingDirectory}" (exists: ${workingDirectory ? existsSync(workingDirectory) : 'N/A'})`);
    emit('error', {
      code: ERROR_CODES.INVALID_WORKING_DIR,
      message: '지정된 프로젝트 경로가 존재하지 않습니다.',
    });
    return;
  }

  // Buffer the user's message so reconnecting clients can display it
  // (SDK may not have written the JSONL file yet at reconnect time)
  emit('user:message', { content, sessionId: sessionId || '' });

  const isResuming = resume && sessionId;
  const sessionService = new SessionService();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let actualSessionId: string | undefined = sessionId;

  try {
    console.log(`[websocket] Creating ChatService: permissionMode="${permissionMode}", workingDirectory="${workingDirectory}"`);
    const chatService = new ChatService({ workingDirectory, permissionMode });
    stream.chatService = chatService;

    const chatOptions = {
      ...(isResuming ? { resume: sessionId } : { sessionId }),
      abortController,
      model,
      images,
    };

    // Create canUseTool callback for permission & AskUserQuestion handling
    // Promise stays pending if socket disconnected — SDK naturally waits
    const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
      const isAskUserQuestion = toolName === 'AskUserQuestion';

      const requestId = options.toolUseID || `perm-${++permissionRequestCounter}`;

      console.log(`[websocket] canUseTool called: tool=${toolName}, toolUseID=${options.toolUseID}, requestId=${requestId}`);

      // Emit permission:request (buffered + forwarded to connected socket)
      emit('permission:request', {
        id: requestId,
        sessionId: actualSessionId || '',
        toolCall: { id: requestId, name: toolName, input },
        requiresApproval: true,
      } as PermissionRequest);

      // Notify via Telegram if no socket connected (user not watching)
      if (stream.sockets.size === 0) {
        const prompt = isAskUserQuestion
          ? ((input as Record<string, unknown>).questions as Array<{ question: string }>)?.[0]?.question
          : `${toolName}`;
        notificationService.notifyInputRequired(stream.sessionId, toolName, prompt);
      }

      // Wait for user response — Promise stays pending if no socket connected
      const userResponse = await new Promise<{ approved: boolean; response?: string | string[] | Record<string, string | string[]> }>((resolve) => {
        stream.pendingPermissions.set(requestId, {
          resolve,
          interactionType: isAskUserQuestion ? 'question' : 'permission',
        });
      });

      if (isAskUserQuestion) {
        const questions = (input as Record<string, unknown>).questions as Array<{ question: string }>;
        let answers: Record<string, string | string[]>;

        if (typeof userResponse.response === 'object' && !Array.isArray(userResponse.response) && userResponse.response !== null) {
          answers = userResponse.response as Record<string, string | string[]>;
        } else {
          const answer = typeof userResponse.response === 'string'
            ? userResponse.response
            : Array.isArray(userResponse.response) ? userResponse.response.join(', ') : '';
          answers = { [questions[0].question]: answer };
        }

        return {
          behavior: 'allow',
          updatedInput: {
            questions,
            answers,
          },
        };
      }

      if (userResponse.approved) {
        return { behavior: 'allow', updatedInput: input };
      } else {
        return { behavior: 'deny', message: 'User denied permission', interrupt: true };
      }
    };

    // Activity-based timeout: resets on every SDK callback event
    // Prevents cancellation while SDK is actively working (e.g., large Write input streaming)
    // Timeout value from preferences (with env var override), clamped to 30s–30min range
    const effectivePrefs = await preferencesService.getEffectivePreferences();
    const rawTimeoutMs = effectivePrefs.chatTimeoutMs ?? config.chat.timeoutMs;
    const timeoutMs = (rawTimeoutMs >= 30000 && rawTimeoutMs <= 1800000) ? rawTimeoutMs : 300000;
    let lastResetSource = 'initial';
    const resetTimeout = (source?: string) => {
      if (source) lastResetSource = source;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log(`[websocket] ⏰ TIMEOUT FIRED after ${timeoutMs}ms inactivity (last reset by: ${lastResetSource})`);
        abortController.abort('timeout');
      }, timeoutMs);
    };
    resetTimeout('initial');

    await chatService.sendMessageWithCallbacks(content, {
      onActivity: (messageType: string) => {
        resetTimeout(`onActivity:${messageType}`);
      },

      onSessionInit: async (sid, metadata) => {
        console.log(`Session initialized: ${sid} (model: ${metadata?.model ?? 'unknown'})`);
        actualSessionId = sid;

        // Re-key stream from pending key to actual sessionId
        if (stream.sessionId !== sid) {
          activeStreams.delete(stream.sessionId);
          stream.sessionId = sid;
          activeStreams.set(sid, stream);
          for (const sock of stream.sockets) {
            socketToSession.set(sock.id, sid);
          }
        }

        // Emit session event BEFORE disk write for faster client navigation
        if (isResuming) {
          emit('session:resumed', { sessionId: sid, model: metadata?.model });
        } else {
          emit('session:created', { sessionId: sid, model: metadata?.model });
        }

        // Broadcast stream-active so session lists can update in real-time
        io.emit('session:stream-change', { sessionId: sid, active: true });

        // Disk write is best-effort (don't block streaming)
        sessionService.saveSessionId(workingDirectory, sid).catch(() => {});
      },

      onTextChunk: (chunk) => {
        resetTimeout('onTextChunk');
        emit('message:chunk', {
          sessionId: actualSessionId || chunk.sessionId,
          messageId: chunk.messageId,
          content: chunk.content,
          done: chunk.done,
        });
      },

      onThinking: (content: string) => {
        resetTimeout('onThinking');
        emit('thinking:chunk', { content });
      },

      onToolUse: (toolCall: TrackedToolCall) => {
        resetTimeout('onToolUse');
        console.log(`[websocket] onToolUse: tool=${toolCall.name}, id=${toolCall.id}`);
        emit('tool:call', {
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });
      },

      onToolInputUpdate: (toolCallId: string, input: Record<string, unknown>) => {
        resetTimeout('onToolInputUpdate');
        emit('tool:input-update', {
          toolCallId,
          input,
        });
      },

      onToolResult: (toolCallId: string, result: ToolResult) => {
        resetTimeout('onToolResult');
        console.log(`[websocket] onToolResult: id=${toolCallId}, success=${result.success}`);
        emit('tool:result', {
          toolCallId,
          result,
        });
      },

      onCompact: (metadata: CompactMetadata) => {
        resetTimeout('onCompact');
        emit('system:compact', metadata);
      },

      onToolProgress: (toolUseId: string, elapsedTimeSeconds: number, toolName: string) => {
        resetTimeout('onToolProgress');
        emit('tool:progress', { toolUseId, elapsedTimeSeconds, toolName });
      },

      onTaskNotification: (data: TaskNotificationData) => {
        resetTimeout('onTaskNotification');
        emit('system:task-notification', data);
      },

      onToolUseSummary: (summary: string, precedingToolUseIds: string[]) => {
        resetTimeout('onToolUseSummary');
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

      onComplete: (response) => {
        emit('message:complete', {
          id: response.id,
          sessionId: actualSessionId || response.sessionId,
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          usage: response.usage,
        });

        if (response.usage) {
          emit('context:usage', response.usage);
        }

        // Notify via Telegram if no socket connected
        if (stream.sockets.size === 0) {
          notificationService.notifyComplete(stream.sessionId);
        }
      },

      onError: (error) => {
        const sdkError = parseSDKError(error);

        if (isResuming && isSessionNotFoundError(error)) {
          emit('error', {
            code: ERROR_CODES.SESSION_NOT_FOUND,
            message: '세션을 찾을 수 없습니다. 새 세션을 시작해주세요.',
          });
          return;
        }

        emit('error', {
          code: ERROR_CODES.CHAT_ERROR,
          message: sdkError.message,
        });

        // Notify via Telegram if no socket connected
        if (stream.sockets.size === 0) {
          notificationService.notifyError(stream.sessionId, sdkError.message);
        }
      },
    }, chatOptions, canUseTool, (messageType: string) => {
      resetTimeout(`raw:${messageType}`);
    });
  } catch (error) {
    const sdkError = parseSDKError(error);
    console.log(`[websocket] ❌ catch block: error=${sdkError.message}, aborted=${abortController.signal.aborted}, reason=${abortController.signal.reason}, isAbortedError=${sdkError instanceof AbortedError}`);

    if (sdkError instanceof AbortedError || abortController.signal.aborted) {
      if (abortController.signal.reason === 'user-abort' || abortController.signal.reason === 'another-client') {
        console.log(`[websocket] ${abortController.signal.reason} abort — silently returning`);
        return;
      }
      console.log('[websocket] Timeout abort — emitting TIMEOUT_ERROR');
      emit('error', {
        code: ERROR_CODES.TIMEOUT_ERROR,
        message: '응답 시간이 초과되었습니다. 다시 시도해 주세요.',
      });
      return;
    }

    if (isResuming && error instanceof Error && isSessionNotFoundError(error)) {
      emit('error', {
        code: ERROR_CODES.SESSION_NOT_FOUND,
        message: '세션을 찾을 수 없습니다. 새 세션을 시작해주세요.',
      });
      return;
    }

    console.log(`[websocket] Non-abort error — emitting CHAT_ERROR: ${sdkError.message}`);
    emit('error', {
      code: ERROR_CODES.CHAT_ERROR,
      message: sdkError.message,
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Handle session:list event from client
 * Lists all sessions for a given project
 */
async function handleSessionList(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  data: { projectPath: string }
): Promise<void> {
  const { projectPath } = data;

  if (!projectPath || !existsSync(projectPath)) {
    socket.emit('error', {
      code: ERROR_CODES.INVALID_WORKING_DIR,
      message: '지정된 프로젝트 경로가 존재하지 않습니다.',
    });
    return;
  }

  try {
    const sessionService = new SessionService();
    const sessions = await sessionService.listSessions(projectPath);
    socket.emit('session:list', { sessions });
  } catch {
    socket.emit('error', {
      code: ERROR_CODES.CHAT_ERROR,
      message: '세션 목록을 불러오는 데 실패했습니다.',
    });
  }
}
