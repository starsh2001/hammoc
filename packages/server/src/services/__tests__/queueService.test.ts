/**
 * QueueService Tests
 * Story 15.2: Queue Runner Engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ChatService constructor — must use regular function (not arrow) for `new`
const mockSendMessageWithCallbacks = vi.fn();
const mockGetPermissionMode = vi.fn().mockReturnValue('default');
vi.mock('../chatService.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChatService: vi.fn().mockImplementation(function (this: any) {
    this.sendMessageWithCallbacks = mockSendMessageWithCallbacks;
    this.getPermissionMode = mockGetPermissionMode;
  }),
}));

// Mock errors utility
vi.mock('../../utils/errors.js', () => ({
  parseSDKError: (error: unknown) => {
    if (error instanceof Error) return error;
    return new Error(String(error));
  },
}));

// Mock i18next — getFixedT returns a translator that maps keys to readable English
vi.mock('../../i18n.js', () => ({
  default: {
    getFixedT: () => (key: string, opts?: Record<string, unknown>) => {
      // Map known keys to English strings matching test assertions
      const translations: Record<string, string> = {
        'queue.pause.userPaused': 'User paused',
        'queue.pause.waitingForPermission': `Waiting for ${opts?.value || 'input'} (${opts?.toolName || 'tool'})`,
        'queue.pause.userAnswer': 'user answer',
        'queue.pause.permissionApproval': 'permission approval',
        'queue.error.sdkError': `SDK Error: ${opts?.value || 'unknown'}`,
        'queue.error.pausewordDetected': `Pauseword "${opts?.value || ''}" detected in response`,
        'queue.error.sessionNotFound': `Session not found: ${opts?.value || 'unknown'}`,
        'queue.error.sessionBusy': 'Session is busy',
        'queue.loop.maxExceeded': `Loop max exceeded: ${opts?.max ?? '?'} iterations without "${opts?.until ?? '?'}"`,
      };
      return translations[key] || (opts?.value ? `${key}: ${opts.value}` : key);
    },
  },
}));

// Mock logger to suppress output
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  }),
}));

// Mock streamCallbacks — buildStreamCallbacks wires hooks so chunk collection works
vi.mock('../../handlers/streamCallbacks.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildStreamCallbacks: vi.fn().mockImplementation((_deps: any, hooks?: any) => {
    const sessionIdRef = { current: undefined as string | undefined };
    const callbacks = {
      onSessionInit: vi.fn(),
      // onTextChunk must invoke onTextChunkReceived hook for @pauseword detection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onTextChunk: vi.fn().mockImplementation((chunk: any) => {
        hooks?.onTextChunkReceived?.(chunk);
      }),
      onThinking: vi.fn(),
      onToolUse: vi.fn(),
      onToolInputUpdate: vi.fn(),
      onToolResult: vi.fn(),
      onCompact: vi.fn(),
      onToolProgress: vi.fn(),
      onTaskNotification: vi.fn(),
      onToolUseSummary: vi.fn(),
      onAssistantUsage: vi.fn(),
      onContextEstimate: vi.fn(),
      onResultError: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };
    return { callbacks, sessionIdRef };
  }),
}));

// Mock notificationService module import (for formatAskQuestionPrompt)
vi.mock('../notificationService.js', () => ({
  notificationService: {},
  formatAskQuestionPrompt: vi.fn().mockReturnValue('mocked question prompt'),
}));

// Mock projectService module import
vi.mock('../projectService.js', () => ({
  projectService: {},
}));

// Mock preferencesService module import
vi.mock('../preferencesService.js', () => ({
  preferencesService: {},
}));

// Mock snippetResolver for BS-2 snippet integration tests
const mockResolveSnippet = vi.fn();
const mockIsSnippetRef = vi.fn().mockReturnValue(false);
vi.mock('../../utils/snippetResolver.js', () => ({
  isSnippetRef: (...args: unknown[]) => mockIsSnippetRef(...args),
  resolveSnippet: (...args: unknown[]) => mockResolveSnippet(...args),
  SnippetError: class SnippetError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = 'SnippetError';
    }
  },
}));

// Mock websocket exports used by QueueService (ActiveStream pattern)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockStreamPendingPermissions = new Map<string, any>();
vi.mock('../../handlers/websocket.js', () => ({
  createHeadlessStream: vi.fn().mockImplementation((sessionId: string) => {
    const stream = {
      sessionId,
      sockets: new Set(),
      buffer: [],
      pendingPermissions: mockStreamPendingPermissions,
      status: 'running',
      startedAt: Date.now(),
      chatService: null,
    };
    return { stream, emit: vi.fn() };
  }),
  isSessionStreaming: vi.fn().mockReturnValue(false),
  rekeyStream: vi.fn(),
  finalizeStream: vi.fn(),
  broadcastStreamChange: vi.fn(),
}));

// Mock projectService
const mockProjectService = {
  resolveOriginalPath: vi.fn().mockResolvedValue('/mock/project/path'),
  readSessionNamesBySlug: vi.fn().mockResolvedValue({ 'session-id-1': 'my-session' }),
  readSessionNames: vi.fn().mockResolvedValue({ 'session-id-1': 'my-session' }),
  updateSessionName: vi.fn().mockResolvedValue(undefined),
  updateSessionNameByPath: vi.fn().mockResolvedValue(undefined),
};

// Mock notificationService
const mockNotificationService = {
  notifyQueueStart: vi.fn().mockResolvedValue(undefined),
  notifyQueueComplete: vi.fn().mockResolvedValue(undefined),
  notifyQueueError: vi.fn().mockResolvedValue(undefined),
  notifyQueueInputRequired: vi.fn().mockResolvedValue(undefined),
  notifyComplete: vi.fn(),
  notifyError: vi.fn(),
  notifyInputRequired: vi.fn(),
  shouldNotify: vi.fn().mockReturnValue(false),
  reload: vi.fn().mockResolvedValue(undefined),
  getBaseUrl: vi.fn().mockReturnValue(''),
};

// Mock preferencesService
const mockPreferencesService = {
  readPreferences: vi.fn().mockResolvedValue({}),
  getEffectivePreferences: vi.fn().mockResolvedValue({}),
  getTelegramSettings: vi.fn().mockResolvedValue({}),
};

// Mock Socket.io
const mockEmit = vi.fn();
const mockIo = {
  to: vi.fn().mockReturnValue({ emit: mockEmit }),
};

import { QueueService } from '../queueService.js';
import type { QueueItem, StreamCallbacks } from '@hammoc/shared';

function createPromptItem(prompt: string, overrides?: Partial<QueueItem>): QueueItem {
  return { prompt, isNewSession: false, ...overrides };
}

// Helper: Make sendMessageWithCallbacks invoke onComplete callback and resolve
function setupMockChat(responseText = 'Response text') {
  mockSendMessageWithCallbacks.mockImplementation(
    async (content: string, callbacks: StreamCallbacks) => {
      callbacks.onTextChunk?.({
        sessionId: 'test-session',
        messageId: 'msg-1',
        content: responseText,
        done: true,
      });
      callbacks.onComplete?.({
        id: 'resp-1',
        sessionId: 'test-session',
        content: responseText,
        done: true,
        isError: false,
      });
      return {
        id: 'resp-1',
        sessionId: 'test-session',
        content: responseText,
        done: true,
        isError: false,
      };
    }
  );
}

describe('QueueService', () => {
  let queueService: QueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamPendingPermissions.clear();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    queueService = new QueueService(
      mockProjectService as any,
      mockNotificationService as any,
      mockPreferencesService as any,
      mockIo as any
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    setupMockChat();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TC-QR-1: Sequential execution of prompt items', () => {
    it('should execute prompts in order', async () => {
      const items = [
        createPromptItem('Hello'),
        createPromptItem('World'),
      ];

      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('Hello');
      expect(mockSendMessageWithCallbacks.mock.calls[1][0]).toBe('World');
    });
  });

  describe('TC-QR-2: Completed items are tracked and progress emitted', () => {
    it('should emit queue:progress and queue:itemComplete events', async () => {
      const items = [createPromptItem('Test')];

      await queueService.start(items, 'test-project');

      // Check emitted events
      const progressCalls = mockEmit.mock.calls.filter(([event]) => event === 'queue:progress');
      const itemCompleteCalls = mockEmit.mock.calls.filter(([event]) => event === 'queue:itemComplete');

      expect(progressCalls.length).toBeGreaterThanOrEqual(2); // running + completed
      expect(itemCompleteCalls.length).toBe(1);
      expect(itemCompleteCalls[0][1]).toEqual(expect.objectContaining({ itemIndex: 0 }));
    });
  });

  describe('TC-QR-3: @pause pauses execution with reason and advances past breakpoint', () => {
    it('should pause and advance currentIndex past the breakpoint', async () => {
      const items = [
        createPromptItem('Pause here', { isBreakpoint: true }),
        createPromptItem('After pause'),
      ];

      await queueService.start(items, 'test-project');

      // Should be paused after @pause item
      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(1); // advanced past @pause
      expect(state.pauseReason).toBe('Pause here');

      // First prompt should NOT have been called (paused before it)
      expect(mockSendMessageWithCallbacks).not.toHaveBeenCalled();
    });
  });

  describe('TC-QR-4: @new creates new session with UUID', () => {
    it('should set a new session ID when isNewSession is true', async () => {
      const items = [
        createPromptItem('Hello', { isNewSession: true }),
      ];

      await queueService.start(items, 'test-project');

      // sendMessageWithCallbacks should have been called with a UUID sessionId
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('buildChatOptions propagates advanced preferences', () => {
    it('passes maxBudgetUsd, maxTurns, maxThinkingTokens, customSystemPrompt, and effort from preferences', async () => {
      mockPreferencesService.getEffectivePreferences.mockResolvedValueOnce({
        maxBudgetUsd: 0.5,
        maxTurns: 10,
        maxThinkingTokens: 8000,
        customSystemPrompt: 'Respond tersely.',
        defaultEffort: 'high',
        enableQueueCheckpointing: true,
      });

      await queueService.start([createPromptItem('hi')], 'test-project');

      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.maxBudgetUsd).toBe(0.5);
      expect(options.maxTurns).toBe(10);
      expect(options.maxThinkingTokens).toBe(8000);
      expect(options.customSystemPrompt).toBe('Respond tersely.');
      expect(options.effort).toBe('high');
      expect(options.enableFileCheckpointing).toBe(true);
    });

    it('omits advanced fields when preferences do not define them', async () => {
      mockPreferencesService.getEffectivePreferences.mockResolvedValueOnce({});

      await queueService.start([createPromptItem('hi')], 'test-project');

      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.maxBudgetUsd).toBeUndefined();
      expect(options.maxTurns).toBeUndefined();
      expect(options.maxThinkingTokens).toBeUndefined();
      expect(options.customSystemPrompt).toBeUndefined();
      expect(options.effort).toBeUndefined();
    });

    it('clamps unsupported max/xhigh effort to high when model does not support it', async () => {
      mockPreferencesService.getEffectivePreferences.mockResolvedValueOnce({
        defaultEffort: 'max',
      });

      // haiku does not support 'max' → falls back to 'high'
      await queueService.start([createPromptItem('hi', { model: 'haiku' })], 'test-project');

      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.effort).toBe('high');
    });
  });

  describe('TC-QR-5: @save calls projectService.updateSessionName', () => {
    it('should call updateSessionNameByPath with correct args', async () => {
      const items = [
        createPromptItem('', { saveSessionName: 'my-save' }),
      ];

      await queueService.start(items, 'test-project', 'existing-session');

      expect(mockProjectService.updateSessionNameByPath).toHaveBeenCalledWith(
        '/mock/project/path', 'existing-session', 'my-save'
      );
    });

    it('should pause with error when no active session', async () => {
      const items = [
        createPromptItem('', { saveSessionName: 'my-save' }),
      ];

      // No sessionId provided → currentSessionId is null
      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(mockProjectService.updateSessionNameByPath).not.toHaveBeenCalled();
    });

    it('should pause with error when updateSessionNameByPath throws', async () => {
      mockProjectService.updateSessionNameByPath.mockRejectedValueOnce(new Error('disk full'));

      const items = [
        createPromptItem('', { saveSessionName: 'my-save' }),
      ];

      await queueService.start(items, 'test-project', 'existing-session');

      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
    });
  });

  describe('TC-QR-6: @load performs reverse name lookup and sets sessionId', () => {
    it('should set sessionId from session-names.json reverse lookup', async () => {
      mockProjectService.readSessionNames.mockResolvedValueOnce({
        'session-id-1': 'my-session',
      });

      const items = [
        createPromptItem('Continue', { loadSessionName: 'my-session' }),
      ];

      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.resume).toBe('session-id-1');
    });
  });

  describe('TC-QR-7: @load with unknown name pauses with error', () => {
    it('should pause with error when session name not found', async () => {
      mockProjectService.readSessionNames.mockResolvedValueOnce({});

      const items = [
        createPromptItem('Continue', { loadSessionName: 'nonexistent' }),
      ];

      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(0); // stays at failed item
      expect(state.pauseReason).toContain('nonexistent');
      expect(mockSendMessageWithCallbacks).not.toHaveBeenCalled();

      // IMPL-001: queue:error event should be emitted
      const errorCalls = mockEmit.mock.calls.filter(([event]) => event === 'queue:error');
      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0][1]).toEqual(expect.objectContaining({
        itemIndex: 0,
        error: expect.stringContaining('nonexistent'),
        sessionId: expect.any(String),
      }));
    });
  });

  describe('TC-QR-8: @model sets model for subsequent prompts', () => {
    it('should pass model to sendMessageWithCallbacks options', async () => {
      const items = [
        createPromptItem('', { modelName: 'opus' }),
        createPromptItem('Hello'),
      ];

      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.model).toBe('opus');
    });
  });

  describe('TC-QR-9: @model persists across @new sessions', () => {
    it('should keep model after @new session', async () => {
      const items = [
        createPromptItem('First', { modelName: 'haiku' }),
        createPromptItem('Second', { isNewSession: true }),
      ];

      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      const secondOptions = mockSendMessageWithCallbacks.mock.calls[1][2];
      expect(secondOptions.model).toBe('haiku');
    });
  });

  describe('TC-QR-10: @delay waits specified milliseconds', () => {
    it('should wait before proceeding to next item', async () => {
      vi.useFakeTimers();

      const items = [
        createPromptItem('', { delayMs: 1000 }),
        createPromptItem('After delay'),
      ];

      const startPromise = queueService.start(items, 'test-project');

      // Fast-forward timers
      await vi.advanceTimersByTimeAsync(1001);
      await startPromise;

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('After delay');
    });
  });

  describe('TC-QR-11: @pauseword in response pauses and keeps currentIndex', () => {
    it('should pause and not advance when pauseword is detected', async () => {
      setupMockChat('Some text QUEUE_STOP here');

      const items = [
        createPromptItem('', { pauseword: 'QUEUE_STOP' }),
        createPromptItem('Check'),
      ];

      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(1); // stays at failed prompt item
      expect(state.pauseReason).toContain('QUEUE_STOP');
      expect(mockNotificationService.notifyQueueError).toHaveBeenCalledWith(
        'Pauseword "QUEUE_STOP" detected in response',
        expect.any(String)
      );

      // IMPL-001: queue:error event should be emitted
      const errorCalls = mockEmit.mock.calls.filter(([event]) => event === 'queue:error');
      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0][1]).toEqual(expect.objectContaining({
        itemIndex: 1,
        error: expect.stringContaining('QUEUE_STOP'),
      }));
    });

    it('should not pause when no pauseword is set', async () => {
      setupMockChat('Some text QUEUE_STOP here');

      const items = [createPromptItem('Check')];

      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isCompleted).toBe(true);
      expect(state.isPaused).toBe(false);
    });
  });

  describe('TC-QR-12: @pauseword persists across items', () => {
    it('should check pauseword for all subsequent prompts', async () => {
      let callCount = 0;
      mockSendMessageWithCallbacks.mockImplementation(
        async (content: string, callbacks: StreamCallbacks) => {
          callCount++;
          const text = callCount === 1 ? 'Normal response' : 'Response with HALT marker';
          callbacks.onTextChunk?.({
            sessionId: 'test-session',
            messageId: `msg-${callCount}`,
            content: text,
            done: true,
          });
          callbacks.onComplete?.({
            id: `resp-${callCount}`,
            sessionId: 'test-session',
            content: text,
            done: true,
            isError: false,
          });
          return { id: `resp-${callCount}`, sessionId: 'test-session', content: text, done: true, isError: false };
        }
      );

      const items = [
        createPromptItem('', { pauseword: 'HALT' }),
        createPromptItem('First'),
        createPromptItem('Second'),
      ];

      await queueService.start(items, 'test-project');

      // First prompt succeeds, second triggers pauseword
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(2); // stays at second prompt
    });
  });

  describe('TC-QR-13: Permission request auto-pauses execution', () => {
    it('should pause and store pending permission', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let _canUseToolFn: any;
      mockSendMessageWithCallbacks.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_content: string, callbacks: StreamCallbacks, _options: unknown, canUseTool: any) => {
          _canUseToolFn = canUseTool;
          // Call canUseTool — it will pause and wait for permission resolution
          const permPromise = canUseTool('Bash', { command: 'ls' }, { toolUseID: 'perm-1' });

          // Resolve permission after a tick (simulated by the test setup below)
          await permPromise;

          callbacks.onTextChunk?.({
            sessionId: 'test-session',
            messageId: 'msg-1',
            content: 'done',
            done: true,
          });
          callbacks.onComplete?.({
            id: 'resp-1',
            sessionId: 'test-session',
            content: 'done',
            done: true,
            isError: false,
          });
          return { id: 'resp-1', sessionId: 'test-session', content: 'done', done: true, isError: false };
        }
      );

      const items = [createPromptItem('Test')];
      const startPromise = queueService.start(items, 'test-project');

      // Wait for permission to be registered
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify paused state — permissions are now stored in stream.pendingPermissions
      expect(mockStreamPendingPermissions.has('perm-1')).toBe(true);
      expect(mockNotificationService.notifyQueueInputRequired).toHaveBeenCalled();

      // Resolve permission via stream's pendingPermissions
      mockStreamPendingPermissions.get('perm-1')?.resolve({ approved: true });

      await startPromise;
    });
  });

  describe('TC-QR-14: Execution resumes after permission response', () => {
    it('should continue execution after user responds to permission', async () => {
      mockSendMessageWithCallbacks.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_content: string, callbacks: StreamCallbacks, _options: unknown, canUseTool: any) => {
          const result = await canUseTool('Bash', { command: 'ls' }, { toolUseID: 'perm-2' });
          expect(result.behavior).toBe('allow');

          callbacks.onTextChunk?.({
            sessionId: 'test-session',
            messageId: 'msg-1',
            content: 'done',
            done: true,
          });
          callbacks.onComplete?.({
            id: 'resp-1',
            sessionId: 'test-session',
            content: 'done',
            done: true,
            isError: false,
          });
          return { id: 'resp-1', sessionId: 'test-session', content: 'done', done: true, isError: false };
        }
      );

      // Start queue and resolve permission after a tick
      const items = [createPromptItem('Test')];
      const startPromise = queueService.start(items, 'test-project');

      // Wait for permission to be registered in stream.pendingPermissions
      await new Promise(resolve => setTimeout(resolve, 10));
      mockStreamPendingPermissions.get('perm-2')?.resolve({ approved: true });

      await startPromise;

      const state = queueService.getState();
      expect(state.isRunning).toBe(false); // completed
    });
  });

  describe('TC-QR-15: SDK error auto-pauses and keeps currentIndex', () => {
    it('should pause on SDK error and not advance', async () => {
      mockSendMessageWithCallbacks.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const items = [createPromptItem('Test')];
      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(0);
      expect(state.pauseReason).toContain('SDK Error');
      expect(mockNotificationService.notifyQueueError).toHaveBeenCalled();

      // IMPL-001: queue:error event should be emitted
      const errorCalls = mockEmit.mock.calls.filter(([event]) => event === 'queue:error');
      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0][1]).toEqual(expect.objectContaining({
        itemIndex: 0,
        error: expect.stringContaining('SDK Error'),
      }));
    });
  });

  describe('TC-QR-16: Progress events emitted via Socket.io', () => {
    it('should emit to project room', async () => {
      const items = [createPromptItem('Test')];
      await queueService.start(items, 'test-project');

      expect(mockIo.to).toHaveBeenCalledWith('project:test-project');
      expect(mockEmit).toHaveBeenCalledWith('queue:progress', expect.objectContaining({
        status: 'running',
      }));
    });
  });

  describe('TC-QR-17: pause() / resume() / abort() control methods', () => {
    it('pause() sets isPauseRequested when item is executing', async () => {
      // Start a long-running queue
      mockSendMessageWithCallbacks.mockImplementation(() => new Promise(() => {})); // never resolves

      const items = [createPromptItem('Test')];
      const _startPromise = queueService.start(items, 'test-project');

      // Give start() time to begin
      await new Promise(resolve => setTimeout(resolve, 10));

      await queueService.pause();
      // When an item is actively executing, pause() defers via isPauseRequested
      // (isPaused is set when the current item completes)
      expect(queueService.getState().isPauseRequested).toBe(true);

      // Abort to clean up
      await queueService.abort();
      // Don't await _startPromise as it will never complete
    });

    it('abort() sets isRunning to false', async () => {
      mockSendMessageWithCallbacks.mockImplementation(() => new Promise(() => {}));

      const items = [createPromptItem('Test')];
      const _startPromise = queueService.start(items, 'test-project');

      await new Promise(resolve => setTimeout(resolve, 10));

      await queueService.abort();
      expect(queueService.getState().isRunning).toBe(false);
    });
  });

  describe('TC-QR-18: Queue notifications sent with correct categories', () => {
    it('should send start and complete notifications', async () => {
      const items = [createPromptItem('Test')];
      await queueService.start(items, 'test-project');

      expect(mockNotificationService.notifyQueueStart).toHaveBeenCalledWith(1, expect.any(String));
      expect(mockNotificationService.notifyQueueComplete).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('TC-QR-19: Queue notification respects category toggles', () => {
    it('should call notification methods (toggle check is in NotificationService)', async () => {
      const items = [createPromptItem('Test')];
      await queueService.start(items, 'test-project');

      // QueueService always calls notification methods;
      // the category toggle check happens inside NotificationService itself
      expect(mockNotificationService.notifyQueueStart).toHaveBeenCalled();
    });
  });

  describe('TC-QR-20: Mixed queue with multiple directive types', () => {
    it('should handle a queue with @new, @model, prompt, @pause', async () => {
      const items = [
        createPromptItem('', { modelName: 'haiku' }),
        createPromptItem('First prompt', { isNewSession: true }),
        createPromptItem('Pause', { isBreakpoint: true }),
        createPromptItem('After pause'),
      ];

      await queueService.start(items, 'test-project');

      // Should have executed 1 prompt, then paused at breakpoint
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(3); // past the @pause
    });
  });

  describe('TC-QR-21: Combined @new+prompt item creates new session AND executes prompt', () => {
    it('should create new session and execute prompt on same item', async () => {
      const items = [
        createPromptItem('Hello in new session', { isNewSession: true }),
      ];

      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('Hello in new session');
      const options = mockSendMessageWithCallbacks.mock.calls[0][2];
      expect(options.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('TC-QR-22: @pause followed by resume continues from next item', () => {
    it('should resume from the item after @pause, not re-execute @pause', async () => {
      const items = [
        createPromptItem('Break', { isBreakpoint: true }),
        createPromptItem('After break'),
      ];

      await queueService.start(items, 'test-project');

      expect(queueService.getState().isPaused).toBe(true);
      expect(queueService.getState().currentIndex).toBe(1);
      expect(mockSendMessageWithCallbacks).not.toHaveBeenCalled();

      // Resume
      await queueService.resume();

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('After break');
      expect(queueService.getState().isRunning).toBe(false); // completed
    });
  });

  describe('BS-2: Snippet expansion in executeItem', () => {
    beforeEach(() => {
      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should expand snippet into multiple items and execute all', async () => {
      setupMockChat();
      mockIsSnippetRef.mockImplementation((text: string) => text?.startsWith('%') ?? false);
      mockResolveSnippet.mockResolvedValue(['expanded one', 'expanded two']);

      const items = [createPromptItem('%my-snippet arg1')];
      await queueService.start(items, 'test-project');

      expect(mockResolveSnippet).toHaveBeenCalledWith('%my-snippet arg1', '/mock/project/path');
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('expanded one');
      expect(mockSendMessageWithCallbacks.mock.calls[1][0]).toBe('expanded two');
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('should not re-resolve snippet-expanded items (recursion prevention)', async () => {
      setupMockChat();
      // First call is a snippet ref, expanded items also start with %
      mockIsSnippetRef.mockImplementation((text: string) => text?.startsWith('%') ?? false);
      mockResolveSnippet.mockResolvedValue(['%still-percent one', '%still-percent two']);

      const items = [createPromptItem('%snippet')];
      await queueService.start(items, 'test-project');

      // resolveSnippet called only once (for original item), not for expanded items
      expect(mockResolveSnippet).toHaveBeenCalledTimes(1);
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('%still-percent one');
      expect(mockSendMessageWithCallbacks.mock.calls[1][0]).toBe('%still-percent two');
    });

    it('should pause with error on SnippetError', async () => {
      const { SnippetError } = await import('../../utils/snippetResolver.js');
      mockIsSnippetRef.mockImplementation((text: string) => text?.startsWith('%') ?? false);
      mockResolveSnippet.mockRejectedValue(new SnippetError('NOT_FOUND', 'Snippet file not found: missing'));

      const items = [createPromptItem('%missing')];
      await queueService.start(items, 'test-project');

      expect(queueService.getState().isPaused).toBe(true);
      expect(mockSendMessageWithCallbacks).not.toHaveBeenCalled();
    });

    it('should not resolve non-snippet prompts', async () => {
      setupMockChat();
      mockIsSnippetRef.mockReturnValue(false);

      const items = [createPromptItem('regular prompt')];
      await queueService.start(items, 'test-project');

      expect(mockResolveSnippet).not.toHaveBeenCalled();
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('regular prompt');
    });
  });

  // ===== BS-4: @loop execution tests =====

  describe('BS-4: @loop execution', () => {
    function createLoopItem(max: number, innerItems: QueueItem[], opts?: { until?: string; onExceed?: 'pause' | 'continue' }): QueueItem {
      return {
        prompt: '',
        isNewSession: false,
        loop: {
          max,
          until: opts?.until,
          onExceed: opts?.onExceed ?? 'pause',
          items: innerItems,
        },
      };
    }

    it('simple loop (max=3, no until): inner items execute exactly 3 times', async () => {
      setupMockChat();
      const items = [createLoopItem(3, [createPromptItem('do work')])];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++) {
        expect(mockSendMessageWithCallbacks.mock.calls[i][0]).toBe('do work');
      }
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('simple loop (max=1, no until): inner items execute exactly once', async () => {
      setupMockChat();
      const items = [createLoopItem(1, [createPromptItem('once')])];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('once');
    });

    it('loop with until: exits early when token found in response', async () => {
      let callCount = 0;
      mockSendMessageWithCallbacks.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_content: string, callbacks: any) => {
          callCount++;
          const text = callCount >= 2 ? 'Result: SUCCESS found' : 'Still working...';
          callbacks.onTextChunk?.({ sessionId: 'test-session', messageId: 'msg-1', content: text, done: true });
          callbacks.onComplete?.({ id: 'resp-1', sessionId: 'test-session', content: text, done: true, isError: false });
          return { id: 'resp-1', sessionId: 'test-session', content: text, done: true, isError: false };
        }
      );

      const items = [createLoopItem(10, [createPromptItem('check')], { until: 'SUCCESS' })];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2); // Exits on 2nd iteration
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('loop with until + on_exceed="pause": pauseWithError on max exceeded', async () => {
      setupMockChat('no token here');
      const items = [createLoopItem(2, [createPromptItem('check')], { until: 'TOKEN', onExceed: 'pause' })];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.lastError?.error).toContain('Loop max');
      expect(mockNotificationService.notifyQueueError).toHaveBeenCalled();
    });

    it('loop with until + on_exceed="continue": continues to next item on max', async () => {
      setupMockChat('no token here');
      const items = [
        createLoopItem(2, [createPromptItem('check')], { until: 'TOKEN', onExceed: 'continue' }),
        createPromptItem('after loop'),
      ];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(3); // 2 loop + 1 after
      expect(mockSendMessageWithCallbacks.mock.calls[2][0]).toBe('after loop');
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('@pauseword inside loop pauses immediately (takes precedence over until)', async () => {
      setupMockChat('response with STOP word');
      const items = [createLoopItem(5, [
        { prompt: '', isNewSession: false, pauseword: 'STOP' },
        createPromptItem('do work'),
      ], { until: 'DONE' })];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.lastError?.error).toContain('Pauseword');
    });

    it('replaceItems during loop pause resets loop state', async () => {
      // Create a loop that will pause (on_exceed)
      setupMockChat('no token');
      const loopItem = createLoopItem(1, [createPromptItem('check')], { until: 'TOKEN', onExceed: 'pause' });
      await queueService.start([loopItem, createPromptItem('after')], 'test-project');

      expect(queueService.getState().isPaused).toBe(true);

      // Simulate edit mode
      queueService.editStart('test-socket');

      // Replace with new items — should reset loop
      const newItems = [createPromptItem('new item')];
      const replaced = queueService.replaceItems(newItems, 'test-socket');
      expect(replaced).toBe(true);

      // Resume — should execute new items, not re-enter loop
      setupMockChat();
      await queueService.resume();
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledWith('new item', expect.anything(), expect.anything(), expect.anything());
    });

    it('addItem rejects loop items', async () => {
      setupMockChat();
      const items = [createPromptItem('first')];
      await queueService.start(items, 'test-project');

      // Try to add a loop item (start a new run first since previous completed)
      mockSendMessageWithCallbacks.mockImplementation(() => new Promise(() => {})); // Never resolve
      const _startPromise = queueService.start([createPromptItem('running')], 'test-project');
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = queueService.addItem(createLoopItem(3, [createPromptItem('inner')]));
      expect(result).toBe(false);

      await queueService.abort();
    });

    it('loop progress events are emitted correctly', async () => {
      setupMockChat();
      const items = [createLoopItem(2, [createPromptItem('work'), createPromptItem('check')])];
      await queueService.start(items, 'test-project');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const progressCalls = mockEmit.mock.calls.filter(([event]: any) => event === 'queue:progress');
      const loopProgressEvents = progressCalls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(([, data]: any) => data.loopProgress)
        .filter(Boolean);

      expect(loopProgressEvents.length).toBeGreaterThan(0);
      // Should have loopProgress with iteration, max, innerIndex, innerTotal
      expect(loopProgressEvents[0]).toEqual(expect.objectContaining({
        max: 2,
        innerTotal: 2,
      }));
    });

    it('loop with until + last inner item is non-prompt: until check skipped', async () => {
      let _callCount = 0;
      mockSendMessageWithCallbacks.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_content: string, callbacks: any) => {
          _callCount++;
          // Always return the until token — but last item is @pause, so until should be skipped
          const text = 'Result: DONE';
          callbacks.onTextChunk?.({ sessionId: 'test-session', messageId: 'msg-1', content: text, done: true });
          callbacks.onComplete?.({ id: 'resp-1', sessionId: 'test-session', content: text, done: true, isError: false });
          return { id: 'resp-1', sessionId: 'test-session', content: text, done: true, isError: false };
        }
      );

      // Last inner item is @pause (non-prompt) — until check should be skipped
      const items = [createLoopItem(2, [
        createPromptItem('check'),
        { prompt: '', isNewSession: false, delayMs: 1 }, // Non-prompt last item
      ], { until: 'DONE', onExceed: 'continue' })];
      await queueService.start(items, 'test-project');

      // Should run all 2 iterations because until check is skipped (last item is non-prompt)
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('on_exceed="pause" resume: execution continues to item after loop', async () => {
      setupMockChat('no token');
      const items = [
        createLoopItem(1, [createPromptItem('check')], { until: 'TOKEN', onExceed: 'pause' }),
        createPromptItem('after loop'),
      ];
      await queueService.start(items, 'test-project');

      expect(queueService.getState().isPaused).toBe(true);

      // Resume — should continue to 'after loop'
      setupMockChat('after response');
      await queueService.resume();

      const lastCall = mockSendMessageWithCallbacks.mock.calls[mockSendMessageWithCallbacks.mock.calls.length - 1];
      expect(lastCall[0]).toBe('after loop');
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('loop with multiple inner items executes all per iteration', async () => {
      setupMockChat();
      const items = [createLoopItem(2, [
        createPromptItem('step 1'),
        createPromptItem('step 2'),
        createPromptItem('step 3'),
      ])];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(6); // 3 items × 2 iterations
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('step 1');
      expect(mockSendMessageWithCallbacks.mock.calls[1][0]).toBe('step 2');
      expect(mockSendMessageWithCallbacks.mock.calls[2][0]).toBe('step 3');
      expect(mockSendMessageWithCallbacks.mock.calls[3][0]).toBe('step 1');
      expect(mockSendMessageWithCallbacks.mock.calls[4][0]).toBe('step 2');
      expect(mockSendMessageWithCallbacks.mock.calls[5][0]).toBe('step 3');
    });

    it('loop with until + max=1: token not found applies on_exceed immediately', async () => {
      setupMockChat('no match');
      const items = [createLoopItem(1, [createPromptItem('check')], { until: 'TOKEN', onExceed: 'pause' })];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(1);
      expect(queueService.getState().isPaused).toBe(true);
      expect(queueService.getState().lastError?.error).toContain('Loop max');
    });

    it('items before and after loop execute normally', async () => {
      setupMockChat();
      const items = [
        createPromptItem('before'),
        createLoopItem(2, [createPromptItem('loop body')]),
        createPromptItem('after'),
      ];
      await queueService.start(items, 'test-project');

      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(4); // 1 + 2 + 1
      expect(mockSendMessageWithCallbacks.mock.calls[0][0]).toBe('before');
      expect(mockSendMessageWithCallbacks.mock.calls[1][0]).toBe('loop body');
      expect(mockSendMessageWithCallbacks.mock.calls[2][0]).toBe('loop body');
      expect(mockSendMessageWithCallbacks.mock.calls[3][0]).toBe('after');
      expect(queueService.getState().isCompleted).toBe(true);
    });

    it('notifyQueueError called on max exceeded with on_exceed="pause"', async () => {
      setupMockChat('no token');
      const items = [createLoopItem(1, [createPromptItem('check')], { until: 'DONE', onExceed: 'pause' })];
      await queueService.start(items, 'test-project');

      expect(mockNotificationService.notifyQueueError).toHaveBeenCalledWith(
        expect.stringContaining('Loop max'),
        expect.any(String),
      );
    });

    it('notifyQueueComplete when loop completes normally as part of queue', async () => {
      setupMockChat();
      const items = [createLoopItem(2, [createPromptItem('work')])];
      await queueService.start(items, 'test-project');

      expect(mockNotificationService.notifyQueueComplete).toHaveBeenCalled();
    });
  });
});
