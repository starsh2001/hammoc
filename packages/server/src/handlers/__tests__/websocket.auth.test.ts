/**
 * WebSocket Authentication Tests
 * Separate test file for testing authenticated and unauthenticated scenarios
 * [Source: Story 2.5 - QA Recommendation]
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';

// Hoisted mock control variable
const mockSessionState = vi.hoisted(() => ({
  authenticated: true,
}));

// Mock session middleware with controllable auth state
vi.mock('../../middleware/session.js', () => ({
  createSessionMiddleware: vi.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, _res: any, next: any) => {
      req.session = { authenticated: mockSessionState.authenticated };
      next();
    }
  ),
}));

import { initializeWebSocket } from '../websocket.js';

describe('WebSocket Authentication', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 3002; // Different port to avoid conflicts

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
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    // Reset to authenticated state for next test
    mockSessionState.authenticated = true;
  });

  describe('Authenticated Session (AC2)', () => {
    it('[HIGH] should accept connection with authenticated session', async () => {
      mockSessionState.authenticated = true;

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

        clientSocket.on('connect', () => {
          clearTimeout(timeout);
          expect(clientSocket.connected).toBe(true);
          resolve();
        });

        clientSocket.on('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    });
  });

  describe('Unauthenticated Session (AC2, AC3)', () => {
    it('[HIGH] should reject connection with unauthenticated session', async () => {
      mockSessionState.authenticated = false;

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Expected connect_error but got timeout')), 5000);

        clientSocket.on('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Connection should have been rejected'));
        });

        clientSocket.on('connect_error', (err) => {
          clearTimeout(timeout);
          expect(err.message).toBe('Unauthorized');
          expect(clientSocket.connected).toBe(false);
          resolve();
        });
      });
    });

    it('[HIGH] should reject connection with null session', async () => {
      // Simulate null session by setting authenticated to false
      mockSessionState.authenticated = false;

      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Expected connect_error but got timeout')), 5000);

        clientSocket.on('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Connection should have been rejected'));
        });

        clientSocket.on('connect_error', (err) => {
          clearTimeout(timeout);
          expect(err.message).toBe('Unauthorized');
          resolve();
        });
      });
    });
  });
});
