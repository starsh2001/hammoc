/**
 * Story 29.2 (TEST-002 regression guard): broadcastSnippetList Phase-1 origin-only.
 *
 * Verifies that the helper emits the `snippets:list` payload to ONLY the
 * originating socket id and not to any other connected socket — even when
 * multiple clients share the same project working directory. If a future
 * change accidentally fan-outs to a `project:<slug>` room or via `io.emit()`,
 * this test catches the regression before Phase 2 is intentional.
 *
 * Strategy: spin up a real socket.io server via `initializeWebSocket()`,
 * connect two client sockets, then call `broadcastSnippetList(workingDirectory,
 * originSocketId)` directly and watch which clients receive the event.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import type { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';

// Mock session middleware so any client can connect.
vi.mock('../../middleware/session.js', () => ({
  createSessionMiddleware: vi.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, _res: any, next: any) => {
      req.session = { authenticated: true };
      next();
    },
  ),
}));

// Mock dashboardService (websocket.ts import).
vi.mock('../../services/dashboardService.js', () => ({
  dashboardService: {
    getProjectStatus: vi.fn().mockResolvedValue({
      projectSlug: 'test',
      activeSessionCount: 0,
      totalSessionCount: 0,
      queueStatus: 'idle',
      terminalCount: 0,
    }),
  },
}));

// Stub listSnippets so the helper does not hit the disk.
vi.mock('../../utils/snippetResolver.js', () => ({
  listSnippets: vi.fn().mockResolvedValue([
    { scope: 'project', name: 'commit-and-done', mtime: '2026-05-07T00:00:00.000Z', size: 9 },
  ]),
}));

import { initializeWebSocket, broadcastSnippetList } from '../websocket.js';

describe('broadcastSnippetList — Phase-1 origin-socket-only emit', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  const TEST_PORT = 3015;
  let originSocket: ClientSocket;
  let bystanderSocket: ClientSocket;

  beforeAll(async () => {
    httpServer = createServer();
    ioServer = await initializeWebSocket(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  afterEach(() => {
    if (originSocket?.connected) originSocket.disconnect();
    if (bystanderSocket?.connected) bystanderSocket.disconnect();
  });

  it('emits the snippets:list payload only to the origin socket and not to any other connected socket', async () => {
    // Connect two clients to the same server (and conceptually the same project
    // working directory). Phase-1 contract: only the origin client must receive
    // the post-mutation snippets:list payload.
    const connectClient = (): Promise<ClientSocket> =>
      new Promise((resolve, reject) => {
        const sock = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
          forceNew: true,
        });
        sock.once('connect', () => resolve(sock));
        sock.once('connect_error', (err) => reject(err));
      });

    originSocket = await connectClient();
    bystanderSocket = await connectClient();

    let originReceived: { snippets: unknown[] } | null = null;
    let bystanderReceived: { snippets: unknown[] } | null = null;

    originSocket.on('snippets:list', (payload: { snippets: unknown[] }) => {
      originReceived = payload;
    });
    bystanderSocket.on('snippets:list', (payload: { snippets: unknown[] }) => {
      bystanderReceived = payload;
    });

    await broadcastSnippetList('/tmp/proj', originSocket.id);

    // Allow the event loop to flush the emit through the local socket.io transport.
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    expect(originReceived).not.toBeNull();
    expect(originReceived!.snippets).toHaveLength(1);
    expect(bystanderReceived).toBeNull();
  });

  it('is a no-op when the origin socket id is missing (best-effort guard)', async () => {
    originSocket = await new Promise<ClientSocket>((resolve, reject) => {
      const sock = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      sock.once('connect', () => resolve(sock));
      sock.once('connect_error', (err) => reject(err));
    });

    let received: unknown = null;
    originSocket.on('snippets:list', (p) => {
      received = p;
    });

    await broadcastSnippetList('/tmp/proj', undefined);
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    expect(received).toBeNull();
  });
});
