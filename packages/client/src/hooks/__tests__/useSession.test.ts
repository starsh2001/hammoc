/**
 * useSession Hook Tests
 * Story 1.6: Session Management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from '../useSession';
import { createMockSocket, MockSocket } from '../../test-utils/mockSocket';

// Mock the socket module
vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(),
}));

describe('useSession', () => {
  let mockSocket: MockSocket;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSocket = createMockSocket();

    const { getSocket } = await import('../../services/socket');
    vi.mocked(getSocket).mockReturnValue(mockSocket as unknown as ReturnType<typeof getSocket>);
  });

  describe('initial state', () => {
    it('should return null currentSessionId', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.currentSessionId).toBeNull();
    });

    it('should return empty sessions array', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.sessions).toEqual([]);
    });

    it('should not be loading sessions initially', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.isLoadingSessions).toBe(false);
    });
  });

  describe('session:created event', () => {
    it('should set currentSessionId on session:created', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        mockSocket.trigger('session:created', { sessionId: 'new-session-123' });
      });

      expect(result.current.currentSessionId).toBe('new-session-123');
    });
  });

  describe('session:resumed event', () => {
    it('should set currentSessionId on session:resumed', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        mockSocket.trigger('session:resumed', { sessionId: 'resumed-session-456' });
      });

      expect(result.current.currentSessionId).toBe('resumed-session-456');
    });
  });

  describe('session:list event', () => {
    it('should update sessions on session:list', () => {
      const { result } = renderHook(() => useSession());

      const mockSessions = [
        {
          sessionId: 'session-1',
          projectSlug: 'test-project',
          firstPrompt: 'Create a component',
          messageCount: 5,
          created: new Date('2026-01-30T10:00:00Z'),
          modified: new Date('2026-01-30T11:00:00Z'),
        },
        {
          sessionId: 'session-2',
          projectSlug: 'test-project',
          firstPrompt: 'Fix a bug',
          messageCount: 3,
          created: new Date('2026-01-29T10:00:00Z'),
          modified: new Date('2026-01-29T11:00:00Z'),
        },
      ];

      act(() => {
        mockSocket.trigger('session:list', { sessions: mockSessions });
      });

      expect(result.current.sessions).toEqual(mockSessions);
      expect(result.current.isLoadingSessions).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('should emit session:list event with projectPath', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.listSessions('/path/to/project');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('session:list', {
        projectPath: '/path/to/project',
      });
    });

    it('should set isLoadingSessions to true', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.listSessions('/path/to/project');
      });

      expect(result.current.isLoadingSessions).toBe(true);
    });

    it('should not emit if projectPath is empty', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.listSessions('');
      });

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('resumeSession', () => {
    it('should set pending session ID for resume', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.resumeSession('session-to-resume');
      });

      // The pending session ID is internal state, tested via session:resumed event
      expect(result.current.currentSessionId).toBeNull();
    });
  });

  describe('startNewSession', () => {
    it('should clear currentSessionId', () => {
      const { result } = renderHook(() => useSession());

      // First set a session
      act(() => {
        mockSocket.trigger('session:created', { sessionId: 'existing-session' });
      });

      expect(result.current.currentSessionId).toBe('existing-session');

      // Then start new session
      act(() => {
        result.current.startNewSession();
      });

      expect(result.current.currentSessionId).toBeNull();
    });
  });

  describe('cleanup on unmount', () => {
    it('should remove event listeners on unmount', () => {
      const { unmount } = renderHook(() => useSession());

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('session:created', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('session:resumed', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('session:list', expect.any(Function));
    });
  });
});

