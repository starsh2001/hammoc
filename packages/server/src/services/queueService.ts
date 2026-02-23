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
} from '@bmad-studio/shared';
import { ChatService } from './chatService.js';
import { parseSDKError } from '../utils/errors.js';
import { projectService as _ps } from './projectService.js';
import { notificationService as _ns } from './notificationService.js';
import { preferencesService as _prs } from './preferencesService.js';

type ProjectService = typeof _ps;
type NotificationService = typeof _ns;
type PreferencesService = typeof _prs;

type SocketIOServer4 = SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface PendingPermission {
  resolve: (result: { approved: boolean; response?: string | string[] | Record<string, string | string[]> }) => void;
  interactionType: 'permission' | 'question';
}

interface ExecuteItemResult {
  shouldAdvance: boolean;
  markerDetected?: 'QUEUE_STOP' | 'QUEUE_PASS';
}

export class QueueService {
  private items: QueueItem[] = [];
  private currentIndex: number = 0;
  private _isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentSessionId: string | null = null;
  private currentModel: string | undefined = undefined;
  private projectSlug: string = '';
  private workingDirectory: string = '';
  private chatService: ChatService | null = null;
  private abortController: AbortController | null = null;
  private pauseReason: string | undefined = undefined;
  private resumeSessionId: string | null = null;
  public pendingPermissions = new Map<string, PendingPermission>();

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

  async start(items: QueueItem[], projectSlug: string, sessionId?: string): Promise<void> {
    this.workingDirectory = await this.projectService.resolveOriginalPath(projectSlug);
    this.chatService = new ChatService({ workingDirectory: this.workingDirectory });
    this.abortController = new AbortController();
    this.items = items;
    this.currentIndex = 0;
    this._isRunning = true;
    this.isPaused = false;
    this.projectSlug = projectSlug;
    this.currentSessionId = sessionId ?? null;
    this.currentModel = undefined;
    this.resumeSessionId = null;
    this.pauseReason = undefined;
    this.pendingPermissions.clear();

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
    this.abortController = new AbortController();
    this.isPaused = false;
    this.pauseReason = undefined;
    this.emitProgress('running');
    await this.executeLoop();
  }

  async abort(): Promise<void> {
    this._isRunning = false;
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

  private async executePrompt(item: QueueItem): Promise<ExecuteItemResult> {
    const { callbacks, getAccumulatedText } = this.buildStreamCallbacks();
    const canUseTool = this.buildCanUseTool();
    const options = this.buildChatOptions();

    try {
      await this.chatService!.sendMessageWithCallbacks(item.prompt, callbacks, options, canUseTool);
    } catch (error) {
      const sdkError = parseSDKError(error);
      this.pauseWithError(`SDK Error: ${sdkError.message}`);
      await this.notificationService.notifyQueueError(sdkError.message, this.buildSessionUrl());
      return { shouldAdvance: false };
    }

    // Clear resume after use (one-time)
    this.resumeSessionId = null;

    // Check markers after completion
    const fullText = getAccumulatedText();
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

  private buildStreamCallbacks(): { callbacks: StreamCallbacks; getAccumulatedText: () => string } {
    const chunks: string[] = [];
    const emitToProject = (event: string, data: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.io.to(`project:${this.projectSlug}`).emit(event as any, data);
    };

    const callbacks: StreamCallbacks = {
      onSessionInit: (sessionId, metadata) => {
        this.currentSessionId = sessionId;
        emitToProject('session:created', { sessionId, model: metadata?.model });
      },
      onTextChunk: (chunk) => {
        chunks.push(chunk.content);
        // Intentional: sessionId placed last to ensure currentSessionId overrides any
        // stale sessionId from the chunk (e.g., when @new allocates a new session mid-queue).
        emitToProject('message:chunk', { ...chunk, sessionId: this.currentSessionId });
      },
      onThinking: (content) => {
        emitToProject('thinking:chunk', { sessionId: this.currentSessionId, content });
      },
      onToolUse: (toolCall) => {
        emitToProject('tool:call', { sessionId: this.currentSessionId, ...toolCall });
      },
      onToolInputUpdate: (toolCallId, input) => {
        emitToProject('tool:input-update', { sessionId: this.currentSessionId, toolCallId, input });
      },
      onToolResult: (toolCallId, result) => {
        emitToProject('tool:result', { sessionId: this.currentSessionId, toolCallId, ...result });
      },
      onComplete: (response) => {
        // Intentional: sessionId placed last (same rationale as onTextChunk)
        emitToProject('message:complete', { ...response, sessionId: this.currentSessionId });
      },
      onError: (error) => {
        emitToProject('error', { sessionId: this.currentSessionId, code: 'QUEUE_SDK_ERROR', message: error.message });
      },
      onCompact: (metadata) => {
        emitToProject('system:compact', { sessionId: this.currentSessionId, ...metadata });
      },
      onToolProgress: (toolUseId, elapsedTimeSeconds, toolName) => {
        emitToProject('tool:progress', { sessionId: this.currentSessionId, toolUseId, elapsedTimeSeconds, toolName });
      },
      onToolUseSummary: (summary, precedingToolUseIds) => {
        emitToProject('tool:summary', { sessionId: this.currentSessionId, summary, precedingToolUseIds });
      },
      onTaskNotification: (data) => {
        emitToProject('system:task-notification', { sessionId: this.currentSessionId, ...data });
      },
      onResultError: (data) => {
        emitToProject('result:error', { sessionId: this.currentSessionId, ...data });
      },
      onAssistantUsage: (usage) => {
        emitToProject('assistant:usage', { sessionId: this.currentSessionId, ...usage });
      },
      onContextEstimate: (estimatedTokens, contextWindow) => {
        emitToProject('context:estimate', { sessionId: this.currentSessionId, estimatedTokens, contextWindow });
      },
    };

    return { callbacks, getAccumulatedText: () => chunks.join('') };
  }

  private buildCanUseTool(): CanUseTool {
    return async (toolName, input, options): Promise<PermissionResult> => {
      const isAskUserQuestion = toolName === 'AskUserQuestion';
      const requestId = options.toolUseID || `perm-queue-${Date.now()}`;

      // Step 1: Pause queue execution
      this.isPaused = true;
      this.pauseReason = `Waiting for ${isAskUserQuestion ? 'user answer' : 'permission'}: ${toolName}`;
      this.emitProgress('paused');
      await this.notificationService.notifyQueueInputRequired(this.buildSessionUrl());

      // Step 2: Emit permission:request to project room
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.io.to(`project:${this.projectSlug}`).emit('permission:request' as any, {
        id: requestId,
        sessionId: this.currentSessionId || '',
        toolCall: { id: requestId, name: toolName, input },
        requiresApproval: true,
      });

      // Step 3: Wait for user response
      const userResponse = await new Promise<{
        approved: boolean;
        response?: string | string[] | Record<string, string | string[]>;
      }>((resolve) => {
        this.pendingPermissions.set(requestId, {
          resolve,
          interactionType: isAskUserQuestion ? 'question' : 'permission',
        });
      });

      // Step 4: Auto-resume after user responds
      this.isPaused = false;
      this.pauseReason = undefined;
      this.emitProgress('running');

      // Step 5: Build PermissionResult
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
