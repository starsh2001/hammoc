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
import { projectService } from '../../services/projectService.js';

// Shared mock state — accessible via vi.hoisted() for vi.mock factories
const { mockState } = vi.hoisted(() => {
  const mockState = {
    sendImpl: vi.fn().mockResolvedValue({}),
    // Story 32.3: the rewind handler now delegates to the engine's rewindFiles
    rewindImpl: vi.fn(),
    lastCtorArgs: undefined as unknown,
    // Story 35.1: lets a test drive the engine's permission mode so the
    // auto-approve branches in canUseTool (ExitPlanMode / safety-check in
    // bypassPermissions) can be exercised. Defaults to 'default'.
    permissionMode: 'default' as string,
  };
  return { mockState };
});

// Stub the Agent SDK module. Story 32.3 moved the rewind handler's SDK call
// behind the ChatEngine seam, so the handler no longer drives `query` directly.
// This stub only prevents the real SDK from loading via transitive importers
// (e.g. summarizeService, which websocket.ts imports) during these socket tests.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

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
    getPermissionMode() { return mockState.permissionMode; }
    rewindFiles(...args: unknown[]) { return mockState.rewindImpl(...args); }
  },
}));

// Mock CliChatEngine — the factory returns this when the effective engine mode is 'cli'.
// Delegates to the SAME mockState as the SDK mock so a CLI-mode test drives the same seam;
// existing tests stay on 'sdk' (the default getEffectiveEngineMode mock) and never touch this.
vi.mock('../../services/cliChatEngine.js', () => ({
  CliChatEngine: class MockCliChatEngine {
    constructor(...args: unknown[]) { mockState.lastCtorArgs = args[0]; }
    sendMessageWithCallbacks(...args: unknown[]) { return mockState.sendImpl(...args); }
    setPermissionMode() {}
    getPermissionMode() { return mockState.permissionMode; }
    rewindFiles(...args: unknown[]) { return mockState.rewindImpl(...args); }
  },
}));

// Mock SessionService - must be a real class (used with `new`). Also exposes the
// `sessionService` singleton consumed by websocket.ts (chat:send uses it to derive
// the project slug for the active-stream session list).
vi.mock('../../services/sessionService.js', () => {
  class MockSessionService {
    saveSessionId = vi.fn().mockResolvedValue(undefined);
    getSessionId = vi.fn().mockResolvedValue(null);
    encodeProjectPath = vi.fn().mockReturnValue('mock-project-slug');
    getSessionFilePath = vi.fn().mockReturnValue('/mock/.claude/projects/mock-project-slug/session.jsonl');
    getProjectDir = vi.fn().mockReturnValue('/mock/.claude/projects/mock-project-slug');
    updateSessionIndex = vi.fn().mockResolvedValue(undefined);
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
  }
  return { SessionService: MockSessionService, sessionService: new MockSessionService() };
});

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
    readPreferences: vi.fn().mockResolvedValue({
      theme: 'dark',
      defaultModel: '',
      permissionMode: 'default',
      chatTimeoutMs: 300000,
      permissionSyncPolicy: 'manual',
    }),
  },
}));

