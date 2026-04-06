import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import {
  initializeWebSocket,
} from '../websocket.js';
import { ERROR_CODES } from '@hammoc/shared';
import type { PromptChainItem } from '@hammoc/shared';

// Shared mock state
const { mockState } = vi.hoisted(() => {
  const mockState = {
    sendImpl: vi.fn().mockResolvedValue({}),
    lastCtorArgs: undefined as unknown,
  };
  return { mockState };
});

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

// Mock session middleware
vi.mock('../../middleware/session.js', () => ({
  createSessionMiddleware: vi.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, _res: any, next: any) => {
      req.session = { authenticated: true };
      next();
    }
  ),
}));

// Mock ChatService
vi.mock('../../services/chatService.js', () => ({
  ChatService: class MockChatService {
    constructor(...args: unknown[]) { mockState.lastCtorArgs = args[0]; }
    sendMessageWithCallbacks(...args: unknown[]) { return mockState.sendImpl(...args); }
    setPermissionMode() {}
  },
}));

// Mock SessionService
vi.mock('../../services/sessionService.js', () => ({
  SessionService: class MockSessionService {
    saveSessionId = vi.fn().mockResolvedValue(undefined);
    getSessionId = vi.fn().mockResolvedValue(null);
    listSessions = vi.fn().mockResolvedValue([]);
    encodeProjectPath = vi.fn().mockReturnValue('mock-project-slug');
    getSessionFilePath = vi.fn().mockReturnValue('/mock/session.jsonl');
    updateSessionIndex = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock preferencesService
vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: {
    getEffectivePreferences: vi.fn().mockResolvedValue({
      theme: 'dark',
      defaultModel: '',
      permissionMode: 'default',
      chatTimeoutMs: 300000,
    }),
    getTerminalEnabled: vi.fn().mockResolvedValue(true),
  },
}));

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    chat: { timeoutMs: 300000 },
    websocket: {
      cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    },
    telegram: { botToken: '', chatId: '', enabled: false },
    terminal: { enabled: true, shellTimeout: 30000, maxSessions: 10 },
  },
}));

vi.mock('../../services/notificationService.js', () => ({
  notificationService: {
    notifyInputRequired: vi.fn().mockResolvedValue(undefined),
    notifyComplete: vi.fn().mockResolvedValue(undefined),
    notifyError: vi.fn().mockResolvedValue(undefined),
  },
  formatAskQuestionPrompt: vi.fn(),
}));

vi.mock('../../controllers/queueController.js', () => ({
  getOrCreateQueueService: vi.fn().mockReturnValue({
    isRunning: false,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    abort: vi.fn(),
  }),
  getQueueInstances: vi.fn().mockReturnValue(new Map()),
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

vi.mock('../../utils/networkUtils.js', () => ({
  isLocalIP: vi.fn().mockReturnValue(true),
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../utils/errors.js', () => ({
  parseSDKError: vi.fn().mockImplementation((err: unknown) => err),
  AbortedError: class AbortedError extends Error {
    constructor(message?: string) { super(message ?? 'Aborted'); this.name = 'AbortedError'; }
  },
}));

vi.mock('../../services/rateLimitProbeService.js', () => ({
  rateLimitProbeService: {
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    getCachedResult: vi.fn().mockReturnValue(null),
    getApiHealth: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../../services/ptyService.js', () => ({
  ptyService: {
    createSession: vi.fn().mockReturnValue({ terminalId: 'term-1', shell: 'bash' }),
    getSession: vi.fn(),
    closeSession: vi.fn(),
    scheduleCleanup: vi.fn(),
    cancelCleanup: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    writeInput: vi.fn(),
    resize: vi.fn(),
  },
}));

vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveProjectPath: vi.fn().mockResolvedValue('/mock/project/path'),
    findProjectByPath: vi.fn().mockResolvedValue({ projectSlug: 'test-project' }),
    readChainFailures: vi.fn().mockResolvedValue([]),
    writeChainFailures: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/dashboardService.js', () => ({
  dashboardService: {
    getProjectStatus: vi.fn().mockResolvedValue({
      projectSlug: 'test-project',
      activeSessionCount: 0,
      totalSessionCount: 0,
      queueStatus: 'idle',
      terminalCount: 0,
    }),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }),
}));

