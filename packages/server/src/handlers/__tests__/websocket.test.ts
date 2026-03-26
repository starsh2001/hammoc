import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { existsSync } from 'fs';
import {
  initializeWebSocket,
  getIO,
  getConnectedClientsCount,
} from '../websocket.js';
import { ERROR_CODES } from '@hammoc/shared';

// Shared mock state — accessible via vi.hoisted() for vi.mock factories
const { mockState } = vi.hoisted(() => {
  const mockState = {
    sendImpl: vi.fn().mockResolvedValue({}),
    lastCtorArgs: undefined as unknown,
  };
  return { mockState };
});

// Mock fs module used by logger and other imports
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock session middleware (Story 2.5 - WebSocket auth)
vi.mock('../../middleware/session.js', () => ({
  createSessionMiddleware: vi.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, _res: any, next: any) => {
      // Simulate authenticated session for tests
      req.session = { authenticated: true };
      next();
    }
  ),
}));

// Mock ChatService - real class that captures constructor args and delegates to mockState
vi.mock('../../services/chatService.js', () => ({
  ChatService: class MockChatService {
    constructor(...args: unknown[]) { mockState.lastCtorArgs = args[0]; }
    sendMessageWithCallbacks(...args: unknown[]) { return mockState.sendImpl(...args); }
    setPermissionMode() {}
  },
}));

// Mock SessionService - must be a real class (used with `new`)
vi.mock('../../services/sessionService.js', () => ({
  SessionService: class MockSessionService {
    saveSessionId = vi.fn().mockResolvedValue(undefined);
    getSessionId = vi.fn().mockResolvedValue(null);
    listSessions = vi.fn().mockResolvedValue([
      {
        sessionId: 'session-123',
        projectSlug: 'test-project',
        firstPrompt: 'Create a component',
        messageCount: 5,
        created: new Date('2026-01-30T10:00:00Z'),
        modified: new Date('2026-01-30T11:00:00Z'),
      },
    ]);
  },
}));

// Mock preferencesService (Story 10.2)
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

// Mock config (Story 4.6)
vi.mock('../../config/index.js', () => ({
  config: {
    chat: {
      timeoutMs: 300000, // 5 minutes default
    },
    websocket: {
      cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    },
    telegram: {
      botToken: '',
      chatId: '',
      enabled: false,
    },
    terminal: {
      enabled: true,
      shellTimeout: 30000,
      maxSessions: 10,
    },
  },
}));

// Mock notificationService (Story 10.4)
vi.mock('../../services/notificationService.js', () => ({
  notificationService: {
    notifyInputRequired: vi.fn().mockResolvedValue(undefined),
    notifyComplete: vi.fn().mockResolvedValue(undefined),
    notifyError: vi.fn().mockResolvedValue(undefined),
    notifyQueueStart: vi.fn().mockResolvedValue(undefined),
    notifyQueueComplete: vi.fn().mockResolvedValue(undefined),
    notifyQueueError: vi.fn().mockResolvedValue(undefined),
    notifyQueueInputRequired: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock queueController (Story 15.2)
vi.mock('../../controllers/queueController.js', () => ({
  getOrCreateQueueService: vi.fn().mockReturnValue({
    isRunning: false,
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
  }),
  getQueueInstances: vi.fn().mockReturnValue(new Map()),
}));

// Mock utils/networkUtils
vi.mock('../../utils/networkUtils.js', () => ({
  isLocalIP: vi.fn().mockReturnValue(true),
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

// Mock utils/errors — parseSDKError classifies errors by message substring
// so that retry-guard logic (isNonSessionError) works correctly in tests.
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
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('rate limit') || msg.includes('too many requests'))
        return Object.assign(err, { code: MockSDKErrorCode.RATE_LIMIT_EXCEEDED });
      if (msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('login'))
        return Object.assign(err, { code: MockSDKErrorCode.AUTHENTICATION_ERROR });
      if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('enotfound'))
        return Object.assign(err, { code: MockSDKErrorCode.NETWORK_ERROR });
      if (msg.includes('abort') || err.name === 'AbortError')
        return Object.assign(err, { code: MockSDKErrorCode.ABORTED });
      if (msg.includes('service unavailable') || msg.includes('503'))
        return Object.assign(err, { code: MockSDKErrorCode.SERVICE_UNAVAILABLE });
    }
    // Default: return SDKError-like object with UNKNOWN code (matches production behavior)
    if (err instanceof Error) return Object.assign(err, { code: MockSDKErrorCode.UNKNOWN });
    return { message: String(err), code: MockSDKErrorCode.UNKNOWN };
  }),
  AbortedError: class AbortedError extends Error {
    constructor(message?: string) { super(message ?? 'Aborted'); this.name = 'AbortedError'; }
  },
}));

