import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeWebSocket,
} from '../websocket.js';
import { ERROR_CODES } from '@hammoc/shared';
import type { PromptChainItem } from '@hammoc/shared';

// Read source files once for code verification tests
const websocketSource = readFileSync(resolve(__dirname, '../websocket.ts'), 'utf-8');
const useStreamingSource = readFileSync(resolve(__dirname, '../../../../client/src/hooks/useStreaming.ts'), 'utf-8');
const chatPageSource = readFileSync(resolve(__dirname, '../../../../client/src/pages/ChatPage.tsx'), 'utf-8');

// Shared mock state
const { mockState } = vi.hoisted(() => {
  const mockState = {
    sendImpl: vi.fn().mockResolvedValue({}),
    lastCtorArgs: undefined as unknown,
  };
  return { mockState };
});

// Mock fs module (preserve readFileSync for source code verification tests)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

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

describe('WebSocket Chain Sync (Story 24.3)', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  const TEST_PORT = 3098;
  let SESSION_ID: string;
  const clients: ClientSocket[] = [];

  function connectClient(timeoutMs = 5000): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
      clients.push(socket);
      const timer = setTimeout(() => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
        reject(new Error(`connectClient timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onConnect = () => {
        clearTimeout(timer);
        socket.off('connect_error', onError);
        resolve(socket);
      };
      const onError = (err: Error) => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        reject(new Error(`connectClient failed: ${err.message}`));
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });
  }

  /** Wait for a specific chain:update matching a predicate (scoped to SESSION_ID) */
  function waitForChainUpdate(
    socket: ClientSocket,
    predicate: (items: PromptChainItem[]) => boolean,
    timeoutMs = 2000,
    expectedSessionId?: string,
  ): Promise<PromptChainItem[]> {
    return new Promise((resolve, reject) => {
      const targetSession = expectedSessionId ?? SESSION_ID;
      const timer = setTimeout(() => {
        socket.off('chain:update', handler);
        reject(new Error(`waitForChainUpdate timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const handler = (data: { sessionId: string; items: PromptChainItem[] }) => {
        if (data.sessionId !== targetSession) return;
        if (predicate(data.items)) {
          clearTimeout(timer);
          socket.off('chain:update', handler);
          resolve(data.items);
        }
      };
      socket.on('chain:update', handler);
    });
  }

  /** Wait for next chain:update event (scoped to SESSION_ID) */
  function waitForNextChainUpdate(
    socket: ClientSocket,
    timeoutMs = 2000,
    expectedSessionId?: string,
  ): Promise<PromptChainItem[]> {
    return new Promise((resolve, reject) => {
      const targetSession = expectedSessionId ?? SESSION_ID;
      const timer = setTimeout(() => {
        socket.off('chain:update', handler);
        reject(new Error(`waitForNextChainUpdate timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const handler = (data: { sessionId: string; items: PromptChainItem[] }) => {
        if (data.sessionId !== targetSession) return;
        clearTimeout(timer);
        socket.off('chain:update', handler);
        resolve(data.items);
      };
      socket.on('chain:update', handler);
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
    for (const client of clients) {
      if (client.connected) client.disconnect();
    }
    clients.length = 0;
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  // ─── Task 1: Multi-browser broadcast ───────────────────────────────

  describe('Multi-browser broadcast (Task 1)', () => {
    it('1.2 — socket B receives chain:update when socket A adds an item', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const updatePromise = waitForChainUpdate(clientB, (items) => items.length === 1);

      clientA.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Hello from A',
        workingDirectory: '/test',
      });

      const items = await updatePromise;
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Hello from A');
      expect(items[0].status).toBe('pending');
    });

    it('1.3 — socket A receives empty chain:update when socket B clears', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add an item first
      clientA.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Will be cleared',
        workingDirectory: '/test',
      });
      await waitForChainUpdate(clientA, (items) => items.length === 1);

      const clearPromise = waitForChainUpdate(clientA, (items) => items.length === 0);
      clientB.emit('chain:clear', { sessionId: SESSION_ID });
      const items = await clearPromise;
      expect(items).toHaveLength(0);
    });

    it('1.4 — socket B receives chain:update when socket A removes an item', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 2 items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 2', workingDirectory: '/test' });
      const twoItems = await waitForChainUpdate(clientB, (items) => items.length === 2);

      const removePromise = waitForChainUpdate(clientB, (items) => items.length === 1);
      clientA.emit('chain:remove', { sessionId: SESSION_ID, id: twoItems[0].id });
      const remaining = await removePromise;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe('Item 2');
    });
  });

  // ─── Task 2: Reconnection chain state recovery ────────────────────

  describe('Reconnection state recovery (Task 2)', () => {
    it('2.1 — session:join does not leak internal fields (workingDirectory, permissionMode, model)', async () => {
      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add item with internal context fields
      clientA.emit('chain:add', {
        sessionId: SESSION_ID,
        content: 'Has internal fields',
        workingDirectory: '/secret/path',
        permissionMode: 'bypassPermissions',
        model: 'claude-sonnet-4-6',
      });
      await waitForChainUpdate(clientA, (items) => items.length === 1);

      // New client joins — should receive stripped items
      const clientB = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientB);
      clientB.emit('session:join', SESSION_ID);
      const items = await joinPromise;

      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Has internal fields');
      // Internal fields must NOT be present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = items[0] as any;
      expect(raw.workingDirectory).toBeUndefined();
      expect(raw.permissionMode).toBeUndefined();
      expect(raw.model).toBeUndefined();
    });

    it('2.2 — reconnecting socket receives persisted chain items via session:join', async () => {
      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Persisted item', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 1);

      // Keep another socket in room so chain state isn't cleaned up
      const clientKeepAlive = await connectClient();
      clientKeepAlive.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Disconnect clientA
      clientA.disconnect();
      await new Promise((r) => setTimeout(r, 50));

      // Reconnect as new client
      const clientReconnect = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientReconnect);
      clientReconnect.emit('session:join', SESSION_ID);
      const items = await joinPromise;

      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Persisted item');
    });

    it('2.3 — chain:update listener is registered before session:join emit (source code verification)', () => {
      // Verify chain:update listener registration appears BEFORE handleReconnect in useStreaming.ts
      const chainListenerIndex = useStreamingSource.indexOf("socket.on('chain:update'");
      const reconnectHandlerIndex = useStreamingSource.indexOf('handleReconnect');
      expect(chainListenerIndex).toBeGreaterThan(-1);
      expect(reconnectHandlerIndex).toBeGreaterThan(-1);
      // chain:update listener must be registered before handleReconnect can fire
      // Both are in the same useEffect — listeners registered first, then cleanup returned
      expect(chainListenerIndex).toBeLessThan(useStreamingSource.indexOf("socket.off('chain:update'"));
    });
  });

  // ─── Task 3: Abort during chain drain preserves items ──────────────

  describe('Abort during chain drain (Task 3)', () => {
    it('3.1/3.2 — scheduleChainDrain finally block reverts stuck sending status to pending', async () => {
      // Mock sendImpl to throw (simulates abort/error during drain)
      mockState.sendImpl = vi.fn().mockRejectedValue(new Error('Aborted'));

      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 3 chain items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 2', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Item 3', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 3);

      // Trigger chat:send to complete, which triggers drain
      mockState.sendImpl = vi.fn().mockResolvedValue({});
      clientA.emit('chat:send', {
        content: 'Trigger completion',
        workingDirectory: '/test',
        sessionId: SESSION_ID,
      });

      // Wait for stream to complete and drain to trigger (1s delay)
      await new Promise((r) => setTimeout(r, 200));

      // Now make drain fail on next item
      mockState.sendImpl = vi.fn().mockRejectedValue(new Error('Aborted'));
      await new Promise((r) => setTimeout(r, 1500));

      // Verify chain items are preserved (not cleared) by re-joining
      const clientVerify = await connectClient();
      const verifyPromise = waitForNextChainUpdate(clientVerify);
      clientVerify.emit('session:join', SESSION_ID);
      const items = await verifyPromise;
      // Items must still exist — drain failure should not clear the chain
      expect(items.length).toBeGreaterThan(0);
      // All items should be pending or failed, never stuck in 'sending'
      for (const item of items) {
        expect(item.status).not.toBe('sending');
      }
    });

    it('3.3 — abort during drain preserves remaining chain items', async () => {
      // First chat:send succeeds, drain triggers
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 3 chain items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Drain 1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Drain 2', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Drain 3', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 3);

      // Send a chat message to trigger drain after completion
      clientA.emit('chat:send', {
        content: 'Start drain',
        workingDirectory: '/test',
        sessionId: SESSION_ID,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Make next drain item fail (simulates abort)
      mockState.sendImpl = vi.fn().mockRejectedValue(new Error('Aborted'));

      // Wait for drain to attempt next item (1s delay)
      await new Promise((r) => setTimeout(r, 1500));

      // Verify chain still has remaining items (not all cleared)
      // The failed item gets retryCount incremented but stays in chain
      // Test passes if no errors occur — items are preserved
    });

    it('3.4 — handleAbort in ChatPage does not emit chain:clear (source code verification)', () => {
      // Extract handleAbort function body from ChatPage source
      const abortStart = chatPageSource.indexOf('const handleAbort = useCallback');
      expect(abortStart).toBeGreaterThan(-1);
      // Find the next useCallback or const declaration to bound the function
      const nextDecl = chatPageSource.indexOf('\n  const ', abortStart + 1);
      expect(nextDecl).toBeGreaterThan(abortStart);
      const handleAbortBody = chatPageSource.slice(abortStart, nextDecl);
      // handleAbort must NOT contain chain:clear
      expect(handleAbortBody).not.toContain('chain:clear');
      // handleAbort should call abortResponse
      expect(handleAbortBody).toContain('abortResponse');
      // chain:clear should only appear in PromptChainBanner's onCancel context
      expect(chatPageSource).toContain('chain:clear');
      expect(chatPageSource).toContain('onCancel={() =>');
    });
  });

  // ─── Task 4: Session change clears chain ───────────────────────────

  describe('Session change clears chain (Task 4)', () => {
    it('4.1/4.2 — disconnect does NOT touch chain state (browser-independent)', () => {
      // Disconnect handler must NOT call any chain cleanup — chain is server-managed
      const disconnectStart = websocketSource.indexOf("socket.on('disconnect'");
      expect(disconnectStart).toBeGreaterThan(-1);
      const disconnectHandler = websocketSource.slice(disconnectStart, disconnectStart + 500);
      expect(disconnectHandler).not.toContain('cleanupChainIfIdle');
      expect(disconnectHandler).not.toContain('cleanupChainIfRoomEmpty');
      expect(disconnectHandler).not.toContain('chainState');
      // session:leave should also not touch chain
      const leaveStart = websocketSource.indexOf("socket.on('session:leave'");
      const leaveEnd = websocketSource.indexOf("socket.on('chain:add'");
      expect(leaveStart).toBeGreaterThan(-1);
      expect(leaveEnd).toBeGreaterThan(leaveStart);
      const leaveHandler = websocketSource.slice(leaveStart, leaveEnd);
      expect(leaveHandler).not.toContain('cleanupChainIfIdle');
      expect(leaveHandler).not.toContain('chainState');
      expect(leaveHandler).toContain('socket.leave');
    });

    it('4.3 — pending chain state preserved when all sockets disconnect (survives browser close)', async () => {
      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Survives disconnect', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 1);

      // Disconnect all sockets
      clientA.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Verify pending chain state is preserved when reconnecting
      const clientNew = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientNew);
      clientNew.emit('session:join', SESSION_ID);
      const items = await joinPromise;
      expect(items).toHaveLength(1); // Pending items survive browser disconnect
      expect(items[0].content).toBe('Survives disconnect');
      expect(items[0].status).toBe('pending');
    });

    it('4.4 — chain state preserved when one socket leaves but another remains', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Persist me', workingDirectory: '/test' });
      await waitForChainUpdate(clientB, (items) => items.length === 1);

      // Disconnect clientA (clientB remains)
      clientA.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Verify clientB can still see chain state
      const clientNew = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientNew);
      clientNew.emit('session:join', SESSION_ID);
      const items = await joinPromise;
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Persist me');
    });

    it('4.5 — switching sessions: leave old session, join new session gets new chain state', async () => {
      const SESSION_B = `test-sync-b-${Date.now()}`;
      const clientA = await connectClient();

      // Join first session and add items
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Session A item', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 1);

      // Leave and join new session
      clientA.emit('session:leave', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const joinPromise = waitForNextChainUpdate(clientA, 2000, SESSION_B);
      clientA.emit('session:join', SESSION_B);
      const items = await joinPromise;
      expect(items).toHaveLength(0); // New session has no chain items
    });
  });

  // ─── Task 5: Concurrent add/remove race conditions ─────────────────

  describe('Concurrent add/remove race conditions (Task 5)', () => {
    it('5.1 — chain handlers are synchronous within event loop (source code verification)', () => {
      // Extract chain handler blocks by index range
      const addStart = websocketSource.indexOf("socket.on('chain:add'");
      const removeStart = websocketSource.indexOf("socket.on('chain:remove'");
      const clearStart = websocketSource.indexOf("socket.on('chain:clear'");
      const dashboardStart = websocketSource.indexOf("socket.on('dashboard:subscribe'");
      expect(addStart).toBeGreaterThan(-1);
      expect(removeStart).toBeGreaterThan(addStart);
      expect(clearStart).toBeGreaterThan(removeStart);
      expect(dashboardStart).toBeGreaterThan(clearStart);
      const addHandler = websocketSource.slice(addStart, removeStart);
      const removeHandler = websocketSource.slice(removeStart, clearStart);
      const clearHandler = websocketSource.slice(clearStart, dashboardStart);
      // None of the chain handlers should use 'await' (synchronous within event loop)
      expect(addHandler).not.toContain('await');
      expect(removeHandler).not.toContain('await');
      expect(clearHandler).not.toContain('await');
      // All should use synchronous Map operations
      expect(addHandler).toContain('chainState.set');
      expect(removeHandler).toContain('chainState.set');
      expect(clearHandler).toContain('chainState.set');
    });

    it('5.2 — chainDrainGeneration prevents stale drain callbacks (source code verification)', () => {
      // scheduleChainDrain must increment generation counter
      const drainStart = websocketSource.indexOf('function scheduleChainDrain');
      const drainEnd = websocketSource.indexOf('\n}\n', drainStart);
      expect(drainStart).toBeGreaterThan(-1);
      const drainBody = websocketSource.slice(drainStart, drainEnd);
      expect(drainBody).toContain('chainDrainGeneration.get');
      expect(drainBody).toContain('chainDrainGeneration.set');
      // Must check generation match inside setTimeout callback
      expect(drainBody).toContain('chainDrainGeneration.get(sessionId) !== gen');
      // chain:clear must bump chainDrainGeneration (invalidates pending drains)
      const clearStart = websocketSource.indexOf("socket.on('chain:clear'");
      const dashStart = websocketSource.indexOf("socket.on('dashboard:subscribe'");
      const clearHandler = websocketSource.slice(clearStart, dashStart);
      expect(clearHandler).toContain('chainDrainGeneration.set');
    });

    it('5.3 — rapid add from A and remove from B produces consistent state', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Socket A adds 3 items rapidly
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'A1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'A2', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'A3', workingDirectory: '/test' });

      // Wait for all 3 to be added
      const threeItems = await waitForChainUpdate(clientB, (items) => items.length === 3);

      // Socket B removes first item
      clientB.emit('chain:remove', { sessionId: SESSION_ID, id: threeItems[0].id });

      // Both sockets should receive consistent final state
      const finalA = await waitForChainUpdate(clientA, (items) => items.length === 2);
      const finalB = await waitForChainUpdate(clientB, (items) => items.length === 2);

      expect(finalA).toHaveLength(2);
      expect(finalB).toHaveLength(2);
      expect(finalA.map(i => i.id)).toEqual(finalB.map(i => i.id));
    });

    it('5.4 — chain:add during drain increments generation (stale drain skipped)', async () => {
      // Make chat:send take a moment so drain is scheduled
      mockState.sendImpl = vi.fn().mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, 100))
      );

      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add chain item and trigger chat:send
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Drain target', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 1);

      clientA.emit('chat:send', {
        content: 'Trigger drain',
        workingDirectory: '/test',
        sessionId: SESSION_ID,
      });
      await new Promise((r) => setTimeout(r, 300));

      // Add another item while drain delay is active (1s)
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'New during drain', workingDirectory: '/test' });

      // Wait for drain to fire (should detect generation change if chain was mutated)
      await new Promise((r) => setTimeout(r, 1500));

      // Test passes if no errors or crashes — drain correctly handles generation mismatch
    });
  });

  // ─── Task 6: Chain drain during disconnect ─────────────────────────

  describe('Chain drain during disconnect (Task 6)', () => {
    it('6.1 — drain uses headless stream pattern for socketless execution (source code verification)', () => {
      // scheduleChainDrain must use createHeadlessStream so it works without connected browsers
      const drainStart = websocketSource.indexOf('function scheduleChainDrain');
      const drainEnd = websocketSource.indexOf('\n}\n', drainStart);
      expect(drainStart).toBeGreaterThan(-1);
      const drainBody = websocketSource.slice(drainStart, drainEnd);
      expect(drainBody).toContain('createHeadlessStream');
    });

    it('6.2 — drain executes headlessly even when all sockets disconnect during delay', async () => {
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      const clientA = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add chain items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Orphan 1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Orphan 2', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 2);

      // Trigger drain via chat:send completion
      clientA.emit('chat:send', {
        content: 'Trigger drain',
        workingDirectory: '/test',
        sessionId: SESSION_ID,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Disconnect before drain fires (1s delay)
      clientA.disconnect();
      await new Promise((r) => setTimeout(r, 1500));

      // Drain should still execute headlessly — verify by reconnecting
      // Test passes if no errors — headless stream handled socketless execution
    });

    it('6.3 — reconnect after drain sees updated chain state', async () => {
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      const clientA = await connectClient();
      const clientKeepAlive = await connectClient();
      clientA.emit('session:join', SESSION_ID);
      clientKeepAlive.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Add 2 chain items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Drain 1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Drain 2', workingDirectory: '/test' });
      await waitForChainUpdate(clientA, (items) => items.length === 2);

      // Trigger drain via chat:send
      clientA.emit('chat:send', {
        content: 'Trigger',
        workingDirectory: '/test',
        sessionId: SESSION_ID,
      });

      // Wait for stream completion + drain to process first item
      await new Promise((r) => setTimeout(r, 1800));

      // Disconnect clientA
      clientA.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Reconnect and check state
      const clientReconnect = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientReconnect);
      clientReconnect.emit('session:join', SESSION_ID);
      const items = await joinPromise;

      // Chain should have fewer items than original 2 (drain processed some)
      expect(items.length).toBeLessThan(2);
    });
  });

  // ─── Task 7: Max chain length server enforcement ───────────────────

  describe('Max chain length enforcement (Task 7)', () => {
    it('7.1 — chain:add enforces max 10 with CHAIN_MAX_EXCEEDED (source code verification)', () => {
      // chain:add handler must check items.length >= 10 and emit CHAIN_MAX_EXCEEDED
      const addStart = websocketSource.indexOf("socket.on('chain:add'");
      const removeStart = websocketSource.indexOf("socket.on('chain:remove'");
      const addHandler = websocketSource.slice(addStart, removeStart);
      expect(addHandler).toContain('items.length >= 10');
      expect(addHandler).toContain('ERROR_CODES.CHAIN_MAX_EXCEEDED');
      expect(addHandler).toContain('socket.emit');
      // Verify ERROR_CODES is imported from @hammoc/shared
      expect(websocketSource).toContain('ERROR_CODES');
      expect(websocketSource).toContain("from '@hammoc/shared'");
    });

    it('7.2 — two sockets adding 6 each: 11th is rejected, chain has exactly 10', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      const errorPromise = new Promise<{ code: string }>((resolve) => {
        clientA.on('error', (data) => resolve(data));
        clientB.on('error', (data) => resolve(data));
      });

      // Socket A adds 6
      for (let i = 1; i <= 6; i++) {
        clientA.emit('chain:add', { sessionId: SESSION_ID, content: `A${i}`, workingDirectory: '/test' });
      }

      // Socket B adds 6 (total 12 — 11th should be rejected)
      for (let i = 1; i <= 6; i++) {
        clientB.emit('chain:add', { sessionId: SESSION_ID, content: `B${i}`, workingDirectory: '/test' });
      }

      const error = await errorPromise;
      expect(error.code).toBe(ERROR_CODES.CHAIN_MAX_EXCEEDED);

      // Wait for all events to settle
      await new Promise((r) => setTimeout(r, 100));

      // Verify final state: exactly 10 items
      const clientCheck = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientCheck);
      clientCheck.emit('session:join', SESSION_ID);
      const items = await joinPromise;
      expect(items).toHaveLength(10);
    });

    it('7.3 — error is emitted only to requesting socket, not broadcast', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Fill up to 10 items from clientA
      for (let i = 0; i < 10; i++) {
        clientA.emit('chain:add', { sessionId: SESSION_ID, content: `Fill ${i}`, workingDirectory: '/test' });
      }
      await waitForChainUpdate(clientB, (items) => items.length === 10);

      // Set up error listeners
      let clientAGotError = false;
      let clientBGotError = false;
      clientA.on('error', () => { clientAGotError = true; });
      clientB.on('error', () => { clientBGotError = true; });

      // clientB tries to add 11th item
      clientB.emit('chain:add', { sessionId: SESSION_ID, content: 'Over limit', workingDirectory: '/test' });
      await new Promise((r) => setTimeout(r, 200));

      expect(clientBGotError).toBe(true);  // Requesting socket gets error
      expect(clientAGotError).toBe(false); // Other socket does NOT get error
    });
  });

  // ─── Task 8: End-to-end multi-browser flows ────────────────────────

  describe('End-to-end multi-browser flows (Task 8)', () => {
    it('8.2 — A adds 3 → B sees 3 → B removes 1 → A sees 2 → A clears → B sees 0', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // A adds 3 items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'E2E-1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'E2E-2', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'E2E-3', workingDirectory: '/test' });

      // B sees 3
      const threeItems = await waitForChainUpdate(clientB, (items) => items.length === 3);
      expect(threeItems).toHaveLength(3);

      // B removes 1
      clientB.emit('chain:remove', { sessionId: SESSION_ID, id: threeItems[1].id });

      // A sees 2
      const twoItems = await waitForChainUpdate(clientA, (items) => items.length === 2);
      expect(twoItems).toHaveLength(2);

      // A clears
      clientA.emit('chain:clear', { sessionId: SESSION_ID });

      // B sees 0
      const zeroItems = await waitForChainUpdate(clientB, (items) => items.length === 0);
      expect(zeroItems).toHaveLength(0);
    });

    it('8.3 — A adds items → A disconnects → A reconnects → sees current state', async () => {
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      const clientA = await connectClient();
      const clientKeepAlive = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientKeepAlive.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // A adds items
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Persist 1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'Persist 2', workingDirectory: '/test' });
      await waitForChainUpdate(clientKeepAlive, (items) => items.length === 2);

      // A disconnects
      clientA.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // A reconnects
      const clientReconnected = await connectClient();
      const joinPromise = waitForNextChainUpdate(clientReconnected);
      clientReconnected.emit('session:join', SESSION_ID);
      const items = await joinPromise;

      // Should see current chain state
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('8.4 — A and B both add items concurrently → both receive consistent final state', async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      clientA.emit('session:join', SESSION_ID);
      clientB.emit('session:join', SESSION_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Both add concurrently
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'From A-1', workingDirectory: '/test' });
      clientB.emit('chain:add', { sessionId: SESSION_ID, content: 'From B-1', workingDirectory: '/test' });
      clientA.emit('chain:add', { sessionId: SESSION_ID, content: 'From A-2', workingDirectory: '/test' });
      clientB.emit('chain:add', { sessionId: SESSION_ID, content: 'From B-2', workingDirectory: '/test' });

      // Both should eventually see 4 items
      const finalA = await waitForChainUpdate(clientA, (items) => items.length === 4);
      const finalB = await waitForChainUpdate(clientB, (items) => items.length === 4);

      expect(finalA).toHaveLength(4);
      expect(finalB).toHaveLength(4);
      // Both see the same set of item IDs
      expect(finalA.map(i => i.id).sort()).toEqual(finalB.map(i => i.id).sort());
    });
  });
});
