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
  StreamCallbacks,
  ChatOptions,
  PermissionMode,
  TrackedToolCall,
  ToolResult,
  CompactMetadata,
  TaskNotificationData,
  PermissionRequest,
} from '@bmad-studio/shared';
import { ERROR_CODES } from '@bmad-studio/shared';
import { ChatService } from './chatService.js';
import { parseSDKError } from '../utils/errors.js';
import { projectService as _ps } from './projectService.js';
import { notificationService as _ns } from './notificationService.js';
import { preferencesService as _prs } from './preferencesService.js';
import {
  createHeadlessStream,
  rekeyStream,
  finalizeStream,
  broadcastStreamChange,
} from '../handlers/websocket.js';

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
    this.emitProgress('running');
    await this.notificationService.notifyQueueStart(items.length, this.buildSessionUrl());
    await this.executeLoop();
  }

  async pause(): Promise<void> {
    this.isPaused = true;
    this.pauseReason = 'User paused';
    this.emitProgress('paused');
  }

  async resume(): Promise<void> {
    if (!this.isPaused || this.isExecuting) return;
    this.abortController = new AbortController();
    this.isPaused = false;
    this.pauseReason = undefined;
    this.emitProgress('running');
    await this.executeLoop();
  }

  async abort(): Promise<void> {
    this._isRunning = false;
    this.isExecuting = false;
    this.abortController?.abort();
    this.emitProgress('completed');
  }

  getState() {
    return {
      isRunning: this._isRunning,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalItems: this.items.length,
      pauseReason: this.pauseReason,
      lockedSessionId: this.lockedSessionId,
      currentModel: this.currentModel,
    };
  }

  private async executeLoop(): Promise<void> {
    if (this.isExecuting) return;
    this.isExecuting = true;
    try {
      while (this.currentIndex < this.items.length && this._isRunning) {
        if (this.isPaused) break;
        const item = this.items[this.currentIndex];
        const result = await this.executeItem(item);

        // Process advancement FIRST, then check pause.
        // @pause: shouldAdvance=true (advance past breakpoint), isPaused=true (break after)
        // QUEUE_STOP/error/@load failure: shouldAdvance=false (stay for retry), isPaused=true (break)
        if (result.shouldAdvance) {
          this.emitItemComplete(this.currentIndex, result.markerDetected);
          this.currentIndex++;
        }
        if (this.isPaused) break;
      }

      if (this.currentIndex >= this.items.length && this._isRunning) {
        this._isRunning = false;
        this.emitProgress('completed');
        await this.notificationService.notifyQueueComplete(this.buildSessionUrl());
      }
    } finally {
      this.isExecuting = false;
    }
  }

  private async executeItem(item: QueueItem): Promise<ExecuteItemResult> {
    // Step 1: Session management flags (processed sequentially, not exclusively)
    if (item.isNewSession) {
      const newSessionId = crypto.randomUUID();
      this.currentSessionId = newSessionId;
      this.resumeSessionId = null;
    }
    if (item.modelName) {
      this.currentModel = item.modelName;
    }
    if (item.saveSessionName) {
      await this.projectService.updateSessionName(
        this.projectSlug, this.currentSessionId!, item.saveSessionName
      );
    }
    if (item.loadSessionName) {
      const loaded = await this.handleLoadSession(item.loadSessionName);
      if (!loaded) return { shouldAdvance: false };
    }
    if (item.delayMs) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, item.delayMs);
        const onAbort = () => { clearTimeout(timer); resolve(); };
        this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
      });
      if (!this._isRunning) return { shouldAdvance: true };
    }

    // Step 2: Breakpoint check
    if (item.isBreakpoint) {
      this.isPaused = true;
      this.pauseReason = item.prompt || 'Breakpoint';
      this.emitProgress('paused');
      return { shouldAdvance: true };
    }

    // Step 3: Prompt execution (only if prompt is non-empty)
    if (item.prompt) {
      return await this.executePrompt(item);
    }

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

    // Identical to handleChatSend: headless stream → createStreamEmit
    const { stream, emit } = createHeadlessStream(streamKey, this.abortController!);
    stream.chatService = this.chatService!;

    let actualSessionId = this.currentSessionId;
    const chunks: string[] = [];

    // canUseTool — permissions stored in stream.pendingPermissions
    // (same map that permission:respond handler in websocket.ts checks)
    const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
      const isAskUserQuestion = toolName === 'AskUserQuestion';
      const requestId = options.toolUseID || `perm-queue-${Date.now()}`;

      // Pause queue execution
      this.isPaused = true;
      this.pauseReason = `Waiting for ${isAskUserQuestion ? 'user answer' : 'permission'}: ${toolName}`;
      this.emitProgress('paused');
      await this.notificationService.notifyQueueInputRequired(this.buildSessionUrl());

      // Emit via ActiveStream (buffered + forwarded to session:join'd socket)
      emit('permission:request', {
        id: requestId,
        sessionId: this.currentSessionId || '',
        toolCall: { id: requestId, name: toolName, input },
        requiresApproval: true,
      } as PermissionRequest);

      // Notify via Telegram if no socket connected
      if (stream.sockets.size === 0) {
        const prompt = isAskUserQuestion
          ? ((input as Record<string, unknown>).questions as Array<{ question: string }>)?.[0]?.question
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

      // Auto-resume
      this.isPaused = false;
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
      await this.chatService!.sendMessageWithCallbacks(item.prompt, {
        // --- Callbacks identical to handleChatSend in websocket.ts ---

        onSessionInit: (sid, metadata) => {
          actualSessionId = sid;
          this.currentSessionId = sid;

          // Re-key stream (identical to handleChatSend inline logic)
          rekeyStream(stream, sid);

          emit('session:created', { sessionId: sid, model: metadata?.model });
          broadcastStreamChange(sid, true);
        },

        onTextChunk: (chunk) => {
          chunks.push(chunk.content);
          emit('message:chunk', {
            sessionId: actualSessionId || chunk.sessionId,
            messageId: chunk.messageId,
            content: chunk.content,
            done: chunk.done,
          });
        },

        onThinking: (content: string) => {
          emit('thinking:chunk', { content });
        },

        onToolUse: (toolCall: TrackedToolCall) => {
          emit('tool:call', { id: toolCall.id, name: toolCall.name, input: toolCall.input });
        },

        onToolInputUpdate: (toolCallId: string, input: Record<string, unknown>) => {
          emit('tool:input-update', { toolCallId, input });
        },

        onToolResult: (toolCallId: string, result: ToolResult) => {
          emit('tool:result', { toolCallId, result });
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
            this.notificationService.notifyComplete(stream.sessionId);
          }
        },

        onError: (error) => {
          const sdkError = parseSDKError(error);
          emit('error', { code: ERROR_CODES.CHAT_ERROR, message: sdkError.message });
          if (stream.sockets.size === 0) {
            this.notificationService.notifyError(stream.sessionId, sdkError.message);
          }
        },

        onCompact: (metadata: CompactMetadata) => {
          emit('system:compact', metadata);
        },

        onToolProgress: (toolUseId: string, elapsedTimeSeconds: number, toolName: string) => {
          emit('tool:progress', { toolUseId, elapsedTimeSeconds, toolName });
        },

        onToolUseSummary: (summary: string, precedingToolUseIds: string[]) => {
          emit('tool:summary', { summary, precedingToolUseIds });
        },

        onTaskNotification: (data: TaskNotificationData) => {
          emit('system:task-notification', data);
        },

        onResultError: (data) => {
          emit('result:error', data);
        },

        onAssistantUsage: (usage) => {
          emit('assistant:usage', usage);
        },

        onContextEstimate: (estimatedTokens, contextWindow) => {
          emit('context:estimate', { estimatedTokens, contextWindow });
        },
      }, chatOptions, canUseTool);
    } catch (error) {
      const sdkError = parseSDKError(error);
      console.error(`[queueService] executePrompt ERROR: ${sdkError.message}`);
      this.pauseWithError(`SDK Error: ${sdkError.message}`);
      await this.notificationService.notifyQueueError(sdkError.message, this.buildSessionUrl());
      return { shouldAdvance: false };
    } finally {
      // Clean up — identical to handleChatSend finally block
      stream.status = 'completed';
      finalizeStream(stream.sessionId);
    }

    // After first successful prompt, subsequent prompts resume the session
    this.resumeSessionId = this.currentSessionId;

    // Check markers
    const fullText = chunks.join('');
    if (fullText.includes('QUEUE_STOP')) {
      this.pauseWithError('QUEUE_STOP detected in response');
      await this.notificationService.notifyQueueError('QUEUE_STOP detected in response', this.buildSessionUrl());
      return { shouldAdvance: false, markerDetected: 'QUEUE_STOP' };
    }
    if (fullText.includes('QUEUE_PASS')) {
      return { shouldAdvance: true, markerDetected: 'QUEUE_PASS' };
    }
    return { shouldAdvance: true };
  }

  private async handleLoadSession(name: string): Promise<boolean> {
    const sessionNames = await this.projectService.readSessionNamesBySlug(this.projectSlug);
    const entry = Object.entries(sessionNames).find(([, n]) => n === name);
    if (!entry) {
      this.pauseWithError(`Session name "${name}" not found`);
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
    this.isPaused = true;
    this.pauseReason = reason;
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
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${baseUrl}/projects/${this.projectSlug}/sessions/${this.currentSessionId || ''}`;
  }

  private emitProgress(status: 'running' | 'paused' | 'completed' | 'error'): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:progress' as any, {
      currentIndex: this.currentIndex,
      totalItems: this.items.length,
      status,
      pauseReason: this.pauseReason,
      sessionId: this.currentSessionId || '',
    });
  }

  private emitItemComplete(itemIndex: number, markerDetected?: 'QUEUE_STOP' | 'QUEUE_PASS'): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(`project:${this.projectSlug}`).emit('queue:itemComplete' as any, {
      itemIndex,
      sessionId: this.currentSessionId || '',
      markerDetected,
    });
  }
}
