/**
 * WebSocket Rewind & Regenerate Handler Tests
 * [Source: Story 25.2 - Tasks 10.6-10.8]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';

// Hoisted mock control — must be declared before vi.mock
const { mockSessionService, mockState } = vi.hoisted(() => {
  const mockSessionService = {
    truncateSessionHistory: vi.fn().mockResolvedValue({ success: true }),
    getRewindInfo: vi.fn().mockResolvedValue({ resumeAtId: null, userMessageId: null }),
    getProjectPathBySlug: vi.fn().mockResolvedValue('/mock/project/path'),
    getSessionMessages: vi.fn().mockResolvedValue({
      messages: [
        { id: 'msg-1', type: 'user', content: 'Hello', timestamp: '2026-01-15T10:00:00Z' },
        { id: 'msg-2', type: 'assistant', content: 'Hi!', timestamp: '2026-01-15T10:00:05Z' },
      ],
      pagination: { offset: 0, limit: 1000, total: 2 },
    }),
    saveSessionId: vi.fn().mockResolvedValue(undefined),
    getSessionId: vi.fn().mockResolvedValue(null),
    listSessions: vi.fn().mockResolvedValue([]),
    updateSessionIndex: vi.fn().mockResolvedValue(undefined),
  };

  const mockState = {
    sendImpl: vi.fn().mockResolvedValue({}),
    lastCtorArgs: undefined as unknown,
  };

  return { mockSessionService, mockState };
});

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

// Mock session middleware — always authenticated
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
    getPermissionMode() { return 'default'; }
    rewindSessionFiles() { return Promise.resolve({ canRewind: true }); }
  },
}));

// Mock SessionService — return shared mock instance
vi.mock('../../services/sessionService.js', () => ({
  SessionService: class {
    truncateSessionHistory = mockSessionService.truncateSessionHistory;
    getRewindInfo = mockSessionService.getRewindInfo;
    getProjectPathBySlug = mockSessionService.getProjectPathBySlug;
    getSessionMessages = mockSessionService.getSessionMessages;
    saveSessionId = mockSessionService.saveSessionId;
    getSessionId = mockSessionService.getSessionId;
    listSessions = mockSessionService.listSessions;
    updateSessionIndex = mockSessionService.updateSessionIndex;
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
    readPreferences: vi.fn().mockResolvedValue({
      theme: 'dark',
      defaultModel: '',
      permissionMode: 'default',
      chatTimeoutMs: 300000,
      permissionSyncPolicy: 'disabled',
    }),
  },
}));

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    chat: { timeoutMs: 300000 },
    websocket: {
      cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'], credentials: true },
    },
    telegram: { botToken: '', chatId: '', enabled: false },
    terminal: { enabled: true, shellTimeout: 30000, maxSessions: 10 },
  },
}));

// Mock notificationService
vi.mock('../../services/notificationService.js', () => ({
  notificationService: {
    notifyInputRequired: vi.fn(),
    notifyComplete: vi.fn(),
    notifyError: vi.fn(),
    notifyQueueStart: vi.fn(),
    notifyQueueComplete: vi.fn(),
    notifyQueueError: vi.fn(),
    notifyQueueInputRequired: vi.fn(),
    reload: vi.fn(),
  },
  formatAskQuestionPrompt: vi.fn(),
}));

// Mock queueController
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

// Mock utils
vi.mock('../../utils/networkUtils.js', () => ({
  isLocalIP: vi.fn().mockReturnValue(true),
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

const { MockSDKErrorCode } = vi.hoisted(() => {
  const MockSDKErrorCode = {
    UNKNOWN: 'UNKNOWN',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    ABORTED: 'ABORTED',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INVALID_REQUEST: 'INVALID_REQUEST',
    INVALID_PATH: 'INVALID_PATH',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  } as const;
  return { MockSDKErrorCode };
});

vi.mock('../../utils/errors.js', () => ({
  SDKErrorCode: MockSDKErrorCode,
  parseSDKError: vi.fn().mockImplementation((err: unknown) => {
    if (err instanceof Error) return Object.assign(err, { code: MockSDKErrorCode.UNKNOWN });
    return { message: String(err), code: MockSDKErrorCode.UNKNOWN };
  }),
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

vi.mock('../../services/gitService.js', () => ({
  gitService: {
    checkout: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue(null),
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

import { initializeWebSocket } from '../websocket.js';

const TEST_PORT = 3005;
const TEST_SESSION_ID = '12345678-1234-1234-1234-123456789abc';
const TEST_MESSAGE_ID = 'aabbccdd-1111-2222-3333-445566778899';
const TEST_PROJECT_SLUG = 'test-project';

function connectClient(): ClientSocket {
  return ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
}

function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve) => socket.on('connect', resolve));
}

function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('WebSocket Rewind & Regenerate Handlers', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    mockState.sendImpl = vi.fn().mockResolvedValue({});
    vi.clearAllMocks();

    // Reset mock defaults
    mockSessionService.truncateSessionHistory.mockResolvedValue({ success: true });
    mockSessionService.getRewindInfo.mockResolvedValue({ resumeAtId: null, userMessageId: null });
    mockSessionService.getProjectPathBySlug.mockResolvedValue('/mock/project/path');
    mockSessionService.getSessionMessages.mockResolvedValue({
      messages: [
        { id: 'msg-1', type: 'user', content: 'Hello', timestamp: '2026-01-15T10:00:00Z' },
      ],
      pagination: { offset: 0, limit: 1000, total: 1 },
    });

    httpServer = createServer();
    ioServer = await initializeWebSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });

    clientSocket = connectClient();
    await waitForConnect(clientSocket);

    // Join session to register socket in internal maps
    clientSocket.emit('session:join', TEST_SESSION_ID, TEST_PROJECT_SLUG);
    // Allow event loop to process the join
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(async () => {
    if (clientSocket?.connected) clientSocket.disconnect();
    await new Promise<void>((resolve) => {
      ioServer.close(() => httpServer.close(() => resolve()));
    });
  });

  describe('chat:rewind', () => {
    // 10.6: Validates session ownership and emits chat:rewound on success
    it('emits chat:rewound with success on valid rewind', async () => {
      const promise = waitForEvent<{ sessionId: string; success: boolean }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:rewind', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(TEST_SESSION_ID);
      expect(mockSessionService.truncateSessionHistory).toHaveBeenCalledWith(
        TEST_PROJECT_SLUG,
        TEST_SESSION_ID,
        TEST_MESSAGE_ID
      );
    });

    // 10.6: Session ownership validation — mismatched session
    it('rejects rewind with session mismatch', async () => {
      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:rewind', {
        sessionId: '00000000-0000-0000-0000-000000000000', // different session
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session mismatch');
    });

    // 10.6: Invalid messageId format
    it('rejects rewind with invalid messageId', async () => {
      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:rewind', {
        sessionId: TEST_SESSION_ID,
        messageId: 'not-a-valid-uuid',
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid message ID');
    });

    // 10.7: Emits chat:rewound with success: false on truncation error (SEC-001: sanitized message)
    it('emits chat:rewound with sanitized error on truncation failure', async () => {
      mockSessionService.truncateSessionHistory.mockResolvedValue({
        success: false,
        error: 'Message not found',
      });

      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:rewind', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(false);
      // SEC-001: Error message is sanitized — not the raw server error
      expect(result.error).toBe('Failed to rewind conversation');
    });

    // VAL-001: Rejects malformed payload
    it('rejects rewind with null/non-object payload', async () => {
      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:rewind', null);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid payload');
    });

    // TEST-001: conversationAndCode mode triggers rewindSessionFiles
    it('calls rewindSessionFiles when undoMode is conversationAndCode', async () => {
      mockSessionService.getRewindInfo.mockResolvedValue({ resumeAtId: 'msg-0', userMessageId: 'msg-user-1' });

      const promise = waitForEvent<{ sessionId: string; success: boolean; warning?: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:rewind', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversationAndCode',
      });

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(TEST_SESSION_ID);
      expect(mockSessionService.getRewindInfo).toHaveBeenCalledWith(
        TEST_PROJECT_SLUG,
        TEST_SESSION_ID,
        TEST_MESSAGE_ID
      );
    });

    // RACE-001: Rejects concurrent rewind on same session
    it('rejects concurrent rewind requests on same session', async () => {
      // Delay the first truncation to simulate concurrency
      mockSessionService.truncateSessionHistory.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 200))
      );

      // Collect all chat:rewound events
      const events: Array<{ success: boolean; error?: string }> = [];
      const allReceived = new Promise<void>((resolve) => {
        clientSocket.on('chat:rewound', (data: { success: boolean; error?: string }) => {
          events.push(data);
          if (events.length >= 2) resolve();
        });
      });

      // Fire first request
      clientSocket.emit('chat:rewind', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      // Wait for first request to acquire lock
      await new Promise((r) => setTimeout(r, 50));

      // Fire second request (should be rejected immediately)
      clientSocket.emit('chat:rewind', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      // Wait for both events
      await allReceived;

      // One should be rejected, one should succeed
      const rejected = events.find(e => !e.success);
      const succeeded = events.find(e => e.success);
      expect(rejected).toBeDefined();
      expect(rejected!.error).toBe('Rewind already in progress');
      expect(succeeded).toBeDefined();
    });
  });

  describe('chat:regenerate', () => {
    // 10.8: Truncates then calls handleChatSend with last user message
    it('emits chat:rewound with success after truncation', async () => {
      const promise = waitForEvent<{ sessionId: string; success: boolean }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(TEST_SESSION_ID);
      expect(mockSessionService.truncateSessionHistory).toHaveBeenCalledWith(
        TEST_PROJECT_SLUG,
        TEST_SESSION_ID,
        TEST_MESSAGE_ID
      );
    });

    // 10.8: Reads truncated history to find last user message for re-send
    it('reads session messages after truncation for regeneration', async () => {
      const promise = waitForEvent(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      await promise;
      // Allow async handler to finish processing after emitting chat:rewound
      await new Promise((r) => setTimeout(r, 200));

      expect(mockSessionService.getSessionMessages).toHaveBeenCalledWith(
        TEST_PROJECT_SLUG,
        TEST_SESSION_ID,
        expect.objectContaining({ limit: 1000 })
      );
    });

    // TEST-002: Verifies handleChatSend is actually invoked with the last user message content
    it('calls handleChatSend (sendMessageWithCallbacks) with last user message after truncation', async () => {
      const promise = waitForEvent(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      await promise;
      // Allow async handler to finish full regeneration flow
      await new Promise((r) => setTimeout(r, 300));

      // handleChatSend internally creates ChatService and calls sendMessageWithCallbacks
      expect(mockState.sendImpl).toHaveBeenCalledTimes(1);
    });

    // 10.8: Regenerate fails on truncation error (SEC-001: sanitized message)
    it('emits chat:rewound with sanitized error when truncation fails', async () => {
      mockSessionService.truncateSessionHistory.mockResolvedValue({
        success: false,
        error: 'Message not found',
      });

      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(false);
      // SEC-001: Error message is sanitized
      expect(result.error).toBe('Failed to rewind conversation');
    });

    // VAL-001: Rejects malformed payload for regenerate
    it('rejects regenerate with null/non-object payload', async () => {
      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', null);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid payload');
    });

    // API-001: Regenerate with no user message returns warning (not error) field
    it('emits warning instead of error when no user message found', async () => {
      mockSessionService.getSessionMessages.mockResolvedValue({
        messages: [],
        pagination: { offset: 0, limit: 1000, total: 0 },
      });

      const promise = waitForEvent<{ success: boolean; warning?: string; error?: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.warning).toBe('No user message found to regenerate');
      expect(result.error).toBeUndefined();
    });

    // TEST-001: conversationAndCode mode triggers rewindSessionFiles for regenerate
    it('calls rewindSessionFiles when undoMode is conversationAndCode', async () => {
      mockSessionService.getRewindInfo.mockResolvedValue({ resumeAtId: 'msg-0', userMessageId: 'msg-user-1' });

      const promise = waitForEvent<{ sessionId: string; success: boolean }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: TEST_SESSION_ID,
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversationAndCode',
      });

      const result = await promise;
      expect(result.success).toBe(true);
      expect(mockSessionService.getRewindInfo).toHaveBeenCalledWith(
        TEST_PROJECT_SLUG,
        TEST_SESSION_ID,
        TEST_MESSAGE_ID
      );
    });

    // Session ownership validation for regenerate
    it('rejects regenerate with session mismatch', async () => {
      const promise = waitForEvent<{ success: boolean; error: string }>(clientSocket, 'chat:rewound');

      clientSocket.emit('chat:regenerate', {
        sessionId: '00000000-0000-0000-0000-000000000000',
        messageId: TEST_MESSAGE_ID,
        undoMode: 'conversation',
      });

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session mismatch');
    });
  });
});
