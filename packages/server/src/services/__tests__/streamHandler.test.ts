import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamHandler, createStreamHandler } from '../streamHandler.js';
import {
  SDKMessageType,
  ContentBlockType,
  type StreamCallbacks,
  type ParsedInitMessage,
  type ParsedAssistantMessage,
  type ParsedUserMessage,
  type ParsedResultMessage,
} from '@bmad-studio/shared';
import type { SDKMessage } from '@anthropic-ai/claude-code';

// ===== Mock Data =====

const mockInitMessage = {
  type: 'init',
  session_id: 'session-123',
  model: 'claude-opus-4-5-20251101',
  cwd: '/path/to/project',
} as unknown as SDKMessage;

const mockAssistantTextMessage = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello, world!' }],
  },
} as unknown as SDKMessage;

const mockAssistantToolUseMessage = {
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        id: 'tool-1',
        name: 'Read',
        input: { file_path: '/path/to/file.ts' },
      },
    ],
  },
} as unknown as SDKMessage;

const mockAssistantMixedMessage = {
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: 'Let me read the file.' },
      {
        type: 'tool_use',
        id: 'tool-2',
        name: 'Write',
        input: { file_path: '/path/to/new.ts', content: 'code' },
      },
    ],
  },
} as unknown as SDKMessage;

const mockToolResultMessage = {
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: 'file contents here',
        is_error: false,
      },
    ],
  },
} as unknown as SDKMessage;

const mockToolResultErrorMessage = {
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: 'File not found',
        is_error: true,
      },
    ],
  },
} as unknown as SDKMessage;

const mockResultSuccessMessage = {
  type: 'result',
  subtype: 'success',
  result: 'Task completed successfully',
  session_id: 'session-123',
  uuid: 'msg-456',
  is_error: false,
  usage: { input_tokens: 100, output_tokens: 50 },
  total_cost_usd: 0.001,
} as unknown as SDKMessage;

const mockResultErrorMessage = {
  type: 'result',
  subtype: 'error',
  result: 'Something went wrong',
  session_id: 'session-123',
  uuid: 'msg-789',
  is_error: true,
} as unknown as SDKMessage;

const mockSystemMessage = {
  type: 'system',
  message: 'System notification',
} as unknown as SDKMessage;

// ===== Helper Functions =====

async function* createMockGenerator(
  messages: SDKMessage[]
): AsyncGenerator<SDKMessage, void, unknown> {
  for (const message of messages) {
    yield message;
  }
}

async function* createErrorGenerator(
  messages: SDKMessage[],
  errorAfter: number
): AsyncGenerator<SDKMessage, void, unknown> {
  let count = 0;
  for (const message of messages) {
    if (count >= errorAfter) {
      throw new Error('Stream interrupted');
    }
    yield message;
    count++;
  }
}

// ===== Tests =====

