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
  PermissionMode,
  ImageAttachment,
  PermissionRequest,
} from '@bmad-studio/shared';
import { ERROR_CODES, IMAGE_CONSTRAINTS, parseQueueScript, TERMINAL_ERRORS } from '@bmad-studio/shared';
import type { TerminalCreateRequest, TerminalInputEvent, TerminalResizeEvent, TerminalErrorEvent } from '@bmad-studio/shared';
import i18next from '../i18n.js';
import { SUPPORTED_LANGUAGES } from '@bmad-studio/shared';
import { isLocalIP, extractClientIP } from '../utils/networkUtils.js';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { ChatService } from '../services/chatService.js';
import { SessionService } from '../services/sessionService.js';
import { parseSDKError, AbortedError } from '../utils/errors.js';
import { createSessionMiddleware } from '../middleware/session.js';
import { config } from '../config/index.js';
import { notificationService, formatAskQuestionPrompt } from '../services/notificationService.js';
import { preferencesService } from '../services/preferencesService.js';
import { getOrCreateQueueService, getQueueInstances } from '../controllers/queueController.js';
import { createLogger } from '../utils/logger.js';
import { buildStreamCallbacks } from './streamCallbacks.js';
import { rateLimitProbeService } from '../services/rateLimitProbeService.js';
import { ptyService } from '../services/ptyService.js';
import { projectService } from '../services/projectService.js';
import { dashboardService } from '../services/dashboardService.js';
const log = createLogger('websocket');

// Alias for concise usage in guards
const queueInstances = getQueueInstances;

// Socket-to-terminal mapping: socket.id → Set of terminalIds (Story 17.1)
const socketTerminals = new Map<string, Set<string>>();

// Story 20.1: Session-to-project mapping for dashboard triggers
const sessionProjectMap = new Map<string, string>();

// Story 20.1: Per-project debounced dashboard status change broadcaster
const dashboardDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function triggerDashboardStatusChange(projectSlug: string): void {
  const existing = dashboardDebounceTimers.get(projectSlug);
  if (existing) clearTimeout(existing);

  dashboardDebounceTimers.set(
    projectSlug,
    setTimeout(async () => {
      dashboardDebounceTimers.delete(projectSlug);
      try {
        const status = await dashboardService.getProjectStatus(projectSlug);
        io.to('dashboard').emit('dashboard:status-change', { projectSlug, status });
      } catch (err) {
        log.error(`Failed to broadcast dashboard status for ${projectSlug}:`, err);
      }
    }, 300)
  );
}

/**
 * Check terminal access for a socket connection.
 * Fail-closed: denies access on any error (e.g., preferences file read failure).
 * Story 17.5: Terminal Security
 */
async function checkTerminalAccess(
  socket: Socket, lang: string
): Promise<{ allowed: boolean; error?: TerminalErrorEvent }> {
  const t = i18next.getFixedT(lang);
  try {
    const terminalEnabled = await preferencesService.getTerminalEnabled();
    if (!terminalEnabled) {
      return {
        allowed: false,
        error: {
          code: TERMINAL_ERRORS.TERMINAL_DISABLED.code,
          message: t('ws.error.terminalDisabled'),
        },
      };
    }
  } catch (err) {
    // Fail-closed: deny access if preferences read fails
    log.error('Failed to check terminal enabled state, denying access:', err);
    return {
      allowed: false,
      error: {
        code: TERMINAL_ERRORS.TERMINAL_DISABLED.code,
        message: t('ws.error.terminalDisabled'),
      },
    };
  }

  const clientIP = extractClientIP(socket);
  if (!isLocalIP(clientIP)) {
    return {
      allowed: false,
      error: {
        code: TERMINAL_ERRORS.TERMINAL_ACCESS_DENIED.code,
        message: t('ws.error.terminalAccessDenied'),
      },
    };
  }

  return { allowed: true };
}

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

