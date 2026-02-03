/**
 * useChatMessages Hook Tests
 * Story 1.5: End-to-End Test Page
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatMessages } from '../useChatMessages';
import { createMockSocket, MockSocket } from '../../test-utils/mockSocket';

// Mock the socket module
vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(),
}));

// Mock requestAnimationFrame for throttling tests
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 0);
});

describe('useChatMessages', () => {
  let mockSocket: MockSocket;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSocket = createMockSocket();

    const { getSocket } = await import('../../services/socket');
    vi.mocked(getSocket).mockReturnValue(mockSocket as unknown as ReturnType<typeof getSocket>);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('initial state', () => {
    it('should return empty messages array', () => {
      const { result } = renderHook(() => useChatMessages());

      expect(result.current.messages).toEqual([]);
    });

    it('should return empty streaming content', () => {
      const { result } = renderHook(() => useChatMessages());

      expect(result.current.streamingContent).toBe('');
    });

    it('should not be streaming initially', () => {
      const { result } = renderHook(() => useChatMessages());

      expect(result.current.isStreaming).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useChatMessages());

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('sendMessage', () => {
    it('should emit chat:send event with content and workingDirectory', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Hello Claude', '/path/to/project');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/path/to/project',
        sessionId: undefined,
        resume: undefined,
      });
    });

    it('should emit chat:send event with sessionId and resume when options provided', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Continue work', '/path/to/project', {
          sessionId: 'session-123',
          resume: true,
        });
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', {
        content: 'Continue work',
        workingDirectory: '/path/to/project',
        sessionId: 'session-123',
        resume: true,
      });
    });

    it('should add user message to messages array', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Hello Claude', '/path/to/project');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello Claude');
    });

    it('should set isStreaming to true', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Hello Claude', '/path/to/project');
      });

      expect(result.current.isStreaming).toBe(true);
    });

    it('should clear any previous error', () => {
      const { result } = renderHook(() => useChatMessages());

      // First set an error
      act(() => {
        mockSocket.trigger('error', { code: 'TEST_ERROR', message: 'Test error' });
      });

      expect(result.current.lastError).not.toBeNull();

      // Then send a message which should clear the error
      act(() => {
        result.current.sendMessage('Hello', '/path');
      });

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('message:chunk event', () => {
    it('should update streamingContent on message:chunk', async () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('message:chunk', {
          sessionId: 'test',
          messageId: 'msg-1',
          content: 'Hello ',
          done: false,
        });
      });

      // Wait for requestAnimationFrame
      await waitFor(() => {
        expect(result.current.streamingContent).toBe('Hello ');
      });
    });

    it('should accumulate content from multiple chunks', async () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('message:chunk', {
          sessionId: 'test',
          messageId: 'msg-1',
          content: 'Hello ',
          done: false,
        });
      });

      await waitFor(() => {
        expect(result.current.streamingContent).toBe('Hello ');
      });

      act(() => {
        mockSocket.trigger('message:chunk', {
          sessionId: 'test',
          messageId: 'msg-2',
          content: 'World!',
          done: false,
        });
      });

      await waitFor(() => {
        expect(result.current.streamingContent).toBe('Hello World!');
      });
    });
  });

  describe('message:complete event', () => {
    it('should add assistant message to messages array', async () => {
      const { result } = renderHook(() => useChatMessages());

      // First send a user message
      act(() => {
        result.current.sendMessage('Hello', '/path');
      });

      // Then receive a complete message
      act(() => {
        mockSocket.trigger('message:complete', {
          id: 'msg-1',
          sessionId: 'test',
          role: 'assistant',
          content: 'Hello! How can I help you?',
          timestamp: new Date(),
        });
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].type).toBe('assistant');
    });

    it('should clear streamingContent on complete', async () => {
      const { result } = renderHook(() => useChatMessages());

      // Simulate streaming
      act(() => {
        mockSocket.trigger('message:chunk', {
          sessionId: 'test',
          messageId: 'msg-1',
          content: 'Streaming...',
          done: false,
        });
      });

      await waitFor(() => {
        expect(result.current.streamingContent).toBe('Streaming...');
      });

      // Then complete
      act(() => {
        mockSocket.trigger('message:complete', {
          id: 'msg-1',
          sessionId: 'test',
          role: 'assistant',
          content: 'Streaming...',
          timestamp: new Date(),
        });
      });

      expect(result.current.streamingContent).toBe('');
    });

    it('should set isStreaming to false on complete', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Hello', '/path');
      });

      expect(result.current.isStreaming).toBe(true);

      act(() => {
        mockSocket.trigger('message:complete', {
          id: 'msg-1',
          sessionId: 'test',
          role: 'assistant',
          content: 'Response',
          timestamp: new Date(),
        });
      });

      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('tool:call event', () => {
    it('should add tool_use message to messages array', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('tool:call', {
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/test/file.ts' },
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('tool_use');
      expect(result.current.messages[0].toolCall?.name).toBe('Read');
      expect(result.current.messages[0].toolCall?.arguments).toEqual({ file_path: '/test/file.ts' });
    });
  });

  describe('tool:result event', () => {
    it('should add tool_result message for success', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('tool:result', {
          toolCallId: 'tool-1',
          result: {
            success: true,
            output: 'File contents here',
          },
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('tool_result');
      expect(result.current.messages[0].toolResult?.success).toBe(true);
      expect(result.current.messages[0].toolResult?.output).toBe('File contents here');
    });

    it('should add tool_result message for error', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('tool:result', {
          toolCallId: 'tool-1',
          result: {
            success: false,
            error: 'File not found',
          },
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('tool_result');
      expect(result.current.messages[0].toolResult?.success).toBe(false);
      expect(result.current.messages[0].toolResult?.error).toBe('File not found');
    });
  });

  describe('error event', () => {
    it('should set lastError on error event', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('error', {
          code: 'CHAT_ERROR',
          message: 'Something went wrong',
        });
      });

      expect(result.current.lastError).toEqual({
        code: 'CHAT_ERROR',
        message: 'Something went wrong',
      });
    });

    it('should add error message to messages array', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('error', {
          code: 'CHAT_ERROR',
          message: 'Something went wrong',
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('error');
      expect(result.current.messages[0].content).toBe('[CHAT_ERROR] Something went wrong');
    });

    it('should set isStreaming to false on error', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Hello', '/path');
      });

      expect(result.current.isStreaming).toBe(true);

      act(() => {
        mockSocket.trigger('error', {
          code: 'CHAT_ERROR',
          message: 'Error',
        });
      });

      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear lastError', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        mockSocket.trigger('error', {
          code: 'TEST_ERROR',
          message: 'Test error',
        });
      });

      expect(result.current.lastError).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', () => {
      const { result } = renderHook(() => useChatMessages());

      act(() => {
        result.current.sendMessage('Hello', '/path');
      });

      expect(result.current.messages.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
    });
  });

  describe('cleanup on unmount', () => {
    it('should remove event listeners on unmount', () => {
      const { unmount } = renderHook(() => useChatMessages());

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('message:chunk', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('message:complete', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('tool:call', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('tool:result', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