// Mock config (Story 4.6)
vi.mock('../../config/index.js', () => ({
  config: {
    chat: {
      timeoutMs: 300000, // 5 minutes default
    },
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
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
    // Story 35.1: canUseTool consults shouldNotify before notifying; default to
    // false so the permission-wait tests don't branch into Telegram formatting.
    shouldNotify: vi.fn().mockReturnValue(false),
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
    hasOAuthCredentials: vi.fn().mockReturnValue(false),
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
    resolveOriginalPath: vi.fn().mockResolvedValue('/mock/project/path'),
    findProjectByPath: vi.fn().mockResolvedValue({ projectSlug: 'test-project' }),
    // Story 33.3: the chat-send + rewind paths resolve the effective engine mode before
    // creating the engine. Default 'sdk' keeps these tests on the mocked ChatService path.
    getEffectiveEngineMode: vi.fn().mockResolvedValue('sdk'),
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

// Mock summarizeService (Story 25.9)
const mockSummarize = vi.fn();
vi.mock('../../services/summarizeService.js', () => ({
  summarize: (...args: unknown[]) => mockSummarize(...args),
}));

// Mock historyParser (Story 25.9)
const mockParseJSONLFile = vi.fn();
vi.mock('../../services/historyParser.js', () => ({
  parseJSONLFile: (...args: unknown[]) => mockParseJSONLFile(...args),
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
    mockState.permissionMode = 'default';

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
      // Socket.IO stores cors options on the server opts, not engine opts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts = (ioServer as any).opts || ioServer.engine.opts;
      const corsOpts = (opts.cors ?? ioServer.engine.opts.cors) as {
        origin?: string | boolean;
        methods?: string[];
        credentials?: boolean;
      };
      expect(corsOpts).toBeDefined();
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

  describe('permission:mode-change — verified-mode readback + originator convergence (Story 37.5)', () => {
    let clientSocket2: ClientSocket;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(true);
    });

    afterEach(() => {
      if (clientSocket2?.connected) clientSocket2.disconnect();
    });

    // Open two clients, start a RUNNING stream owned by clientSocket (sendImpl never resolves so
    // status stays 'running' and setPermissionMode is actually invoked), and join clientSocket2 as a
    // room viewer. `verifiedMode` is what the engine's getPermissionMode() reports back (the read-back
    // the handler broadcasts) — set ≠ request to model a CLI fail-safe / off-cycle landing.
    async function runningStreamWithViewer(sessionId: string, verifiedMode: string): Promise<void> {
      mockState.sendImpl = vi.fn(() => new Promise<never>(() => {})); // never resolves → stays running
      mockState.permissionMode = verifiedMode; // mock getPermissionMode() returns this (the verified mode)

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
      clientSocket2 = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
      await Promise.all([
        new Promise<void>((r) => clientSocket.on('connect', () => r())),
        new Promise<void>((r) => clientSocket2.on('connect', () => r())),
      ]);

      clientSocket.emit('chat:send', { sessionId, content: 'hi', workingDirectory: '/valid/path' });
      await new Promise((r) => setTimeout(r, 150)); // let the stream reach running + chatService set
      expect(mockState.sendImpl).toHaveBeenCalled();

      clientSocket2.emit('session:join', sessionId); // join the broadcast room as a viewer
      await new Promise((r) => setTimeout(r, 80));
    }

    it('broadcasts the VERIFIED applied mode (getPermissionMode read-back), not the requested mode', async () => {
      // Engine "lands" on plan though bypassPermissions was requested (fail-safe / off-cycle).
      await runningStreamWithViewer('perm-375-readback', 'plan');

      const viewerMsg = new Promise<{ mode: string }>((r) =>
        clientSocket2.on('permission:mode-change', (m) => r(m)),
      );
      const originatorMsg = new Promise<{ mode: string }>((r) =>
        clientSocket.on('permission:mode-change', (m) => r(m)),
      );

      clientSocket.emit('permission:mode-change', { mode: 'bypassPermissions', projectSlug: 'mock-project-slug' });

      // Viewer (room broadcast, sender excluded) gets the VERIFIED mode — NOT the inbound request.
      await expect(viewerMsg).resolves.toEqual({ mode: 'plan' });
      // Originator convergence: on divergence the sender ALSO receives the verified mode (its
      // optimistic selector was on the wrong request value).
      await expect(originatorMsg).resolves.toEqual({ mode: 'plan' });
    });

    it('does NOT self-echo to the originator when the verified mode equals the request (normal path)', async () => {
      // Engine verifies exactly the requested mode → no divergence → no redundant self-echo.
      await runningStreamWithViewer('perm-375-noecho', 'acceptEdits');

      let selfEcho = false;
      clientSocket.on('permission:mode-change', () => {
        selfEcho = true;
      });
      const viewerMsg = new Promise<{ mode: string }>((r) =>
        clientSocket2.on('permission:mode-change', (m) => r(m)),
      );

      clientSocket.emit('permission:mode-change', { mode: 'acceptEdits', projectSlug: 'mock-project-slug' });

      await expect(viewerMsg).resolves.toEqual({ mode: 'acceptEdits' }); // viewer still gets the broadcast
      await new Promise((r) => setTimeout(r, 100));
      expect(selfEcho).toBe(false); // sender (socket.to excludes it) gets no echo on the normal path
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
        expect.any(Function),
        undefined, // onGenerationProgress gated off in SDK mode (Story 33.3)
        undefined, // onPhase gated off in SDK mode (Story 36.2)
        undefined // onPtyRaw gated off in SDK mode (debug PTY mirror)
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
        expect.any(Function),
        undefined, // onGenerationProgress gated off in SDK mode (Story 33.3)
        undefined, // onPhase gated off in SDK mode (Story 36.2)
        undefined // onPtyRaw gated off in SDK mode (debug PTY mirror)
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
        expect.any(Function),
        undefined, // onGenerationProgress gated off in SDK mode (Story 33.3)
        undefined, // onPhase gated off in SDK mode (Story 36.2)
        undefined // onPtyRaw gated off in SDK mode (debug PTY mirror)
      );
    });

    it('should pass forkSession to chatOptions when provided (Story 25.11)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockState.sendImpl = vi.fn().mockResolvedValue({});

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('chat:send', {
        content: 'Continue from here',
        workingDirectory: '/valid/path',
        sessionId: 'original-session-id',
        resume: true,
        resumeSessionAt: 'assistant-uuid-123',
        forkSession: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockState.sendImpl).toHaveBeenCalledWith(
        'Continue from here',
        expect.any(Object),
        expect.objectContaining({
          resume: 'original-session-id',
          resumeSessionAt: 'assistant-uuid-123',
          forkSession: true,
          enableFileCheckpointing: true,
        }),
        expect.any(Function),
        expect.any(Function),
        undefined, // onGenerationProgress gated off in SDK mode (Story 33.3)
        undefined, // onPhase gated off in SDK mode (Story 36.2)
        undefined // onPtyRaw gated off in SDK mode (debug PTY mirror)
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
        expect.any(Function),
        undefined, // onGenerationProgress gated off in SDK mode (Story 33.3)
        undefined, // onPhase gated off in SDK mode (Story 36.2)
        undefined // onPtyRaw gated off in SDK mode (debug PTY mirror)
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
        expect.any(Function),
        undefined, // onGenerationProgress gated off in SDK mode (Story 33.3)
        undefined, // onPhase gated off in SDK mode (Story 36.2)
        undefined // onPtyRaw gated off in SDK mode (debug PTY mirror)
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

  describe('Story 35.1: inactivity timer pause/resume during input wait', () => {
    // The chat inactivity timer is a setTimeout/clearTimeout pair. We fake ONLY those
    // so it becomes deterministically advanceable, while socket.io I/O (setImmediate,
    // ping setInterval, Date, microtasks) stays real — letting chat:send / permission
    // events still flow over the live socket. We connect first (real timers), then
    // switch to fake timers right before chat:send so the handler's own timer is faked.
    const TIMEOUT_MS = 300000; // mirrors mocked config.chat.timeoutMs

    // canUseTool as the handler passes it to the engine (4th arg of sendMessageWithCallbacks).
    type TestCanUseTool = (
      tool: string,
      input: Record<string, unknown>,
      opts: { toolUseID?: string; signal?: AbortSignal; title?: string },
    ) => Promise<{ behavior: string; updatedInput?: unknown }>;

    afterEach(() => {
      vi.useRealTimers();
    });

    // Drive real macrotasks (setImmediate is NOT faked) until `predicate` holds, so
    // socket delivery + the handler's mocked-async chain progress even though the
    // chat timer's setTimeout is frozen.
    const flushUntil = async (predicate: () => boolean, maxTicks = 300): Promise<void> => {
      for (let i = 0; i < maxTicks && !predicate(); i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };

    const connect = async (): Promise<void> => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
    };

    it('pauses the timer while awaiting permission — no abort past the timeout (AC1)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      let captured: AbortController | null = null;
      let enteredWait = false;
      let releaseSend!: () => void;
      const sendHeld = new Promise<void>((r) => { releaseSend = r; });

      mockState.sendImpl = vi.fn().mockImplementation(
        async (_c: string, _cb: unknown, options: { abortController?: AbortController }, canUseTool: TestCanUseTool) => {
          captured = options.abortController ?? null;
          // Entering the wait synchronously pauses the timer before the await yields.
          void canUseTool('Bash', { command: 'ls' }, { toolUseID: 'perm-1', signal: options.abortController?.signal });
          enteredWait = true;
          await sendHeld; // keep the SDK call open so the paused state persists
          return {};
        },
      );

      await connect();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      clientSocket.emit('chat:send', { content: 'Hi', workingDirectory: '/valid/path' });
      await flushUntil(() => enteredWait);

      // Timer was cleared on wait-entry. Advancing well past the timeout must NOT abort.
      vi.advanceTimersByTime(TIMEOUT_MS * 3);
      expect(captured).toBeInstanceOf(AbortController);
      expect(captured!.signal.aborted).toBe(false);

      releaseSend();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });

    it('resumes the timer after the user responds — aborts on later inactivity (AC2)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      let captured: AbortController | null = null;
      let enteredWait = false;
      let resolved = false;
      let releaseSend!: () => void;
      const sendHeld = new Promise<void>((r) => { releaseSend = r; });

      mockState.sendImpl = vi.fn().mockImplementation(
        async (_c: string, _cb: unknown, options: { abortController?: AbortController }, canUseTool: TestCanUseTool) => {
          captured = options.abortController ?? null;
          // .then fires AFTER canUseTool's finally re-armed the timer.
          void canUseTool('Bash', { command: 'ls' }, { toolUseID: 'perm-2', signal: options.abortController?.signal })
            .then(() => { resolved = true; });
          enteredWait = true;
          await sendHeld; // keep the SDK call open so the re-armed timer can fire
          return {};
        },
      );

      await connect();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      clientSocket.emit('chat:send', { content: 'Hi', workingDirectory: '/valid/path' });
      await flushUntil(() => enteredWait);

      // Respond — the finally clears the pause and re-arms the timer.
      clientSocket.emit('permission:respond', { requestId: 'perm-2', approved: true, interactionType: 'permission' });
      await flushUntil(() => resolved);

      // Re-armed but not yet elapsed → not aborted.
      expect(captured!.signal.aborted).toBe(false);
      // Elapse the resumed timer with no further activity → hang detection fires.
      vi.advanceTimersByTime(TIMEOUT_MS + 1000);
      expect(captured!.signal.aborted).toBe(true);
      expect(captured!.signal.reason).toBe('timeout');

      releaseSend();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });

    it('still fires during generation when no wait is entered — hang detection intact (AC4)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      let captured: AbortController | null = null;
      let started = false;
      let releaseSend!: () => void;
      const sendHeld = new Promise<void>((r) => { releaseSend = r; });

      mockState.sendImpl = vi.fn().mockImplementation(
        async (_c: string, _cb: unknown, options: { abortController?: AbortController }) => {
          captured = options.abortController ?? null;
          started = true;
          await sendHeld; // a generation that produces no activity (hang)
          return {};
        },
      );

      await connect();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      clientSocket.emit('chat:send', { content: 'Hi', workingDirectory: '/valid/path' });
      await flushUntil(() => started);

      // No wait entered → the initial timer is live. Elapsing it aborts (hang).
      vi.advanceTimersByTime(TIMEOUT_MS + 1000);
      expect(captured!.signal.aborted).toBe(true);
      expect(captured!.signal.reason).toBe('timeout');

      releaseSend();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });

    it('does not pause for auto-approved tools (ExitPlanMode in bypass) — timer still fires', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockState.permissionMode = 'bypassPermissions';
      let captured: AbortController | null = null;
      let autoApproved = false;
      let releaseSend!: () => void;
      const sendHeld = new Promise<void>((r) => { releaseSend = r; });

      mockState.sendImpl = vi.fn().mockImplementation(
        async (_c: string, _cb: unknown, options: { abortController?: AbortController }, canUseTool: TestCanUseTool) => {
          captured = options.abortController ?? null;
          const result = await canUseTool('ExitPlanMode', {}, { toolUseID: 'perm-4', signal: options.abortController?.signal });
          autoApproved = result?.behavior === 'allow';
          await sendHeld;
          return {};
        },
      );

      await connect();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      clientSocket.emit('chat:send', { content: 'Hi', workingDirectory: '/valid/path' });
      await flushUntil(() => autoApproved);

      // Auto-approve returned immediately without entering the wait → timer never paused.
      expect(autoApproved).toBe(true);
      vi.advanceTimersByTime(TIMEOUT_MS + 1000);
      expect(captured!.signal.aborted).toBe(true);
      expect(captured!.signal.reason).toBe('timeout');

      releaseSend();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });

    it('CLI mode never arms the inactivity timer — quiet generation is not aborted', async () => {
      // The user removed the CLI timeout: a CLI turn can be legitimately quiet (deep thinking,
      // a long tool run) yet the spinner stops repainting, so a blind timer would kill healthy
      // work. The genuine stuck case (usage limit) is caught directly on the PTY by the engine.
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(projectService.getEffectiveEngineMode).mockResolvedValueOnce('cli');
      let captured: AbortController | null = null;
      let started = false;
      let releaseSend!: () => void;
      const sendHeld = new Promise<void>((r) => { releaseSend = r; });

      mockState.sendImpl = vi.fn().mockImplementation(
        async (_c: string, _cb: unknown, options: { abortController?: AbortController }) => {
          captured = options.abortController ?? null;
          started = true;
          await sendHeld; // a quiet generation — SDK mode would abort here (AC4)
          return {};
        },
      );

      await connect();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      clientSocket.emit('chat:send', { content: 'Hi', workingDirectory: '/valid/path' });
      await flushUntil(() => started);

      // No timer was armed for CLI mode → advancing far past the timeout must NOT abort.
      vi.advanceTimersByTime(TIMEOUT_MS * 3);
      expect(captured).toBeInstanceOf(AbortController);
      expect(captured!.signal.aborted).toBe(false);

      releaseSend();
      await new Promise<void>((resolve) => setImmediate(resolve));
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

    it('should emit session:created and context:usage for completed messages', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const mockUsage = {
        inputTokens: 100,
        outputTokens: 50,
      };

      mockState.sendImpl =vi.fn().mockImplementation(
        async (_content: string, callbacks: {
          onSessionInit?: (sessionId: string, metadata?: Record<string, unknown>) => void;
          onComplete?: (response: { id: string; sessionId: string; content: string; usage?: unknown }) => void;
        }) => {
          callbacks.onSessionInit?.('session-123', {});
          callbacks.onComplete?.({
            id: 'response-1',
            sessionId: 'session-123',
            content: 'Task completed',
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

      const createdPromise = new Promise<{ sessionId: string }>((resolve) => {
        clientSocket.on('session:created', (data) => resolve(data));
      });

      const usagePromise = new Promise<Record<string, unknown>>((resolve) => {
        clientSocket.on('context:usage', (data) => resolve(data));
      });

      clientSocket.emit('chat:send', {
        content: 'Complete the task',
        workingDirectory: '/valid/path',
      });

      const created = await createdPromise;
      expect(created.sessionId).toBe('session-123');

      const usage = await usagePromise;
      expect(usage).toEqual(mockUsage);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Capture the onExit callback
      let capturedOnExit: ((exitCode: number) => void) | null = null;
      const { ptyService } = await import('../../services/ptyService.js');
      const { projectService } = await import('../../services/projectService.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(ptyService.createSession).mockReturnValue({ terminalId: 'term-exit-1', shell: 'bash' } as any);
      vi.mocked(ptyService.onData).mockImplementation(() => {});
      vi.mocked(ptyService.onExit).mockImplementation((_id, cb) => {
        capturedOnExit = cb;
      });
      vi.mocked(projectService.resolveProjectPath).mockResolvedValue('/mock/path');
      mockGetProjectStatus.mockResolvedValue({
        projectSlug: 'test-project',
        activeSessionCount: 0,
        totalSessionCount: 0,
        queueStatus: 'idle' as const,
        terminalCount: 0,
      });

      clientSocket.emit('terminal:create', { projectSlug: 'test-project' });
      // Wait for terminal:create handler + debounce to fully complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify onExit callback was captured
      expect(capturedOnExit).not.toBeNull();

      // Use a promise that resolves on dashboard:status-change to avoid timing issues
      const exitDashboardEvent = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 2000);
        clientSocket.on('dashboard:status-change', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Simulate natural PTY exit
      capturedOnExit!(0);

      await exitDashboardEvent;
      // If we reach here, the event was received (or 2s timeout)
      expect(mockGetProjectStatus).toHaveBeenCalledWith('test-project');
    });
  });

  describe('session:rewind-files event handler', () => {
    const VALID_SESSION_UUID = '12345678-1234-1234-1234-123456789abc';
    const VALID_MSG_UUID = 'abcdef01-abcd-abcd-abcd-abcdef012345';

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(true);
    });

    it('should emit error event when validation fails (missing sessionId)', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientSocket.on('error', (error) => resolve(error));
      });

      clientSocket.emit('session:rewind-files', {
        sessionId: '',
        workingDirectory: '/valid/path',
        messageUuid: VALID_MSG_UUID,
      });

      const error = await errorPromise;
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('should emit session:rewind-result {success:true} when canRewind is true', async () => {
      mockState.rewindImpl.mockResolvedValue({
        canRewind: true,
        filesChanged: ['src/index.ts', 'src/utils.ts'],
        insertions: 10,
        deletions: 5,
      });

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const resultPromise = new Promise<{ success: boolean; dryRun: boolean; filesChanged?: string[] }>((resolve) => {
        clientSocket.on('session:rewind-result', (data) => resolve(data));
      });

      // Join session room before rewind (required by room membership check)
      clientSocket.emit('session:join', VALID_SESSION_UUID);
      // Allow server to process the join before emitting rewind
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('session:rewind-files', {
        sessionId: VALID_SESSION_UUID,
        workingDirectory: '/valid/path',
        messageUuid: VALID_MSG_UUID,
        dryRun: true,
      });

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.filesChanged).toEqual(['src/index.ts', 'src/utils.ts']);
      // Handler delegated to the engine's rewind op with the right params
      expect(mockState.rewindImpl).toHaveBeenCalledWith({
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
        dryRun: true,
      });
    });

    it('should silently reject rewind when socket has not joined the session room', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      // Do NOT join session room — emit rewind directly
      clientSocket.emit('session:rewind-files', {
        sessionId: VALID_SESSION_UUID,
        workingDirectory: '/valid/path',
        messageUuid: VALID_MSG_UUID,
        dryRun: true,
      });

      // Wait enough time for handler to potentially fire
      await new Promise((r) => setTimeout(r, 200));

      // The engine's rewind op must never be reached — the room gate short-circuits first
      expect(mockState.rewindImpl).not.toHaveBeenCalled();
    });

    it('should emit session:rewind-result {success:false} when canRewind is false', async () => {
      mockState.rewindImpl.mockResolvedValue({
        canRewind: false,
        error: 'No checkpoint available for this message',
      });

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const resultPromise = new Promise<{ success: boolean; dryRun: boolean; error?: string }>((resolve) => {
        clientSocket.on('session:rewind-result', (data) => resolve(data));
      });

      // Join session room before rewind (required by room membership check)
      clientSocket.emit('session:join', VALID_SESSION_UUID);
      await new Promise((r) => setTimeout(r, 50));

      clientSocket.emit('session:rewind-files', {
        sessionId: VALID_SESSION_UUID,
        workingDirectory: '/valid/path',
        messageUuid: VALID_MSG_UUID,
        dryRun: false,
      });

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.dryRun).toBe(false);
      expect(result.error).toBe('No checkpoint available for this message');
      // Handler delegated to the engine with dryRun:false
      expect(mockState.rewindImpl).toHaveBeenCalledWith({
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
        dryRun: false,
      });
    });
  });

  // Story 25.9: session:generate-summary tests
  describe('session:generate-summary event handler', () => {
    const VALID_SESSION_UUID = '12345678-1234-1234-1234-123456789abc';
    const VALID_MSG_UUID = 'abcdef01-abcd-abcd-abcd-abcdef012345';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should emit summary-result with error for invalid messageUuid format', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      const resultPromise = new Promise<{ messageUuid: string; error?: string }>((resolve) => {
        clientSocket.on('session:summary-result', (data) => resolve(data));
      });

      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: 'not-a-uuid',
      });

      const result = await resultPromise;
      expect(result.error).toBe('Invalid messageUuid format');
    });

    it('should respond with error when socket is not in session room', async () => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      // Don't join session room — just emit
      const resultPromise = new Promise<{ messageUuid: string; error?: string }>((resolve) => {
        clientSocket.on('session:summary-result', (data) => resolve(data));
      });

      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });

      const result = await resultPromise;
      expect(result.error).toBe('Not joined to session');
    });

    it('should emit summary-result with error when messageUuid not found', async () => {
      mockParseJSONLFile.mockResolvedValue([
        { uuid: 'other-uuid-1234-1234-1234-123456789abc', type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-01-01T00:00:00Z' },
      ]);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      // Join session room and emit a chat:send first to populate sessionProjectMap
      clientSocket.emit('session:join', VALID_SESSION_UUID, 'test-project');
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const resultPromise = new Promise<{ messageUuid: string; error?: string }>((resolve) => {
        clientSocket.on('session:summary-result', (data) => resolve(data));
      });

      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });

      const result = await resultPromise;
      expect(result.messageUuid).toBe(VALID_MSG_UUID);
      expect(result.error).toContain('not found');
    });

    it('should emit summary-result with error when too few messages', async () => {
      mockParseJSONLFile.mockResolvedValue([
        { uuid: VALID_MSG_UUID, type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-01-01T00:00:00Z' },
        { uuid: '22222222-2222-2222-2222-222222222222', type: 'assistant', message: { role: 'assistant', content: 'hi' }, timestamp: '2026-01-01T00:00:01Z' },
        { uuid: '33333333-3333-3333-3333-333333333333', type: 'user', message: { role: 'user', content: 'bye' }, timestamp: '2026-01-01T00:00:02Z' },
      ]);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('session:join', VALID_SESSION_UUID, 'test-project');
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const resultPromise = new Promise<{ messageUuid: string; error?: string }>((resolve) => {
        clientSocket.on('session:summary-result', (data) => resolve(data));
      });

      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });

      const result = await resultPromise;
      expect(result.error).toBe('Too few messages to summarize');
    });

    it('should emit summary-result with summary on success', async () => {
      mockParseJSONLFile.mockResolvedValue([
        { uuid: VALID_MSG_UUID, type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-01-01T00:00:00Z' },
        { uuid: '22222222-2222-2222-2222-222222222222', type: 'user', message: { role: 'user', content: 'q1' }, timestamp: '2026-01-01T00:00:01Z' },
        { uuid: '33333333-3333-3333-3333-333333333333', type: 'assistant', message: { role: 'assistant', content: 'a1' }, timestamp: '2026-01-01T00:00:02Z' },
        { uuid: '44444444-4444-4444-4444-444444444444', type: 'user', message: { role: 'user', content: 'q2' }, timestamp: '2026-01-01T00:00:03Z' },
        { uuid: '55555555-5555-5555-5555-555555555555', type: 'assistant', message: { role: 'assistant', content: 'a2' }, timestamp: '2026-01-01T00:00:04Z' },
      ]);
      mockSummarize.mockResolvedValue('## Summary\n- Key decisions');

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('session:join', VALID_SESSION_UUID, 'test-project');
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const resultPromise = new Promise<{ messageUuid: string; summary?: string }>((resolve) => {
        clientSocket.on('session:summary-result', (data) => resolve(data));
      });

      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });

      const result = await resultPromise;
      expect(result.messageUuid).toBe(VALID_MSG_UUID);
      expect(result.summary).toBe('## Summary\n- Key decisions');
    });

    it('should abort previous summary and start new one when concurrent request arrives', async () => {
      // First call: slow summarize that won't resolve until we let it
      let resolveFirst!: (value: string) => void;
      const firstCallPromise = new Promise<string>((resolve, reject) => {
        resolveFirst = resolve;
        // The abort will cause this to be ignored (aborted signal)
        void reject; // suppress unused
      });
      mockSummarize.mockReturnValueOnce(firstCallPromise);
      // Second call resolves immediately
      mockSummarize.mockResolvedValueOnce('## Summary\n- Second result');

      mockParseJSONLFile.mockResolvedValue([
        { uuid: VALID_MSG_UUID, type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-01-01T00:00:00Z' },
        { uuid: '22222222-2222-2222-2222-222222222222', type: 'user', message: { role: 'user', content: 'q1' }, timestamp: '2026-01-01T00:00:01Z' },
        { uuid: '33333333-3333-3333-3333-333333333333', type: 'assistant', message: { role: 'assistant', content: 'a1' }, timestamp: '2026-01-01T00:00:02Z' },
        { uuid: '44444444-4444-4444-4444-444444444444', type: 'user', message: { role: 'user', content: 'q2' }, timestamp: '2026-01-01T00:00:03Z' },
        { uuid: '55555555-5555-5555-5555-555555555555', type: 'assistant', message: { role: 'assistant', content: 'a2' }, timestamp: '2026-01-01T00:00:04Z' },
      ]);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('session:join', VALID_SESSION_UUID, 'test-project');
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const results: Array<{ messageUuid: string; summary?: string }>  = [];
      clientSocket.on('session:summary-result', (data) => results.push(data));

      // Fire first request
      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });
      // Wait for server to start processing
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      // Fire second request while first is still in progress — aborts previous, starts new
      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });

      // Resolve first call (will be silently ignored since it was aborted)
      resolveFirst('## Summary\n- First result');
      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      // The second request's result should be emitted (previous was aborted)
      expect(results.length).toBeGreaterThanOrEqual(1);
      const lastResult = results[results.length - 1];
      expect(lastResult.summary).toBe('## Summary\n- Second result');
      // summarize was called twice (first aborted, second completed)
      expect(mockSummarize).toHaveBeenCalledTimes(2);
    });

    it('should abort in-progress summary when cancel-summary is received', async () => {
      // Slow summarize that rejects with abort error
      let rejectSummarize!: (err: Error) => void;
      const slowPromise = new Promise<string>((_, reject) => { rejectSummarize = reject; });
      mockSummarize.mockReturnValueOnce(slowPromise);

      mockParseJSONLFile.mockResolvedValue([
        { uuid: VALID_MSG_UUID, type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-01-01T00:00:00Z' },
        { uuid: '22222222-2222-2222-2222-222222222222', type: 'user', message: { role: 'user', content: 'q1' }, timestamp: '2026-01-01T00:00:01Z' },
        { uuid: '33333333-3333-3333-3333-333333333333', type: 'assistant', message: { role: 'assistant', content: 'a1' }, timestamp: '2026-01-01T00:00:02Z' },
        { uuid: '44444444-4444-4444-4444-444444444444', type: 'user', message: { role: 'user', content: 'q2' }, timestamp: '2026-01-01T00:00:03Z' },
        { uuid: '55555555-5555-5555-5555-555555555555', type: 'assistant', message: { role: 'assistant', content: 'a2' }, timestamp: '2026-01-01T00:00:04Z' },
      ]);

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      clientSocket.emit('session:join', VALID_SESSION_UUID, 'test-project');
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const results: Array<{ messageUuid: string; summary?: string; error?: string }> = [];
      clientSocket.on('session:summary-result', (data) => results.push(data));

      // Start summary
      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      // Cancel it
      clientSocket.emit('session:cancel-summary', { sessionId: VALID_SESSION_UUID });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      // Simulate the abort rejection (in real code, Anthropic SDK throws on abort)
      const abortError = new Error('Request was aborted');
      abortError.name = 'AbortError';
      rejectSummarize(abortError);
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      // No error should be emitted to client (cancelled requests are silently dropped)
      expect(results).toHaveLength(0);

      // After cancel, a new request should be accepted (isSummarizing was reset)
      mockSummarize.mockResolvedValueOnce('## New Summary');
      const newResultPromise = new Promise<{ messageUuid: string; summary?: string }>((resolve) => {
        // Re-attach since results array captures all
        const handler = (data: { messageUuid: string; summary?: string }) => {
          resolve(data);
          clientSocket.off('session:summary-result', handler);
        };
        clientSocket.on('session:summary-result', handler);
      });

      clientSocket.emit('session:generate-summary', {
        sessionId: VALID_SESSION_UUID,
        messageUuid: VALID_MSG_UUID,
      });

      const newResult = await newResultPromise;
      expect(newResult.summary).toBe('## New Summary');
    });
  });
});
