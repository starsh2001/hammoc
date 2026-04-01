/**
 * WebSocket Handler for Socket.io
 * Story 1.4: WebSocket Server Setup
 * Story 1.5: Chat event handler with streaming
 * Story 4.6: Timeout handling and error management
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { existsSync, unlinkSync, readFileSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  PermissionMode,
  ImageAttachment,
  PermissionRequest,
  PromptChainItem,
  ThinkingEffort,
} from '@hammoc/shared';
import { ERROR_CODES, IMAGE_CONSTRAINTS, parseQueueScript, TERMINAL_ERRORS, ROOT_BRANCH_KEY } from '@hammoc/shared';
import type { TerminalCreateRequest, TerminalListRequest, TerminalInputEvent, TerminalResizeEvent, TerminalErrorEvent } from '@hammoc/shared';
import i18next from '../i18n.js';
import { SUPPORTED_LANGUAGES } from '@hammoc/shared';
import { isLocalIP, extractClientIP } from '../utils/networkUtils.js';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { ChatService } from '../services/chatService.js';
import { SessionService } from '../services/sessionService.js';
import { parseSDKError, AbortedError, SDKErrorCode } from '../utils/errors.js';
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
import { summarize } from '../services/summarizeService.js';
import { parseJSONLFile } from '../services/historyParser.js';
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
 * Checks server config (TERMINAL_ENABLED env var) and local IP.
 * Story 17.5: Terminal Security
 */
function checkTerminalAccess(
  socket: Socket, lang: string
): { allowed: boolean; error?: TerminalErrorEvent } {
  const t = i18next.getFixedT(lang);
  if (!preferencesService.getTerminalEnabled()) {
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
  buffer: Array<{ event: string; data: unknown; ts: number }>;
  pendingPermissions: Map<string, PendingPermission>;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  chatService?: ChatService;
  resumeSessionAt?: string;
  expectedBranchTotal?: number;
}

// Primary maps: sessionId → ActiveStream, socketId → sessionId
const activeStreams = new Map<string, ActiveStream>();
const socketToSession = new Map<string, string>();
// Story 24.3: Track which session room each socket joined (for session:leave room management)
const socketSessionRoom = new Map<string, string>();
// Track which project room each socket joined (for leave on session switch)
const socketProjectRoom = new Map<string, string>();

// Story 24.1: Per-session prompt chain state
// Internal chain item with per-item execution context (not sent to clients)
interface InternalChainItem extends PromptChainItem {
  workingDirectory: string;
  permissionMode?: PermissionMode;
  model?: string;
  effort?: ThinkingEffort;
}
const chainState = new Map<string, InternalChainItem[]>();
// Per-session drain generation counter for race guard
const chainDrainGeneration = new Map<string, number>();
// Sessions that have completed at least one handleChatSend — safe to resume
const chainResumableSessions = new Set<string>();
let chainItemCounter = 0;
const CHAIN_MAX_RETRIES = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Story 25.9: Per-socket summarizing state — requestId prevents race between cancel + new request
const socketSummarizing = new Map<string, { activeRequestId: string | null; abortController: AbortController | null }>();

/** Generate a unique chain item ID */
function generateChainItemId(): string {
  return `chain-${Date.now()}-${++chainItemCounter}`;
}

/** Map internal chain item to public PromptChainItem (allow-list of fields) */
function toPublicChainItem(item: InternalChainItem): PromptChainItem {
  const pub: PromptChainItem = { id: item.id, content: item.content, status: item.status, createdAt: item.createdAt };
  if (item.retryCount !== undefined) pub.retryCount = item.retryCount;
  return pub;
}

/** Broadcast current chain state to all sockets in the session room (strips internal fields) */
function broadcastChainUpdate(sessionId: string): void {
  if (!io) return;
  const internalItems = chainState.get(sessionId) || [];
  const items: PromptChainItem[] = internalItems.map(toPublicChainItem);
  io.to(`session:${sessionId}`).emit('chain:update', { sessionId, items });
}

/** Broadcast chain state including persisted failures from disk */
function broadcastChainUpdateWithFailures(sessionId: string): void {
  if (!io) return;
  withChainFailureLock(sessionId, () => projectService.readChainFailures(sessionId))
    .then(failures => {
      // Re-read in-memory state now (may have changed during async disk read)
      const freshItems = (chainState.get(sessionId) || []).map(toPublicChainItem);
      io!.to(`session:${sessionId}`).emit('chain:update', { sessionId, items: [...freshItems, ...failures] });
    })
    .catch((err) => {
      log.error(`Failed to read chain failures for broadcast (session ${sessionId}):`, err);
      const freshItems = (chainState.get(sessionId) || []).map(toPublicChainItem);
      io!.to(`session:${sessionId}`).emit('chain:update', { sessionId, items: freshItems });
    });
}

/** Clean up chain state when no active work remains */
function cleanupChainIfIdle(sessionId: string): void {
  if (activeStreams.has(sessionId)) return;
  const items = chainState.get(sessionId);
  // Preserve if pending/sending items remain (drain will handle them)
  // or failed items remain (disk persistence may have failed — keep in memory until dismissed)
  if (items && items.some(item => item.status === 'pending' || item.status === 'sending' || item.status === 'failed')) {
    return;
  }
  chainState.delete(sessionId);
  // NOTE: chainResumableSessions is intentionally NOT deleted here.
  // It tracks whether a session has ever completed a successful handleChatSend,
  // which is needed for future chain:add items to use resume mode. Deleting it
  // causes the next chain drain to attempt a fresh session with an existing
  // sessionId, resulting in "process exited with code 1".
  //
  // NOTE: chainDrainGeneration is intentionally NOT deleted here.
  // Deleting would reset the counter to 0, allowing stale timers from before
  // cleanup to match a new gen=1 value (ABA problem).
}

// Per-session mutex for failure file I/O to prevent read-modify-write races
const chainFailureLocks = new Map<string, Promise<void>>();

/** Execute a failure file operation under per-session lock */
function withChainFailureLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chainFailureLocks.get(sessionId) || Promise.resolve();
  const next = prev.then(fn, fn); // run even if previous rejected
  chainFailureLocks.set(sessionId, next.then(() => {}, () => {}));
  return next;
}

/** Persist a failed chain item to disk so it survives server restarts */
async function persistChainFailure(sessionId: string, item: InternalChainItem): Promise<void> {
  return withChainFailureLock(sessionId, async () => {
    const existing = await projectService.readChainFailures(sessionId);
    existing.push(toPublicChainItem(item));
    await projectService.writeChainFailures(sessionId, existing);
  });
}

/** Remove a specific failure from disk */
async function removePersistedFailure(sessionId: string, itemId: string): Promise<void> {
  return withChainFailureLock(sessionId, async () => {
    const failures = await projectService.readChainFailures(sessionId);
    if (failures.length === 0) return;
    const remaining = failures.filter(f => f.id !== itemId);
    if (remaining.length !== failures.length) {
      await projectService.writeChainFailures(sessionId, remaining);
    }
  });
}

/** Clear all persisted failures for a session */
async function clearPersistedFailures(sessionId: string): Promise<void> {
  return withChainFailureLock(sessionId, async () => {
    await projectService.writeChainFailures(sessionId, []);
  });
}