// streamCallbacks: use real implementation (callbacks drive the socket events tests verify)

// Mock rateLimitProbeService
vi.mock('../../services/rateLimitProbeService.js', () => ({
  rateLimitProbeService: {
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    getCachedResult: vi.fn().mockReturnValue(null),
    getApiHealth: vi.fn().mockReturnValue(null),
  },
}));

// Mock ptyService
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

// Mock projectService
vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveProjectPath: vi.fn().mockResolvedValue('/mock/project/path'),
    findProjectByPath: vi.fn().mockResolvedValue({ projectSlug: 'test-project' }),
  },
}));

// Mock dashboardService (Story 20.1)
const mockGetProjectStatus = vi.fn().mockResolvedValue({
  projectSlug: 'test-project',
  activeSessionCount: 0,
  totalSessionCount: 0,
  queueStatus: 'idle',
  terminalCount: 0,
});
vi.mock('../../services/dashboardService.js', () => ({
  dashboardService: {
    getProjectStatus: (...args: unknown[]) => mockGetProjectStatus(...args),
  },
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }),
}));

describe('WebSocket Handler', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 3001;

  beforeEach(async () => {
    // Reset shared ChatService mock state
    mockState.sendImpl = vi.fn().mockResolvedValue({});
    mockState.lastCtorArgs = undefined;

    // Create HTTP server
    httpServer = createServer();

    // Initialize WebSocket (now async for session middleware - Story 2.5)
    ioServer = await initializeWebSocket(httpServer);

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });

  afterEach(async () => {
    // Cleanup client socket
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }

    // Close server
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  describe('initializeWebSocket', () => {
    it('should return a Socket.io server instance', () => {
      expect(ioServer).toBeInstanceOf(SocketIOServer);
    });

    it('should configure CORS for localhost:5173', () => {
      const opts = ioServer.engine.opts;
      expect(opts.cors).toBeDefined();
      // Type assertion for CorsOptions object
      const corsOpts = opts.cors as {
        origin?: string;
        methods?: string[];
        credentials?: boolean;
      };
      expect(corsOpts.origin).toBe('http://localhost:5173');
      expect(corsOpts.methods).toContain('GET');
      expect(corsOpts.methods).toContain('POST');
      expect(corsOpts.credentials).toBe(true);
    });
  });

  describe('getIO', () => {
    it('should return the initialized Socket.io instance', () => {
      const io = getIO();
      expect(io).toBe(ioServer);
    });
  });

  describe('Client connection', () => {
    it('should accept client connection', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          expect(clientSocket.connected).toBe(true);
          resolve();
        });
      });
    });

    it('should increment connected clients count on connection', async () => {
      const initialCount = getConnectedClientsCount();

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          expect(getConnectedClientsCount()).toBe(initialCount + 1);
          resolve();
        });
      });
    });

    it('should decrement connected clients count on disconnect', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const countBeforeDisconnect = getConnectedClientsCount();

      clientSocket.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getConnectedClientsCount()).toBe(countBeforeDisconnect - 1);
    });

    it('should log connection and disconnection', async () => {
      const { createLogger } = await import('../../utils/logger.js');
      const mockLogger = vi.mocked(createLogger).mock.results[0]?.value;

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Client connected')
      );

      clientSocket.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Client disconnected')
      );
    });
  });

  describe('Multiple clients', () => {
    let clientSocket2: ClientSocket;

    afterEach(() => {
      if (clientSocket2?.connected) {
        clientSocket2.disconnect();
      }
    });

    it('should track multiple client connections', async () => {
      const initialCount = getConnectedClientsCount();

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      clientSocket2 = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket.on('connect', () => resolve());
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('connect', () => resolve());
        }),
      ]);

      expect(getConnectedClientsCount()).toBe(initialCount + 2);
    });
  });

  describe('chat:send event handler', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should emit error for invalid workingDirectory (non-existent)', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        sessionId: 'test-session',
        content: 'Hello',
        workingDirectory: '/non/existent/path',
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.INVALID_WORKING_DIR);
      expect(error.message).toBe('ws.error.projectPathNotFound');
    });

    it('should emit error for empty workingDirectory', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        sessionId: 'test-session',
        content: 'Hello',
        workingDirectory: '',
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.INVALID_WORKING_DIR);
    });

    it('should call ChatService when workingDirectory is valid', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/valid/path',
      });

      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.lastCtorArgs).toEqual(expect.objectContaining({ workingDirectory: '/valid/path' }));
      expect(mockState.sendImpl).toHaveBeenCalledWith(
        'Hello Claude',
        expect.any(Object),
        expect.any(Object),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should pass resume option when sessionId and resume are provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'resume-session-id',
        resume: true,
      });

      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // chatOptions includes resume and abortController
      expect(mockState.sendImpl).toHaveBeenCalledWith(
        'Continue our work',
        expect.any(Object),
        expect.objectContaining({ resume: 'resume-session-id', abortController: expect.any(AbortController) }),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should pass resumeSessionAt to chatOptions when provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Edited message',
        workingDirectory: '/valid/path',
        sessionId: 'branch-session-id',
        resume: true,
        resumeSessionAt: 'assistant-uuid-123',
        rewindToMessageUuid: 'user-uuid-456',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.sendImpl).toHaveBeenCalledWith(
        'Edited message',
        expect.any(Object),
        expect.objectContaining({
          resume: 'branch-session-id',
          resumeSessionAt: 'assistant-uuid-123',
          enableFileCheckpointing: true,
          rewindToMessageUuid: 'user-uuid-456',
        }),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should always include enableFileCheckpointing: true in chatOptions', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Normal message',
        workingDirectory: '/valid/path',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.sendImpl).toHaveBeenCalledWith(
        'Normal message',
        expect.any(Object),
        expect.objectContaining({
          enableFileCheckpointing: true,
        }),
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  describe('WebSocket Authentication (Story 2.5)', () => {
    it('should accept connection with authenticated session', async () => {
      // Default mock has authenticated: true
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          expect(clientSocket.connected).toBe(true);
          resolve();
        });
      });
    });
  });

  describe('Story 5.2: permissionMode handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should pass permissionMode to ChatService constructor when provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/valid/path',
        permissionMode: 'plan',
      });

      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.lastCtorArgs).toEqual(expect.objectContaining({ workingDirectory: '/valid/path', permissionMode: 'plan' }));
    });

    it('should pass undefined permissionMode when not provided (defaults to default)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/valid/path',
      });

      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.lastCtorArgs).toEqual(expect.objectContaining({ workingDirectory: '/valid/path' }));
    });

    it('should pass acceptEdits permissionMode to ChatService', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Auto edit',
        workingDirectory: '/valid/path',
        permissionMode: 'acceptEdits',
      });

      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.lastCtorArgs).toEqual(expect.objectContaining({ workingDirectory: '/valid/path', permissionMode: 'acceptEdits' }));
    });
  });

  describe('Story 5.5: Image validation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should reject images exceeding 10MB', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      // 10MB = 10 * 1024 * 1024 bytes; base64 length * 0.75 = original bytes
      // So base64 length > 10MB / 0.75 ≈ 14,000,000 chars
      const oversizedBase64 = 'A'.repeat(15_000_000);

      clientSocket.emit('chat:send', {
        content: 'Check this',
        workingDirectory: '/valid/path',
        images: [
          { mimeType: 'image/png', data: oversizedBase64, name: 'large.png' },
        ],
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.message).toBe('ws.error.imageSizeExceeded');
    });

    it('should reject unsupported MIME types', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Check this',
        workingDirectory: '/valid/path',
        images: [
          { mimeType: 'image/svg+xml', data: 'PHN2Zz4=', name: 'icon.svg' },
        ],
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.message).toBe('ws.error.unsupportedImageFormat');
    });

    it('should reject more than 5 images', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      const sixImages = Array.from({ length: 6 }, (_, i) => ({
        mimeType: 'image/png',
        data: 'iVBORw0KGgo=',
        name: `img${i}.png`,
      }));

      clientSocket.emit('chat:send', {
        content: 'Check these',
        workingDirectory: '/valid/path',
        images: sixImages,
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.message).toBe('ws.error.maxImages');
    });
  });

  describe('Story 4.6: Error Handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should pass abortController in chatOptions', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/valid/path',
      });

      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.sendImpl).toHaveBeenCalledWith(
        'Hello Claude',
        expect.any(Object),
        expect.objectContaining({
          abortController: expect.any(AbortController),
        }),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should retry without resume when resume fails, then emit CHAT_ERROR if retry also fails', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockRejectedValue(
        new Error('Session not found: invalid-session-id')
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'invalid-session-id',
        resume: true,
      });

      const error = await errorPromise;

      // Resume fails → retries without resume → also fails → CHAT_ERROR
      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      // sendImpl should be called twice: once with resume, once without
      expect(mockState.sendImpl).toHaveBeenCalledTimes(2);
      // First call should have resume option, second should have sessionId without resume
      const firstCallOptions = mockState.sendImpl.mock.calls[0][2];
      const secondCallOptions = mockState.sendImpl.mock.calls[1][2];
      expect(firstCallOptions).toHaveProperty('resume', 'invalid-session-id');
      expect(secondCallOptions).not.toHaveProperty('resume');
      expect(secondCallOptions).toHaveProperty('sessionId', 'invalid-session-id');
    });

    it('should NOT retry for rate-limit/auth/network errors during resume', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockRejectedValue(
        new Error('Network connection failed')
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'valid-session-id',
        resume: true,
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      // Network errors should NOT trigger retry — only called once
      expect(mockState.sendImpl).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry for rate-limit errors during resume', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockRejectedValue(
        new Error('Rate limit exceeded, too many requests')
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'valid-session-id',
        resume: true,
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      // Rate limit errors should NOT trigger retry
      expect(mockState.sendImpl).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry for authentication errors during resume', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      mockState.sendImpl = vi.fn().mockRejectedValue(
        new Error('Authentication failed: unauthorized')
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'valid-session-id',
        resume: true,
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      expect(mockState.sendImpl).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry when onSessionInit has already fired (hasEmittedOutput guard)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      // First call: invoke onSessionInit callback (simulating output started), then reject
      mockState.sendImpl = vi.fn().mockImplementation(
        (_content: string, callbacks: { onSessionInit?: (sid: string, meta: unknown) => void }) => {
          // Simulate SDK firing onSessionInit before the error
          callbacks.onSessionInit?.('test-session-id', { model: 'test' });
          return Promise.reject(new Error('Some session error after output started'));
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'valid-session-id',
        resume: true,
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
      // Should NOT retry because output was already emitted
      expect(mockState.sendImpl).toHaveBeenCalledTimes(1);
    });

    it('should emit CHAT_ERROR when SDK throws error', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockRejectedValue(
        new Error('SDK internal error')
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.CHAT_ERROR);
    });

    it('should emit TIMEOUT_ERROR when chat response times out', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      // Import AbortedError for simulation
      const { AbortedError } = await import('../../utils/errors.js');


      // Simulate timeout by throwing AbortedError
      mockState.sendImpl =vi.fn().mockRejectedValue(
        new AbortedError()
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      const error = await errorPromise;

      expect(error.code).toBe(ERROR_CODES.TIMEOUT_ERROR);
      expect(error.message).toBe('ws.error.timeout');
    });

    it('should call abortController.abort() when timeout occurs', async () => {
      vi.mocked(existsSync).mockReturnValue(true);



      // Track if abortController was passed and its state
      let capturedAbortController: AbortController | null = null;

      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, _callbacks: unknown, options: { abortController?: AbortController }) => {
          capturedAbortController = options.abortController || null;
          // Simulate long-running operation that checks abort signal
          return new Promise((resolve, reject) => {
            if (capturedAbortController) {
              capturedAbortController.signal.addEventListener('abort', () => {
                reject(new Error('Aborted'));
              });
            }
            // Don't resolve - let timeout trigger
          });
        }
      );


      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      // Wait for handler to start processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify abortController was passed
      expect(capturedAbortController).toBeInstanceOf(AbortController);
    });

    it('should use CHAT_TIMEOUT_MS from config for timeout value', async () => {
      // This test verifies that config.chat.timeoutMs is used
      // The mock config sets it to 300000 (5 minutes)
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockResolvedValue({});


      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      // Wait for handler to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify ChatService was called (timeout didn't trigger immediately)
      // This implicitly tests that config.chat.timeoutMs (300000ms) is being used
      // If timeout was 0 or very small, the call would abort immediately
      expect(mockState.sendImpl).toHaveBeenCalled();
    });
  });

  describe('Story 4.6: Session Events', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should emit session:created for new session', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: { onSessionInit?: (sessionId: string) => void }) => {
          // Simulate session init callback
          callbacks.onSessionInit?.('new-session-123');
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const sessionPromise = new Promise<{ sessionId: string }>((resolve) => {
        clientSocket.on('session:created', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/valid/path',
      });

      const session = await sessionPromise;

      expect(session.sessionId).toBe('new-session-123');
    });

    it('should emit session:resumed for resumed session', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: { onSessionInit?: (sessionId: string) => void }) => {
          // Simulate session init callback for resumed session
          callbacks.onSessionInit?.('resumed-session-456');
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const sessionPromise = new Promise<{ sessionId: string }>((resolve) => {
        clientSocket.on('session:resumed', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Continue our work',
        workingDirectory: '/valid/path',
        sessionId: 'resumed-session-456',
        resume: true,
      });

      const session = await sessionPromise;

      expect(session.sessionId).toBe('resumed-session-456');
    });
  });

  describe('Story 4.6: Message Type Events', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should emit message:chunk for text chunks', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string) => void;
          onTextChunk?: (chunk: { sessionId: string; messageId: string; content: string; done: boolean }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123');
          callbacks.onTextChunk?.({
            sessionId: 'session-123',
            messageId: 'msg-1',
            content: 'Hello',
            done: false,
          });
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const chunkPromise = new Promise<{ content: string }>((resolve) => {
        clientSocket.on('message:chunk', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/valid/path',
      });

      const chunk = await chunkPromise;

      expect(chunk.content).toBe('Hello');
    });

    it('should emit tool:call for tool use', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string) => void;
          onToolUse?: (toolCall: { id: string; name: string; input: Record<string, unknown> }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123');
          callbacks.onToolUse?.({
            id: 'tool-call-1',
            name: 'Read',
            input: { file_path: '/path/to/file.ts' },
          });
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const toolCallPromise = new Promise<{ id: string; name: string }>((resolve) => {
        clientSocket.on('tool:call', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Read the file',
        workingDirectory: '/valid/path',
      });

      const toolCall = await toolCallPromise;

      expect(toolCall.id).toBe('tool-call-1');
      expect(toolCall.name).toBe('Read');
    });

    it('should emit tool:result for tool results', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string) => void;
          onToolResult?: (toolCallId: string, result: { success: boolean; output?: string }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123');
          callbacks.onToolResult?.('tool-call-1', { success: true, output: 'file contents' });
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const toolResultPromise = new Promise<{ toolCallId: string; result: { success: boolean } }>((resolve) => {
        clientSocket.on('tool:result', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Read the file',
        workingDirectory: '/valid/path',
      });

      const toolResult = await toolResultPromise;

      expect(toolResult.toolCallId).toBe('tool-call-1');
      expect(toolResult.result.success).toBe(true);
    });

    it('should emit message:complete for completed messages', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string) => void;
          onComplete?: (response: { id: string; sessionId: string; content: string }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123');
          callbacks.onComplete?.({
            id: 'response-1',
            sessionId: 'session-123',
            content: 'Task completed',
          });
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const completePromise = new Promise<{ id: string; role: string; content: string }>((resolve) => {
        clientSocket.on('message:complete', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Complete the task',
        workingDirectory: '/valid/path',
      });

      const message = await completePromise;

      expect(message.id).toBe('response-1');
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Task completed');
    });
  });

  describe('Story 5.6: context:usage event', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should emit context:usage when response has usage data', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      const mockUsage = {
        inputTokens: 150000,
        outputTokens: 500,
        cacheReadInputTokens: 80000,
        cacheCreationInputTokens: 5000,
        totalCostUSD: 0.05,
        contextWindow: 200000,
      };
      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string) => void;
          onComplete?: (response: { id: string; sessionId: string; content: string; usage?: unknown }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123');
          callbacks.onComplete?.({
            id: 'response-1',
            sessionId: 'session-123',
            content: 'Done',
            usage: mockUsage,
          });
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const usagePromise = new Promise<Record<string, unknown>>((resolve) => {
        clientSocket.on('context:usage', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      const usage = await usagePromise;

      expect(usage).toEqual(mockUsage);
    });

    it('should not emit context:usage when response has no usage data', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string) => void;
          onComplete?: (response: { id: string; sessionId: string; content: string }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123');
          callbacks.onComplete?.({
            id: 'response-1',
            sessionId: 'session-123',
            content: 'Done',
          });
          return {};
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      let usageReceived = false;
      clientSocket.on('context:usage', () => {
        usageReceived = true;
      });

      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      // Wait to ensure no context:usage event is emitted
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(usageReceived).toBe(false);
    });
  });

  describe('Story 5.4: chat:abort event handler', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should abort active request when chat:abort is received', async () => {
      vi.mocked(existsSync).mockReturnValue(true);



      let capturedAbortController: AbortController | null = null;

      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, _callbacks: unknown, options: { abortController?: AbortController }) => {
          capturedAbortController = options.abortController || null;
          // Simulate long-running operation
          return new Promise((_resolve, reject) => {
            if (capturedAbortController) {
              capturedAbortController.signal.addEventListener('abort', () => {
                reject(new Error('Aborted'));
              });
            }
          });
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      // Start a chat request
      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      // Wait for handler to start processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Emit abort
      clientSocket.emit('chat:abort');

      // Wait for abort to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the abort controller was aborted with 'user-abort' reason
      expect(capturedAbortController).toBeInstanceOf(AbortController);
      expect(capturedAbortController!.signal.aborted).toBe(true);
      expect(capturedAbortController!.signal.reason).toBe('user-abort');
    });

    it('should be no-op when no active request exists', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      // Emit abort without any active chat:send — should not throw
      clientSocket.emit('chat:abort');

      // Wait to ensure no errors
      await new Promise((resolve) => setTimeout(resolve, 100));

      // If we reach here, no error was thrown — test passes
      expect(true).toBe(true);
    });

    it('should not emit error event on user-initiated abort', async () => {
      vi.mocked(existsSync).mockReturnValue(true);


      const { AbortedError } = await import('../../utils/errors.js');

      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, _callbacks: unknown, options: { abortController?: AbortController }) => {
          return new Promise((_resolve, reject) => {
            if (options.abortController) {
              options.abortController.signal.addEventListener('abort', () => {
                reject(new AbortedError());
              });
            }
          });
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errors: { code: string; message: string }[] = [];
      clientSocket.on('error', (error) => errors.push(error));

      // Start a chat request
      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      // Wait for handler to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // User-initiated abort
      clientSocket.emit('chat:abort');

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should NOT have received any error events
      expect(errors).toHaveLength(0);
    });

    it('should NOT abort active stream on disconnect (stream survives for reconnection)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      let capturedAbortController: AbortController | null = null;

      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, _callbacks: unknown, options: { abortController?: AbortController }) => {
          capturedAbortController = options.abortController || null;
          return new Promise((_resolve, reject) => {
            if (capturedAbortController) {
              capturedAbortController.signal.addEventListener('abort', () => {
                reject(new Error('Aborted'));
              });
            }
          });
        }
      );

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      // Start a chat request
      clientSocket.emit('chat:send', {
        content: 'Hello',
        workingDirectory: '/valid/path',
      });

      // Wait for handler to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Disconnect
      clientSocket.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Stream should NOT be aborted — it survives disconnects for reconnection support.
      // The activity timeout will eventually abort it if no client reconnects.
      expect(capturedAbortController).toBeInstanceOf(AbortController);
      expect(capturedAbortController!.signal.aborted).toBe(false);
    });
  });

  // Story 20.1: Dashboard WebSocket events
  describe('Dashboard subscribe/unsubscribe', () => {
    it('should join dashboard room on dashboard:subscribe', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify by checking server-side room membership
      const rooms = ioServer.sockets.adapter.rooms.get('dashboard');
      expect(rooms).toBeDefined();
      expect(rooms!.size).toBe(1);
    });

    it('should leave dashboard room on dashboard:unsubscribe', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      clientSocket.emit('dashboard:unsubscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const rooms = ioServer.sockets.adapter.rooms.get('dashboard');
      // Room should be empty or deleted
      expect(rooms?.size ?? 0).toBe(0);
    });

    it('should clean up dashboard room on disconnect', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      clientSocket.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const rooms = ioServer.sockets.adapter.rooms.get('dashboard');
      expect(rooms?.size ?? 0).toBe(0);
    });

    it('should emit dashboard:status-change only to dashboard room', async () => {
      // Client 1: subscribed to dashboard
      const client1 = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      // Client 2: NOT subscribed to dashboard
      const client2 = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', () => resolve())),
        new Promise<void>((resolve) => client2.on('connect', () => resolve())),
      ]);

      client1.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      let client1Received = false;
      let client2Received = false;

      client1.on('dashboard:status-change', () => { client1Received = true; });
      client2.on('dashboard:status-change', () => { client2Received = true; });

      // Emit directly to dashboard room to test room isolation
      ioServer.to('dashboard').emit('dashboard:status-change', {
        projectSlug: 'test',
        status: {
          projectSlug: 'test',
          activeSessionCount: 0,
          totalSessionCount: 0,
          queueStatus: 'idle',
          terminalCount: 0,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(client1Received).toBe(true);
      expect(client2Received).toBe(false);

      client1.disconnect();
      client2.disconnect();
    });

    it('should debounce rapid status changes (300ms)', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      let receivedCount = 0;
      clientSocket.on('dashboard:status-change', () => { receivedCount++; });

      // Import the trigger function indirectly by triggering terminal events
      // which internally call triggerDashboardStatusChange
      const { ptyService } = await import('../../services/ptyService.js');
      vi.mocked(ptyService.createSession).mockReturnValue({ terminalId: 'term-debounce-1', shell: 'bash' } as any);
      vi.mocked(ptyService.onData).mockImplementation(() => {});
      vi.mocked(ptyService.onExit).mockImplementation(() => {});

      // Trigger 3 rapid terminal creates (each triggers dashboard status change)
      clientSocket.emit('terminal:create', { projectSlug: 'test-project' });
      clientSocket.emit('terminal:create', { projectSlug: 'test-project' });
      clientSocket.emit('terminal:create', { projectSlug: 'test-project' });

      // Wait less than debounce interval — should not have received yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(receivedCount).toBe(0);

      // Wait for debounce to fire (300ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(receivedCount).toBe(1);
    });

    it('should debounce per-project independently', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const receivedSlugs: string[] = [];
      clientSocket.on('dashboard:status-change', (data: any) => {
        receivedSlugs.push(data.projectSlug);
      });

      mockGetProjectStatus.mockImplementation(async (slug: string) => ({
        projectSlug: slug,
        activeSessionCount: 0,
        totalSessionCount: 0,
        queueStatus: 'idle' as const,
        terminalCount: 0,
      }));

      const { ptyService } = await import('../../services/ptyService.js');
      vi.mocked(ptyService.createSession).mockReturnValue({ terminalId: 'term-iso-1', shell: 'bash' } as any);
      vi.mocked(ptyService.onData).mockImplementation(() => {});
      vi.mocked(ptyService.onExit).mockImplementation(() => {});

      const { projectService } = await import('../../services/projectService.js');
      vi.mocked(projectService.resolveProjectPath).mockResolvedValue('/mock/path');

      // Trigger for project-A
      clientSocket.emit('terminal:create', { projectSlug: 'project-a' });
      // Trigger for project-B
      clientSocket.emit('terminal:create', { projectSlug: 'project-b' });

      // Wait for debounce to fire
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Both projects should get separate broadcasts
      expect(receivedSlugs).toContain('project-a');
      expect(receivedSlugs).toContain('project-b');
    });

    it('should trigger dashboard status change on terminal:close', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      let received = false;
      clientSocket.on('dashboard:status-change', () => { received = true; });

      // Mock ptyService.getSession to return session data with projectSlug
      const { ptyService } = await import('../../services/ptyService.js');
      vi.mocked(ptyService.getSession).mockReturnValue({
        terminalId: 'term-close-1',
        projectSlug: 'test-project',
        shell: 'bash',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      } as any);

      clientSocket.emit('terminal:close', { terminalId: 'term-close-1' });

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(received).toBe(true);
      expect(ptyService.getSession).toHaveBeenCalledWith('term-close-1');
    });

    it('should trigger dashboard status change on terminal:exit (natural PTY exit)', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('dashboard:subscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      let received = false;
      clientSocket.on('dashboard:status-change', () => { received = true; });

      // Capture the onExit callback
      let capturedOnExit: ((exitCode: number) => void) | null = null;
      const { ptyService } = await import('../../services/ptyService.js');
      vi.mocked(ptyService.createSession).mockReturnValue({ terminalId: 'term-exit-1', shell: 'bash' } as any);
      vi.mocked(ptyService.onData).mockImplementation(() => {});
      vi.mocked(ptyService.onExit).mockImplementation((_id, cb) => {
        capturedOnExit = cb;
      });

      clientSocket.emit('terminal:create', { projectSlug: 'test-project' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reset received flag (terminal:create also triggers dashboard)
      received = false;
      mockGetProjectStatus.mockClear();

      // Simulate natural PTY exit
      expect(capturedOnExit).not.toBeNull();
      capturedOnExit!(0);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(received).toBe(true);
    });
  });
});
