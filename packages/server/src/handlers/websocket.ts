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
  PermissionMode,
  ImageAttachment,
} from '@bmad-studio/shared';
import { ERROR_CODES, IMAGE_CONSTRAINTS } from '@bmad-studio/shared';
import { ChatService } from '../services/chatService.js';
import { SessionService } from '../services/sessionService.js';
import { parseSDKError, AbortedError } from '../utils/errors.js';
import { createSessionMiddleware } from '../middleware/session.js';
import { config } from '../config/index.js';

let io: SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
let connectedClients = 0;

// Module-level map: socket.id → active AbortController
const activeAbortControllers = new Map<string, AbortController>();

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

    // Handle chat:send event
    socket.on('chat:send', async (data) => {
      const abortController = new AbortController();
      activeAbortControllers.set(socket.id, abortController);
      try {
        await handleChatSend(socket, data, abortController);
      } finally {
        activeAbortControllers.delete(socket.id);
      }
    });

    // Handle chat:abort event — user-initiated abort
    socket.on('chat:abort', () => {
      const controller = activeAbortControllers.get(socket.id);
      if (controller) {
        controller.abort('user-abort');
        activeAbortControllers.delete(socket.id);
      }
    });

    // Handle session:list event
    socket.on('session:list', async (data) => {
      await handleSessionList(socket, data);
    });

    socket.on('disconnect', () => {
      const controller = activeAbortControllers.get(socket.id);
      if (controller) {
        controller.abort('disconnect');
        activeAbortControllers.delete(socket.id);
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
 * Story 4.6: Added timeout handling and SESSION_NOT_FOUND error handling
 */
async function handleChatSend(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  data: { content: string; workingDirectory: string; sessionId?: string; resume?: boolean; permissionMode?: PermissionMode; images?: ImageAttachment[] },
  abortController: AbortController
): Promise<void> {
  const { content, workingDirectory, sessionId, resume, permissionMode, images } = data;

  // Validate images if present (Story 5.5)
  if (images && images.length > 0) {
    const validation = validateImages(images);
    if (!validation.valid) {
      socket.emit('error', {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: validation.error!,
      });
      return;
    }
  }

  // Validate workingDirectory exists
  if (!workingDirectory || !existsSync(workingDirectory)) {
    socket.emit('error', {
      code: ERROR_CODES.INVALID_WORKING_DIR,
      message: '지정된 프로젝트 경로가 존재하지 않습니다.',
    });
    return;
  }

  const isResuming = resume && sessionId;
  const sessionService = new SessionService();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const chatService = new ChatService({ workingDirectory, permissionMode });

    // Build chat options with resume, abortController, and images
    const chatOptions = {
      ...(isResuming ? { resume: sessionId } : {}),
      abortController,
      images,
    };

    // Set timeout for chat response
    timeoutId = setTimeout(() => {
      abortController.abort();
    }, config.chat.timeoutMs);

    await chatService.sendMessageWithCallbacks(content, {
      onSessionInit: async (sid) => {
        console.log(`Session initialized: ${sid}`);

        // Save session ID for future use
        await sessionService.saveSessionId(workingDirectory, sid);

        // Emit appropriate session event
        if (isResuming) {
          socket.emit('session:resumed', { sessionId: sid });
        } else {
          socket.emit('session:created', { sessionId: sid });
        }
      },

      onTextChunk: (chunk) => {
        socket.emit('message:chunk', {
          sessionId: sessionId || chunk.sessionId,
          messageId: chunk.messageId,
          content: chunk.content,
          done: chunk.done,
        });
      },

      onToolUse: (toolCall: TrackedToolCall) => {
        socket.emit('tool:call', {
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });
      },

      onToolInputUpdate: (toolCallId: string, input: Record<string, unknown>) => {
        socket.emit('tool:input-update', {
          toolCallId,
          input,
        });
      },

      onToolResult: (toolCallId: string, result: ToolResult) => {
        socket.emit('tool:result', {
          toolCallId,
          result,
        });
      },

      onComplete: (response) => {
        socket.emit('message:complete', {
          id: response.id,
          sessionId: sessionId || response.sessionId,
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
        });
      },

      onError: (error) => {
        const sdkError = parseSDKError(error);

        // Story 4.6 - Task 3.3: Check for session not found error
        if (isResuming && isSessionNotFoundError(error)) {
          socket.emit('error', {
            code: ERROR_CODES.SESSION_NOT_FOUND,
            message: '세션을 찾을 수 없습니다. 새 세션을 시작해주세요.',
          });
          return;
        }

        socket.emit('error', {
          code: ERROR_CODES.CHAT_ERROR,
          message: sdkError.message,
        });
      },
    }, chatOptions);
  } catch (error) {
    const sdkError = parseSDKError(error);

    // Check for abort (user-initiated or timeout)
    if (sdkError instanceof AbortedError || abortController.signal.aborted) {
      if (abortController.signal.reason === 'user-abort') {
        // User initiated abort — no error event needed, silent return
        return;
      }
      // Timeout or other abort — emit timeout error
      socket.emit('error', {
        code: ERROR_CODES.TIMEOUT_ERROR,
        message: '응답 시간이 초과되었습니다. 다시 시도해 주세요.',
      });
      return;
    }

    // Story 4.6 - Task 3.3: Check for session not found error
    if (isResuming && error instanceof Error && isSessionNotFoundError(error)) {
      socket.emit('error', {
        code: ERROR_CODES.SESSION_NOT_FOUND,
        message: '세션을 찾을 수 없습니다. 새 세션을 시작해주세요.',
      });
      return;
    }

    socket.emit('error', {
      code: ERROR_CODES.CHAT_ERROR,
      message: sdkError.message,
    });
  } finally {
    // Clear timeout to prevent memory leaks
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
