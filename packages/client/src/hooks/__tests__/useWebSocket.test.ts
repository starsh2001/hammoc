import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import { createMockSocket, MockSocket } from '../../test-utils/mockSocket';

// Mock the socket service
vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(),
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
}));

import { getSocket } from '../../services/socket';

describe('useWebSocket', () => {
  let mockSocket: MockSocket;

  beforeEach(() => {
    mockSocket = createMockSocket();
    vi.mocked(getSocket).mockReturnValue(mockSocket as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have disconnected status initially', () => {
      const { result } = renderHook(() => useWebSocket());

      // Initial state: 'reconnecting' (not 'disconnected') to avoid brief red flash
      expect(result.current.connectionStatus).toBe('reconnecting');
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isReconnecting).toBe(true);
      expect(result.current.reconnectAttempt).toBe(0);
      expect(result.current.lastError).toBeNull();
    });
  });

  describe('connect', () => {
    it('should call socket.connect when not connected', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect();
      });

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should not call socket.connect when already connected', () => {
      mockSocket.connected = true;
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect();
      });

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('should clear lastError on connect attempt', () => {
      const { result } = renderHook(() => useWebSocket());

      // First, simulate an error
      act(() => {
        mockSocket.simulateConnectError(new Error('Test error'));
      });

      expect(result.current.lastError).not.toBeNull();

      // Now connect
      act(() => {
        result.current.connect();
      });

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should call socket.disconnect', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.disconnect();
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('connection events', () => {
    it('should update status to connected on connect event', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        mockSocket.simulateConnect();
      });

      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.isConnected).toBe(true);
    });

    it('should update status to disconnected on disconnect event', () => {
      const { result } = renderHook(() => useWebSocket());

      // First connect
      act(() => {
        mockSocket.simulateConnect();
      });

      // Then disconnect
      act(() => {
        mockSocket.simulateDisconnect();
      });

      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.isConnected).toBe(false);
    });

    it('should reset reconnectAttempt and lastError on successful connect', () => {
      const { result } = renderHook(() => useWebSocket());

      // Simulate some reconnection attempts
      act(() => {
        mockSocket.simulateReconnectAttempt(3);
      });

      expect(result.current.reconnectAttempt).toBe(3);

      // Simulate error
      act(() => {
        mockSocket.simulateConnectError(new Error('Test error'));
      });

      expect(result.current.lastError).not.toBeNull();

      // Now successfully connect
      act(() => {
        mockSocket.simulateConnect();
      });

      expect(result.current.reconnectAttempt).toBe(0);
      expect(result.current.lastError).toBeNull();
    });
  });

  describe('reconnection events', () => {
    it('should update status to reconnecting on reconnect_attempt', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        mockSocket.simulateReconnectAttempt(1);
      });

      expect(result.current.connectionStatus).toBe('reconnecting');
      expect(result.current.isReconnecting).toBe(true);
      expect(result.current.reconnectAttempt).toBe(1);
    });

    it('should update reconnectAttempt on each attempt', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        mockSocket.simulateReconnectAttempt(1);
      });
      expect(result.current.reconnectAttempt).toBe(1);

      act(() => {
        mockSocket.simulateReconnectAttempt(2);
      });
      expect(result.current.reconnectAttempt).toBe(2);

      act(() => {
        mockSocket.simulateReconnectAttempt(5);
      });
      expect(result.current.reconnectAttempt).toBe(5);
    });

    it('should set lastError on reconnect_failed', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        mockSocket.simulateReconnectFailed();
      });

      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.lastError).toContain('서버 연결에 실패했습니다');
    });
  });

  describe('error handling', () => {
    it('should set lastError on connect_error', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        mockSocket.simulateConnectError(new Error('Connection refused'));
      });

      expect(result.current.lastError).toContain('Connection refused');
    });
  });

  describe('cleanup', () => {
    it('should unregister event handlers on unmount', () => {
      const { unmount } = renderHook(() => useWebSocket());

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.io.off).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockSocket.io.off).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });
  });
});
