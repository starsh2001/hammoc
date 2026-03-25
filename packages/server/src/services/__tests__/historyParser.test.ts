import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseJSONLFile,
  sortMessagesByParentUuid,
  transformToHistoryMessages,
} from '../historyParser.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import type { RawJSONLMessage } from '@hammoc/shared';

// Mock fs/promises and fs
vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

const mockFs = vi.mocked(fs);
const mockExistsSync = vi.mocked(existsSync);

describe('historyParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file exists
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('parseJSONLFile', () => {
    it('parses valid JSONL content', async () => {
      const content = `{"uuid":"1","type":"user","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-15T10:00:00Z"}
{"uuid":"2","type":"assistant","parentUuid":"1","message":{"role":"assistant","content":"Hi!"},"timestamp":"2026-01-15T10:00:05Z"}`;

      mockFs.readFile.mockResolvedValue(content);

      const messages = await parseJSONLFile('/path/to/session.jsonl');

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('user');
      expect(messages[1].type).toBe('assistant');
      expect(messages[0].uuid).toBe('1');
      expect(messages[1].uuid).toBe('2');
    });

    it('skips invalid JSON lines and continues parsing', async () => {
      const content = `{"uuid":"1","type":"user","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-15T10:00:00Z"}
invalid json line
{"uuid":"2","type":"assistant","parentUuid":"1","message":{"role":"assistant","content":"Hi!"},"timestamp":"2026-01-15T10:00:05Z"}`;

      mockFs.readFile.mockResolvedValue(content);
      const messages = await parseJSONLFile('/path/to/session.jsonl');

      expect(messages).toHaveLength(2);
    });

    it('returns empty array for non-existent file', async () => {
      mockExistsSync.mockReturnValue(false);

      const messages = await parseJSONLFile('/path/to/nonexistent.jsonl');

      expect(messages).toEqual([]);
    });

    it('returns empty array for empty file', async () => {
      mockFs.readFile.mockResolvedValue('');

      const messages = await parseJSONLFile('/path/to/empty.jsonl');

      expect(messages).toEqual([]);
    });

    it('handles file with only whitespace', async () => {
      mockFs.readFile.mockResolvedValue('   \n\n   ');

      const messages = await parseJSONLFile('/path/to/whitespace.jsonl');

      expect(messages).toEqual([]);
    });

    it('parses tool_use messages correctly', async () => {
      const content = `{"uuid":"1","type":"tool_use","toolName":"Read","toolInput":{"file_path":"/index.ts"},"timestamp":"2026-01-15T10:00:00Z"}`;

      mockFs.readFile.mockResolvedValue(content);

      const messages = await parseJSONLFile('/path/to/session.jsonl');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[0].toolName).toBe('Read');
      expect(messages[0].toolInput).toEqual({ file_path: '/index.ts' });
    });

    it('parses tool_result messages correctly', async () => {
      const content = `{"uuid":"1","type":"tool_result","parentUuid":"0","result":"file content here","timestamp":"2026-01-15T10:00:00Z"}`;

      mockFs.readFile.mockResolvedValue(content);

      const messages = await parseJSONLFile('/path/to/session.jsonl');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].result).toBe('file content here');
    });

    it('parses tool_result with error correctly', async () => {
      const content = `{"uuid":"1","type":"tool_result","parentUuid":"0","error":"File not found","timestamp":"2026-01-15T10:00:00Z"}`;

      mockFs.readFile.mockResolvedValue(content);

      const messages = await parseJSONLFile('/path/to/session.jsonl');

      expect(messages).toHaveLength(1);
      expect(messages[0].error).toBe('File not found');
    });
  });

  describe('sortMessagesByParentUuid', () => {
    it('sorts messages in conversation order', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: '3', parentUuid: '2', type: 'assistant', timestamp: '2026-01-15T10:00:10Z' },
        { uuid: '1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: '2', parentUuid: '1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted[0].uuid).toBe('1');
      expect(sorted[1].uuid).toBe('2');
      expect(sorted[2].uuid).toBe('3');
    });

    it('handles multiple root messages', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: '2', type: 'user', timestamp: '2026-01-15T10:00:05Z' },
        { uuid: '1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: '3', parentUuid: '1', type: 'assistant', timestamp: '2026-01-15T10:00:10Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      // Active branch: latest leaf is msg-3 (t=10Z), trace: msg-3→msg-1 (root, t=00Z)
      // msg-2 is a later compaction root (t=05Z > t=00Z) without the latest leaf → excluded
      expect(sorted).toHaveLength(2);
      expect(sorted[0].uuid).toBe('1');
      expect(sorted[1].uuid).toBe('3');
    });

    it('handles empty array', () => {
      const sorted = sortMessagesByParentUuid([]);

      expect(sorted).toEqual([]);
    });

    it('handles single message', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: '1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].uuid).toBe('1');
    });

    it('sorts children by timestamp when same parent', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: '1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: '3', parentUuid: '1', type: 'tool_use', timestamp: '2026-01-15T10:00:10Z' },
        { uuid: '2', parentUuid: '1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      // Active branch: msg-2 and msg-3 are both children of msg-1 (branch point).
      // Latest leaf is msg-3 (t=10Z). Active path: msg-3→msg-1. msg-2 is sidechain.
      expect(sorted).toHaveLength(2);
      expect(sorted[0].uuid).toBe('1');
      expect(sorted[1].uuid).toBe('3');
    });

    it('handles deep nesting correctly', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: '4', parentUuid: '3', type: 'assistant', timestamp: '2026-01-15T10:00:15Z' },
        { uuid: '1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: '3', parentUuid: '2', type: 'tool_result', timestamp: '2026-01-15T10:00:11Z' },
        { uuid: '2', parentUuid: '1', type: 'tool_use', timestamp: '2026-01-15T10:00:10Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted[0].uuid).toBe('1');
      expect(sorted[1].uuid).toBe('2');
      expect(sorted[2].uuid).toBe('3');
      expect(sorted[3].uuid).toBe('4');
    });
  });

  describe('active branch extraction (Story 25.2)', () => {
    it('linear conversation — all messages retained, same order', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: 'msg-1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-2', parentUuid: 'msg-1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
        { uuid: 'msg-3', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:10Z' },
        { uuid: 'msg-4', parentUuid: 'msg-3', type: 'assistant', timestamp: '2026-01-15T10:00:15Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted.map((m) => m.uuid)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4']);
    });

    it('single rewind scenario — dead branch excluded', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: 'msg-1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-2', parentUuid: 'msg-1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
        { uuid: 'msg-3', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:10Z' },
        { uuid: 'msg-4', parentUuid: 'msg-3', type: 'assistant', timestamp: '2026-01-15T10:00:15Z' },
        { uuid: 'msg-5', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:20Z' },
        { uuid: 'msg-6', parentUuid: 'msg-5', type: 'assistant', timestamp: '2026-01-15T10:00:25Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted.map((m) => m.uuid)).toEqual(['msg-1', 'msg-2', 'msg-5', 'msg-6']);
      // Dead branch messages should be marked as sidechain
      expect(messages.find((m) => m.uuid === 'msg-3')!.isSidechain).toBe(true);
      expect(messages.find((m) => m.uuid === 'msg-4')!.isSidechain).toBe(true);
    });

    it('multiple rewind scenario — only latest branch active', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: 'msg-1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-2', parentUuid: 'msg-1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
        // First branch (dead)
        { uuid: 'msg-3', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:10Z' },
        { uuid: 'msg-4', parentUuid: 'msg-3', type: 'assistant', timestamp: '2026-01-15T10:00:15Z' },
        // Second branch (dead)
        { uuid: 'msg-5', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:20Z' },
        { uuid: 'msg-6', parentUuid: 'msg-5', type: 'assistant', timestamp: '2026-01-15T10:00:25Z' },
        // Third branch (active — latest leaf)
        { uuid: 'msg-7', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:30Z' },
        { uuid: 'msg-8', parentUuid: 'msg-7', type: 'assistant', timestamp: '2026-01-15T10:00:35Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted.map((m) => m.uuid)).toEqual(['msg-1', 'msg-2', 'msg-7', 'msg-8']);
    });

    it('compaction boundary — earlier segment included entirely, active branch filtered in active segment', () => {
      const messages: RawJSONLMessage[] = [
        // Compacted tree 1 (earlier segment)
        { uuid: 'msg-A', type: 'user', timestamp: '2026-01-15T09:00:00Z' },
        { uuid: 'msg-B', parentUuid: 'msg-A', type: 'assistant', timestamp: '2026-01-15T09:00:05Z' },
        { uuid: 'msg-C', parentUuid: 'msg-B', type: 'user', timestamp: '2026-01-15T09:00:10Z' },
        // Active tree 2 (after compaction)
        { uuid: 'msg-D', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-E', parentUuid: 'msg-D', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
        // Dead branch in active tree
        { uuid: 'msg-F', parentUuid: 'msg-E', type: 'user', timestamp: '2026-01-15T10:00:10Z' },
        // Active branch in active tree
        { uuid: 'msg-G', parentUuid: 'msg-E', type: 'user', timestamp: '2026-01-15T10:00:15Z' },
        { uuid: 'msg-H', parentUuid: 'msg-G', type: 'assistant', timestamp: '2026-01-15T10:00:20Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted.map((m) => m.uuid)).toEqual([
        'msg-A', 'msg-B', 'msg-C', 'msg-D', 'msg-E', 'msg-G', 'msg-H',
      ]);
      expect(messages.find((m) => m.uuid === 'msg-F')!.isSidechain).toBe(true);
    });

    it('later compaction segment excluded', () => {
      // Abnormal edge case: tree 1 contains the latest leaf (msg-C at t=25Z),
      // tree 2 has a later root but does NOT contain the latest leaf → excluded
      const messages: RawJSONLMessage[] = [
        // Tree 1 — active segment (contains latest leaf)
        { uuid: 'msg-A', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-B', parentUuid: 'msg-A', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
        { uuid: 'msg-C', parentUuid: 'msg-B', type: 'user', timestamp: '2026-01-15T10:00:25Z' },
        // Tree 2 — later root, no latest leaf → excluded
        { uuid: 'msg-D', type: 'user', timestamp: '2026-01-15T10:00:15Z' },
        { uuid: 'msg-E', parentUuid: 'msg-D', type: 'assistant', timestamp: '2026-01-15T10:00:20Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      // Latest leaf: msg-C (t=25Z). Active root: msg-A (t=00Z).
      // Tree 2 root (msg-D, t=15Z) is newer than active root → later segment → excluded.
      expect(sorted.map((m) => m.uuid)).toEqual(['msg-A', 'msg-B', 'msg-C']);
      expect(messages.find((m) => m.uuid === 'msg-D')!.isSidechain).toBe(true);
      expect(messages.find((m) => m.uuid === 'msg-E')!.isSidechain).toBe(true);
    });

    it('orphaned messages excluded', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: 'msg-1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-2', parentUuid: 'msg-1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z' },
        { uuid: 'msg-3', parentUuid: 'msg-1', type: 'user', timestamp: '2026-01-15T10:00:10Z' },
        // Orphaned message — references nonexistent parent
        { uuid: 'msg-orphan', parentUuid: 'nonexistent', type: 'user', timestamp: '2026-01-15T10:00:08Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      // Latest leaf: msg-3 (t=10Z). Active path: msg-3→msg-1. Orphan excluded.
      expect(sorted.map((m) => m.uuid)).toEqual(['msg-1', 'msg-3']);
      expect(messages.find((m) => m.uuid === 'msg-orphan')!.isSidechain).toBe(true);
    });

    it('root with parentUuid undefined vs null — both treated as root', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: 'msg-1', parentUuid: undefined, type: 'user', timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-2', parentUuid: null, type: 'assistant', timestamp: '2026-01-15T10:00:05Z', message: { role: 'assistant', content: 'Hi' } } as RawJSONLMessage,
        { uuid: 'msg-3', parentUuid: 'msg-2', type: 'user', timestamp: '2026-01-15T10:00:10Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      // Latest leaf: msg-3 (t=10Z). Trace: msg-3→msg-2 (root, parentUuid=null).
      // msg-1 is an earlier root (t=00Z < t=05Z) → included entirely as earlier compaction segment.
      // Actually msg-1 (parentUuid=undefined) and msg-2 (parentUuid=null) are both roots.
      // Active root = msg-2 (contains latest leaf msg-3). msg-1 root is earlier → included.
      expect(sorted.map((m) => m.uuid)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('empty array returns empty', () => {
      expect(sortMessagesByParentUuid([])).toEqual([]);
    });

    it('single message returns as-is', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: 'msg-1', type: 'user', timestamp: '2026-01-15T10:00:00Z' },
      ];

      const sorted = sortMessagesByParentUuid(messages);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].uuid).toBe('msg-1');
    });
  });

  describe('transformToHistoryMessages', () => {
    it('filters out init/system messages', () => {
      const messages: RawJSONLMessage[] = [
        { uuid: '1', type: 'init', timestamp: '2026-01-15T10:00:00Z' },
        {
          uuid: '2',
          type: 'user',
          message: { role: 'user', content: 'Hello' },
          timestamp: '2026-01-15T10:00:01Z',
        },
        { uuid: '3', type: 'system', timestamp: '2026-01-15T10:00:02Z' },
        {
          uuid: '4',
          type: 'assistant',
          parentUuid: '2',
          message: { role: 'assistant', content: 'Hi!' },
          timestamp: '2026-01-15T10:00:03Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(2);
      expect(transformed[0].type).toBe('user');
      expect(transformed[1].type).toBe('assistant');
    });

    it('merges tool_result into tool_use as single message', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'tool_use',
          toolName: 'Read',
          toolInput: { file_path: '/index.ts' },
          timestamp: '2026-01-15T10:00:00Z',
        },
        {
          uuid: '2',
          type: 'tool_result',
          parentUuid: '1',
          result: 'file content',
          timestamp: '2026-01-15T10:00:01Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      // tool_result merged into tool_use — single message
      expect(transformed).toHaveLength(1);
      expect(transformed[0].toolName).toBe('Read');
      expect(transformed[0].toolInput).toEqual({ file_path: '/index.ts' });
      expect(transformed[0].content).toBe('Calling Read');
      expect(transformed[0].toolResult?.success).toBe(true);
      expect(transformed[0].toolResult?.output).toBe('file content');
    });

    it('transforms user messages correctly', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'user',
          message: { role: 'user', content: 'Hello world' },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed[0].id).toBe('1');
      expect(transformed[0].type).toBe('user');
      expect(transformed[0].content).toBe('Hello world');
      expect(transformed[0].timestamp).toBe('2026-01-15T10:00:00Z');
    });

    it('transforms assistant messages correctly', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: { role: 'assistant', content: 'I can help you' },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed[0].id).toBe('1');
      expect(transformed[0].type).toBe('assistant');
      expect(transformed[0].content).toBe('I can help you');
    });

    it('handles tool_result with error', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'tool_result',
          parentUuid: '0',
          error: 'Permission denied',
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed[0].toolResult?.success).toBe(false);
      expect(transformed[0].toolResult?.error).toBe('Permission denied');
      expect(transformed[0].content).toBe('Permission denied');
    });

    it('filters out messages with missing content', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'user',
          timestamp: '2026-01-15T10:00:00Z',
          // message is undefined - should be filtered out
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      // Messages without content are filtered out
      expect(transformed).toHaveLength(0);
    });

    it('handles empty array', () => {
      const transformed = transformToHistoryMessages([]);

      expect(transformed).toEqual([]);
    });

    it('filters out meta messages (expanded slash commands)', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'user',
          timestamp: '2026-01-15T10:00:00Z',
          message: { role: 'user', content: '/sm' },
        },
        {
          uuid: '2',
          type: 'user',
          timestamp: '2026-01-15T10:00:01Z',
          message: { role: 'user', content: '# Expanded command content...' },
          isMeta: true, // This should be filtered out
        },
        {
          uuid: '3',
          type: 'assistant',
          timestamp: '2026-01-15T10:00:02Z',
          message: { role: 'assistant', content: 'Hello!' },
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(2);
      expect(transformed[0].content).toBe('/sm');
      expect(transformed[1].content).toBe('Hello!');
    });

    it('cleans command tags from user messages', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'user',
          timestamp: '2026-01-15T10:00:00Z',
          message: {
            role: 'user',
            content:
              '<command-message>BMad:agents:sm</command-message>\n<command-name>/BMad:agents:sm</command-name>',
          },
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(1);
      expect(transformed[0].content).toBe('/BMad:agents:sm');
    });
  });

  describe('thinking block extraction (Story 7.4)', () => {
    it('extracts thinking field from assistant message with thinking block', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Let me think...', signature: 'sig123' },
              { type: 'text', text: 'Here is my answer.' },
            ],
          },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(1);
      expect(transformed[0].thinking).toBe('Let me think...');
      expect(transformed[0].content).toBe('Here is my answer.');
    });

    it('preserves thinking field when thinking + tool_use coexist', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'I need to read a file.', signature: 'sig456' },
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/index.ts' } },
            ],
          },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(1);
      expect(transformed[0].thinking).toBe('I need to read a file.');
      expect(transformed[0].type).toBe('tool_use');
      expect(transformed[0].toolName).toBe('Read');
    });

    it('preserves thinking-only turn (no text content, only thinking)', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Deep thinking only...', signature: 'sig789' },
              { type: 'text', text: '(no content)' },
            ],
          },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(1);
      expect(transformed[0].thinking).toBe('Deep thinking only...');
      expect(transformed[0].content).toBe('');
    });

    it('filters out messages without thinking and without content', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: '(no content)' },
            ],
          },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(0);
    });

    it('does not set thinking field for assistant messages without thinking block', () => {
      const messages: RawJSONLMessage[] = [
        {
          uuid: '1',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Normal response' },
            ],
          },
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      const transformed = transformToHistoryMessages(messages);

      expect(transformed).toHaveLength(1);
      expect(transformed[0].thinking).toBeUndefined();
    });
  });

  describe('RawJSONLMessage type validation', () => {
    // Type guard function for testing
    function isValidRawJSONLMessage(obj: unknown): obj is RawJSONLMessage {
      if (typeof obj !== 'object' || obj === null) return false;
      const msg = obj as Record<string, unknown>;
      return (
        typeof msg.uuid === 'string' &&
        typeof msg.type === 'string' &&
        typeof msg.timestamp === 'string'
      );
    }

    it('validates required fields in user message', () => {
      const validUserMessage = {
        uuid: 'msg-1',
        type: 'user',
        message: { role: 'user', content: 'Hello' },
        timestamp: '2026-01-15T10:00:00Z',
      };

      expect(isValidRawJSONLMessage(validUserMessage)).toBe(true);
    });

    it('rejects messages with missing uuid', () => {
      const invalidMessage = {
        type: 'user',
        message: { role: 'user', content: 'Hello' },
        timestamp: '2026-01-15T10:00:00Z',
      };

      expect(isValidRawJSONLMessage(invalidMessage)).toBe(false);
    });

    it('rejects messages with missing type', () => {
      const invalidMessage = {
        uuid: 'msg-1',
        message: { role: 'user', content: 'Hello' },
        timestamp: '2026-01-15T10:00:00Z',
      };

      expect(isValidRawJSONLMessage(invalidMessage)).toBe(false);
    });

    it('rejects messages with missing timestamp', () => {
      const invalidMessage = {
        uuid: 'msg-1',
        type: 'user',
        message: { role: 'user', content: 'Hello' },
      };

      expect(isValidRawJSONLMessage(invalidMessage)).toBe(false);
    });

    it('rejects null', () => {
      expect(isValidRawJSONLMessage(null)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isValidRawJSONLMessage('string')).toBe(false);
      expect(isValidRawJSONLMessage(123)).toBe(false);
    });
  });

  describe('active branch + transformToHistoryMessages integration (Story 25.2)', () => {
    it('branched session: only active branch messages appear in final output', () => {
      const raw: RawJSONLMessage[] = [
        {
          uuid: 'u1', type: 'user', timestamp: '2026-01-15T10:00:00Z',
          message: { role: 'user', content: 'Hello' },
        },
        {
          uuid: 'a1', parentUuid: 'u1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z',
          message: { role: 'assistant', content: 'Hi there!' },
        },
        // Dead branch
        {
          uuid: 'u2-dead', parentUuid: 'a1', type: 'user', timestamp: '2026-01-15T10:00:10Z',
          message: { role: 'user', content: 'Dead branch question' },
        },
        {
          uuid: 'a2-dead', parentUuid: 'u2-dead', type: 'assistant', timestamp: '2026-01-15T10:00:15Z',
          message: { role: 'assistant', content: 'Dead branch answer' },
        },
        // Active branch (rewind)
        {
          uuid: 'u2-active', parentUuid: 'a1', type: 'user', timestamp: '2026-01-15T10:00:20Z',
          message: { role: 'user', content: 'Active branch question' },
        },
        {
          uuid: 'a2-active', parentUuid: 'u2-active', type: 'assistant', timestamp: '2026-01-15T10:00:25Z',
          message: { role: 'assistant', content: 'Active branch answer' },
        },
      ];

      const sorted = sortMessagesByParentUuid(raw);
      const result = transformToHistoryMessages(sorted);

      expect(result).toHaveLength(4);
      expect(result.map((m) => m.content)).toEqual([
        'Hello', 'Hi there!', 'Active branch question', 'Active branch answer',
      ]);
      // Dead branch content should NOT appear
      expect(result.find((m) => m.content === 'Dead branch question')).toBeUndefined();
      expect(result.find((m) => m.content === 'Dead branch answer')).toBeUndefined();
    });

    it('tool_use/tool_result merging works correctly after branch filtering', () => {
      const raw: RawJSONLMessage[] = [
        {
          uuid: 'u1', type: 'user', timestamp: '2026-01-15T10:00:00Z',
          message: { role: 'user', content: 'Read a file' },
        },
        {
          uuid: 'a1', parentUuid: 'u1', type: 'assistant', timestamp: '2026-01-15T10:00:05Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use' as const, id: 'tool-dead', name: 'Read', input: { file_path: '/dead.ts' } },
            ],
          },
        },
        // tool_result for dead branch tool_use
        {
          uuid: 'tr-dead', parentUuid: 'a1', type: 'user', timestamp: '2026-01-15T10:00:10Z',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result' as const, tool_use_id: 'tool-dead', content: 'dead file content' },
            ],
          },
        },
        // Dead branch continues
        {
          uuid: 'a2-dead', parentUuid: 'tr-dead', type: 'assistant', timestamp: '2026-01-15T10:00:15Z',
          message: { role: 'assistant', content: 'Dead response' },
        },
        // Active branch (rewind from a1)
        {
          uuid: 'u2-active', parentUuid: 'a1', type: 'user', timestamp: '2026-01-15T10:00:20Z',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result' as const, tool_use_id: 'tool-dead', content: 'active tool result' },
            ],
          },
        },
        {
          uuid: 'a3-active', parentUuid: 'u2-active', type: 'assistant', timestamp: '2026-01-15T10:00:25Z',
          message: { role: 'assistant', content: 'Active response' },
        },
      ];

      const sorted = sortMessagesByParentUuid(raw);
      const result = transformToHistoryMessages(sorted);

      // Active branch: u1 → a1 → u2-active → a3-active
      // tool_use (tool-dead) from a1 should get merged with tool_result from u2-active
      const toolMsg = result.find((m) => m.type === 'tool_use');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.toolName).toBe('Read');
      expect(toolMsg!.toolResult?.output).toBe('active tool result');

      // Dead branch content should not appear
      expect(result.find((m) => m.content === 'Dead response')).toBeUndefined();
      expect(result.find((m) => m.content === 'dead file content')).toBeUndefined();
    });
  });

  describe('task notification parsing', () => {
    it('should convert task-notification user message (string content) to task_notification type', () => {
      const raw: RawJSONLMessage[] = [
        {
          uuid: 'task-notif-1',
          type: 'user',
          timestamp: '2026-03-10T10:00:00Z',
          message: {
            role: 'user',
            content: '<task-notification>\n<task-id>abc123</task-id>\n<status>completed</status>\n<summary>Background command "npm test" completed (exit code 0)</summary>\n</task-notification>\nRead the output file to retrieve the result: /tmp/abc123.output',
          },
        },
      ];

      const result = transformToHistoryMessages(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('task_notification');
      expect(result[0].taskStatus).toBe('completed');
      expect(result[0].taskSummary).toBe('Background command "npm test" completed (exit code 0)');
    });

    it('should convert task-notification user message (array content) to task_notification type', () => {
      const raw: RawJSONLMessage[] = [
        {
          uuid: 'task-notif-2',
          type: 'user',
          timestamp: '2026-03-10T10:00:00Z',
          message: {
            role: 'user',
            content: [
              {
                type: 'text' as const,
                text: '<task-notification>\n<task-id>def456</task-id>\n<status>failed</status>\n<summary>Agent "run tests" failed</summary>\n</task-notification>',
              },
            ],
          },
        },
      ];

      const result = transformToHistoryMessages(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('task_notification');
      expect(result[0].taskStatus).toBe('failed');
      expect(result[0].taskSummary).toBe('Agent "run tests" failed');
    });

    it('should not convert regular user message containing task-notification text mid-content', () => {
      const raw: RawJSONLMessage[] = [
        {
          uuid: 'not-notif',
          type: 'user',
          timestamp: '2026-03-10T10:00:00Z',
          message: {
            role: 'user',
            content: 'Please fix the <task-notification> rendering issue',
          },
        },
      ];

      const result = transformToHistoryMessages(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('user');
    });

    it('should convert queue-operation task-notification to task_notification type', () => {
      const raw: RawJSONLMessage[] = [
        {
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-03-10T10:00:00Z',
          content: '<task-notification>\n<task-id>b81fb64</task-id>\n<tool-use-id>toolu_01J8XtUkjm59mdWQun3p5ojo</tool-use-id>\n<output-file>/tmp/tasks/b81fb64.output</output-file>\n<status>completed</status>\n<summary>Background command "npm test" completed (exit code 0)</summary>\n</task-notification>\nRead the output file to retrieve the result: /tmp/tasks/b81fb64.output',
        } as unknown as RawJSONLMessage,
      ];

      const result = transformToHistoryMessages(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('task_notification');
      expect(result[0].taskStatus).toBe('completed');
      expect(result[0].taskSummary).toBe('Background command "npm test" completed (exit code 0)');
      expect(result[0].taskToolUseId).toBe('toolu_01J8XtUkjm59mdWQun3p5ojo');
    });

    it('should handle stopped status', () => {
      const raw: RawJSONLMessage[] = [
        {
          uuid: 'task-stopped',
          type: 'user',
          timestamp: '2026-03-10T10:00:00Z',
          message: {
            role: 'user',
            content: '<task-notification>\n<task-id>ghi789</task-id>\n<status>stopped</status>\n<summary>Task was stopped by user</summary>\n</task-notification>',
          },
        },
      ];

      const result = transformToHistoryMessages(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('task_notification');
      expect(result[0].taskStatus).toBe('stopped');
    });
  });
});
