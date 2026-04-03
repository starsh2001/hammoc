/**
 * WebSocket messages:switch-branch handler tests
 * Story 27.3: Branch Viewer Mode — Task 10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { initializeWebSocket } from '../websocket.js';

// Shared mock state
const { mockState } = vi.hoisted(() => {
  const mockState = {
    sendImpl: vi.fn().mockResolvedValue({}),
    lastCtorArgs: undefined as unknown,
  };
  return { mockState };
});

const { mockSdkQuery } = vi.hoisted(() => {
  const mockSdkQuery = vi.fn();
  return { mockSdkQuery };
});

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockSdkQuery,
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../middleware/session.js', () => ({
  createSessionMiddleware: vi.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, _res: any, next: any) => {
      req.session = { authenticated: true };
      next();
    }
  ),
}));

vi.mock('../../services/chatService.js', () => ({
  ChatService: class MockChatService {
    constructor(...args: unknown[]) { mockState.lastCtorArgs = args[0]; }
    sendMessageWithCallbacks(...args: unknown[]) { return mockState.sendImpl(...args); }
    setPermissionMode() {}
  },
}));

vi.mock('../../services/sessionService.js', () => ({
  SessionService: class MockSessionService {
    saveSessionId = vi.fn().mockResolvedValue(undefined);
    getSessionId = vi.fn().mockResolvedValue(null);
    encodeProjectPath = vi.fn().mockReturnValue('mock-project-slug');
    getSessionFilePath = vi.fn().mockReturnValue('/mock/session.jsonl');
    listSessions = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: {
    getEffectivePreferences: vi.fn().mockResolvedValue({
      theme: 'dark', defaultModel: '', permissionMode: 'default', chatTimeoutMs: 300000,
    }),
    getTerminalEnabled: vi.fn().mockResolvedValue(true),
    readPreferences: vi.fn().mockResolvedValue({
      theme: 'dark', defaultModel: '', permissionMode: 'default', chatTimeoutMs: 300000, permissionSyncPolicy: 'manual',
    }),
  },
}));

vi.mock('../../config/index.js', () => ({
  config: {
    chat: { timeoutMs: 300000 },
    websocket: { cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'], credentials: true } },
    telegram: { botToken: '', chatId: '', enabled: false },
    terminal: { enabled: true, shellTimeout: 30000, maxSessions: 10 },
  },
}));

vi.mock('../../services/notificationService.js', () => ({
  notificationService: {
    notifyInputRequired: vi.fn(), notifyComplete: vi.fn(), notifyError: vi.fn(),
    notifyQueueStart: vi.fn(), notifyQueueComplete: vi.fn(), notifyQueueError: vi.fn(),
    notifyQueueInputRequired: vi.fn(), reload: vi.fn(),
  },
}));

vi.mock('../../controllers/queueController.js', () => ({
  getOrCreateQueueService: vi.fn().mockReturnValue({
    isRunning: false, start: vi.fn(), pause: vi.fn(), resume: vi.fn(), abort: vi.fn(),
  }),
  getQueueInstances: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../../utils/networkUtils.js', () => ({
  isLocalIP: vi.fn().mockReturnValue(true),
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

const { MockSDKErrorCode } = vi.hoisted(() => ({
  MockSDKErrorCode: {
    UNKNOWN: 'UNKNOWN', RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR', NETWORK_ERROR: 'NETWORK_ERROR',
    ABORTED: 'ABORTED', SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INVALID_REQUEST: 'INVALID_REQUEST', INVALID_PATH: 'INVALID_PATH',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  } as const,
}));

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
    startPolling: vi.fn(), stopPolling: vi.fn(), getCachedResult: vi.fn().mockReturnValue(null),
    getApiHealth: vi.fn().mockReturnValue(null), hasOAuthCredentials: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../services/ptyService.js', () => ({
  ptyService: {
    createSession: vi.fn(), getSession: vi.fn(), closeSession: vi.fn(),
    scheduleCleanup: vi.fn(), cancelCleanup: vi.fn(), onData: vi.fn(), onExit: vi.fn(),
    writeInput: vi.fn(), resize: vi.fn(),
  },
}));

vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveProjectPath: vi.fn().mockResolvedValue('/mock/path'),
    findProjectByPath: vi.fn().mockResolvedValue({ projectSlug: 'test-project' }),
    resolveOriginalPath: vi.fn().mockResolvedValue('/mock/path'),
  },
}));

vi.mock('../../services/dashboardService.js', () => ({
  dashboardService: { getProjectStatus: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../services/summarizeService.js', () => ({
  summarize: vi.fn(),
}));

const mockReloadFromJSONL = vi.fn();
vi.mock('../../services/sessionBufferManager.js', () => ({
  sessionBufferManager: {
    create: vi.fn().mockReturnValue({ sessionId: 'test', messages: [], streaming: false }),
    get: vi.fn(),
    setMessages: vi.fn(),
    addMessage: vi.fn(),
    setStreaming: vi.fn(),
    reloadFromJSONL: (...args: unknown[]) => mockReloadFromJSONL(...args),
    rekey: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('../../services/imageStorageService.js', () => ({
  imageStorageService: {
    getImageUrl: vi.fn(),
    getThumbnailUrl: vi.fn(),
    storeBase64Image: vi.fn(),
  },
}));

const mockParseJSONLFile = vi.fn();
vi.mock('../../services/historyParser.js', () => ({
  parseJSONLFile: (...args: unknown[]) => mockParseJSONLFile(...args),
  transformToHistoryMessages: vi.fn().mockReturnValue([]),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
  }),
}));

const { mockI18next } = vi.hoisted(() => ({
  mockI18next: {
    getFixedT: () => (key: string) => key,
    init: () => {},
    use: () => ({ init: () => {} }),
  },
}));
vi.mock('../../i18n.js', () => ({ default: mockI18next }));
vi.mock('i18next', () => ({ default: mockI18next }));

describe('messages:switch-branch handler', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 3005;

  beforeEach(async () => {
    mockState.sendImpl = vi.fn().mockResolvedValue({});
    mockReloadFromJSONL.mockReset();
    mockParseJSONLFile.mockReset();

    httpServer = createServer();
    ioServer = await initializeWebSocket(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });

  afterEach(async () => {
    if (clientSocket?.connected) clientSocket.disconnect();
    await new Promise<void>((resolve) => {
      ioServer.close(() => { httpServer.close(() => resolve()); });
    });
  });

  async function connectAndJoinSession(sessionId: string): Promise<void> {
    clientSocket = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
    await new Promise<void>((resolve) => { clientSocket.on('connect', () => resolve()); });

    // Join session room — server's session:join handler adds socket to room
    // and sets sessionProjectMap. Wait for stream:status (always emitted on join).
    mockReloadFromJSONL.mockResolvedValue([]);
    const joinStatusPromise = new Promise<void>((resolve) => {
      clientSocket.once('stream:status', () => resolve());
    });
    clientSocket.emit('session:join', sessionId, 'test-project');
    await joinStatusPromise;
    mockReloadFromJSONL.mockReset();
  }

  const SESSION_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const SESSION_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
  const SESSION_3 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

  it('should call reloadFromJSONL with branchSelections and emit stream:history', async () => {
    await connectAndJoinSession(SESSION_1);

    const mockMessages = [{ id: 'msg-1', type: 'user', content: 'hello', timestamp: '2026-01-01' }];
    mockReloadFromJSONL.mockResolvedValue(mockMessages);

    const responsePromise = new Promise<{ sessionId: string; messages: unknown[] }>((resolve) => {
      clientSocket.on('stream:history', (data) => resolve(data));
    });

    clientSocket.emit('messages:switch-branch', {
      sessionId: SESSION_1,
      branchSelections: { key1: 1 },
    });

    const response = await responsePromise;

    expect(mockReloadFromJSONL).toHaveBeenCalledWith(SESSION_1, 'test-project', { key1: 1 });
    expect(response.sessionId).toBe(SESSION_1);
    expect(response.messages).toEqual(mockMessages);
  });

  it('should reject when not in session room', async () => {
    clientSocket = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
    await new Promise<void>((resolve) => { clientSocket.on('connect', () => resolve()); });

    const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      clientSocket.on('error', (data) => resolve(data));
    });

    clientSocket.emit('messages:switch-branch', {
      sessionId: SESSION_1,
      branchSelections: {},
    });

    const error = await errorPromise;
    expect(error.code).toBe('NOT_IN_SESSION');
  });

  it('should work with empty branchSelections (exit viewer mode)', async () => {
    await connectAndJoinSession(SESSION_2);

    const mockMessages = [{ id: 'msg-1', type: 'user', content: 'hello', timestamp: '2026-01-01' }];
    mockReloadFromJSONL.mockResolvedValue(mockMessages);

    const responsePromise = new Promise<{ sessionId: string; messages: unknown[] }>((resolve) => {
      clientSocket.on('stream:history', (data) => resolve(data));
    });

    clientSocket.emit('messages:switch-branch', {
      sessionId: SESSION_2,
      branchSelections: {},
    });

    const response = await responsePromise;

    expect(mockReloadFromJSONL).toHaveBeenCalledWith(SESSION_2, 'test-project', {});
    expect(response.messages).toEqual(mockMessages);
  });

  it('should emit error when reloadFromJSONL throws', async () => {
    await connectAndJoinSession(SESSION_3);

    mockReloadFromJSONL.mockRejectedValue(new Error('JSONL parse failed'));

    const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      clientSocket.on('error', (data) => resolve(data));
    });

    clientSocket.emit('messages:switch-branch', {
      sessionId: SESSION_3,
      branchSelections: { key: 0 },
    });

    const error = await errorPromise;
    expect(error.code).toBe('BRANCH_SWITCH_ERROR');
  });

  it('should reject with STREAMING_ACTIVE when session has an active stream', async () => {
    const SESSION_STREAM = 'd4e5f6a7-b8c9-0123-defa-234567890123';
    await connectAndJoinSession(SESSION_STREAM);

    // Make sendImpl never resolve so the stream stays active in activeStreams
    mockState.sendImpl = vi.fn().mockReturnValue(new Promise(() => {}));
    mockParseJSONLFile.mockResolvedValue([]);

    // Trigger chat:send to create an active stream (stream is created synchronously)
    clientSocket.emit('chat:send', {
      content: 'hello',
      workingDirectory: '/mock/path',
      sessionId: SESSION_STREAM,
    });

    // Wait for the server to process the chat:send event and create the active stream
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      clientSocket.on('error', (data) => resolve(data));
    });

    clientSocket.emit('messages:switch-branch', {
      sessionId: SESSION_STREAM,
      branchSelections: { key: 0 },
    });

    const error = await errorPromise;
    expect(error.code).toBe('STREAMING_ACTIVE');
    expect(error.message).toBe('Cannot switch branches during streaming');
  });
});
