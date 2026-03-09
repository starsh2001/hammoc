/**
 * QueueService Tests
 * Story 15.2: Queue Runner Engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ChatService constructor — must use regular function (not arrow) for `new`
const mockSendMessageWithCallbacks = vi.fn();
vi.mock('../chatService.js', () => ({
  ChatService: vi.fn().mockImplementation(function (this: any) {
    this.sendMessageWithCallbacks = mockSendMessageWithCallbacks;
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
        'queue.error.queueStopDetected': 'QUEUE_STOP detected in response',
        'queue.error.sessionNotFound': `Session not found: ${opts?.value || 'unknown'}`,
        'queue.error.sessionBusy': 'Session is busy',
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
  buildStreamCallbacks: vi.fn().mockImplementation((_deps: any, hooks?: any) => {
    const sessionIdRef = { current: undefined as string | undefined };
    const callbacks = {
      onSessionInit: vi.fn(),
      // onTextChunk must invoke onTextChunkReceived hook for QUEUE_STOP/QUEUE_PASS marker detection
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

// Mock websocket exports used by QueueService (ActiveStream pattern)
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
  updateSessionName: vi.fn().mockResolvedValue(undefined),
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
    queueService = new QueueService(
      mockProjectService as any,
      mockNotificationService as any,
      mockPreferencesService as any,
      mockIo as any
    );
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

  describe('TC-QR-5: @save calls projectService.updateSessionName', () => {
    it('should call updateSessionName with correct args', async () => {
      const items = [
        createPromptItem('', { saveSessionName: 'my-save' }),
      ];

      await queueService.start(items, 'test-project', 'existing-session');

      expect(mockProjectService.updateSessionName).toHaveBeenCalledWith(
        'test-project', 'existing-session', 'my-save'
      );
    });
  });

  describe('TC-QR-6: @load performs reverse name lookup and sets sessionId', () => {
    it('should set sessionId from session-names.json reverse lookup', async () => {
      mockProjectService.readSessionNamesBySlug.mockResolvedValueOnce({
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
      mockProjectService.readSessionNamesBySlug.mockResolvedValueOnce({});

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

  describe('TC-QR-11: QUEUE_STOP in response pauses and keeps currentIndex', () => {
    it('should pause and not advance on QUEUE_STOP', async () => {
      setupMockChat('Some text QUEUE_STOP here');

      const items = [createPromptItem('Check')];

      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isPaused).toBe(true);
      expect(state.currentIndex).toBe(0); // stays at failed item
      expect(state.pauseReason).toContain('QUEUE_STOP');
      expect(mockNotificationService.notifyQueueError).toHaveBeenCalledWith(
        'QUEUE_STOP detected in response',
        expect.any(String)
      );

      // IMPL-001: queue:error event should be emitted
      const errorCalls = mockEmit.mock.calls.filter(([event]) => event === 'queue:error');
      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0][1]).toEqual(expect.objectContaining({
        itemIndex: 0,
        error: expect.stringContaining('QUEUE_STOP'),
      }));
    });
  });

  describe('TC-QR-12: QUEUE_PASS in response proceeds normally', () => {
    it('should advance on QUEUE_PASS', async () => {
      setupMockChat('Result QUEUE_PASS done');

      const items = [
        createPromptItem('Check'),
        createPromptItem('Next'),
      ];

      // Reset to handle both calls
      let callCount = 0;
      mockSendMessageWithCallbacks.mockImplementation(
        async (content: string, callbacks: StreamCallbacks) => {
          callCount++;
          const text = callCount === 1 ? 'Result QUEUE_PASS done' : 'Normal response';
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

      await queueService.start(items, 'test-project');

      const state = queueService.getState();
      expect(state.isRunning).toBe(false); // completed
      expect(mockSendMessageWithCallbacks).toHaveBeenCalledTimes(2);
    });
  });

  describe('TC-QR-13: Permission request auto-pauses execution', () => {
    it('should pause and store pending permission', async () => {
      let canUseToolFn: any;
      mockSendMessageWithCallbacks.mockImplementation(
        async (_content: string, callbacks: StreamCallbacks, _options: unknown, canUseTool: any) => {
          canUseToolFn = canUseTool;
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
    it('pause() sets isPaused', async () => {
      // Start a long-running queue
      mockSendMessageWithCallbacks.mockImplementation(() => new Promise(() => {})); // never resolves

      const items = [createPromptItem('Test')];
      const startPromise = queueService.start(items, 'test-project');

      // Give start() time to begin
      await new Promise(resolve => setTimeout(resolve, 10));

      await queueService.pause();
      expect(queueService.getState().isPaused).toBe(true);

      // Abort to clean up
      await queueService.abort();
      // Don't await startPromise as it will never complete
    });

    it('abort() sets isRunning to false', async () => {
      mockSendMessageWithCallbacks.mockImplementation(() => new Promise(() => {}));

      const items = [createPromptItem('Test')];
      const startPromise = queueService.start(items, 'test-project');

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
});
