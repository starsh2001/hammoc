/**
 * SummarizeService Tests — Story 25.9 Task 7.2
 *
 * Tests the Agent SDK-based summarize service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Agent SDK query
const mockAbort = vi.fn();
const mockQueryIterator = {
  [Symbol.asyncIterator]: vi.fn(),
  abort: mockAbort,
};
const mockQuery = vi.fn(() => mockQueryIterator);

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock fs.unlink for temp session cleanup
vi.mock('fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock SessionService so that getSessionFilePath returns a testable path
vi.mock('../sessionService.js', () => ({
  SessionService: vi.fn().mockImplementation(() => ({
    getSessionFilePath: vi.fn().mockReturnValue('/tmp/test-session.jsonl'),
  })),
  sessionService: {},
}));

import { summarize, type SummarizeMessage } from '../summarizeService.js';

function makeAsyncIterator(messages: Array<{ type: string; [key: string]: unknown }>) {
  let idx = 0;
  return () => ({
    next: async () => {
      if (idx < messages.length) {
        return { value: messages[idx++], done: false };
      }
      return { value: undefined, done: true };
    },
  });
}

describe('summarizeService (Agent SDK)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleMessages: SummarizeMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'How are you?' },
    { role: 'assistant', content: 'I am good.' },
  ];

  it('generates summary successfully via Agent SDK query', async () => {
    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'assistant', uuid: 'a1' },
      { type: 'result', subtype: 'success', result: '## Summary\n- Key decisions' },
    ]);

    const result = await summarize(sampleMessages);

    expect(result).toBe('## Summary\n- Key decisions');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain('user: Hello');
    expect(callArgs.options.maxTurns).toBe(1);
    expect(callArgs.options.permissionMode).toBe('dontAsk');
  });

  it('throws error for empty messages array', async () => {
    await expect(summarize([])).rejects.toThrow('No messages to summarize');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('throws error when no text in result', async () => {
    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'result', subtype: 'success', result: '' },
    ]);

    await expect(summarize(sampleMessages)).rejects.toThrow('No text content in summary response');
  });

  it('truncates messages when exceeding token limit', async () => {
    const longMessages: SummarizeMessage[] = [];
    for (let i = 0; i < 10; i++) {
      longMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'x'.repeat(100_000),
      });
    }

    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'result', subtype: 'success', result: 'Truncated summary' },
    ]);

    const result = await summarize(longMessages);
    expect(result).toBe('Truncated summary');
    // Prompt should be shorter than full input
    const prompt = mockQuery.mock.calls[0][0].prompt as string;
    expect(prompt.length).toBeLessThan(10 * 100_000);
  });

  it('throws when all messages truncated', async () => {
    // Single huge message that exceeds limit even alone
    const hugeMessages: SummarizeMessage[] = [
      { role: 'user', content: 'x'.repeat(900_000) },
    ];

    await expect(summarize(hugeMessages)).rejects.toThrow('Conversation too large to summarize');
  });

  it('adds locale hint when provided', async () => {
    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'result', subtype: 'success', result: 'Korean summary' },
    ]);

    await summarize(sampleMessages, { locale: 'ko' });

    const prompt = mockQuery.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Respond in ko language.');
  });

  it('passes cwd to Agent SDK options', async () => {
    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'result', subtype: 'success', result: 'Summary' },
    ]);

    await summarize(sampleMessages, { cwd: '/test/path' });

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.cwd).toBe('/test/path');
  });

  it('cleans up temp session JSONL after completion', async () => {
    const { unlink } = await import('fs/promises');

    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'result', subtype: 'success', result: 'Summary' },
    ]);

    await summarize(sampleMessages, { projectSlug: 'test-proj' });

    expect(unlink).toHaveBeenCalledTimes(1);
    const deletedPath = (unlink as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(deletedPath).toContain('.jsonl');
  });

  it('cleans up temp session even on error', async () => {
    const { unlink } = await import('fs/promises');

    mockQueryIterator[Symbol.asyncIterator] = makeAsyncIterator([
      { type: 'result', subtype: 'error', result: '' },
    ]);

    await expect(summarize(sampleMessages, { projectSlug: 'test-proj' })).rejects.toThrow();
    expect(unlink).toHaveBeenCalledTimes(1);
  });
});