/** Schedule chain drain after stream completion (1s delay) */
function scheduleChainDrain(sessionId: string, lang: string): void {
  // Increment generation counter to detect stale drains
  const gen = (chainDrainGeneration.get(sessionId) || 0) + 1;
  chainDrainGeneration.set(sessionId, gen);
  log.info(`[CHAIN-DRAIN] scheduleChainDrain called: sessionId=${sessionId}, gen=${gen}, chainItems=${chainState.get(sessionId)?.length ?? 0}, activeStream=${activeStreams.has(sessionId)}`);

  setTimeout(async () => {
    // Race guard: if generation changed (manual chat:send started/finished), abort
    if (chainDrainGeneration.get(sessionId) !== gen) {
      log.info(`[CHAIN-DRAIN] timer aborted (generation mismatch): sessionId=${sessionId}, expected=${gen}, actual=${chainDrainGeneration.get(sessionId)}`);
      return;
    }
    // Race guard: if another stream is currently active, abort drain
    if (activeStreams.has(sessionId)) {
      log.info(`[CHAIN-DRAIN] timer aborted (active stream exists): sessionId=${sessionId}, gen=${gen}`);
      return;
    }

    const items = chainState.get(sessionId);
    log.info(`[CHAIN-DRAIN] timer fired: sessionId=${sessionId}, gen=${gen}, items=${items?.length ?? 0}, statuses=${JSON.stringify(items?.map(i => ({ id: i.id.slice(0, 8), status: i.status })) ?? [])}`);
    if (!items || items.length === 0) { cleanupChainIfIdle(sessionId); return; }

    const nextItem = items.find(item => item.status === 'pending');
    if (!nextItem) { log.info(`[CHAIN-DRAIN] no pending item found, cleaning up: sessionId=${sessionId}`); cleanupChainIfIdle(sessionId); return; }

    // Use per-item execution context
    const { workingDirectory, permissionMode, model, effort } = nextItem;

    // Mark item as 'sending' and broadcast (must happen before any await to prevent duplicate execution)
    nextItem.status = 'sending';
    log.info(`[CHAIN-DRAIN] executing item: sessionId=${sessionId}, itemId=${nextItem.id.slice(0, 8)}, content="${nextItem.content.slice(0, 80)}"`);
    broadcastChainUpdate(sessionId);

    const abortController = new AbortController();
    let stream: ActiveStream | undefined;
    try {
      // Create headless stream inside try — if this throws, sending status is recovered below
      const headless = createHeadlessStream(sessionId, abortController);
      stream = headless.stream;
      log.info(`[CHAIN-DRAIN] headless stream created: sessionId=${sessionId}, socketsInRoom=${stream.sockets.size}`);

      // Resolve projectSlug async (fire-and-forget) — same pattern as chat:send
      projectService.findProjectByPath(workingDirectory).then((project) => {
        if (project && stream!.status === 'running' && activeStreams.get(stream!.sessionId) === stream) {
          sessionProjectMap.set(stream!.sessionId, project.projectSlug);
          triggerDashboardStatusChange(project.projectSlug);
        }
      }).catch((err) => {
        log.warn(`[CHAIN-DRAIN] failed to resolve projectSlug for dashboard: sessionId=${sessionId}, dir=${workingDirectory}`, err);
      });

      emitStreamChange(sessionId, true, sessionProjectMap.get(sessionId) ?? null);
      const drainSuccess = await handleChatSend(
        stream,
        { content: nextItem.content, workingDirectory, sessionId, resume: chainResumableSessions.has(sessionId) || undefined, permissionMode, model, effort },
        abortController,
        lang
      );
      if (!drainSuccess) throw new Error('handleChatSend returned false');
      // Success: mark as 'sent' and remove from chain
      nextItem.status = 'sent';
      chainResumableSessions.add(sessionId);
      log.info(`[CHAIN-DRAIN] item completed successfully: sessionId=${sessionId}, itemId=${nextItem.id.slice(0, 8)}`);
      const currentItems = chainState.get(sessionId);
      if (currentItems) {
        chainState.set(sessionId, currentItems.filter(item => item.id !== nextItem.id));
      }
      broadcastChainUpdate(sessionId);
    } catch (err) {
      // Check if this was an intentional abort (chain:remove or chain:clear)
      const isAborted = abortController.signal.aborted;
      const abortReason = abortController.signal.reason;
      const isChainCanceled = isAborted && (abortReason === 'chain-item-removed' || abortReason === 'chain-cleared' || abortReason === 'user-abort');

      if (isChainCanceled) {
        // User-initiated cancel — remove from chain, no disk record needed.
        // Mark as 'sent' so the finally safety-net doesn't reset it to 'pending'.
        nextItem.status = 'sent';
        const cancelItems = chainState.get(sessionId);
        if (cancelItems) {
          chainState.set(sessionId, cancelItems.filter(item => item.id !== nextItem.id));
        }
        log.info(`Chain item ${nextItem.id} canceled (${abortReason}) for session ${sessionId}`);
      } else {
        // On error: increment retry count and persist failure if max retries exceeded
        const retries = (nextItem.retryCount || 0) + 1;
        nextItem.retryCount = retries;
        if (retries >= CHAIN_MAX_RETRIES) {
          nextItem.status = 'failed';
          // Persist to disk, then remove from memory only on success
          try {
            await persistChainFailure(sessionId, nextItem);
            const failItems = chainState.get(sessionId);
            if (failItems) {
              chainState.set(sessionId, failItems.filter(item => item.id !== nextItem.id));
            }
          } catch (persistErr) {
            // Disk write failed — keep in memory so it's not lost
            log.error(`Failed to persist chain failure for session ${sessionId}:`, persistErr);
          }
          log.error(`Chain item ${nextItem.id} failed after ${CHAIN_MAX_RETRIES} retries for session ${sessionId}:`, err);
        } else if (nextItem.status === 'sending') {
          nextItem.status = 'pending';
        }
        log.error(`Chain drain error for session ${sessionId} (attempt ${retries}):`, err);
      }
      // Use disk-aware broadcast since failures may have been persisted above
      broadcastChainUpdateWithFailures(sessionId);
    } finally {
      // Safety net: ensure item is never left stuck in 'sending'
      if (nextItem.status === 'sending') {
        log.warn(`[CHAIN-DRAIN] finally: item still in 'sending', resetting to 'pending': sessionId=${sessionId}, itemId=${nextItem.id.slice(0, 8)}`);
        nextItem.status = 'pending';
        broadcastChainUpdate(sessionId);
      }

      if (stream) {
        stream.status = 'completed';
        const isCurrentStream = activeStreams.get(sessionId) === stream;
        log.info(`[CHAIN-DRAIN] finally: sessionId=${sessionId}, streamCompleted=true, isCurrentStream=${isCurrentStream}`);
        if (isCurrentStream) {
          const remaining = chainState.get(sessionId);
          const remainingPending = remaining?.filter(item => item.status === 'pending').length ?? 0;
          log.info(`[CHAIN-DRAIN] finally: cleaning up stream, remainingItems=${remaining?.length ?? 0}, remainingPending=${remainingPending}`);
          const chainEndSlug = sessionProjectMap.get(sessionId) ?? null;
          cleanupStream(sessionId);
          emitStreamChange(sessionId, false, chainEndSlug);
          // Persist per-session permission mode before cleanup
          const chainFinalMode = stream.chatService?.getPermissionMode();
          if (chainFinalMode) await persistSessionPermissionMode(sessionId, chainFinalMode);
          const endProjectSlug = sessionProjectMap.get(sessionId);
          if (endProjectSlug) {
            triggerDashboardStatusChange(endProjectSlug);
            sessionProjectMap.delete(sessionId);
          }

          // Continue draining or clean up — browser state is irrelevant
          if (remaining && remaining.some(item => item.status === 'pending')) {
            log.info(`[CHAIN-DRAIN] finally: scheduling next drain for sessionId=${sessionId}`);
            scheduleChainDrain(sessionId, lang);
          } else {
            log.info(`[CHAIN-DRAIN] finally: no more pending items, cleaning up chain for sessionId=${sessionId}`);
            cleanupChainIfIdle(sessionId);
          }
        } else {
          log.warn(`[CHAIN-DRAIN] finally: stream is NOT the current active stream (replaced?): sessionId=${sessionId}`);
        }
      } else {
        // Stream creation failed — schedule retry or cleanup
        log.warn(`[CHAIN-DRAIN] finally: no stream was created, scheduling retry: sessionId=${sessionId}`);
        const remaining = chainState.get(sessionId);
        if (remaining && remaining.some(item => item.status === 'pending')) {
          scheduleChainDrain(sessionId, lang);
        } else {
          cleanupChainIfIdle(sessionId);
        }
      }
    }
  }, 1000);
}

let permissionRequestCounter = 0;

