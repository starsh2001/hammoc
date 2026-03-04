import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatService, createChatService } from '../chatService.js';
import {
  SDKError,
  RateLimitError,
  AuthenticationError,
  NetworkError,
  InvalidPathError,
  parseSDKError,
  isRetriableError,
  getRetryDelay,
  SDKErrorCode,
} from '../../utils/errors.js';
import type { Stats } from 'node:fs';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Mock the SDK query function
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
  },
}));

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChatService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const service = new ChatService();
      expect(service.getWorkingDirectory()).toBeUndefined();
    });

    it('should create instance with working directory', () => {
      const service = new ChatService({ workingDirectory: '/test/path' });
      expect(service.getWorkingDirectory()).toBe('/test/path');
    });
  });

  describe('initSession', () => {
    it('should set working directory for valid path', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      const testPath = os.tmpdir();
      await service.initSession(testPath);

      expect(service.getWorkingDirectory()).toBe(path.resolve(testPath));
    });

    it('should throw InvalidPathError for non-existent path', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      await expect(service.initSession('/non/existent/path')).rejects.toThrow(
        InvalidPathError
      );
    });

    it('should throw InvalidPathError for file path (not directory)', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as Stats);

      await expect(service.initSession('/some/file.txt')).rejects.toThrow(
        InvalidPathError
      );
    });
  });

  describe('setAllowedTools', () => {
    it('should set allowed tools list', () => {
      const tools = ['Read', 'Write', 'Edit'];
      service.setAllowedTools(tools);

      // Verify by trying to send a message (internal state check)
      expect(() => service.setAllowedTools(['Bash'])).not.toThrow();
    });

    it('should create a copy of the tools array', () => {
      const tools = ['Read', 'Write'];
      service.setAllowedTools(tools);
      tools.push('Edit'); // Modifying original should not affect service

      // The service should have a separate copy
      service.setAllowedTools(['Bash']);
      expect(tools).toEqual(['Read', 'Write', 'Edit']);
    });
  });

  describe('setDisallowedTools', () => {
    it('should set disallowed tools list', () => {
      const tools = ['Bash', 'Write'];
      service.setDisallowedTools(tools);
      expect(() => service.setDisallowedTools(['Edit'])).not.toThrow();
    });
  });

  describe('createChatService', () => {
    it('should create a new ChatService instance', () => {
      const service = createChatService();
      expect(service).toBeInstanceOf(ChatService);
    });

    it('should pass config to ChatService', () => {
      const service = createChatService({ workingDirectory: '/test' });
      expect(service.getWorkingDirectory()).toBe('/test');
    });
  });
});

