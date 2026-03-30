/**
 * SummarizeService Tests — Story 25.9 Task 7.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor() {}
    },
  };
});

import { summarize, type SummarizeMessage } from '../summarizeService.js';

describe('summarizeService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const sampleMessages: SummarizeMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'How are you?' },
    { role: 'assistant', content: 'I am good.' },
  ];

  it('generates summary successfully', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '## Summary\n- Key decisions made' }],
    });

    const result = await summarize(sampleMessages);

    expect(result).toBe('## Summary\n- Key decisions made');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    expect(callArgs.max_tokens).toBe(2048);
  });

  it('throws error for empty messages array', async () => {
    await expect(summarize([])).rejects.toThrow('No messages to summarize');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws error when API key is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(summarize(sampleMessages)).rejects.toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('throws error when API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(summarize(sampleMessages)).rejects.toThrow('API rate limit exceeded');
  });

  it('uses custom model from environment variable', async () => {
    process.env.SUMMARIZE_MODEL = 'claude-haiku-4-5-20251001';
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Summary' }],
    });

    await summarize(sampleMessages);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
    delete process.env.SUMMARIZE_MODEL;
  });

  it('truncates messages when exceeding token limit', async () => {
    // Create messages that exceed 200k tokens (~800k chars)
    const longMessages: SummarizeMessage[] = [];
    for (let i = 0; i < 10; i++) {
      longMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'x'.repeat(100_000), // ~25k tokens each
      });
    }
    // Total: ~250k tokens, should be truncated to ~200k

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Truncated summary' }],
    });

    const result = await summarize(longMessages);
    expect(result).toBe('Truncated summary');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('passes locale in system prompt when provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Korean summary' }],
    });

    await summarize(sampleMessages, { locale: 'ko' });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('Respond in ko language.');
  });

  it('does not add locale instruction when locale is not provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Summary' }],
    });

    await summarize(sampleMessages);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).not.toContain('Respond in');
  });

  it('passes AbortSignal to API call', async () => {
    const abortController = new AbortController();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Summary' }],
    });

    await summarize(sampleMessages, { signal: abortController.signal });

    // Second arg to create() should have signal
    const opts = mockCreate.mock.calls[0][1];
    expect(opts.signal).toBe(abortController.signal);
  });

  it('throws when response has no text content', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'test', name: 'test', input: {} }],
    });

    await expect(summarize(sampleMessages)).rejects.toThrow('No text content in summary response');
  });
});