/** Create a buffered emit function that buffers and broadcasts to all connected sockets */
function createStreamEmit(stream: ActiveStream) {
  return (event: string, data: unknown) => {
    stream.buffer.push({ event, data, ts: Date.now() });
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

/** Get active (running) session counts grouped by project slug (in-memory, no I/O) */
export function getActiveSessionCountsByProject(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [sessionId, stream] of activeStreams.entries()) {
    if (stream.status !== 'running') continue;
    const slug = sessionProjectMap.get(sessionId);
    if (slug) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

/** Check if a specific session has a running active stream */
export function isSessionStreaming(sessionId: string): boolean {
  const stream = activeStreams.get(sessionId);
  return !!stream && stream.status === 'running';
}

/** Completed stream buffers kept independently of activeStreams.
 *  When a stream completes, its buffer is saved here for 5 seconds so clients
 *  joining during the JSONL flush window can still receive the completed turn.
 *  This is separate from activeStreams so new streams can be created immediately
 *  without losing the completed buffer. */
const completedBuffers = new Map<string, {
  events: Array<{ event: string; data: unknown; ts: number }>;
  startedAt: number;
  resumeSessionAt?: string;
  expectedBranchTotal?: number;
}>();

/** Timer handles for completedBuffer expiry, keyed by sessionId.
 *  Tracked so we can cancel the previous timer when a new buffer replaces it,
 *  allowing the old buffer to be GC'd immediately instead of waiting for expiry. */
const completedBufferTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** How long to keep completed buffers (ms). Allows JSONL to flush before
 *  fetchMessages becomes the sole source for this turn's data. */
const COMPLETED_BUFFER_TTL_MS = 5000;

/** Get the earliest stream start timestamp (active OR recently completed).
 *  When both exist (e.g., chain: previous turn completed + new turn running),
 *  returns the earlier one so fetchMessages excludes ALL stream-period messages.
 *  Both the completed turn and active turn are provided via buffer replay. */
export function getStreamStartedAt(sessionId: string): number | null {
  const stream = activeStreams.get(sessionId);
  const runningStart = stream && stream.status === 'running' ? stream.startedAt : null;
  const completedStart = completedBuffers.get(sessionId)?.startedAt ?? null;
  if (runningStart && completedStart) return Math.min(runningStart, completedStart);
  return runningStart ?? completedStart;
}

/** Get start timestamp of the currently running stream only (ignores completed buffers). */
export function getRunningStreamStartedAt(sessionId: string): number | null {
  const stream = activeStreams.get(sessionId);
  return stream && stream.status === 'running' ? stream.startedAt : null;
}

/** Get the completed buffer for a session (null if none or expired). */
export function getCompletedBuffer(sessionId: string): {
  events: Array<{ event: string; data: unknown; ts: number }>;
  startedAt: number;
  resumeSessionAt?: string;
  expectedBranchTotal?: number;
} | null {
  return completedBuffers.get(sessionId) ?? null;
}

/** Clean up a stream from activeStreams immediately. Saves the buffer to
 *  completedBuffers for 5 seconds so it remains available independently
 *  of any new stream that may be created for the same session. */
function cleanupStream(streamKey: string, expectedStream?: ActiveStream) {
  const current = activeStreams.get(streamKey);

  // Identity guard: if caller specifies the expected stream but a replacement has
  // taken over, don't delete activeStreams (would remove the new stream). However,
  // still save the completed buffer so clients can replay the finished turn.
  const replaced = expectedStream && current !== expectedStream;
  const stream = expectedStream ?? current;

  // Keep a reference to the completed buffer independently of activeStreams.
  // No copy needed — the buffer is immutable after completion (createStreamEmit
  // only pushes to running streams). Only the buffer array is retained; the rest
  // of the stream object (sockets, chatService, etc.) is released for GC.
  if (stream && stream.buffer.length > 0) {
    // Only write if this stream is newer than (or same as) any existing entry.
    // An older stream's delayed finalizeStream must not overwrite a newer buffer.
    const existing = completedBuffers.get(streamKey);
    if (!existing || stream.startedAt >= existing.startedAt) {
      // Cancel previous expiry timer so the old buffer can be GC'd immediately
      const prevTimer = completedBufferTimers.get(streamKey);
      if (prevTimer) clearTimeout(prevTimer);

      completedBuffers.set(streamKey, {
        events: stream.buffer,
        startedAt: stream.startedAt,
        resumeSessionAt: stream.resumeSessionAt,
        expectedBranchTotal: stream.expectedBranchTotal,
      });
      const timer = setTimeout(() => {
        // Guard: only delete if this timer is still the current one for this key.
        if (completedBufferTimers.get(streamKey) === timer) {
          completedBuffers.delete(streamKey);
          completedBufferTimers.delete(streamKey);
        }
      }, COMPLETED_BUFFER_TTL_MS);
      completedBufferTimers.set(streamKey, timer);
    }
  }

  // Only delete from activeStreams and clean up socket mappings if the stream
  // hasn't been replaced. When replaced, the new stream owns those resources.
  if (!replaced) {
    activeStreams.delete(streamKey);
    for (const [sockId, sessId] of socketToSession.entries()) {
      if (sessId === streamKey) socketToSession.delete(sockId);
    }
  }
}

/** Normalize legacy 'never' sync policy to 'streaming' */
function normalizeSyncPolicy(policy: string | undefined): 'streaming' | 'always' {
  return policy === 'always' ? 'always' : 'streaming';
}

/**
 * Persist the stream's final permission mode to .hammoc/session-permissions.json.
 * Returns a promise that resolves when persistence is complete (or fails silently).
 * Must be called before sessionProjectMap.delete() for the given sessionId.
 */
async function persistSessionPermissionMode(sessionId: string, mode: PermissionMode, fallbackSlug?: string): Promise<void> {
  const slug = sessionProjectMap.get(sessionId) || fallbackSlug;
  if (!slug) return;
  try {
    const projectPath = await projectService.resolveProjectPath(slug);
    if (projectPath) {
      await projectService.updateSessionPermission(projectPath, sessionId, mode);
    }
  } catch (err) {
    log.error('Failed to persist session permission mode:', err);
  }
}

/**
 * Create a headless ActiveStream (no attached socket) for queue execution.
 * Returns a buffered emit function and a broadcast function for project room delivery.
 * The stream is registered in activeStreams so session:join/reconnect works.
 */
export function createHeadlessStream(
  sessionId: string,
  abortController: AbortController,
  projectSlug?: string
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
  if (projectSlug) {
    sessionProjectMap.set(sessionId, projectSlug);
  }
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
  const projectSlug = sessionProjectMap.get(oldSessionId);
  activeStreams.delete(oldSessionId);
  stream.sessionId = newSessionId;
  activeStreams.set(newSessionId, stream);
  if (projectSlug) {
    sessionProjectMap.delete(oldSessionId);
    sessionProjectMap.set(newSessionId, projectSlug);
  }
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
export async function finalizeStream(sessionId: string): Promise<void> {
  const stream = activeStreams.get(sessionId);
  if (stream) {
    const finalMode = stream.chatService?.getPermissionMode();
    if (finalMode) await persistSessionPermissionMode(sessionId, finalMode);
    stream.status = 'completed';
    // Pass stream reference so cleanupStream won't accidentally clean up a
    // replacement stream that started during the async persistence above.
    cleanupStream(sessionId, stream);
  }
  // Only emit inactive status and clear project mapping if a replacement stream
  // hasn't taken over during the async persistence above. Without this guard,
  // a new running stream would be falsely reported as inactive.
  // Re-read slug at use time to avoid ABA race with stale capture.
  const currentStream = activeStreams.get(sessionId);
  if (!currentStream || currentStream.status !== 'running') {
    const freshSlug = sessionProjectMap.get(sessionId);
    emitStreamChange(sessionId, false, freshSlug ?? null);
    if (freshSlug) {
      sessionProjectMap.delete(sessionId);
      triggerDashboardStatusChange(freshSlug);
    }
  }
}

/**
 * Emit session:stream-change scoped to the project room when projectSlug is known,
 * falling back to global broadcast otherwise.
 */
function emitStreamChange(sessionId: string, active: boolean, projectSlug: string | null): void {
  const payload = { sessionId, active, projectSlug };
  if (projectSlug) {
    io.to(`project:${projectSlug}`).emit('session:stream-change', payload);
  } else {
    io.emit('session:stream-change', payload);
  }
}

/**
 * Broadcast session:stream-change to project room (or all clients as fallback).
 * Used by queue service to signal stream start/end.
 * Story 20.1: Also triggers dashboard status change when projectSlug is known.
 */
export function broadcastStreamChange(sessionId: string, active: boolean): void {
  const slug = sessionProjectMap.get(sessionId);
  emitStreamChange(sessionId, active, slug ?? null);
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
    cors: config.cors,
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
        const terminalEnabled = preferencesService.getTerminalEnabled();
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

    // Send subscriber status immediately (credential file check, no network call)
    socket.emit('auth:subscriber', { isSubscriber: rateLimitProbeService.hasOAuthCredentials() });

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
        resumeSessionAt: data.resumeSessionAt,
        expectedBranchTotal: data.expectedBranchTotal,
      };
      activeStreams.set(streamKey, stream);
      // Bump drain generation so any pending scheduled drain is invalidated
      chainDrainGeneration.set(streamKey, (chainDrainGeneration.get(streamKey) || 0) + 1);
      for (const sock of initialSockets) {
        socketToSession.set(sock.id, streamKey);
      }

      // Story 20.1: Populate session→project mapping for dashboard triggers
      // Use stream.sessionId (mutable) instead of captured streamKey to handle
      // race condition where rekeyStream() may have already changed the session ID
      projectService.findProjectByPath(data.workingDirectory).then((project) => {
        if (project && stream.status === 'running') {
          sessionProjectMap.set(stream.sessionId, project.projectSlug);
          triggerDashboardStatusChange(project.projectSlug);
        }
      }).catch(() => {});

      try {
        const sendSuccess = await handleChatSend(stream, data, abortController, lang);
        if (sendSuccess) chainResumableSessions.add(stream.sessionId);
      } finally {
        stream.status = 'completed';
        const endedSessionId = stream.sessionId;
        const isCurrentStream = activeStreams.get(endedSessionId) === stream;
        log.info(`[CHAIN-DRAIN] chat:send finally: endedSessionId=${endedSessionId}, isCurrentStream=${isCurrentStream}, socketsOnStream=${stream.sockets.size}`);
        // Only cleanup if this stream is still the active one for this session.
        // A replacement stream (from another chat:send) may have already taken over
        // the same key — deleting it would be a race condition.
        if (isCurrentStream) {
          const sendEndSlug = sessionProjectMap.get(endedSessionId) ?? null;
          cleanupStream(endedSessionId);
          emitStreamChange(endedSessionId, false, sendEndSlug);
          // Persist per-session permission mode before cleanup
          const sendFinalMode = stream.chatService?.getPermissionMode();
          if (sendFinalMode) await persistSessionPermissionMode(endedSessionId, sendFinalMode);

          // Story 20.1: Trigger dashboard status change on stream end
          const endProjectSlug = sessionProjectMap.get(endedSessionId);
          if (endProjectSlug) {
            // Update sessions-index.json so future list queries hit cache
            new SessionService().updateSessionIndex(endProjectSlug, endedSessionId).catch((err) => {
              log.warn(`Failed to update session index: project=${endProjectSlug} session=${endedSessionId}`, err);
            });
            triggerDashboardStatusChange(endProjectSlug);
            sessionProjectMap.delete(endedSessionId);
          }

          // Story 24.1: Schedule chain drain if pending items exist (browser-independent)
          const pendingChain = chainState.get(endedSessionId);
          const pendingCount = pendingChain?.filter(item => item.status === 'pending').length ?? 0;
          log.info(`[CHAIN-DRAIN] chat:send finally: chainItems=${pendingChain?.length ?? 0}, pendingCount=${pendingCount}, statuses=${JSON.stringify(pendingChain?.map(i => ({ id: i.id.slice(0, 8), status: i.status })) ?? [])}`);
          if (pendingChain && pendingChain.some(item => item.status === 'pending')) {
            scheduleChainDrain(endedSessionId, lang);
          } else {
            log.info(`[CHAIN-DRAIN] chat:send finally: no pending chain items, calling cleanupChainIfIdle for ${endedSessionId}`);
            cleanupChainIfIdle(endedSessionId);
          }
        } else {
          log.warn(`[CHAIN-DRAIN] chat:send finally: stream is NOT current active stream (replaced?): endedSessionId=${endedSessionId}`);
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
        // tool/interactive cards can show the correct approve/deny state.
        // Also buffer via createStreamEmit so reconnecting clients see the
        // resolved state instead of a stale 'waiting' permission card.
        const emit = createStreamEmit(stream);
        emit('permission:resolved', {
          requestId: data.requestId,
          approved: data.approved,
          interactionType: data.interactionType,
          response: data.response,
        });
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

      // Also clear any pending prompt chain — user expects everything to stop.
      // Always bump generation to invalidate any in-flight drain timers,
      // even if chainState is already empty (stale timer edge case).
      const gen = (chainDrainGeneration.get(sessionId) || 0) + 1;
      chainDrainGeneration.set(sessionId, gen);
      const chainItems = chainState.get(sessionId);
      if (chainItems && chainItems.length > 0) {
        chainState.set(sessionId, []);
        broadcastChainUpdate(sessionId);
        // Do NOT call cleanupChainIfIdle here — the active stream still exists
        // and scheduleChainDrain's finally block will handle cleanup after it completes.
        clearPersistedFailures(sessionId)
          .then(() => {
            // Guard: only broadcast if no new chain was started since this abort
            if (chainDrainGeneration.get(sessionId) === gen) {
              broadcastChainUpdate(sessionId);
            }
          })
          .catch((err) => {
            log.error(`Failed to clear persisted failures for session ${sessionId}:`, err);
          });
      }
    });

    // Handle permission:mode-change — update SDK permission mode and broadcast to viewers
    socket.on('permission:mode-change', async (data) => {
      const sessionId = socketToSession.get(socket.id) || socketSessionRoom.get(socket.id);
      if (!sessionId) return;

      const { mode, projectSlug } = data;
      const stream = activeStreams.get(sessionId);

      // 1) Update SDK permission mode — only when stream is actively running
      if (stream?.chatService && stream.status === 'running') {
        try {
          await stream.chatService.setPermissionMode(mode);
          log.debug(`Permission mode changed to "${mode}" for session ${sessionId}`);
        } catch (err) {
          log.error('Failed to change permission mode:', err);
          return; // Don't persist or broadcast a mode that failed to apply
        }
      }

      // Update pending chain items so the next drain uses the new mode.
      // Outside the running-stream block because mode can change between turns
      // (e.g., during the 1s chain drain delay when no stream is active).
      const chainItems = chainState.get(sessionId);
      if (chainItems) {
        for (const item of chainItems) {
          if (item.status === 'pending' || item.status === 'sending') {
            item.permissionMode = mode as PermissionMode;
          }
        }
      }

      // 2) Always persist per-session permission mode (read only when policy is 'always')
      // Use projectSlug from client as fallback when sessionProjectMap entry is gone (stream ended)
      await persistSessionPermissionMode(sessionId, mode, projectSlug);

      // 3) Broadcast to other viewers based on sync policy
      let syncPolicy: 'streaming' | 'always' = 'streaming';
      try {
        const prefs = await preferencesService.readPreferences();
        syncPolicy = normalizeSyncPolicy(prefs.permissionSyncPolicy);
      } catch (err) {
        log.error('Failed to read preferences for sync policy:', err);
      }
      if (syncPolicy === 'streaming' && stream?.status !== 'running') return;

      // 'always' or ('streaming' + running) → broadcast via Socket.io room
      socket.to(`session:${sessionId}`).emit('permission:mode-change', { mode });
    });

    // Handle session:join event — attach socket to active running stream (broadcast)
    // Also joins a persistent Socket.io room so future streams auto-include this socket.
    socket.on('session:join', (sessionId: string, projectSlug?: string) => {
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
      // Also leave previous session room even when no active stream existed
      // (socketToSession is only set when a stream is running)
      const prevRoomSessionId = socketSessionRoom.get(socket.id);
      if (prevRoomSessionId && prevRoomSessionId !== sessionId && prevRoomSessionId !== prevSessionId) {
        socket.leave(`session:${prevRoomSessionId}`);
      }

      // Join persistent session room (survives beyond ActiveStream lifecycle)
      socket.join(`session:${sessionId}`);
      // Leave previous project room if switching projects (or if new join has no projectSlug)
      const prevProjectRoom = socketProjectRoom.get(socket.id);
      if (prevProjectRoom && prevProjectRoom !== projectSlug) {
        socket.leave(`project:${prevProjectRoom}`);
        socketProjectRoom.delete(socket.id);
      }
      // Join project room so scoped events (e.g., session:stream-change) are received
      if (projectSlug) {
        socket.join(`project:${projectSlug}`);
        socketProjectRoom.set(socket.id, projectSlug);
      }
      // Story 24.3: Track session room membership for session:leave room management
      socketSessionRoom.set(socket.id, sessionId);

      const stream = activeStreams.get(sessionId);

      // Story 24.1: Send current chain state on join (in-memory + persisted failures)
      // Only attempt disk read for valid UUID sessionIds to avoid unbounded lock map growth
      if (UUID_RE.test(sessionId)) {
        withChainFailureLock(sessionId, async () => {
          return projectService.readChainFailures(sessionId);
        }).then(failures => {
          // Re-read in-memory state now (may have changed during async disk read)
          const freshItems = (chainState.get(sessionId) || []).map(toPublicChainItem);
          const allItems = [...freshItems, ...failures];
          socket.emit('chain:update', { sessionId, items: allItems });
        }).catch((err) => {
          log.error(`Failed to read chain failures on join (session ${sessionId}):`, err);
          const freshItems = (chainState.get(sessionId) || []).map(toPublicChainItem);
          socket.emit('chain:update', { sessionId, items: freshItems });
        });
      } else {
        // Non-UUID session: only send in-memory chain state (no disk persistence)
        const freshItems = (chainState.get(sessionId) || []).map(toPublicChainItem);
        socket.emit('chain:update', { sessionId, items: freshItems });
      }

      if (!stream || stream.status !== 'running') {
        // Emit inactive status + completed buffer replay.
        // Wrapped in a helper that re-checks activeStreams because the async
        // preference-read path can yield, and a new stream may start in between.
        const emitInactiveWithReplay = (permissionMode?: PermissionMode) => {
          // Stale callback guard: if the socket has left this session (moved to
          // another session or disconnected), don't emit anything for the old session.
          if (socketSessionRoom.get(socket.id) !== sessionId || !socket.connected) {
            return;
          }

          // Re-check: if a running stream appeared during async wait, emit active
          // state instead of stale inactive. Without this, the client would miss
          // the initial stream:status/buffer-replay for the new stream.
          const freshStream = activeStreams.get(sessionId);
          if (freshStream && freshStream.status === 'running') {
            socketToSession.set(socket.id, sessionId);
            const bufSnapshot = [...freshStream.buffer];
            const freshMode = freshStream.chatService?.getPermissionMode();
            socket.emit('stream:status', { active: true, sessionId, permissionMode: freshMode });
            // Only replay active buffer — completedBuffer is served via fetchMessages API
            socket.emit('stream:buffer-replay', { sessionId, events: bufSnapshot });
            freshStream.sockets.add(socket);
            return;
          }
          socket.emit('stream:status', { active: false, sessionId, permissionMode });
          // completedBuffer is NOT replayed here — fetchMessages API already merges
          // completedBuffer data into its response, so the client gets it via HTTP.
        };

        // For 'always' sync policy, restore per-session permission mode from disk
        const resolvedSlug = projectSlug || sessionProjectMap.get(sessionId);
        if (resolvedSlug && UUID_RE.test(sessionId)) {
          preferencesService.readPreferences().then(async (prefs) => {
            if (normalizeSyncPolicy(prefs.permissionSyncPolicy) === 'always') {
              const projectPath = await projectService.resolveProjectPath(resolvedSlug);
              if (projectPath) {
                const perms = await projectService.readSessionPermissions(projectPath);
                const savedMode = perms[sessionId] as PermissionMode | undefined;
                emitInactiveWithReplay(savedMode);
                return;
              }
            }
            emitInactiveWithReplay();
          }).catch(() => {
            emitInactiveWithReplay();
          });
        } else {
          emitInactiveWithReplay();
        }
        return;
      }

      socketToSession.set(socket.id, sessionId);

      // Snapshot BEFORE adding socket to broadcast set to prevent race.
      const bufferSnapshot = [...stream.buffer];
      const permissionMode = stream.chatService?.getPermissionMode();

      // Emit order matters for the client:
      // 1. stream:status { active: true } → client calls restoreStreaming + trimMessagesAfterLastUser
      // 2. active buffer replay → client sets streaming segments for the current turn
      // Note: completedBuffer (previous chain turn) is NOT replayed here — the client's
      // fetchMessages API already merges completedBuffer data into its response. Sending
      // it as buffer-replay too would cause duplicate user messages on session entry.
      socket.emit('stream:status', { active: true, sessionId, permissionMode });
      socket.emit('stream:buffer-replay', { sessionId, events: bufferSnapshot });

      // NOW add to broadcast set — live events flow from here
      stream.sockets.add(socket);
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
      // Use prevSessionId / socketSessionRoom as fallback — client may send empty
      // string when the sessionId is not available at unmount time (e.g., ChatPage cleanup)
      const roomSessionId = sessionId || prevSessionId || socketSessionRoom.get(socket.id);
      if (roomSessionId) {
        socket.leave(`session:${roomSessionId}`);
      }
      // Story 25.9: Cancel in-progress summary on session leave
      const sumState = socketSummarizing.get(socket.id);
      if (sumState?.abortController) {
        sumState.abortController.abort();
        socketSummarizing.set(socket.id, { activeRequestId: null, abortController: null });
      }

      // Story 24.3: Clean up session room tracking on leave
      // Only clear project room if the leaving session matches current tracking.
      // Prevents race where a new session:join overwrites tracking before old leave arrives.
      const trackedSession = socketSessionRoom.get(socket.id);
      if (!trackedSession || trackedSession === roomSessionId) {
        socketSessionRoom.delete(socket.id);
        const prevProjectSlug = socketProjectRoom.get(socket.id);
        if (prevProjectSlug) {
          socket.leave(`project:${prevProjectSlug}`);
        }
        socketProjectRoom.delete(socket.id);
      }
    });

    // Story 24.1: Prompt chain event handlers
    socket.on('chain:add', (data) => {
      if (!data || typeof data !== 'object') return;
      const { sessionId, content, workingDirectory, permissionMode, model, effort } = data;
      const lang = socket.data.language || 'en';
      const t = i18next.getFixedT(lang);

      // Input validation (UUID required for disk persistence compatibility)
      if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return;
      if (!content || typeof content !== 'string' || !content.trim()) return;
      if (!workingDirectory || typeof workingDirectory !== 'string') return;
      if (content.length > 100_000) {
        socket.emit('error', { code: ERROR_CODES.CHAT_ERROR, message: t('ws.error.chainContentTooLong') });
        return;
      }

      // Validate socket is a member of the session room
      if (!socket.rooms.has(`session:${sessionId}`)) return;

      const items = chainState.get(sessionId) || [];
      if (items.length >= 10) {
        socket.emit('error', {
          code: ERROR_CODES.CHAIN_MAX_EXCEEDED,
          message: t('ws.error.chainMaxExceeded'),
        });
        return;
      }

      const item: InternalChainItem = {
        id: generateChainItemId(),
        content,
        status: 'pending',
        createdAt: Date.now(),
        workingDirectory,
        permissionMode,
        model,
        effort,
      };
      items.push(item);
      chainState.set(sessionId, items);
      broadcastChainUpdate(sessionId);

      // If no active stream, trigger drain so items don't stay pending indefinitely
      if (!activeStreams.has(sessionId)) {
        scheduleChainDrain(sessionId, lang);
      }
    });

    socket.on('chain:remove', (data) => {
      if (!data || typeof data !== 'object') return;
      const { sessionId, id } = data;
      if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return;
      if (!id || typeof id !== 'string') return;
      if (!socket.rooms.has(`session:${sessionId}`)) return;
      const items = chainState.get(sessionId);
      if (items) {
        // If the removed item is currently sending, abort its active stream
        const removedItem = items.find(item => item.id === id);
        if (removedItem?.status === 'sending') {
          const stream = activeStreams.get(sessionId);
          if (stream && stream.status === 'running') {
            stream.abortController.abort('chain-item-removed');
          }
        }
        const filtered = items.filter(item => item.id !== id);
        chainState.set(sessionId, filtered);
        broadcastChainUpdate(sessionId);
        if (filtered.length === 0) {
          cleanupChainIfIdle(sessionId);
        }
      }
      // Also remove from persisted failures (dismiss)
      removePersistedFailure(sessionId, id).catch((err) => {
        log.error(`Failed to remove persisted failure ${id} for session ${sessionId}:`, err);
      });
    });

    socket.on('chain:clear', (data) => {
      if (!data || typeof data !== 'object') return;
      const { sessionId } = data;
      if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return;
      // Validate socket is a member of the session room
      if (!socket.rooms.has(`session:${sessionId}`)) return;
      // If any item is currently sending, abort its active stream
      const items = chainState.get(sessionId);
      if (items?.some(item => item.status === 'sending')) {
        const stream = activeStreams.get(sessionId);
        if (stream && stream.status === 'running') {
          stream.abortController.abort('chain-cleared');
        }
      }
      chainState.set(sessionId, []);
      // Bump generation instead of deleting — prevents stale timers from matching
      // a reset counter value after clear + re-add sequence
      chainDrainGeneration.set(sessionId, (chainDrainGeneration.get(sessionId) || 0) + 1);
      broadcastChainUpdate(sessionId);
      cleanupChainIfIdle(sessionId);
      // Clear persisted failures from disk, then broadcast final consistent state
      // (prevents stale failures from reappearing via concurrent broadcastChainUpdateWithFailures)
      clearPersistedFailures(sessionId)
        .then(() => broadcastChainUpdate(sessionId))
        .catch((err) => {
          log.error(`Failed to clear persisted failures for session ${sessionId}:`, err);
        });
    });

    // Story 25.8: Standalone file rewind
    socket.on('session:rewind-files', async (data) => {
      const lang = socket.data.language || 'en';
      const t = i18next.getFixedT(lang);

      if (!data || typeof data !== 'object') return;
      const { sessionId, workingDirectory, messageUuid, dryRun } = data;

      // Validation
      if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId) ||
          !messageUuid || typeof messageUuid !== 'string') {
        socket.emit('error', { code: ERROR_CODES.VALIDATION_ERROR, message: t('ws.error.rewindMissingParams') });
        return;
      }

      if (!workingDirectory || typeof workingDirectory !== 'string') {
        socket.emit('error', { code: ERROR_CODES.VALIDATION_ERROR, message: t('ws.error.rewindMissingParams') });
        return;
      }

      // Validate socket is a member of the session room
      if (!socket.rooms.has(`session:${sessionId}`)) return;

      log.info(`session:rewind-files sessionId=${sessionId}, messageUuid=${messageUuid}, dryRun=${!!dryRun}`);

      try {
        const sessionService = new SessionService();
        const projectSlug = sessionService.encodeProjectPath(workingDirectory);

        const rewindQuery = sdkQuery({
          prompt: '',
          options: {
            resume: sessionId,
            cwd: workingDirectory,
            enableFileCheckpointing: true,
            // Do NOT pass sessionId here — CLI rejects --session-id
            // combined with --resume unless --fork-session is also set.
            // resume: sessionId already identifies the session.
          },
        });

        try {
          const rewindResult = await rewindQuery.rewindFiles(messageUuid, { dryRun: !!dryRun });
          log.info(`rewindFiles result: canRewind=${rewindResult.canRewind}, filesChanged=${rewindResult.filesChanged?.length ?? 0}, insertions=${rewindResult.insertions ?? 0}, deletions=${rewindResult.deletions ?? 0}`);

          if (rewindResult.canRewind) {
            socket.emit('session:rewind-result', {
              success: true,
              dryRun: !!dryRun,
              filesChanged: rewindResult.filesChanged,
              insertions: rewindResult.insertions,
              deletions: rewindResult.deletions,
            });
          } else {
            socket.emit('session:rewind-result', {
              success: false,
              dryRun: !!dryRun,
              error: rewindResult.error,
            });
          }
        } finally {
          // Clean up the query object
          rewindQuery.close();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`session:rewind-files error: ${msg}`);
        socket.emit('session:rewind-result', {
          success: false,
          dryRun: !!dryRun,
          error: msg,
        });
      }
    });

    // Story 25.9: Generate conversation summary
    socket.on('session:generate-summary', async (data) => {
      const lang = socket.data.language || 'en';

      if (!data || typeof data !== 'object') return;
      const { sessionId, messageUuid } = data;

      // Validate sessionId
      if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
        socket.emit('session:summary-result', { messageUuid: messageUuid ?? '', error: 'Invalid sessionId' });
        return;
      }

      // Validate messageUuid format
      if (!messageUuid || typeof messageUuid !== 'string' || !UUID_RE.test(messageUuid)) {
        socket.emit('session:summary-result', { messageUuid: messageUuid ?? '', error: 'Invalid messageUuid format' });
        return;
      }

      // Validate socket is in the session room
      if (!socket.rooms.has(`session:${sessionId}`)) {
        socket.emit('session:summary-result', { messageUuid, error: 'Not joined to session' });
        return;
      }

      // Abort any in-progress summary before starting a new one
      const prevState = socketSummarizing.get(socket.id);
      if (prevState?.abortController) {
        prevState.abortController.abort();
      }

      const requestId = randomUUID();
      const abortController = new AbortController();
      socketSummarizing.set(socket.id, { activeRequestId: requestId, abortController });

      try {
        const sessionService = new SessionService();
        // Find projectSlug for this session — try sessionProjectMap first, then socketProjectRoom
        const projectSlug = sessionProjectMap.get(sessionId) || socketProjectRoom.get(socket.id);
        if (!projectSlug) {
          socket.emit('session:summary-result', { messageUuid, error: 'Session project not found' });
          return;
        }

        const filePath = sessionService.getSessionFilePath(projectSlug, sessionId);
        const rawMessages = await parseJSONLFile(filePath);

        // Find messageUuid index
        const targetIdx = rawMessages.findIndex((m) => m.uuid === messageUuid);
        if (targetIdx === -1) {
          socket.emit('session:summary-result', { messageUuid, error: 'Message not found' });
          return;
        }

        // Extract messages AFTER the target (not including it)
        const afterMessages = rawMessages
          .slice(targetIdx + 1)
          .filter((m) => (m.type === 'user' || m.type === 'assistant') && m.message)
          .map((m) => ({
            role: m.message!.role as 'user' | 'assistant',
            content: typeof m.message!.content === 'string'
              ? m.message!.content
              : (m.message!.content as Array<{ type: string; text?: string }>)
                  .filter((b) => b.type === 'text' && b.text)
                  .map((b) => b.text!)
                  .join('\n'),
          }))
          .filter((m) => m.content.length > 0);

        // Min message guard: need at least 2 pairs (4 messages)
        if (afterMessages.length < 4) {
          socket.emit('session:summary-result', { messageUuid, error: 'Too few messages to summarize' });
          return;
        }

        // Resolve project originalPath for Agent SDK cwd
        let cwd: string | undefined;
        try {
          cwd = await projectService.resolveOriginalPath(projectSlug);
        } catch (err) {
          log.warn(`Failed to resolve originalPath for ${projectSlug}, summarize will proceed without cwd:`, err);
        }

        log.info(`session:generate-summary sessionId=${sessionId}, messageUuid=${messageUuid}, targetMessages=${afterMessages.length}`);

        const summary = await summarize(afterMessages, {
          signal: abortController.signal,
          locale: lang !== 'en' ? lang : undefined,
          cwd,
          projectSlug,
        });

        socket.emit('session:summary-result', { requestId, messageUuid, summary });
      } catch (err) {
        if (abortController.signal.aborted) {
          // Cancelled — don't emit error
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`session:generate-summary error: ${msg}`);
        socket.emit('session:summary-result', { requestId, messageUuid, error: msg });
      } finally {
        // Only clean up if this request is still the active one
        const current = socketSummarizing.get(socket.id);
        if (current?.activeRequestId === requestId) {
          socketSummarizing.set(socket.id, { activeRequestId: null, abortController: null });
        }
      }
    });

    // Story 25.9: Cancel ongoing summary
    socket.on('session:cancel-summary', (data) => {
      if (!data || typeof data !== 'object') return;
      const { sessionId } = data;
      if (!sessionId || typeof sessionId !== 'string') return;
      // Only cancel if socket is in the session room (prevents cross-session cancel)
      if (!socket.rooms.has(`session:${sessionId}`)) return;

      const state = socketSummarizing.get(socket.id);
      if (state?.abortController) {
        state.abortController.abort();
        socketSummarizing.set(socket.id, { activeRequestId: null, abortController: null });
      }
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
      // Track project for disconnect cleanup (e.g. edit lock release)
      socketProjectRoom.set(socket.id, projectSlug);
    });
    socket.on('project:leave', (projectSlug: string) => {
      socket.leave(`project:${projectSlug}`);
      if (socketProjectRoom.get(socket.id) === projectSlug) {
        socketProjectRoom.delete(socket.id);
      }
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
    socket.on('queue:cancelPause' as any, (data: any) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.cancelPause();
    });
    // queue:dismiss moved to HTTP POST — see queueController.dismissQueue
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:replaceItems' as any, (data: any) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.replaceItems(data.items, socket.id);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:editStart' as any, (data: any) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.editStart(socket.id);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:editEnd' as any, (data: any) => {
      const qs = getOrCreateQueueService(data.projectSlug);
      qs.editEnd(socket.id);
    });

    // --- Story 17.1: Terminal PTY events ---
    socketTerminals.set(socket.id, new Set());

    socket.on('terminal:create', async (data: TerminalCreateRequest) => {
      const lang = socket.data.language || 'en';
      const t = i18next.getFixedT(lang);
      // Story 17.5: Security guard
      const access = checkTerminalAccess(socket, lang);
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
      const inputAccess = checkTerminalAccess(socket, socket.data.language || 'en');
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
      const resizeAccess = checkTerminalAccess(socket, socket.data.language || 'en');
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

    socket.on('terminal:list', async (data: TerminalListRequest) => {
      const lang = socket.data.language || 'en';
      const access = checkTerminalAccess(socket, lang);
      if (!access.allowed) {
        socket.emit('terminal:list', { projectSlug: data.projectSlug, terminals: [] });
        return;
      }

      try {
        const sessions = ptyService.getSessionsByProject(data.projectSlug);
        const socketTerminalSet = socketTerminals.get(socket.id);
        const terminals = sessions.map((s) => {
          ptyService.cancelCleanup(s.terminalId);
          // Only re-register callbacks if not already attached to this socket
          if (!socketTerminalSet?.has(s.terminalId)) {
            ptyService.onData(s.terminalId, (output: string) => {
              socket.emit('terminal:data', { terminalId: s.terminalId, data: output });
            });
            ptyService.onExit(s.terminalId, (exitCode: number) => {
              socket.emit('terminal:exit', { terminalId: s.terminalId, exitCode });
              socketTerminals.get(socket.id)?.delete(s.terminalId);
              triggerDashboardStatusChange(data.projectSlug);
            });
            socketTerminalSet?.add(s.terminalId);
          }
          return { terminalId: s.terminalId, shell: s.shell };
        });
        socket.emit('terminal:list', { projectSlug: data.projectSlug, terminals });
      } catch (err) {
        log.error('terminal:list error:', err);
        socket.emit('terminal:list', { projectSlug: data.projectSlug, terminals: [] });
      }
    });

    socket.on('terminal:close', async (data: { terminalId: string }) => {
      // Story 17.5: Security guard
      const closeAccess = checkTerminalAccess(socket, socket.data.language || 'en');
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

      socketSessionRoom.delete(socket.id);
      // Release queue edit lock only if this socket owns it
      const disconnectProjectSlug = socketProjectRoom.get(socket.id);
      if (disconnectProjectSlug) {
        const qs = getQueueInstances().get(disconnectProjectSlug);
        if (qs) {
          qs.editEnd(socket.id);
        }
      }
      socketProjectRoom.delete(socket.id);

      // Story 25.9: Cleanup summarizing state on disconnect
      const sumState = socketSummarizing.get(socket.id);
      if (sumState?.abortController) {
        sumState.abortController.abort();
      }
      socketSummarizing.delete(socket.id);

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
 * Handle chat:send event from client
 * Processes user message through ChatService and streams response back
 * All emit calls are buffered via createStreamEmit for reconnect support.
 */
async function handleChatSend(
  stream: ActiveStream,
  data: { content: string; workingDirectory: string; sessionId?: string; resume?: boolean; permissionMode?: PermissionMode; model?: string; images?: ImageAttachment[]; effort?: ThinkingEffort; resumeSessionAt?: string; forkSession?: boolean; rewindToMessageUuid?: string; expectedBranchTotal?: number },
  abortController: AbortController,
  lang: string
): Promise<boolean> {
  const emit = createStreamEmit(stream);
  const t = i18next.getFixedT(lang);
  const { content, workingDirectory, sessionId, resume, permissionMode, model, images, effort, resumeSessionAt: rawResumeSessionAt, forkSession, rewindToMessageUuid } = data;

  // Validate images if present (Story 5.5)
  if (images && images.length > 0) {
    const validation = validateImages(images, lang);
    if (!validation.valid) {
      emit('error', {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: validation.error!,
      });
      return false;
    }
  }

  // Validate workingDirectory exists
  if (!workingDirectory || !existsSync(workingDirectory)) {
    emit('error', {
      code: ERROR_CODES.INVALID_WORKING_DIR,
      message: t('ws.error.projectPathNotFound'),
    });
    return false;
  }

  // Buffer the user's message so reconnecting clients can display it
  // (SDK may not have written the JSONL file yet at reconnect time).
  // Include timestamp for correct ordering. For images, only send count
  // (not full base64 data) to avoid bloating the buffer.
  emit('user:message', {
    content,
    sessionId: sessionId || '',
    timestamp: new Date().toISOString(),
    ...(images && images.length > 0 ? { imageCount: images.length } : {}),
  });

  const isResuming = resume && sessionId;

  // Story 25.7: resumeSessionAt/rewindToMessageUuid require a valid resume flow
  // Story 25.11: forkSession also requires resume context (SDK needs original session to read)
  if ((rawResumeSessionAt || rewindToMessageUuid || forkSession) && !isResuming) {
    emit('error', {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: t('ws.error.resumeSessionAtRequiresResume', { defaultValue: 'resumeSessionAt, rewindToMessageUuid, and forkSession require resume=true and a valid sessionId' }),
    });
    return false;
  }

  const sessionService = new SessionService();

  // Resolve ROOT_BRANCH_KEY to the actual first root message UUID in the JSONL.
  // Root edits send '__root__' because the client has no visibility into the
  // non-display root message (progress/init type) that the SDK needs.
  let resumeSessionAt = rawResumeSessionAt;
  if (resumeSessionAt === ROOT_BRANCH_KEY && sessionId) {
    const projectSlug = sessionService.encodeProjectPath(workingDirectory);
    const rootUuid = await sessionService.getRootMessageUuid(projectSlug, sessionId);
    if (rootUuid) {
      resumeSessionAt = rootUuid;
      // Update stream so completedBuffer gets the resolved UUID, not ROOT_BRANCH_KEY.
      // This ensures branchInfo.selectionKey matches the tree's node UUID for navigation.
      stream.resumeSessionAt = rootUuid;
    } else {
      emit('error', {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Cannot resolve root branch point: no root message found in session',
      });
      return false;
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Snapshot JSONL files before SDK query to detect phantom checkpoint files.
  // The SDK's file checkpointing creates separate JSONL files (new UUIDs) with
  // only file-history-snapshot entries alongside the real session file. These
  // are redundant copies of checkpoint state already present in the session
  // file and are not needed for rewindFiles() to function.
  let preQueryFiles: Set<string> | null = null;
  try {
    const encoded = sessionService.encodeProjectPath(workingDirectory);
    const projectDir = sessionService.getProjectDir(encoded);
    if (existsSync(projectDir)) {
      preQueryFiles = new Set(readdirSync(projectDir).filter(f => f.endsWith('.jsonl')));
    }
  } catch {
    // Non-critical — cleanup will be skipped if snapshot fails
  }

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
      // Strip 'max' effort for Claude.ai subscribers (CLI exits with code 1)
      effort: (() => {
        const e = effort ?? effectivePrefs.defaultEffort;
        return (e === 'max' && rateLimitProbeService.hasOAuthCredentials()) ? 'high' : e;
      })(),
      // Story 25.7: conversation branching via resumeSessionAt
      ...(resumeSessionAt ? { resumeSessionAt } : {}),
      // Story 25.11: fork session — create new session from branch point
      ...(forkSession ? { forkSession: true } : {}),
      enableFileCheckpointing: true,
      ...(rewindToMessageUuid ? { rewindToMessageUuid } : {}),
    };

    // Create canUseTool callback for permission & AskUserQuestion handling
    // Promise stays pending if socket disconnected — SDK naturally waits
    const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
      // Auto-approve ExitPlanMode when the current permission mode is Bypass.
      // Use chatService.getPermissionMode() instead of the closure-captured variable
      // so that mid-stream permission mode changes (e.g. Plan → Bypass) are reflected.
      if (toolName === 'ExitPlanMode' && chatService.getPermissionMode() === 'bypassPermissions') {
        log.debug('Auto-approving ExitPlanMode: current permissionMode is bypassPermissions');
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

      // Notify via Telegram if no socket connected (or alwaysNotify enabled)
      if (notificationService.shouldNotify(stream.sockets.size)) {
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
        isFork: !!forkSession,
        initialSessionId: sessionId,
        rekeyStream: (sid) => rekeyStream(stream, sid),
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

    // Track whether SDK has started producing user-visible output.
    // Used to guard resume-retry: if output was already emitted, retrying
    // would cause duplicate content / tool side-effects.
    let hasEmittedOutput = false;
    const origOnSessionInit = callbacks.onSessionInit;
    callbacks.onSessionInit = (sid, metadata) => {
      hasEmittedOutput = true;
      origOnSessionInit?.(sid, metadata);
    };

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

      emit('error', {
        code: ERROR_CODES.CHAT_ERROR,
        message: sdkError.message,
      });

      // Notify via Telegram if no socket connected (or alwaysNotify enabled)
      if (notificationService.shouldNotify(stream.sockets.size)) {
        notificationService.notifyError(stream.sessionId, sdkError.message);
      }
    };

    // Attempt to send — if resume fails, retry without resume (create fresh session).
    // This handles cases where the first send was aborted before SDK created the session file,
    // leaving the client with messages (from partial response) but no actual SDK session on disk.
    //
    // When resuming, gate error-related emissions so the client never sees a flash of error
    // if the retry succeeds. The gate is released (flushed or discarded) after the decision.
    const isResumeAttempt = !!isResuming;
    const origOnResultError = callbacks.onResultError;
    const origOnComplete = callbacks.onComplete;
    const origOnError = callbacks.onError;
    let gatedResultError: unknown = null;
    let gatedComplete: unknown = null;

    /** Restore all callbacks to their original (ungated) versions */
    const ungateCallbacks = () => {
      callbacks.onResultError = origOnResultError;
      callbacks.onComplete = origOnComplete;
      callbacks.onError = origOnError;
    };

    if (isResumeAttempt) {
      callbacks.onResultError = (data) => {
        if (!hasEmittedOutput) {
          gatedResultError = data;
        } else {
          origOnResultError?.(data);
        }
      };
      callbacks.onComplete = (response) => {
        if (!hasEmittedOutput && gatedResultError) {
          gatedComplete = response;
        } else {
          origOnComplete?.(response);
        }
      };
      // Also gate onError (thrown errors call onError before re-throwing)
      callbacks.onError = (error) => {
        if (!hasEmittedOutput) {
          // Swallow — the catch block below handles retry or re-throws
          return;
        }
        origOnError?.(error);
      };
    }

    try {
      const sendResult = await chatService.sendMessageWithCallbacks(content, callbacks, chatOptions, canUseTool, (messageType: string) => {
        resetTimeout(`raw:${messageType}`);
      });
      // SDK may return "No conversation found" as an error result (not a thrown exception).
      // Convert to a thrown error so the retry logic below can handle it.
      if (sendResult.isError && isResumeAttempt && !abortController.signal.aborted && !hasEmittedOutput) {
        log.info(`[RESUME-RETRY] SDK returned error result while resuming, converting to thrown error for retry. result="${(sendResult.content || '').slice(0, 200)}"`);
        throw new Error(sendResult.content || 'Resume returned error result');
      }
      // Story 25.7: warn client if file rewind failed (non-fatal)
      if (chatService.rewindWarning) {
        emit('error', { code: 'REWIND_WARNING', message: chatService.rewindWarning });
      }
      // Resume succeeded or non-resume — flush any gated events
      ungateCallbacks();
      if (gatedResultError) origOnResultError?.(gatedResultError as never);
      if (gatedComplete) origOnComplete?.(gatedComplete as never);
    } catch (sendError) {
      // Resume failed — retry once without resume so SDK creates a fresh session.
      // Guards:
      //  1. Only when resuming (not a fresh session send)
      //  2. Skip if intentionally aborted (user-abort / another-client / timeout)
      //  3. Skip if SDK already emitted output (onSessionInit fired) — retrying would duplicate side-effects
      //  4. Skip for non-session errors (rate-limit / auth / network / service-unavailable)
      const parsedError = parseSDKError(sendError, lang);
      const isNonSessionError = !!parsedError.code && parsedError.code !== SDKErrorCode.UNKNOWN;
      if (
        isResumeAttempt
        && !abortController.signal.aborted
        && !hasEmittedOutput
        && !isNonSessionError
        && !chatOptions.resumeSessionAt
      ) {
        log.info(`[RESUME-RETRY] resume failed, retrying without resume: sessionId=${sessionId}, error=${parsedError.message.slice(0, 120)}`);
        // Discard gated events and restore original callbacks for the retry
        gatedResultError = null;
        gatedComplete = null;
        ungateCallbacks();
        // Delete stale session file from the aborted first send so the SDK
        // can create a fresh session with the same ID (avoids "Session ID already in use").
        if (sessionId) {
          const encoded = sessionService.encodeProjectPath(workingDirectory);
          const staleFile = sessionService.getSessionFilePath(encoded, sessionId);
          try {
            if (existsSync(staleFile)) {
              unlinkSync(staleFile);
              log.info(`[RESUME-RETRY] deleted stale session file: ${staleFile}`);
            }
          } catch (e) {
            log.warn(`[RESUME-RETRY] failed to delete stale session file: ${staleFile}`, e);
          }
        }
        const retryOptions = { ...chatOptions, resume: undefined, resumeSessionAt: undefined, sessionId };
        delete retryOptions.resume;
        delete retryOptions.resumeSessionAt;
        resetTimeout('resume-retry');
        await chatService.sendMessageWithCallbacks(content, callbacks, retryOptions, canUseTool, (messageType: string) => {
          resetTimeout(`raw:${messageType}`);
        });
      } else {
        // Not retrying — flush gated error events before re-throwing
        ungateCallbacks();
        if (gatedResultError) origOnResultError?.(gatedResultError as never);
        if (gatedComplete) origOnComplete?.(gatedComplete as never);
        throw sendError;
      }
    }
    return true;
  } catch (error) {
    const sdkError = parseSDKError(error, lang);
    log.info(`[CHAIN-DRAIN] handleChatSend catch: sessionId=${stream.sessionId}, aborted=${abortController.signal.aborted}, reason=${abortController.signal.reason}, error=${sdkError.message.slice(0, 120)}`);

    if (sdkError instanceof AbortedError || abortController.signal.aborted) {
      if (abortController.signal.reason === 'user-abort' || abortController.signal.reason === 'another-client') {
        return false;
      }
      emit('error', {
        code: ERROR_CODES.TIMEOUT_ERROR,
        message: t('ws.error.timeout'),
      });
      return false;
    }

    emit('error', {
      code: ERROR_CODES.CHAT_ERROR,
      message: sdkError.message,
    });
    return false;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Delete phantom checkpoint files created by SDK file checkpointing.
    // These are separate JSONL files (new UUIDs) containing only
    // file-history-snapshot entries. The same snapshot data already exists
    // in the actual session file, so these are redundant and not needed
    // for rewindFiles() to function.
    if (preQueryFiles) {
      try {
        const encoded = sessionService.encodeProjectPath(workingDirectory);
        const projectDir = sessionService.getProjectDir(encoded);
        const postQueryFiles = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
        for (const file of postQueryFiles) {
          if (preQueryFiles.has(file)) continue;
          const filePath = `${projectDir}/${file}`;
          try {
            const raw = readFileSync(filePath, 'utf8');
            const hasConversation = raw.includes('"type":"user"') || raw.includes('"type":"assistant"');
            if (!hasConversation) {
              unlinkSync(filePath);
              log.info(`Deleted phantom checkpoint file: ${file}`);
            }
          } catch {
            // Skip unreadable files
          }
        }
      } catch (cleanupErr) {
        log.warn('Failed to clean up phantom checkpoint files:', cleanupErr);
      }
    }
  }
}
