/**
 * Queue Service — Sequential execution engine for queue commands
 * Story 15.2: Queue Runner Engine
 */

import crypto from 'node:crypto';
import { Server as SocketIOServer } from 'socket.io';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  QueueItem,
  ChatOptions,
  PermissionMode,
  PermissionRequest,
} from '@hammoc/shared';
import { ERROR_CODES, SUPPORTED_LANGUAGES } from '@hammoc/shared';
import { ChatService } from './chatService.js';
import { parseSDKError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import i18next from '../i18n.js';

const log = createLogger('queueService');
import { projectService as _ps } from './projectService.js';
import { notificationService as _ns, formatAskQuestionPrompt } from './notificationService.js';
import { preferencesService as _prs } from './preferencesService.js';
import {
  createHeadlessStream,
  isSessionStreaming,
  rekeyStream,
  finalizeStream,
  broadcastStreamChange,
} from '../handlers/websocket.js';
import { buildStreamCallbacks } from '../handlers/streamCallbacks.js';

type ProjectService = typeof _ps;
type NotificationService = typeof _ns;
type PreferencesService = typeof _prs;

type SocketIOServer4 = SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface ExecuteItemResult {
  shouldAdvance: boolean;
  markerDetected?: 'QUEUE_STOP' | 'QUEUE_PASS';
}

export class QueueService {
  private items: QueueItem[] = [];
  private currentIndex: number = 0;
  private _isRunning: boolean = false;
  private isPaused: boolean = false;
  private isExecuting: boolean = false; // guards against concurrent executeLoop
  private currentSessionId: string | null = null;
  private currentModel: string | undefined = undefined;
  private projectSlug: string = '';
  private workingDirectory: string = '';
  private chatService: ChatService | null = null;
  private abortController: AbortController | null = null;
  private pauseReason: string | undefined = undefined;
  private resumeSessionId: string | null = null;
  private lastError: { itemIndex: number; error: string } | null = null;
  private completedSessionIds: Map<number, string> = new Map();
  /** Terminal states that persist until manually dismissed */
  private _isCompleted: boolean = false;
  private _isErrored: boolean = false;
  /** Snapshot of totalItems for completed/errored display */
  private _finalTotalItems: number = 0;
  /** Socket ID that owns the edit lock (null = no one editing) */
  private _editingSocketId: string | null = null;
  private _isPauseRequested: boolean = false;
  /** True when waiting for user input (permission/question) — distinct from isPaused */
  private _isWaitingForInput: boolean = false;
  private lang: string = 'en';
  constructor(
    private projectService: ProjectService,
    private notificationService: NotificationService,
    private preferencesService: PreferencesService,
    private io: SocketIOServer4
  ) {}

  get isRunning(): boolean {
    return this._isRunning;
  }

  get lockedSessionId(): string | null {
    return this._isRunning ? this.currentSessionId : null;
  }

  async start(items: QueueItem[], projectSlug: string, sessionId?: string, permissionMode?: PermissionMode): Promise<void> {
    // Reset language to default before reading preferences (prevent stale value from prior run)
    this.lang = 'en';
    try {
      const prefs = await this.preferencesService.readPreferences();
      if (prefs.language && SUPPORTED_LANGUAGES.includes(prefs.language as typeof SUPPORTED_LANGUAGES[number])) {
        this.lang = prefs.language;
      }
    } catch { /* keep default 'en' */ }

    this.workingDirectory = await this.projectService.resolveOriginalPath(projectSlug);
    this.chatService = new ChatService({ workingDirectory: this.workingDirectory, permissionMode });
    this.abortController = new AbortController();
    this.items = items;
    this.currentIndex = 0;
    this._isRunning = true;
    this.isPaused = false;
    this.isExecuting = false;
    this.projectSlug = projectSlug;
    this.currentSessionId = sessionId ?? null;
    this.currentModel = undefined;
    this.resumeSessionId = null;
    this.pauseReason = undefined;
    this._isPauseRequested = false;
    this._isWaitingForInput = false;
    this.lastError = null;
    this._isCompleted = false;
    this._isErrored = false;
    this._editingSocketId = null;
    this._finalTotalItems = 0;
    this.completedSessionIds = new Map();
    log.info(`START: project="${projectSlug}", items=${items.length}, sessionId=${sessionId ?? '(new)'}, cwd="${this.workingDirectory}"`);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      log.verbose(`item[${i}]: prompt=${JSON.stringify((it.prompt || '').slice(0, 80))}${it.isNewSession ? ' [NEW_SESSION]' : ''}${it.isBreakpoint ? ' [BREAKPOINT]' : ''}${it.modelName ? ` model=${it.modelName}` : ''}${it.saveSessionName ? ` save="${it.saveSessionName}"` : ''}${it.loadSessionName ? ` load="${it.loadSessionName}"` : ''}${it.delayMs ? ` delay=${it.delayMs}ms` : ''}`);
    }
    this.emitProgress('running');
    await this.notificationService.notifyQueueStart(items.length, this.buildSessionUrl());
    await this.executeLoop();
  }

  async pause(): Promise<void> {
    log.info(`PAUSE: index=${this.currentIndex}/${this.items.length}, isExecuting=${this.isExecuting}`);
    if (this.isExecuting) {
      // Item in progress — schedule pause after completion
      this._isPauseRequested = true;
      this.emitProgress('running'); // re-emit so clients pick up isPauseRequested
    } else {
      // No item running (e.g. between items) — pause immediately
      this.isPaused = true;
      const t = i18next.getFixedT(this.lang);
      this.pauseReason = t('queue.pause.userPaused');
      this.emitProgress('paused');
    }
  }

  cancelPause(): void {
    if (!this._isPauseRequested) return;
    log.info(`CANCEL_PAUSE: index=${this.currentIndex}/${this.items.length}`);
    this._isPauseRequested = false;
    // Emit actual state — may already be paused by permission/error/breakpoint
    this.emitProgress(this.isPaused ? 'paused' : 'running');
  }

  async resume(): Promise<void> {
    if (!this.isPaused || this.isExecuting) {
      log.debug(`RESUME skipped: isPaused=${this.isPaused}, isExecuting=${this.isExecuting}`);
      return;
    }
    log.info(`RESUME: index=${this.currentIndex}/${this.items.length}, sessionId=${this.currentSessionId}`);
    this.abortController = new AbortController();
    this.isPaused = false;
    this._isPauseRequested = false;
    this.pauseReason = undefined;
    this.lastError = null;
    // Release edit lock when resuming (editor must re-acquire after next pause)
    if (this._editingSocketId) {
      this._editingSocketId = null;
      this.emitEditState();
    }
    this.emitProgress('running');
    await this.executeLoop();
  }

  async abort(): Promise<void> {
    log.info(`ABORT: index=${this.currentIndex}/${this.items.length}, sessionId=${this.currentSessionId}`);
    this._finalTotalItems = this.items.length;
    this._isRunning = false;
    this.isExecuting = false;
    this.isPaused = false;
    this._isPauseRequested = false;
    this._isWaitingForInput = false;
    this.pauseReason = undefined;
    this.lastError = null;
    this._isCompleted = false;
    this._isErrored = false;
    this._editingSocketId = null;
    this.abortController?.abort();
    this.emitProgress('aborted');
  }

  /** Dismiss the completed/errored terminal state banner and release held data */
  dismiss(): void {
    log.info(`DISMISS: wasCompleted=${this._isCompleted}, wasErrored=${this._isErrored}`);
    this._isCompleted = false;
    this._isErrored = false;
    this.lastError = null;
    this._finalTotalItems = 0;
    this.currentIndex = 0;
    // Release memory held by completed run data
    this.items = [];
    this.completedSessionIds = new Map();
    this.chatService = null;
  }

  getState() {
    // Include items when queue has meaningful state to display
    const hasActiveState = this._isRunning || this.isPaused || this._isWaitingForInput || this._isCompleted || this._isErrored;
    // After abort: _finalTotalItems is set, items are still in memory
    const hasAbortedState = !hasActiveState && this._finalTotalItems > 0;
    return {
      isRunning: this._isRunning,
      isPaused: this.isPaused,
      isCompleted: this._isCompleted,
      isErrored: this._isErrored,
      currentIndex: this.currentIndex,
      totalItems: this._isRunning || this.isPaused || this._isWaitingForInput ? this.items.length : this._finalTotalItems,
      pauseReason: this.pauseReason,
      lockedSessionId: this.lockedSessionId,
      currentModel: this.currentModel,
      isPauseRequested: this._isPauseRequested,
      isWaitingForInput: this._isWaitingForInput,
      lastError: this.lastError,
      items: hasActiveState || hasAbortedState ? this.items : undefined,
      isEditing: this._editingSocketId !== null,
      completedSessionIds: (() => {
        // Include current running item's sessionId so clients joining mid-run see the link
        const all = new Map(this.completedSessionIds);
        if (this.currentSessionId && (this._isRunning || this.isPaused)) {
          all.set(this.currentIndex, this.currentSessionId);
        }
        return all.size > 0 ? Object.fromEntries(all) : undefined;
      })(),
    };
  }

  /** Remove a pending item (index must be > currentIndex) */
  removeItem(itemIndex: number): boolean {
    if (!this._isRunning && !this.isPaused) return false;
    if (itemIndex <= this.currentIndex || itemIndex >= this.items.length) return false;

    this.items.splice(itemIndex, 1);
    // Remap completedSessionIds for indices shifted down
    const newMap = new Map<number, string>();
    for (const [idx, sid] of this.completedSessionIds) {
      if (idx < itemIndex) newMap.set(idx, sid);
      // indices > itemIndex shift down by 1 (but completed items are always < currentIndex < itemIndex, so no shift needed)
    }
    this.completedSessionIds = newMap;

    this.emitItemsUpdated();
    this.emitProgress(this.isPaused ? 'paused' : 'running');
    log.info(`REMOVE_ITEM: index=${itemIndex}, newTotal=${this.items.length}`);
    return true;
  }

  /** Add a new item at the end of the queue */
  addItem(item: QueueItem): boolean {
    if (!this._isRunning && !this.isPaused) return false;

    this.items.push(item);
    this.emitItemsUpdated();
    this.emitProgress(this.isPaused ? 'paused' : 'running');
    log.info(`ADD_ITEM: prompt=${JSON.stringify((item.prompt || '').slice(0, 80))}, newTotal=${this.items.length}`);
    return true;
  }

  /** Reorder pending items. newOrder is array of current indices for items after currentIndex */
  reorderItems(newOrder: number[]): boolean {
    if (!this._isRunning && !this.isPaused) return false;

    const pendingStart = this.currentIndex + (this.isPaused ? 0 : 1);
    const pendingCount = this.items.length - pendingStart;

    // Validate: newOrder must be permutation of [pendingStart..items.length-1]
    if (newOrder.length !== pendingCount) return false;
    const expected = new Set(Array.from({ length: pendingCount }, (_, i) => pendingStart + i));
    if (!newOrder.every(i => expected.has(i))) return false;

    // Apply reorder
    const reordered = newOrder.map(i => this.items[i]);
    this.items = [...this.items.slice(0, pendingStart), ...reordered];

    this.emitItemsUpdated();
    log.info(`REORDER_ITEMS: pendingStart=${pendingStart}, newOrder=${JSON.stringify(newOrder)}`);
    return true;
  }

  /** Replace all pending items with new items (script edit mode, paused only) */
  replaceItems(newItems: QueueItem[], socketId?: string): boolean {
    if (!this.isPaused) return false;
    // Require edit lock ownership to replace items
    if (!this._editingSocketId) return false;
    if (socketId && this._editingSocketId !== socketId) return false;

    const pendingStart = this.currentIndex;
    this.items = [...this.items.slice(0, pendingStart), ...newItems];
    this._editingSocketId = null;

    this.emitItemsUpdated();
    this.emitProgress('paused');
    this.emitEditState();
    log.info(`REPLACE_ITEMS: pendingStart=${pendingStart}, newCount=${newItems.length}, newTotal=${this.items.length}`);
    return true;
  }

  /** Mark that a client has entered script edit mode. Returns false if not paused or already locked by another. */
  editStart(socketId?: string): boolean {
    if (!this.isPaused) return false;
    const id = socketId ?? 'unknown';
    if (this._editingSocketId && this._editingSocketId !== id) {
      log.info(`EDIT_START rejected: already locked by ${this._editingSocketId}, requested by ${id}`);
      return false;
    }
    this._editingSocketId = id;
    this.emitEditState();
    log.info(`EDIT_START: socketId=${this._editingSocketId}`);
    return true;
  }

  /** Mark that a client has exited script edit mode */
  editEnd(socketId?: string): void {
    if (!this._editingSocketId) return;
    // Only owner or unspecified caller can release the lock
    if (socketId && this._editingSocketId !== socketId) return;
    this._editingSocketId = null;
    this.emitEditState();
    log.info(`EDIT_END: socketId=${socketId ?? 'cleanup'}`);
  }

  private emitEditState(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:editState' as any, {
      isEditing: this._editingSocketId !== null,
    });
  }

  private emitItemsUpdated(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:itemsUpdated' as any, {
      items: this.items,
      totalItems: this.items.length,
      currentIndex: this.currentIndex,
    });
  }

  private async executeLoop(): Promise<void> {
    if (this.isExecuting) {
      log.debug(`executeLoop: already executing, skipping`);
      return;
    }
    this.isExecuting = true;
    log.debug(`executeLoop: ENTER, startIndex=${this.currentIndex}/${this.items.length}`);
    try {
      while (this.currentIndex < this.items.length && this._isRunning) {
        if (this.isPaused) {
          log.debug(`executeLoop: paused at index=${this.currentIndex}, reason="${this.pauseReason}"`);
          break;
        }
        const item = this.items[this.currentIndex];
        log.debug(`executeLoop: executing item[${this.currentIndex}], prompt=${JSON.stringify((item.prompt || '').slice(0, 80))}, sessionId=${this.currentSessionId}`);
        const startTime = Date.now();
        const result = await this.executeItem(item);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log.debug(`executeLoop: item[${this.currentIndex}] done in ${elapsed}s, shouldAdvance=${result.shouldAdvance}, marker=${result.markerDetected || 'none'}, isPaused=${this.isPaused}`);

        // Process advancement FIRST, then check pause.
        // @pause: shouldAdvance=true (advance past breakpoint), isPaused=true (break after)
        // QUEUE_STOP/error/@load failure: shouldAdvance=false (stay for retry), isPaused=true (break)
        if (result.shouldAdvance) {
          this.emitItemComplete(this.currentIndex, result.markerDetected);
          this.currentIndex++;
          // Emit progress after advancing so clients update currentIndex and sessionId in real-time
          if (!this.isPaused && this._isRunning && this.currentIndex < this.items.length) {
            this.emitProgress('running');
          }
        }
        // Apply deferred pause request after item completion
        if (!this.isPaused && this._isPauseRequested) {
          this._isPauseRequested = false;
          this.isPaused = true;
          const t = i18next.getFixedT(this.lang);
          this.pauseReason = t('queue.pause.userPaused');
          this.emitProgress('paused');
        }
        if (this.isPaused) {
          log.debug(`executeLoop: paused after item, index=${this.currentIndex}, reason="${this.pauseReason}"`);
          break;
        }
      }

      if (this.currentIndex >= this.items.length && this._isRunning) {
        log.info(`ALL ITEMS COMPLETED (${this.items.length} items)`);
        this._finalTotalItems = this.items.length;
        this._isRunning = false;
        this._isCompleted = true;
        this.isPaused = false;
        this._isPauseRequested = false;
        this.pauseReason = undefined;
        this.lastError = null; // clear error on successful completion
        this.emitProgress('completed');
        await this.notificationService.notifyQueueComplete(this.buildSessionUrl());
      } else {
        log.debug(`executeLoop: EXIT loop — index=${this.currentIndex}/${this.items.length}, isRunning=${this._isRunning}, isPaused=${this.isPaused}`);
      }
    } catch (error) {
      // Catch any unexpected errors that bubble up from executeItem
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      log.error(`executeLoop: UNEXPECTED ERROR at index=${this.currentIndex}:`, errMsg);
      if (errStack) log.error(`executeLoop: stack:`, errStack);
      this._finalTotalItems = this.items.length;
      this._isRunning = false;
      this._isErrored = true;
      this.pauseWithError(`Unexpected error: ${errMsg}`);
      await this.notificationService.notifyQueueError(errMsg, this.buildSessionUrl());
    } finally {
      log.debug(`executeLoop: FINALLY — isExecuting=false, isRunning=${this._isRunning}, index=${this.currentIndex}/${this.items.length}`);
      this.isExecuting = false;
    }
  }

  private async executeItem(item: QueueItem): Promise<ExecuteItemResult> {
    // Step 1: Session management flags (processed sequentially, not exclusively)
    if (item.isNewSession) {
      const newSessionId = crypto.randomUUID();
      log.debug(`executeItem: NEW_SESSION ${newSessionId} (prev=${this.currentSessionId})`);
      this.currentSessionId = newSessionId;
      this.resumeSessionId = null;
    }
    if (item.modelName) {
      log.debug(`executeItem: MODEL change → ${item.modelName}`);
      this.currentModel = item.modelName;
    }
    if (item.saveSessionName) {
      log.debug(`executeItem: SAVE session name="${item.saveSessionName}", sessionId=${this.currentSessionId}`);
      if (!this.currentSessionId) {
        log.warn(`executeItem: SAVE failed — no active session`);
        const t = i18next.getFixedT(this.lang);
        this.pauseWithError(t('queue.error.saveNoSession', { defaultValue: 'Cannot save: no active session' }));
        return { shouldAdvance: false };
      }
      // Use workingDirectory directly to avoid reading sessions-index.json
      // which may be locked by the SDK during active streaming
      try {
        await this.projectService.updateSessionNameByPath(
          this.workingDirectory, this.currentSessionId, item.saveSessionName
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error(`executeItem: SAVE session name failed (${msg})`);
        const t = i18next.getFixedT(this.lang);
        this.pauseWithError(t('queue.error.saveFailed', { defaultValue: `Save failed: ${msg}` }));
        return { shouldAdvance: false };
      }
    }
    if (item.loadSessionName) {
      log.debug(`executeItem: LOAD session name="${item.loadSessionName}"`);
      const loaded = await this.handleLoadSession(item.loadSessionName);
      if (!loaded) {
        log.warn(`executeItem: LOAD FAILED — session "${item.loadSessionName}" not found`);
        return { shouldAdvance: false };
      }
      log.debug(`executeItem: LOAD OK → sessionId=${this.currentSessionId}`);
    }
    if (item.delayMs) {
      log.debug(`executeItem: DELAY ${item.delayMs}ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, item.delayMs);
        const onAbort = () => { clearTimeout(timer); resolve(); };
        this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
      });
      if (!this._isRunning) {
        log.debug(`executeItem: aborted during delay`);
        return { shouldAdvance: true };
      }
    }

    // Step 2: Breakpoint check
    if (item.isBreakpoint) {
      log.debug(`executeItem: BREAKPOINT — pausing`);
      this.isPaused = true;
      this._isPauseRequested = false; // clear deferred request since we're pausing now
      this.pauseReason = item.prompt || 'Breakpoint';
      this.emitProgress('paused');
      return { shouldAdvance: true };
    }

    // Step 3: Prompt execution (only if prompt is non-empty)
    if (item.prompt) {
      return await this.executePrompt(item);
    }

    log.debug(`executeItem: no prompt, skipping`);
    return { shouldAdvance: true };
  }

  /**
   * Execute a single prompt using the exact same ActiveStream pattern as
   * handleChatSend in websocket.ts.  createHeadlessStream registers the
   * stream in activeStreams so session:join / reconnect / buffer replay all
   * work identically to normal chat.
   */
  private async executePrompt(item: QueueItem): Promise<ExecuteItemResult> {
    const chatOptions = this.buildChatOptions();
    const streamKey = this.currentSessionId || `queue-pending-${Date.now()}`;
    log.debug(`executePrompt: START prompt=${JSON.stringify((item.prompt || '').slice(0, 120))}, streamKey=${streamKey}, model=${chatOptions.model || '(default)'}, resume=${chatOptions.resume || 'none'}, sessionId=${chatOptions.sessionId || 'none'}`);

    // Guard: don't overwrite an active user stream on this session
    if (isSessionStreaming(streamKey)) {
      log.warn(`executePrompt: session ${streamKey} already has an active stream — pausing queue`);
      const t = i18next.getFixedT(this.lang);
      this.pauseWithError(t('queue.error.sessionBusy'));
      return { shouldAdvance: false };
    }

    // Identical to handleChatSend: headless stream → createStreamEmit
    const { stream, emit } = createHeadlessStream(streamKey, this.abortController!, this.projectSlug);
    stream.chatService = this.chatService!;

    const chunks: string[] = [];

    // canUseTool — permissions stored in stream.pendingPermissions
    // (same map that permission:respond handler in websocket.ts checks)
    const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
      const isAskUserQuestion = toolName === 'AskUserQuestion';
      const requestId = options.toolUseID || `perm-queue-${Date.now()}`;
      log.debug(`canUseTool: tool=${toolName}, isAskUserQuestion=${isAskUserQuestion}, requestId=${requestId}`);

      // Mark as waiting for input (distinct from user pause)
      const t = i18next.getFixedT(this.lang);
      this._isWaitingForInput = true;
      this.pauseReason = t('queue.pause.waitingForPermission', { value: isAskUserQuestion ? t('queue.pause.userAnswer') : t('queue.pause.permissionApproval'), toolName });
      this.emitProgress('running');
      await this.notificationService.notifyQueueInputRequired(this.buildSessionUrl());

      // Emit via ActiveStream (buffered + forwarded to session:join'd socket)
      emit('permission:request', {
        id: requestId,
        sessionId: this.currentSessionId || '',
        toolCall: { id: requestId, name: toolName, input },
        requiresApproval: true,
      } as PermissionRequest);

      // Notify via Telegram if no socket connected (or alwaysNotify enabled)
      if (this.notificationService.shouldNotify(stream.sockets.size)) {
        const prompt = isAskUserQuestion
          ? formatAskQuestionPrompt(input as Record<string, unknown>)
          : `${toolName}`;
        this.notificationService.notifyInputRequired(stream.sessionId, toolName, prompt);
      }

      // Wait for user response — uses stream.pendingPermissions (websocket.ts resolves this)
      const userResponse = await new Promise<{
        approved: boolean;
        response?: string | string[] | Record<string, string | string[]>;
      }>((resolve) => {
        stream.pendingPermissions.set(requestId, {
          resolve,
          interactionType: isAskUserQuestion ? 'question' : 'permission',
        });
      });

      // Auto-resume from input wait
      this._isWaitingForInput = false;
      this.pauseReason = undefined;
      this.emitProgress('running');

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
        return { behavior: 'allow', updatedInput: { questions, answers } };
      }

      return userResponse.approved
        ? { behavior: 'allow', updatedInput: input }
        : { behavior: 'deny', message: 'User denied permission', interrupt: true };
    };

    try {
      // Emit user message to streaming buffer (identical to handleChatSend in websocket.ts)
      emit('user:message', { content: item.prompt, sessionId: streamKey, timestamp: new Date().toISOString() });

      // Build shared callbacks (common logic for browser & queue paths)
      const { callbacks, sessionIdRef } = buildStreamCallbacks(
        {
          emit,
          stream,
          isResuming: !!chatOptions.resume,
          initialSessionId: this.currentSessionId ?? undefined,
          rekeyStream: (sid) => rekeyStream(stream, sid),
          broadcastStreamChange,
          notificationService: this.notificationService,
          getQueueProgress: () => ({
            current: this.currentIndex + 1,
            total: this.items.length,
          }),
        },
        {
          onSessionIdResolved: (sid) => { this.currentSessionId = sid; },
          onTextChunkReceived: (chunk) => { chunks.push(chunk.content); },
        },
      );

      // Queue-specific: onError with logging
      callbacks.onError = (error) => {
        const sdkError = parseSDKError(error);
        log.error(`executePrompt: onError callback: ${sdkError.message} (code=${sdkError.code})`);
        emit('error', { code: ERROR_CODES.CHAT_ERROR, message: sdkError.message });
        if (this.notificationService.shouldNotify(stream.sockets.size)) {
          this.notificationService.notifyError(stream.sessionId, sdkError.message);
        }
      };

      // Queue-specific: wrap callbacks with extra debug logging
      const baseOnComplete = callbacks.onComplete!;
      callbacks.onComplete = (response) => {
        const contentPreview = (response.content || '').slice(0, 120);
        log.debug(`executePrompt: onComplete sid=${sessionIdRef.current || response.sessionId}, isError=${response.isError}, usage=${response.usage ? `in=${response.usage.inputTokens} out=${response.usage.outputTokens} cost=$${response.usage.totalCostUSD?.toFixed(4)}` : 'none'}, content=${JSON.stringify(contentPreview)}`);
        baseOnComplete(response);
      };

      const baseOnResultError = callbacks.onResultError!;
      callbacks.onResultError = (data) => {
        log.error(`executePrompt: onResultError subtype=${data.subtype}, errors=${JSON.stringify(data.errors)}, result=${data.result?.slice(0, 200)}`);
        baseOnResultError(data);
      };

      const baseOnCompact = callbacks.onCompact!;
      callbacks.onCompact = (metadata) => {
        log.debug(`executePrompt: onCompact trigger=${metadata.trigger}, preTokens=${metadata.preTokens}`);
        baseOnCompact(metadata);
      };

      const baseOnToolResult = callbacks.onToolResult!;
      callbacks.onToolResult = (toolCallId, result) => {
        // Only log extra detail when there's an error (base already logs id + success)
        if (result.error) {
          log.debug(`executePrompt: onToolResult id=${toolCallId}, error=${result.error.slice(0, 200)}`);
        }
        baseOnToolResult(toolCallId, result);
      };

      await this.chatService!.sendMessageWithCallbacks(item.prompt, callbacks, chatOptions, canUseTool);
    } catch (error) {
      const sdkError = parseSDKError(error);

      // Abort is intentional (user clicked abort) — not an error
      if (sdkError.code === 'ABORTED' || !this._isRunning) {
        log.debug(`executePrompt: aborted — not an error (code=${sdkError.code}, isRunning=${this._isRunning})`);
        return { shouldAdvance: false };
      }

      const originalStack = (error instanceof Error && error.stack) ? error.stack : undefined;
      log.error(`executePrompt CATCH: code=${sdkError.code}, message=${sdkError.message}`);
      if (originalStack) log.error(`executePrompt CATCH stack:`, originalStack);
      if (sdkError.originalError && sdkError.originalError !== error) {
        log.error(`executePrompt CATCH originalError:`, sdkError.originalError.message);
      }
      const te = i18next.getFixedT(this.lang);
      this.pauseWithError(te('queue.error.sdkError', { value: sdkError.message }));
      await this.notificationService.notifyQueueError(sdkError.message, this.buildSessionUrl());
      return { shouldAdvance: false };
    } finally {
      log.debug(`executePrompt: FINALLY — cleaning up stream for ${stream.sessionId}`);
      // Clean up — identical to handleChatSend finally block
      stream.status = 'completed';
      finalizeStream(stream.sessionId);
    }

    // After first successful prompt, subsequent prompts resume the session
    this.resumeSessionId = this.currentSessionId;
    log.debug(`executePrompt: SUCCESS — resumeSessionId=${this.resumeSessionId}, chunks=${chunks.length}, totalChars=${chunks.reduce((a, c) => a + c.length, 0)}`);

    // Check markers
    const fullText = chunks.join('');
    if (fullText.includes('QUEUE_STOP')) {
      log.warn(`executePrompt: QUEUE_STOP marker detected in response`);
      const tq = i18next.getFixedT(this.lang);
      this.pauseWithError(tq('queue.error.queueStopDetected'));
      await this.notificationService.notifyQueueError(tq('queue.error.queueStopDetected'), this.buildSessionUrl());
      return { shouldAdvance: false, markerDetected: 'QUEUE_STOP' };
    }
    if (fullText.includes('QUEUE_PASS')) {
      log.debug(`executePrompt: QUEUE_PASS marker detected`);
      return { shouldAdvance: true, markerDetected: 'QUEUE_PASS' };
    }
    return { shouldAdvance: true };
  }

  private async handleLoadSession(name: string): Promise<boolean> {
    // Use workingDirectory directly to avoid reading sessions-index.json
    // which may be locked by the SDK during active streaming
    let sessionNames: Record<string, string>;
    try {
      sessionNames = await this.projectService.readSessionNames(this.workingDirectory);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`handleLoadSession: failed to read session names (${msg})`);
      const t = i18next.getFixedT(this.lang);
      this.pauseWithError(t('queue.error.sessionNotFound', { value: name }));
      return false;
    }
    const entry = Object.entries(sessionNames).find(([, n]) => n === name);
    if (!entry) {
      const t = i18next.getFixedT(this.lang);
      this.pauseWithError(t('queue.error.sessionNotFound', { value: name }));
      return false;
    }
    this.currentSessionId = entry[0];
    this.resumeSessionId = entry[0];
    return true;
  }

  private buildChatOptions(): ChatOptions {
    const opts: ChatOptions = { abortController: this.abortController! };
    if (this.resumeSessionId) {
      opts.resume = this.resumeSessionId;
    } else if (this.currentSessionId) {
      opts.sessionId = this.currentSessionId;
    }
    if (this.currentModel) opts.model = this.currentModel;
    return opts;
  }

  private pauseWithError(reason: string): void {
    log.error(`pauseWithError: index=${this.currentIndex}, reason="${reason}"`);
    this.isPaused = true;
    this._isPauseRequested = false; // clear deferred request since we're pausing now
    this.pauseReason = reason;
    this.lastError = { itemIndex: this.currentIndex, error: reason };
    this.emitProgress('paused');
    this.emitQueueError(reason);
  }

  private emitQueueError(error: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:error' as any, {
      itemIndex: this.currentIndex,
      error,
      sessionId: this.currentSessionId || '',
    });
  }

  private buildSessionUrl(): string {
    const baseUrl = this.notificationService.getBaseUrl() || `http://localhost:${process.env.PORT || 3000}`;
    return `${baseUrl}/projects/${this.projectSlug}/sessions/${this.currentSessionId || ''}`;
  }

  private emitProgress(status: 'running' | 'paused' | 'completed' | 'error' | 'aborted'): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:progress' as any, {
      currentIndex: this.currentIndex,
      totalItems: this._isRunning || this.isPaused ? this.items.length : this._finalTotalItems,
      status,
      pauseReason: this.pauseReason,
      sessionId: this.currentSessionId || '',
      isPauseRequested: this._isPauseRequested,
      isWaitingForInput: this._isWaitingForInput,
    });
  }

  private emitItemComplete(itemIndex: number, markerDetected?: 'QUEUE_STOP' | 'QUEUE_PASS'): void {
    const sessionId = this.currentSessionId || '';
    this.completedSessionIds.set(itemIndex, sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:itemComplete' as any, {
      itemIndex,
      sessionId,
      markerDetected,
    });
  }
}