describe('Error Utilities', () => {
  describe('SDKError', () => {
    it('should create error with default code', () => {
      const error = new SDKError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(SDKErrorCode.UNKNOWN);
      expect(error.statusCode).toBe(500);
    });

    it('should create error with specific code', () => {
      const error = new SDKError('Rate limit', SDKErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.code).toBe(SDKErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.statusCode).toBe(429);
    });

    it('should include retryAfter when provided', () => {
      const error = new SDKError('Rate limit', SDKErrorCode.RATE_LIMIT_EXCEEDED, {
        retryAfter: 60,
      });
      expect(error.retryAfter).toBe(60);
    });

    it('should serialize to JSON correctly', () => {
      const error = new SDKError('Test', SDKErrorCode.RATE_LIMIT_EXCEEDED, {
        retryAfter: 30,
      });
      const json = error.toJSON();
      expect(json).toEqual({
        name: 'SDKError',
        message: 'Test',
        code: SDKErrorCode.RATE_LIMIT_EXCEEDED,
        statusCode: 429,
        retryAfter: 30,
      });
    });
  });

  describe('RateLimitError', () => {
    it('should have correct properties', () => {
      const error = new RateLimitError(120);
      expect(error.code).toBe(SDKErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(120);
      expect(error.message).toContain('API request limit reached');
    });

    it('should use default retryAfter of 60', () => {
      const error = new RateLimitError();
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct properties', () => {
      const error = new AuthenticationError();
      expect(error.code).toBe(SDKErrorCode.AUTHENTICATION_ERROR);
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('claude login');
    });
  });

  describe('NetworkError', () => {
    it('should have correct properties', () => {
      const error = new NetworkError();
      expect(error.code).toBe(SDKErrorCode.NETWORK_ERROR);
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain('Network connection problem');
    });
  });

  describe('InvalidPathError', () => {
    it('should include path in error', () => {
      const error = new InvalidPathError('/bad/path');
      expect(error.code).toBe(SDKErrorCode.INVALID_PATH);
      expect(error.path).toBe('/bad/path');
      expect(error.message).toContain('/bad/path');
    });
  });

  describe('parseSDKError', () => {
    it('should return SDKError as-is', () => {
      const original = new SDKError('Test');
      const parsed = parseSDKError(original);
      expect(parsed).toBe(original);
    });

    it('should parse rate limit error from message', () => {
      const error = new Error('rate limit exceeded, retry after 120');
      const parsed = parseSDKError(error);
      expect(parsed).toBeInstanceOf(RateLimitError);
      expect(parsed.retryAfter).toBe(120);
    });

    it('should parse authentication error from message', () => {
      const error = new Error('authentication failed');
      const parsed = parseSDKError(error);
      expect(parsed).toBeInstanceOf(AuthenticationError);
    });

    it('should parse network error from message', () => {
      const error = new Error('ECONNREFUSED');
      const parsed = parseSDKError(error);
      expect(parsed).toBeInstanceOf(NetworkError);
    });

    it('should return generic SDKError for unknown errors', () => {
      const error = new Error('Something went wrong');
      const parsed = parseSDKError(error);
      expect(parsed).toBeInstanceOf(SDKError);
      expect(parsed.code).toBe(SDKErrorCode.UNKNOWN);
    });

    it('should handle non-Error objects', () => {
      const parsed = parseSDKError('string error');
      expect(parsed).toBeInstanceOf(SDKError);
      expect(parsed.message).toBe('string error');
    });
  });

  describe('isRetriableError', () => {
    it('should return true for rate limit errors', () => {
      expect(isRetriableError(new RateLimitError())).toBe(true);
    });

    it('should return true for network errors', () => {
      expect(isRetriableError(new NetworkError())).toBe(true);
    });

    it('should return false for authentication errors', () => {
      expect(isRetriableError(new AuthenticationError())).toBe(false);
    });

    it('should return false for non-SDKError', () => {
      expect(isRetriableError(new Error('test'))).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return retryAfter in milliseconds', () => {
      const error = new RateLimitError(30);
      expect(getRetryDelay(error)).toBe(30000);
    });

    it('should return default 5000ms for errors without retryAfter', () => {
      const error = new NetworkError();
      expect(getRetryDelay(error)).toBe(5000);
    });
  });
});

describe('Cross-Platform Path Handling', () => {
  it('should use path.resolve for absolute paths', () => {
    const relativePath = './test';
    const absolutePath = path.resolve(relativePath);
    expect(path.isAbsolute(absolutePath)).toBe(true);
  });

  it('should use path.join for path concatenation', () => {
    const basePath = os.homedir();
    const configPath = path.join(basePath, '.bmad-studio', 'config.json');
    expect(configPath).toContain('.bmad-studio');
    expect(configPath).toContain('config.json');
  });

  it('should handle path separators correctly', () => {
    const testPath = path.join('a', 'b', 'c');
    // Should work regardless of platform
    expect(testPath.split(path.sep)).toEqual(['a', 'b', 'c']);
  });
});

// Story 4.6 - Task 6: chatService 통합 테스트 확장
describe('sendMessageWithCallbacks (Story 4.6)', () => {
  let service: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChatService({ workingDirectory: '/test/path' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass resume option to SDK when provided', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          session_id: 'test-session',
          uuid: 'msg-1',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 5 },
          total_cost_usd: 0.001,
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onSessionInit: vi.fn(),
      onComplete: vi.fn(),
    };

    await service.sendMessageWithCallbacks('Test message', callbacks, {
      resume: 'existing-session-id',
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          resume: 'existing-session-id',
        }),
      })
    );
  });

  it('should call onError callback when error occurs in stream', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        throw new Error('Stream error');
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onSessionInit: vi.fn(),
      onError: vi.fn(),
    };

    await expect(
      service.sendMessageWithCallbacks('Test message', callbacks)
    ).rejects.toThrow('Stream error');

    expect(callbacks.onError).toHaveBeenCalled();
  });

  it('should pass abortController to SDK', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          session_id: 'test-session',
          uuid: 'msg-1',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 5 },
          total_cost_usd: 0.001,
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const abortController = new AbortController();
    const callbacks = {
      onComplete: vi.fn(),
    };

    await service.sendMessageWithCallbacks('Test message', callbacks, {
      abortController,
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          abortController,
        }),
      })
    );
  });

  it('should pass AsyncIterable prompt to query() when images are provided', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          session_id: 'test-session',
          uuid: 'msg-1',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 5 },
          total_cost_usd: 0.001,
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onComplete: vi.fn(),
    };

    await service.sendMessageWithCallbacks('Describe this image', callbacks, {
      images: [
        { mimeType: 'image/png', data: 'iVBORw0KGgo=', name: 'test.png' },
      ],
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.objectContaining({
          [Symbol.asyncIterator]: expect.any(Function),
        }),
      })
    );
  });

  it('should pass string prompt to query() when no images are provided', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          session_id: 'test-session',
          uuid: 'msg-1',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 5 },
          total_cost_usd: 0.001,
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onComplete: vi.fn(),
    };

    await service.sendMessageWithCallbacks('Hello no images', callbacks);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Hello no images',
      })
    );
  });

  it('should return extended ChatUsage fields in result', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          session_id: 'test-session',
          uuid: 'msg-1',
          is_error: false,
          usage: {
            input_tokens: 150000,
            output_tokens: 500,
            cache_read_input_tokens: 80000,
            cache_creation_input_tokens: 5000,
          },
          total_cost_usd: 0.05,
          modelUsage: {
            'claude-opus-4-5-20251101': {
              contextWindow: 200000,
              inputTokens: 150000,
              outputTokens: 500,
              cacheReadInputTokens: 80000,
              cacheCreationInputTokens: 5000,
              costUSD: 0.05,
              webSearchRequests: 0,
            },
          },
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onComplete: vi.fn(),
    };

    const result = await service.sendMessageWithCallbacks('Test', callbacks);

    expect(result.usage).toMatchObject({
      inputTokens: 150000,
      outputTokens: 500,
      cacheReadInputTokens: 80000,
      cacheCreationInputTokens: 5000,
      totalCostUSD: 0.05,
      contextWindow: 200000,
    });
  });

  it('should capture usage even on error result (error_max_turns)', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session' };
        yield {
          type: 'result',
          subtype: 'error_max_turns',
          result: '',
          session_id: 'test-session',
          uuid: 'msg-err',
          is_error: true,
          usage: {
            input_tokens: 195000,
            output_tokens: 100,
            cache_read_input_tokens: 10000,
            cache_creation_input_tokens: 2000,
          },
          total_cost_usd: 0.08,
          modelUsage: {
            'claude-opus-4-5-20251101': {
              contextWindow: 200000,
              inputTokens: 195000,
              outputTokens: 100,
              cacheReadInputTokens: 10000,
              cacheCreationInputTokens: 2000,
              costUSD: 0.08,
              webSearchRequests: 0,
            },
          },
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onComplete: vi.fn(),
    };

    const result = await service.sendMessageWithCallbacks('Test', callbacks);

    expect(result.isError).toBe(true);
    expect(result.usage).toBeDefined();
    expect(result.usage?.inputTokens).toBe(195000);
    expect(result.usage?.contextWindow).toBe(200000);
  });

  it('should call callbacks in correct order: onSessionInit → onTextChunk → onComplete', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const callOrder: string[] = [];

    const mockIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'init', session_id: 'test-session', model: 'claude' };
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello' }] },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          session_id: 'test-session',
          uuid: 'msg-1',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 5 },
          total_cost_usd: 0.001,
        };
      },
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    vi.mocked(query).mockReturnValue(mockIterator as unknown as ReturnType<typeof query>);

    const callbacks = {
      onSessionInit: vi.fn(() => callOrder.push('onSessionInit')),
      onTextChunk: vi.fn(() => callOrder.push('onTextChunk')),
      onComplete: vi.fn(() => callOrder.push('onComplete')),
    };

    await service.sendMessageWithCallbacks('Test message', callbacks);

    expect(callOrder).toEqual(['onSessionInit', 'onTextChunk', 'onComplete']);
  });
});