describe('StreamHandler', () => {
  let handler: StreamHandler;

  beforeEach(() => {
    handler = new StreamHandler();
  });

  describe('createStreamHandler', () => {
    it('should create a new StreamHandler instance', () => {
      const handler = createStreamHandler();
      expect(handler).toBeInstanceOf(StreamHandler);
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = handler.getState();
      expect(state.sessionId).toBeNull();
      expect(state.accumulatedText).toBe('');
      expect(state.isComplete).toBe(false);
      expect(state.pendingToolCalls.size).toBe(0);
      expect(state.completedToolCalls.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', () => {
      const state = handler.getState();
      state.sessionId = 'test';
      state.accumulatedText = 'some text';

      handler.reset();

      const newState = handler.getState();
      expect(newState.sessionId).toBeNull();
      expect(newState.accumulatedText).toBe('');
    });
  });

  describe('parseMessage', () => {
    describe('init message', () => {
      it('should parse init message correctly', () => {
        const parsed = handler.parseMessage(mockInitMessage);

        expect(parsed.type).toBe(SDKMessageType.INIT);
        const initMsg = parsed as ParsedInitMessage;
        expect(initMsg.sessionId).toBe('session-123');
        expect(initMsg.model).toBe('claude-opus-4-5-20251101');
        expect(initMsg.cwd).toBe('/path/to/project');
      });
    });

    describe('assistant message with text', () => {
      it('should parse text content block', () => {
        const parsed = handler.parseMessage(mockAssistantTextMessage);

        expect(parsed.type).toBe(SDKMessageType.ASSISTANT);
        const assistantMsg = parsed as ParsedAssistantMessage;
        expect(assistantMsg.contentBlocks).toHaveLength(1);
        expect(assistantMsg.contentBlocks[0].type).toBe(ContentBlockType.TEXT);
        if (assistantMsg.contentBlocks[0].type === ContentBlockType.TEXT) {
          expect(assistantMsg.contentBlocks[0].text).toBe('Hello, world!');
        }
      });
    });

    describe('assistant message with tool_use', () => {
      it('should parse tool_use content block', () => {
        const parsed = handler.parseMessage(mockAssistantToolUseMessage);

        expect(parsed.type).toBe(SDKMessageType.ASSISTANT);
        const assistantMsg = parsed as ParsedAssistantMessage;
        expect(assistantMsg.contentBlocks).toHaveLength(1);
        expect(assistantMsg.contentBlocks[0].type).toBe(ContentBlockType.TOOL_USE);
        if (assistantMsg.contentBlocks[0].type === ContentBlockType.TOOL_USE) {
          expect(assistantMsg.contentBlocks[0].id).toBe('tool-1');
          expect(assistantMsg.contentBlocks[0].name).toBe('Read');
          expect(assistantMsg.contentBlocks[0].input).toEqual({
            file_path: '/path/to/file.ts',
          });
        }
      });
    });

    describe('assistant message with mixed content', () => {
      it('should parse multiple content blocks', () => {
        const parsed = handler.parseMessage(mockAssistantMixedMessage);

        expect(parsed.type).toBe(SDKMessageType.ASSISTANT);
        const assistantMsg = parsed as ParsedAssistantMessage;
        expect(assistantMsg.contentBlocks).toHaveLength(2);
        expect(assistantMsg.contentBlocks[0].type).toBe(ContentBlockType.TEXT);
        expect(assistantMsg.contentBlocks[1].type).toBe(ContentBlockType.TOOL_USE);
      });
    });

    describe('user message with tool_result', () => {
      it('should parse successful tool_result', () => {
        const parsed = handler.parseMessage(mockToolResultMessage);

        expect(parsed.type).toBe(SDKMessageType.USER);
        const userMsg = parsed as ParsedUserMessage;
        expect(userMsg.contentBlocks).toHaveLength(1);
        expect(userMsg.contentBlocks[0].type).toBe(ContentBlockType.TOOL_RESULT);
        if (userMsg.contentBlocks[0].type === ContentBlockType.TOOL_RESULT) {
          expect(userMsg.contentBlocks[0].toolUseId).toBe('tool-1');
          expect(userMsg.contentBlocks[0].content).toBe('file contents here');
          expect(userMsg.contentBlocks[0].isError).toBe(false);
        }
      });

      it('should parse error tool_result', () => {
        const parsed = handler.parseMessage(mockToolResultErrorMessage);

        expect(parsed.type).toBe(SDKMessageType.USER);
        const userMsg = parsed as ParsedUserMessage;
        if (userMsg.contentBlocks[0].type === ContentBlockType.TOOL_RESULT) {
          expect(userMsg.contentBlocks[0].isError).toBe(true);
          expect(userMsg.contentBlocks[0].content).toBe('File not found');
        }
      });
    });

    describe('result message', () => {
      it('should parse success result message', () => {
        const parsed = handler.parseMessage(mockResultSuccessMessage);

        expect(parsed.type).toBe(SDKMessageType.RESULT);
        const resultMsg = parsed as ParsedResultMessage;
        expect(resultMsg.subtype).toBe('success');
        expect(resultMsg.sessionId).toBe('session-123');
        expect(resultMsg.uuid).toBe('msg-456');
        expect(resultMsg.isError).toBe(false);
        expect(resultMsg.usage).toEqual({
          inputTokens: 100,
          outputTokens: 50,
          totalCostUSD: 0.001,
        });
      });

      it('should parse error result message', () => {
        const parsed = handler.parseMessage(mockResultErrorMessage);

        expect(parsed.type).toBe(SDKMessageType.RESULT);
        const resultMsg = parsed as ParsedResultMessage;
        expect(resultMsg.subtype).toBe('error');
        expect(resultMsg.isError).toBe(true);
        expect(resultMsg.usage).toBeUndefined();
      });
    });

    describe('system message', () => {
      it('should parse system message', () => {
        const parsed = handler.parseMessage(mockSystemMessage);
        expect(parsed.type).toBe(SDKMessageType.SYSTEM);
      });
    });

    describe('unknown message type', () => {
      it('should handle unknown message types gracefully', () => {
        const unknownMessage = {
          type: 'unknown_type',
          data: 'some data',
        } as unknown as SDKMessage;

        const parsed = handler.parseMessage(unknownMessage);
        expect(parsed.type).toBe(SDKMessageType.SYSTEM);
      });
    });
  });

  describe('processStream', () => {
    describe('full stream flow', () => {
      it('should process init → assistant → result flow', async () => {
        const callbacks: StreamCallbacks = {
          onSessionInit: vi.fn(),
          onTextChunk: vi.fn(),
          onComplete: vi.fn(),
        };

        const messages = [
          mockInitMessage,
          mockAssistantTextMessage,
          mockResultSuccessMessage,
        ];

        const result = await handler.processStream(
          createMockGenerator(messages),
          callbacks
        );

        expect(callbacks.onSessionInit).toHaveBeenCalledWith('session-123', {
          model: 'claude-opus-4-5-20251101',
          cwd: '/path/to/project',
        });
        expect(callbacks.onTextChunk).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: 'session-123',
            content: 'Hello, world!',
            done: false,
          })
        );
        expect(callbacks.onComplete).toHaveBeenCalled();
        expect(result.done).toBe(true);
        expect(result.sessionId).toBe('session-123');
      });

      it('should process tool_use → tool_result flow', async () => {
        const callbacks: StreamCallbacks = {
          onSessionInit: vi.fn(),
          onToolUse: vi.fn(),
          onToolResult: vi.fn(),
          onComplete: vi.fn(),
        };

        const messages = [
          mockInitMessage,
          mockAssistantToolUseMessage,
          mockToolResultMessage,
          mockResultSuccessMessage,
        ];

        await handler.processStream(createMockGenerator(messages), callbacks);

        expect(callbacks.onToolUse).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'tool-1',
            name: 'Read',
            status: 'pending',
          })
        );
        expect(callbacks.onToolResult).toHaveBeenCalledWith('tool-1', {
          success: true,
          output: 'file contents here',
          error: undefined,
        });
      });

      it('should accumulate text from multiple messages', async () => {
        const callbacks: StreamCallbacks = {
          onTextChunk: vi.fn(),
          onComplete: vi.fn(),
        };

        const message1 = {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'First ' }] },
        } as unknown as SDKMessage;

        const message2 = {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Second' }] },
        } as unknown as SDKMessage;

        const messages = [mockInitMessage, message1, message2, mockResultSuccessMessage];

        const result = await handler.processStream(
          createMockGenerator(messages),
          callbacks
        );

        expect(callbacks.onTextChunk).toHaveBeenCalledTimes(2);
        expect(result.content).toBe('First Second');
      });

      it('should track tool calls from pending to completed', async () => {
        const callbacks: StreamCallbacks = {};

        const messages = [
          mockInitMessage,
          mockAssistantToolUseMessage,
          mockToolResultMessage,
          mockResultSuccessMessage,
        ];

        await handler.processStream(createMockGenerator(messages), callbacks);

        const state = handler.getState();
        expect(state.pendingToolCalls.size).toBe(0);
        expect(state.completedToolCalls.size).toBe(1);
        expect(state.completedToolCalls.get('tool-1')?.status).toBe('completed');
      });
    });

    describe('error handling', () => {
      it('should call onError when stream throws', async () => {
        const callbacks: StreamCallbacks = {
          onError: vi.fn(),
        };

        const messages = [mockInitMessage, mockAssistantTextMessage];

        await expect(
          handler.processStream(createErrorGenerator(messages, 1), callbacks)
        ).rejects.toThrow('Stream interrupted');

        expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should handle error result message', async () => {
        const callbacks: StreamCallbacks = {
          onComplete: vi.fn(),
        };

        const messages = [mockInitMessage, mockResultErrorMessage];

        const result = await handler.processStream(
          createMockGenerator(messages),
          callbacks
        );

        expect(result.isError).toBe(true);
        expect(callbacks.onComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            isError: true,
          })
        );
      });

      it('should cleanup resources after error', async () => {
        const callbacks: StreamCallbacks = {};

        // Add a pending tool call first
        const messages = [mockInitMessage, mockAssistantToolUseMessage];

        try {
          await handler.processStream(createErrorGenerator(messages, 2), callbacks);
        } catch {
          // Expected error
        }

        const state = handler.getState();
        expect(state.pendingToolCalls.size).toBe(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty content blocks', async () => {
        const callbacks: StreamCallbacks = {
          onTextChunk: vi.fn(),
        };

        const emptyMessage = {
          type: 'assistant',
          message: { content: [] },
        } as unknown as SDKMessage;

        const messages = [mockInitMessage, emptyMessage, mockResultSuccessMessage];

        await handler.processStream(createMockGenerator(messages), callbacks);

        expect(callbacks.onTextChunk).not.toHaveBeenCalled();
      });

      it('should handle unknown content block types', async () => {
        const callbacks: StreamCallbacks = {
          onTextChunk: vi.fn(),
        };

        const unknownBlockMessage = {
          type: 'assistant',
          message: {
            content: [
              { type: 'unknown_block', data: 'test' },
              { type: 'text', text: 'Valid text' },
            ],
          },
        } as unknown as SDKMessage;

        const messages = [mockInitMessage, unknownBlockMessage, mockResultSuccessMessage];

        await handler.processStream(createMockGenerator(messages), callbacks);

        // Should only call for the valid text block
        expect(callbacks.onTextChunk).toHaveBeenCalledTimes(1);
      });

      it('should handle tool_result without matching tool_use', async () => {
        const callbacks: StreamCallbacks = {
          onToolResult: vi.fn(),
        };

        const orphanToolResult = {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'nonexistent-tool',
                content: 'result',
                is_error: false,
              },
            ],
          },
        } as unknown as SDKMessage;

        const messages = [mockInitMessage, orphanToolResult, mockResultSuccessMessage];

        // Should not throw
        await handler.processStream(createMockGenerator(messages), callbacks);

        expect(callbacks.onToolResult).toHaveBeenCalled();
      });

      it('should handle tool_result with is_error true', async () => {
        const callbacks: StreamCallbacks = {
          onToolUse: vi.fn(),
          onToolResult: vi.fn(),
        };

        const messages = [
          mockInitMessage,
          mockAssistantToolUseMessage,
          mockToolResultErrorMessage,
          mockResultSuccessMessage,
        ];

        await handler.processStream(createMockGenerator(messages), callbacks);

        expect(callbacks.onToolResult).toHaveBeenCalledWith('tool-1', {
          success: false,
          output: undefined,
          error: 'File not found',
        });
      });

      it('should handle system messages without error', async () => {
        const callbacks: StreamCallbacks = {
          onComplete: vi.fn(),
        };

        const messages = [
          mockInitMessage,
          mockSystemMessage,
          mockResultSuccessMessage,
        ];

        await handler.processStream(createMockGenerator(messages), callbacks);

        expect(callbacks.onComplete).toHaveBeenCalled();
      });
    });
  });
});