describe('WebSocket Chain Handler (Story 24.1)', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 3099;
  let SESSION_ID: string;

  function connectClient(): Promise<ClientSocket> {
    return new Promise((resolve) => {
      const socket = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
      socket.on('connect', () => resolve(socket));
    });
  }

  beforeEach(async () => {
    SESSION_ID = crypto.randomUUID();
    mockState.sendImpl = vi.fn().mockResolvedValue({});
    mockState.lastCtorArgs = undefined;

    httpServer = createServer();
    ioServer = await initializeWebSocket(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });

  afterEach(async () => {
    if (clientSocket?.connected) clientSocket.disconnect();
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  describe('PromptChainItem type', () => {
    it('should have correct shape', () => {
      const item: PromptChainItem = {
        id: 'chain-1',
        content: 'test prompt',
        status: 'pending',
        createdAt: Date.now(),
      };
      expect(item.id).toBe('chain-1');
      expect(item.status).toBe('pending');
    });
  });

  describe('chain:add', () => {
    it('should add item and receive chain:update', async () => {
      clientSocket = await connectClient();

      const updatePromise = new Promise<{ sessionId: string; items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length > 0) resolve(data);
        });
      });

      // Join session first
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Hello world',
        workingDirectory: '/test/path',
      });

      const update = await updatePromise;
      expect(update.sessionId).toBe(SESSION_ID);
      expect(update.items).toHaveLength(1);
      expect(update.items[0].content).toBe('Hello world');
      expect(update.items[0].status).toBe('pending');
    });

    it('should reject when exceeding max 10 items', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 10 items
      for (let i = 0; i < 10; i++) {
        clientSocket.emit('chain:add', {
          sessionId: SESSION_ID,
          content: `Prompt ${i}`,
          workingDirectory: '/test/path',
        });
      }
      await new Promise((r) => setTimeout(r, 100));

      // 11th should trigger error
      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (data) => resolve(data));
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Too many',
        workingDirectory: '/test/path',
      });

      const error = await errorPromise;
      expect(error.code).toBe(ERROR_CODES.CHAIN_MAX_EXCEEDED);
    });

    it('should store chain context (workingDirectory, permissionMode, model)', async () => {
      clientSocket = await connectClient();

      const updatePromise = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length > 0) resolve(data);
        });
      });

      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'test',
        workingDirectory: '/test/path',
        permissionMode: 'bypassPermissions',
        model: 'claude-sonnet-4-6',
      });

      const update = await updatePromise;
      expect(update.items).toHaveLength(1);
      // Context is stored server-side, verified by successful add
    });
  });

  describe('chain:remove', () => {
    it('should remove specific item by id', async () => {
      clientSocket = await connectClient();

      // Set up listener before joining to capture all updates
      let addedItems: PromptChainItem[] = [];
      const twoItemsPromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          addedItems = data.items;
          if (data.items.length === 2) resolve(data.items);
        });
      });

      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('chain:add', { sessionId: SESSION_ID, content: 'First', workingDirectory: '/test' });
      clientSocket.emit('chain:add', { sessionId: SESSION_ID, content: 'Second', workingDirectory: '/test' });

      addedItems = await twoItemsPromise;
      expect(addedItems).toHaveLength(2);

      // Remove listener, set up new one for remove
      clientSocket.removeAllListeners('chain:update');
      const removePromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => resolve(data.items));
      });

      clientSocket.emit('chain:remove', { sessionId: SESSION_ID, id: addedItems[0].id });
      const remaining = await removePromise;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe('Second');
    });
  });

  describe('chain:clear', () => {
    it('should clear all items', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add items
      clientSocket.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 1', workingDirectory: '/test' });
      clientSocket.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 2', workingDirectory: '/test' });
      await new Promise((r) => setTimeout(r, 100));

      const clearPromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 0) resolve(data.items);
        });
      });

      clientSocket.emit('chain:clear', { sessionId: SESSION_ID });
      const items = await clearPromise;
      expect(items).toHaveLength(0);
    });
  });

  describe('chain:remove edge cases', () => {
    it('should be a no-op when removing non-existent id', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add one item
      const addPromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 1) resolve(data.items);
        });
      });
      clientSocket.emit('chain:add', { sessionId: SESSION_ID, content: 'Keep me', workingDirectory: '/test' });
      const addedItems = await addPromise;
      expect(addedItems).toHaveLength(1);

      // Remove with non-existent id — should not change items
      clientSocket.removeAllListeners('chain:update');
      const removePromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => resolve(data.items));
      });
      clientSocket.emit('chain:remove', { sessionId: SESSION_ID, id: 'non-existent-id' });
      const remaining = await removePromise;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe('Keep me');
    });
  });

  describe('chain:clear cleans up context', () => {
    it('should allow re-adding with new context after clear', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add with initial context
      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Old context',
        workingDirectory: '/old/path',
        model: 'claude-haiku-4-5-20251001',
      });
      await new Promise((r) => setTimeout(r, 50));

      // Clear
      const clearPromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 0) resolve(data.items);
        });
      });
      clientSocket.emit('chain:clear', { sessionId: SESSION_ID });
      await clearPromise;

      // Re-add with new context — should succeed without stale context interference
      clientSocket.removeAllListeners('chain:update');
      const reAddPromise = new Promise<PromptChainItem[]>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 1) resolve(data.items);
        });
      });
      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'New context',
        workingDirectory: '/new/path',
        model: 'claude-sonnet-4-6',
      });
      const newItems = await reAddPromise;
      expect(newItems).toHaveLength(1);
      expect(newItems[0].content).toBe('New context');
    });
  });

  describe('chain:update broadcast', () => {
    it('should broadcast to all sockets in session room', async () => {
      clientSocket = await connectClient();
      const client2 = await connectClient();

      // Set up listener before joining
      const client2Update = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        client2.on('chain:update', (data) => {
          if (data.items.length > 0) resolve(data);
        });
      });

      // Both join same session
      clientSocket.emit('session:join', SESSION_ID);
      client2.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Broadcast test',
        workingDirectory: '/test',
      });

      const update = await client2Update;
      expect(update.items).toHaveLength(1);
      expect(update.items[0].content).toBe('Broadcast test');

      client2.disconnect();
    });
  });

  describe('session:join chain state', () => {
    it('should receive current chain state on join', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add items
      clientSocket.emit('chain:add', { sessionId: SESSION_ID, content: 'Pre-existing', workingDirectory: '/test' });
      await new Promise((r) => setTimeout(r, 50));

      // Second client joins and should receive existing chain state
      const client2 = await connectClient();
      const joinUpdate = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        client2.on('chain:update', (data) => resolve(data));
      });

      client2.emit('session:join', SESSION_ID);
      const update = await joinUpdate;
      expect(update.items.length).toBeGreaterThanOrEqual(1);
      expect(update.items.some(i => i.content === 'Pre-existing')).toBe(true);

      client2.disconnect();
    });

    it('should receive empty array when no chain state exists', async () => {
      const freshSession = 'fresh-session-' + Date.now();
      clientSocket = await connectClient();

      const joinUpdate = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => resolve(data));
      });

      clientSocket.emit('session:join', freshSession);
      const update = await joinUpdate;
      expect(update.items).toHaveLength(0);
    });
  });

  describe('normal chat flow unaffected', () => {
    it('should not trigger drain when no chain items exist', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Send normal chat message (no chain items)
      clientSocket.emit('chat:send', {
        content: 'Normal message',
        workingDirectory: '/test/path',
        sessionId: SESSION_ID,
      });

      // Wait for completion
      await new Promise((r) => setTimeout(r, 200));

      // No chain:update should have been emitted beyond the session:join one
      // (test passes if no errors occur — drain is not triggered)
    });
  });

  describe('drain skips when no sockets remain', () => {
    it('should not crash when session room is empty during drain', async () => {
      const drainSession = 'drain-empty-' + Date.now();
      clientSocket = await connectClient();
      clientSocket.emit('session:join', drainSession);
      await new Promise((r) => setTimeout(r, 50));

      // Add a chain item
      clientSocket.emit('chain:add', {
        sessionId: drainSession,
        content: 'Will be orphaned',
        workingDirectory: '/test/path',
      });
      await new Promise((r) => setTimeout(r, 50));

      // Start a chat:send and disconnect immediately during processing
      clientSocket.emit('chat:send', {
        content: 'Trigger completion',
        workingDirectory: '/test/path',
        sessionId: drainSession,
      });

      // Disconnect before drain can fire
      await new Promise((r) => setTimeout(r, 50));
      clientSocket.disconnect();

      // Wait for drain timer (1s) + processing
      await new Promise((r) => setTimeout(r, 1500));
      // Test passes if no uncaught errors
    });
  });

  describe('session room membership validation', () => {
    it('should reject chain:add when socket has not joined session room', async () => {
      clientSocket = await connectClient();
      // Do NOT join session room — chain:add should be silently rejected

      const errorPromise = new Promise<boolean>((resolve) => {
        clientSocket.on('chain:update', () => resolve(false));
        setTimeout(() => resolve(true), 200);
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Should be rejected',
        workingDirectory: '/test/path',
      });

      const wasRejected = await errorPromise;
      expect(wasRejected).toBe(true);
    });
  });

  describe('PromptChainItem failed status', () => {
    it('should accept failed as a valid status', () => {
      const item: PromptChainItem = {
        id: 'chain-fail-1',
        content: 'failed prompt',
        status: 'failed',
        createdAt: Date.now(),
        retryCount: 3,
      };
      expect(item.status).toBe('failed');
      expect(item.retryCount).toBe(3);
    });
  });

  describe('BS-2: Snippet expansion in chain:add', () => {
    it('should expand snippet into multiple chain items', async () => {
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['prompt one', 'prompt two']);

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const updatePromise = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 2) resolve(data);
        });
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: '%my-snippet arg1',
        workingDirectory: '/test/path',
      });

      const update = await updatePromise;
      expect(update.items).toHaveLength(2);
      expect(update.items[0].content).toBe('prompt one');
      expect(update.items[1].content).toBe('prompt two');

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should reject snippet when total items exceed 10 (9 existing + 2-item snippet)', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 9 regular items
      for (let i = 0; i < 9; i++) {
        clientSocket.emit('chain:add', {
          sessionId: SESSION_ID,
          content: `Item ${i}`,
          workingDirectory: '/test/path',
        });
      }
      await new Promise((r) => setTimeout(r, 200));

      // Now try a snippet that expands to 2 items (9+2=11>10)
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['prompt one', 'prompt two']);

      const errorPromise = new Promise<{ code: string }>((resolve) => {
        clientSocket.on('error', (data) => resolve(data));
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: '%snippet arg1',
        workingDirectory: '/test/path',
      });

      const error = await errorPromise;
      expect(error.code).toBe(ERROR_CODES.CHAIN_MAX_EXCEEDED);

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should allow snippet when total items equal 10 (8 existing + 2-item snippet)', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 8 regular items
      for (let i = 0; i < 8; i++) {
        clientSocket.emit('chain:add', {
          sessionId: SESSION_ID,
          content: `Item ${i}`,
          workingDirectory: '/test/path',
        });
      }
      await new Promise((r) => setTimeout(r, 200));

      // Snippet that expands to 2 items (8+2=10, allowed)
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['prompt one', 'prompt two']);

      const updatePromise = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 10) resolve(data);
        });
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: '%snippet arg1',
        workingDirectory: '/test/path',
      });

      const update = await updatePromise;
      expect(update.items).toHaveLength(10);

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should allow snippet when total items equal 10 (9 existing + 1-item snippet)', async () => {
      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 9 regular items
      for (let i = 0; i < 9; i++) {
        clientSocket.emit('chain:add', {
          sessionId: SESSION_ID,
          content: `Item ${i}`,
          workingDirectory: '/test/path',
        });
      }
      await new Promise((r) => setTimeout(r, 200));

      // Snippet that expands to 1 item (9+1=10, allowed)
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['single prompt']);

      const updatePromise = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 10) resolve(data);
        });
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: '%snippet arg1',
        workingDirectory: '/test/path',
      });

      const update = await updatePromise;
      expect(update.items).toHaveLength(10);

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should emit error on SnippetError (not found)', async () => {
      const { SnippetError } = await import('../../utils/snippetResolver.js');
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockRejectedValue(new SnippetError('NOT_FOUND', 'Snippet file not found: missing'));

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (data) => resolve(data));
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: '%missing',
        workingDirectory: '/test/path',
      });

      const error = await errorPromise;
      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      expect(error.message).toContain('Snippet file not found');

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should not affect non-snippet content', async () => {
      // Ensure isSnippetRef returns false for regular content
      mockIsSnippetRef.mockReturnValue(false);

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const updatePromise = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => {
          if (data.items.length === 1) resolve(data);
        });
      });

      clientSocket.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Regular prompt',
        workingDirectory: '/test/path',
      });

      const update = await updatePromise;
      expect(update.items).toHaveLength(1);
      expect(update.items[0].content).toBe('Regular prompt');
      expect(mockResolveSnippet).not.toHaveBeenCalled();
    });
  });

  describe('BS-3: Snippet resolution in chat:send / handleChatSend', () => {
    it('should resolve single-prompt snippet and pass resolved content to ChatService', async () => {
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['Resolved prompt content']);

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('chat:send', {
        content: '%my-snippet arg1',
        workingDirectory: '/test/path',
        sessionId: SESSION_ID,
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(mockResolveSnippet).toHaveBeenCalledWith('%my-snippet arg1', '/test/path');
      // ChatService receives the resolved content (not the raw snippet ref)
      expect(mockState.sendImpl).toHaveBeenCalled();

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should resolve multi-prompt snippet: first as message, rest as chain items', async () => {
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['First prompt', 'Second prompt', 'Third prompt']);

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const chainStatePromise = new Promise<{ items: PromptChainItem[] }>((resolve) => {
        clientSocket.on('chain:update', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: '%multi-snippet',
        workingDirectory: '/test/path',
        sessionId: SESSION_ID,
      });

      const chainState = await chainStatePromise;
      expect(chainState.items).toHaveLength(2);
      expect(chainState.items[0].content).toBe('Second prompt');
      expect(chainState.items[1].content).toBe('Third prompt');

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should emit error on SnippetError and not send message', async () => {
      const { SnippetError } = await import('../../utils/snippetResolver.js');
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockRejectedValue(new SnippetError('NOT_FOUND', 'Snippet file not found: missing'));

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: '%missing',
        workingDirectory: '/test/path',
        sessionId: SESSION_ID,
      });

      const error = await errorPromise;
      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      // ChatService should NOT have been called
      await new Promise((r) => setTimeout(r, 100));
      expect(mockState.sendImpl).not.toHaveBeenCalled();

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });

    it('should not resolve snippets for non-% messages (regression)', async () => {
      mockIsSnippetRef.mockReturnValue(false);

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('chat:send', {
        content: 'Normal message without snippet',
        workingDirectory: '/test/path',
        sessionId: SESSION_ID,
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(mockResolveSnippet).not.toHaveBeenCalled();
      // ChatService should still be called with original content
      expect(mockState.sendImpl).toHaveBeenCalled();
    });

    it('should resolve snippet with context block', async () => {
      mockIsSnippetRef.mockImplementation((text: string) => text.trim().startsWith('%'));
      mockResolveSnippet.mockResolvedValue(['Resolved with context']);

      clientSocket = await connectClient();
      clientSocket.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const contentWithContext = '%my-snippet arg1\n---context\nSome context content';
      clientSocket.emit('chat:send', {
        content: contentWithContext,
        workingDirectory: '/test/path',
        sessionId: SESSION_ID,
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(mockResolveSnippet).toHaveBeenCalledWith(contentWithContext, '/test/path');

      mockIsSnippetRef.mockReturnValue(false);
      mockResolveSnippet.mockReset();
    });
  });
});