/** Check if a specific session has a running active stream */
export function isSessionStreaming(sessionId: string): boolean {
  const stream = activeStreams.get(sessionId);
  return !!stream && stream.status === 'running';
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
  // Collect sockets from session room (same as chat:send handler)
  const sockets = new Set<SocketType>();
  if (io) {
    const roomSockets = io.sockets.adapter.rooms.get(`session:${sessionId}`);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const sock = io.sockets.sockets.get(socketId) as SocketType | undefined;
        if (sock) sockets.add(sock);
      }
    }
  }

  const stream: ActiveStream = {
    sessionId,
    sockets,
    abortController,
    buffer: [],
    pendingPermissions: new Map(),
    status: 'running',
    startedAt: Date.now(),
  };
  activeStreams.set(sessionId, stream);
  for (const sock of sockets) {
    socketToSession.set(sock.id, sessionId);
  }

  const emit = createStreamEmit(stream);

  return { stream, emit };
}

/**
 * Re-key a stream when SDK assigns a different sessionId than the initial key.
 * Updates activeStreams map and socketToSession references.
 */
export function rekeyStream(stream: ActiveStream, newSessionId: string): void {
  if (stream.sessionId === newSessionId) return;
  const oldSessionId = stream.sessionId;
  activeStreams.delete(oldSessionId);
  stream.sessionId = newSessionId;
  activeStreams.set(newSessionId, stream);
  for (const sock of stream.sockets) {
    socketToSession.set(sock.id, newSessionId);
    sock.leave(`session:${oldSessionId}`);
    sock.join(`session:${newSessionId}`);
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
 * Story 20.1: Also triggers dashboard status change when projectSlug is known.
 */
export function broadcastStreamChange(sessionId: string, active: boolean): void {
  io.emit('session:stream-change', { sessionId, active });
  const slug = sessionProjectMap.get(sessionId);
  if (slug) {
    triggerDashboardStatusChange(slug);
    if (!active) sessionProjectMap.delete(sessionId);
  }
}

/**
 * Match Accept-Language header against SUPPORTED_LANGUAGES.
 * Returns the first matching language code or null.
 */
function matchAcceptLanguage(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(',').map(part => {
    const [lang, qStr] = part.trim().split(';q=');
    return { lang: lang.trim().split('-')[0].toLowerCase(), q: qStr ? parseFloat(qStr) : 1.0 };
  }).sort((a, b) => b.q - a.q);
  for (const { lang } of parts) {
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
      return lang;
    }
  }
  return null;
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
    log.info(`Client connected. Total: ${connectedClients}`);

    // Set default language synchronously; resolved asynchronously below.
    // Handlers read socket.data.language at invocation time (not capture time).
    socket.data.language = 'en';

    // Resolve language preference and send terminal:access asynchronously.
    // Event listeners are registered synchronously below to prevent race conditions
    // where early client emits could be dropped during async preference loading.
    (async () => {
      try {
        const prefs = await preferencesService.readPreferences();
        const prefLang = prefs.language && SUPPORTED_LANGUAGES.includes(prefs.language as typeof SUPPORTED_LANGUAGES[number])
          ? prefs.language : null;
        const headerLang = matchAcceptLanguage(socket.request?.headers?.['accept-language']);
        socket.data.language = prefLang || headerLang || 'en';
      } catch {
        // Keep default 'en'
      }

      // Story 17.5: Send terminal access info on connection (after language resolved)
      const lang = socket.data.language || 'en';
      const t = i18next.getFixedT(lang);
      try {
        const clientIP = extractClientIP(socket);
        const isLocal = isLocalIP(clientIP);
        const terminalEnabled = await preferencesService.getTerminalEnabled();
        socket.emit('terminal:access', {
          allowed: terminalEnabled && isLocal,
          enabled: terminalEnabled,
          reason: !terminalEnabled
            ? t('ws.error.terminalDisabled')
            : !isLocal
            ? t('ws.error.terminalAccessDenied')
            : undefined,
        });
      } catch (err) {
        log.error('Failed to send terminal:access event:', err);
        // Fail-closed: report as disabled
        socket.emit('terminal:access', {
          allowed: false,
          enabled: false,
          reason: t('ws.error.terminalDisabled'),
        });
      }
    })();

    // Start rate limit polling on first client connection
    if (connectedClients === 1) {
      rateLimitProbeService.startPolling(
        (data) => { io.emit('rateLimit:update', data); },
        (data) => { io.emit('apiHealth:update', data); },
      );
    }

    // Send cached rate limit data immediately to newly connected client
    const cachedRateLimit = rateLimitProbeService.getCachedResult();
    if (cachedRateLimit) {
      socket.emit('rateLimit:update', cachedRateLimit);
    }

    // Send cached API health status to newly connected client
    const cachedHealth = rateLimitProbeService.getApiHealth();
    if (cachedHealth) {
      socket.emit('apiHealth:update', cachedHealth);
    }

    // Handle chat:send event — background streaming with reconnect support
    socket.on('chat:send', async (data) => {
      const lang = socket.data.language || 'en';
      const t = i18next.getFixedT(lang);
      // Reject if queue has locked this session (server-side enforcement)
      if (data.sessionId) {
        for (const [, qs] of queueInstances()) {
          if (qs.lockedSessionId === data.sessionId) {
            socket.emit('error', {
              code: ERROR_CODES.CHAT_ERROR,
              message: t('ws.error.queueSessionLocked'),
            });
            return;
          }
        }
      }
      const abortController = new AbortController();
      const streamKey = data.sessionId || `pending-${socket.id}`;

      // Story 20.1: Populate session→project mapping for dashboard triggers
      projectService.findProjectByPath(data.workingDirectory).then((project) => {
        if (project) sessionProjectMap.set(streamKey, project.projectSlug);
      }).catch(() => {});

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
        await handleChatSend(stream, data, abortController, lang);
      } finally {
        stream.status = 'completed';
        const endedSessionId = stream.sessionId;
        // Only cleanup if this stream is still the active one for this session.
        // A replacement stream (from another chat:send) may have already taken over
        // the same key — deleting it would be a race condition.
        if (activeStreams.get(endedSessionId) === stream) {
          cleanupStream(endedSessionId);
          io.emit('session:stream-change', { sessionId: endedSessionId, active: false });
          // Story 20.1: Trigger dashboard status change on stream end
          const endProjectSlug = sessionProjectMap.get(endedSessionId);
          if (endProjectSlug) {
            triggerDashboardStatusChange(endProjectSlug);
            sessionProjectMap.delete(endedSessionId);
          }
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
              response: data.response,
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
        log.debug(`Permission mode changed to "${data.mode}" for session ${sessionId}`);
        // Broadcast to other viewers so their UI stays in sync
        for (const sock of stream.sockets) {
          if (sock.id !== socket.id) {
            sock.emit('permission:mode-change', { mode: data.mode });
          }
        }
      } catch (err) {
        log.error('Failed to change permission mode:', err);
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
      await handleSessionList(socket, data, socket.data.language || 'en');
    });

    // Story 20.1: Dashboard subscribe/unsubscribe
    socket.on('dashboard:subscribe', () => {
      socket.join('dashboard');
    });
    socket.on('dashboard:unsubscribe', () => {
      socket.leave('dashboard');
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
        const t = i18next.getFixedT(socket.data.language || 'en');
        socket.emit('error', { code: 'QUEUE_ALREADY_RUNNING', message: t('ws.error.queueAlreadyRunning') });
        return;
      }
      queueService.start(items, projectSlug, sessionId, permissionMode).catch((err) => {
        log.error('Queue execution error:', err);
      });
      triggerDashboardStatusChange(projectSlug);
    });
    socket.on('queue:pause', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      if (qs.isRunning) qs.pause();
      triggerDashboardStatusChange(data.projectSlug);
    });
    socket.on('queue:resume', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      if (qs.isRunning) qs.resume().catch(() => {});
      triggerDashboardStatusChange(data.projectSlug);
    });
    socket.on('queue:abort', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      if (qs.isRunning) qs.abort();
      triggerDashboardStatusChange(data.projectSlug);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:dismiss' as any, (data: { projectSlug: string }) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.dismiss();
    });
    socket.on('queue:removeItem', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.removeItem(data.itemIndex);
    });
    socket.on('queue:addItem', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      const result = parseQueueScript(data.rawLine);
      if (result.items.length > 0) {
        qs.addItem(result.items[0]);
      }
    });
    socket.on('queue:reorderItems', (data) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.reorderItems(data.newOrder);
    });

    // --- Story 17.1: Terminal PTY events ---
    socketTerminals.set(socket.id, new Set());

    socket.on('terminal:create', async (data: TerminalCreateRequest) => {
      const lang = socket.data.language || 'en';
      const t = i18next.getFixedT(lang);
      // Story 17.5: Security guard
      const access = await checkTerminalAccess(socket, lang);
      if (!access.allowed) {
        log.warn(`Terminal access denied for ${extractClientIP(socket)} on terminal:create`);
        socket.emit('terminal:error', access.error!);
        return;
      }

      try {
        // Reattach to existing session
        if (data.terminalId) {
          const tid = data.terminalId;
          const existing = ptyService.getSession(tid);
          if (!existing) {
            socket.emit('terminal:error', {
              terminalId: tid,
              code: TERMINAL_ERRORS.TERMINAL_NOT_FOUND.code,
              message: t('ws.error.terminalNotFound'),
            });
            return;
          }
          ptyService.cancelCleanup(tid);
          ptyService.onData(tid, (output: string) => {
            socket.emit('terminal:data', { terminalId: tid, data: output });
          });
          ptyService.onExit(tid, (exitCode: number) => {
            socket.emit('terminal:exit', { terminalId: tid, exitCode });
            socketTerminals.get(socket.id)?.delete(tid);
          });
          socketTerminals.get(socket.id)?.add(tid);
          socket.emit('terminal:created', { terminalId: tid, shell: existing.shell });
          return;
        }

        // Create new session
        const projectPath = await projectService.resolveProjectPath(data.projectSlug);
        if (!projectPath) {
          socket.emit('terminal:error', {
            code: TERMINAL_ERRORS.PTY_SPAWN_ERROR.code,
            message: t('ws.error.terminalProjectNotFound'),
          });
          return;
        }

        const { terminalId, shell } = ptyService.createSession(projectPath, data.projectSlug);

        ptyService.onData(terminalId, (output: string) => {
          socket.emit('terminal:data', { terminalId, data: output });
        });
        ptyService.onExit(terminalId, (exitCode: number) => {
          socket.emit('terminal:exit', { terminalId, exitCode });
          socketTerminals.get(socket.id)?.delete(terminalId);
          // Story 20.1: Trigger dashboard on natural PTY exit
          triggerDashboardStatusChange(data.projectSlug);
        });

        socketTerminals.get(socket.id)?.add(terminalId);
        socket.emit('terminal:created', { terminalId, shell });
        // Story 20.1: Trigger dashboard on terminal create
        triggerDashboardStatusChange(data.projectSlug);
      } catch (err) {
        const code = (err as Error & { code?: string }).code || TERMINAL_ERRORS.PTY_SPAWN_ERROR.code;
        const message = (err as Error).message || t('ws.error.ptySpawnError');
        socket.emit('terminal:error', { terminalId: data.terminalId, code, message });
      }
    });

    socket.on('terminal:input', async (data: TerminalInputEvent) => {
      // Story 17.5: Security guard
      const inputAccess = await checkTerminalAccess(socket, socket.data.language || 'en');
      if (!inputAccess.allowed) {
        log.warn(`Terminal access denied for ${extractClientIP(socket)} on terminal:input`);
        socket.emit('terminal:error', { ...inputAccess.error!, terminalId: data.terminalId });
        return;
      }

      try {
        ptyService.writeInput(data.terminalId, data.data);
      } catch (err) {
        const code = (err as Error & { code?: string }).code || TERMINAL_ERRORS.TERMINAL_NOT_FOUND.code;
        socket.emit('terminal:error', { terminalId: data.terminalId, code, message: (err as Error).message });
      }
    });

    socket.on('terminal:resize', async (data: TerminalResizeEvent) => {
      // Story 17.5: Security guard
      const resizeAccess = await checkTerminalAccess(socket, socket.data.language || 'en');
      if (!resizeAccess.allowed) {
        log.warn(`Terminal access denied for ${extractClientIP(socket)} on terminal:resize`);
        socket.emit('terminal:error', { ...resizeAccess.error!, terminalId: data.terminalId });
        return;
      }

      try {
        ptyService.resize(data.terminalId, data.cols, data.rows);
      } catch (err) {
        const code = (err as Error & { code?: string }).code || TERMINAL_ERRORS.INVALID_DIMENSIONS.code;
        socket.emit('terminal:error', { terminalId: data.terminalId, code, message: (err as Error).message });
      }
    });

    socket.on('terminal:close', async (data: { terminalId: string }) => {
      // Story 17.5: Security guard
      const closeAccess = await checkTerminalAccess(socket, socket.data.language || 'en');
      if (!closeAccess.allowed) {
        log.warn(`Terminal access denied for ${extractClientIP(socket)} on terminal:close`);
        socket.emit('terminal:error', { ...closeAccess.error!, terminalId: data.terminalId });
        return;
      }

      try {
        // Story 20.1: Extract projectSlug BEFORE closeSession removes the session
        const closingSession = ptyService.getSession(data.terminalId);
        const closeProjectSlug = closingSession?.projectSlug;
        ptyService.closeSession(data.terminalId);
        socketTerminals.get(socket.id)?.delete(data.terminalId);
        if (closeProjectSlug) {
          triggerDashboardStatusChange(closeProjectSlug);
        }
      } catch {
        // Ignore close errors — session may already be gone
      }
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

      // PTY sessions are NOT cleaned up on socket disconnect.
      // They persist until explicitly closed by the user, the PTY process exits,
      // or the server shuts down. This prevents losing long-running terminal
      // work during browser refreshes or temporary network interruptions.
      const terminalIds = socketTerminals.get(socket.id);
      if (terminalIds) {
        socketTerminals.delete(socket.id);
      }

      connectedClients--;
      log.info(`Client disconnected. Total: ${connectedClients}`);

      // Stop polling when no clients connected
      if (connectedClients === 0) {
        rateLimitProbeService.stopPolling();
      }
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
function validateImages(images: ImageAttachment[], lang: string): { valid: boolean; error?: string } {
  const t = i18next.getFixedT(lang);
  if (images.length > IMAGE_CONSTRAINTS.MAX_COUNT) {
    return { valid: false, error: t('ws.error.maxImages', { value: IMAGE_CONSTRAINTS.MAX_COUNT }) };
  }

  for (const img of images) {
    if (!(IMAGE_CONSTRAINTS.ACCEPTED_TYPES as readonly string[]).includes(img.mimeType)) {
      return { valid: false, error: t('ws.error.unsupportedImageFormat', { value: img.mimeType }) };
    }
    // base64 size approximation: base64 length * 0.75 ≈ original bytes
    const sizeBytes = Math.ceil(img.data.length * 0.75);
    if (sizeBytes > IMAGE_CONSTRAINTS.MAX_SIZE_BYTES) {
      return { valid: false, error: t('ws.error.imageSizeExceeded', { value: img.name }) };
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
  abortController: AbortController,
  lang: string
): Promise<void> {
  const emit = createStreamEmit(stream);
  const t = i18next.getFixedT(lang);
  const { content, workingDirectory, sessionId, resume, permissionMode, model, images } = data;

  // Validate images if present (Story 5.5)
  if (images && images.length > 0) {
    const validation = validateImages(images, lang);
    if (!validation.valid) {
      emit('error', {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: validation.error!,
      });
      return;
    }
  }

  // Validate workingDirectory exists
  if (!workingDirectory || !existsSync(workingDirectory)) {
    emit('error', {
      code: ERROR_CODES.INVALID_WORKING_DIR,
      message: t('ws.error.projectPathNotFound'),
    });
    return;
  }

  // Buffer the user's message so reconnecting clients can display it
  // (SDK may not have written the JSONL file yet at reconnect time)
  emit('user:message', { content, sessionId: sessionId || '' });

  const isResuming = resume && sessionId;
  const sessionService = new SessionService();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const chatService = new ChatService({ workingDirectory, permissionMode });
    stream.chatService = chatService;

    // Load preferences early for advanced settings + timeout
    const effectivePrefs = await preferencesService.getEffectivePreferences();

    const chatOptions = {
      ...(isResuming ? { resume: sessionId } : { sessionId }),
      abortController,
      model,
      images,
      // Advanced settings from preferences
      customSystemPrompt: effectivePrefs.customSystemPrompt,
      maxThinkingTokens: effectivePrefs.maxThinkingTokens,
      maxTurns: effectivePrefs.maxTurns,
      maxBudgetUsd: effectivePrefs.maxBudgetUsd,
    };

    // Create canUseTool callback for permission & AskUserQuestion handling
    // Promise stays pending if socket disconnected — SDK naturally waits
    const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
      // Auto-approve ExitPlanMode when the user originally chose Bypass mode.
      // The SDK internally switches to 'plan' after EnterPlanMode, which causes
      // ExitPlanMode to request approval even though the user intended full bypass.
      if (toolName === 'ExitPlanMode' && permissionMode === 'bypassPermissions') {
        log.debug('Auto-approving ExitPlanMode: original permissionMode is bypassPermissions');
        return { behavior: 'allow', updatedInput: input };
      }

      const isAskUserQuestion = toolName === 'AskUserQuestion';

      const requestId = options.toolUseID || `perm-${++permissionRequestCounter}`;

      log.debug(`canUseTool called: tool=${toolName}, toolUseID=${options.toolUseID}, requestId=${requestId}`);

      // Emit permission:request (buffered + forwarded to connected socket)
      emit('permission:request', {
        id: requestId,
        sessionId: sessionIdRef.current || '',
        toolCall: { id: requestId, name: toolName, input },
        requiresApproval: true,
      } as PermissionRequest);

      // Notify via Telegram if no socket connected (user not watching)
      if (stream.sockets.size === 0) {
        const prompt = isAskUserQuestion
          ? formatAskQuestionPrompt(input as Record<string, unknown>)
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
    const rawTimeoutMs = effectivePrefs.chatTimeoutMs ?? config.chat.timeoutMs;
    const timeoutMs = (rawTimeoutMs >= 30000 && rawTimeoutMs <= 1800000) ? rawTimeoutMs : 300000;
    let lastResetSource = 'initial';
    const resetTimeout = (source?: string) => {
      if (source) lastResetSource = source;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        log.warn(`TIMEOUT FIRED after ${timeoutMs}ms inactivity (last reset by: ${lastResetSource})`);
        abortController.abort('timeout');
      }, timeoutMs);
    };
    resetTimeout('initial');

    // Build shared callbacks (common logic for browser & queue paths)
    const { callbacks, sessionIdRef } = buildStreamCallbacks(
      {
        emit,
        stream,
        isResuming: !!isResuming,
        initialSessionId: sessionId,
        rekeyStream: (sid) => {
          // Story 20.1: Update session→project mapping on rekey
          const projectSlug = sessionProjectMap.get(stream.sessionId);
          rekeyStream(stream, sid);
          if (projectSlug) {
            sessionProjectMap.delete(stream.sessionId);
            sessionProjectMap.set(sid, projectSlug);
          }
        },
        broadcastStreamChange,
        notificationService,
      },
      {
        onCallbackActivity: (source) => resetTimeout(source),
        onSessionIdResolved: (sid) => {
          sessionService.saveSessionId(workingDirectory, sid).catch(() => {});
        },
      },
    );

    // Browser-only callbacks
    callbacks.onActivity = (messageType: string) => {
      resetTimeout(`onActivity:${messageType}`);
    };

    callbacks.onError = (error) => {
      // Ignore abort errors from replaced streams (another-client or user-abort)
      if (abortController.signal.aborted) {
        const reason = abortController.signal.reason;
        if (reason === 'another-client' || reason === 'user-abort') {
          return;
        }
      }

      const sdkError = parseSDKError(error, lang);

      if (isResuming && isSessionNotFoundError(error)) {
        emit('error', {
          code: ERROR_CODES.SESSION_NOT_FOUND,
          message: t('ws.error.sessionNotFound'),
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
    };

    await chatService.sendMessageWithCallbacks(content, callbacks, chatOptions, canUseTool, (messageType: string) => {
      resetTimeout(`raw:${messageType}`);
    });
  } catch (error) {
    const sdkError = parseSDKError(error, lang);

    if (sdkError instanceof AbortedError || abortController.signal.aborted) {
      if (abortController.signal.reason === 'user-abort' || abortController.signal.reason === 'another-client') {
        return;
      }
      emit('error', {
        code: ERROR_CODES.TIMEOUT_ERROR,
        message: t('ws.error.timeout'),
      });
      return;
    }

    if (isResuming && error instanceof Error && isSessionNotFoundError(error)) {
      emit('error', {
        code: ERROR_CODES.SESSION_NOT_FOUND,
        message: t('ws.error.sessionNotFound'),
      });
      return;
    }

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
  data: { projectPath: string },
  lang: string
): Promise<void> {
  const t = i18next.getFixedT(lang);
  const { projectPath } = data;

  if (!projectPath || !existsSync(projectPath)) {
    socket.emit('error', {
      code: ERROR_CODES.INVALID_WORKING_DIR,
      message: t('ws.error.projectPathNotFound'),
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
      message: t('ws.error.sessionListFailed'),
    });
  }
}
