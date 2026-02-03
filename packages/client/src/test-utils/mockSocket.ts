/**
 * Mock Socket.io Client for Testing
 * Story 1.4: WebSocket Server Setup
 */

import { vi } from 'vitest';

type EventHandler = (...args: unknown[]) => void;

export interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
  io: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  trigger: (event: string, data?: unknown) => void;
  simulateConnect: () => void;
  simulateDisconnect: () => void;
  simulateReconnectAttempt: (attempt: number) => void;
  simulateReconnectFailed: () => void;
  simulateConnectError: (error: Error) => void;
}

/**
 * Create a mock socket instance for testing
 */
export function createMockSocket(): MockSocket {
  const handlers = new Map<string, Set<EventHandler>>();
  const ioHandlers = new Map<string, Set<EventHandler>>();

  const addHandler = (event: string, handler: EventHandler) => {
    if (!handlers.has(event)) {
      handlers.set(event, new Set());
    }
    handlers.get(event)!.add(handler);
  };

  const removeHandler = (event: string, handler: EventHandler) => {
    const eventHandlers = handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
    }
  };

  const addIoHandler = (event: string, handler: EventHandler) => {
    if (!ioHandlers.has(event)) {
      ioHandlers.set(event, new Set());
    }
    ioHandlers.get(event)!.add(handler);
  };

  const removeIoHandler = (event: string, handler: EventHandler) => {
    const eventHandlers = ioHandlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
    }
  };

  const trigger = (event: string, data?: unknown) => {
    handlers.get(event)?.forEach((handler) => handler(data));
  };

  const triggerIo = (event: string, data?: unknown) => {
    ioHandlers.get(event)?.forEach((handler) => handler(data));
  };

  const mockSocket: MockSocket = {
    on: vi.fn((event: string, handler: EventHandler) => {
      addHandler(event, handler);
      return mockSocket;
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      removeHandler(event, handler);
      return mockSocket;
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
    io: {
      on: vi.fn((event: string, handler: EventHandler) => {
        addIoHandler(event, handler);
        return mockSocket.io;
      }),
      off: vi.fn((event: string, handler: EventHandler) => {
        removeIoHandler(event, handler);
        return mockSocket.io;
      }),
    },
    trigger,
    simulateConnect() {
      this.connected = true;
      trigger('connect');
    },
    simulateDisconnect() {
      this.connected = false;
      trigger('disconnect');
    },
    simulateReconnectAttempt(attempt: number) {
      triggerIo('reconnect_attempt', attempt);
    },
    simulateReconnectFailed() {
      triggerIo('reconnect_failed');
    },
    simulateConnectError(error: Error) {
      trigger('connect_error', error);
    },
  };

  return mockSocket;
}
