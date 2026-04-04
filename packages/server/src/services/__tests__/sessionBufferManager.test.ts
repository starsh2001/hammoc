import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionBufferManager } from '../sessionBufferManager.js';
import type { HistoryMessage } from '@hammoc/shared';

// Mock dependencies
vi.mock('../historyParser.js', () => ({
  parseJSONLFile: vi.fn(),
  transformToHistoryMessages: vi.fn(),
}));
vi.mock('../sessionService.js', () => ({
  sessionService: {
    getSessionFilePath: vi.fn(),
  },
}));
vi.mock('../../utils/messageTree.js', () => ({
  buildRawMessageTree: vi.fn(),
  getActiveRawBranch: vi.fn(),
  getDefaultRawBranchSelections: vi.fn(),
}));

import { parseJSONLFile, transformToHistoryMessages } from '../historyParser.js';
import { sessionService } from '../sessionService.js';
import { buildRawMessageTree, getActiveRawBranch, getDefaultRawBranchSelections } from '../../utils/messageTree.js';

const mockParseJSONLFile = vi.mocked(parseJSONLFile);
const mockTransformToHistoryMessages = vi.mocked(transformToHistoryMessages);
const mockGetSessionFilePath = vi.mocked(sessionService.getSessionFilePath);
const mockBuildRawMessageTree = vi.mocked(buildRawMessageTree);
const mockGetActiveRawBranch = vi.mocked(getActiveRawBranch);
const mockGetDefaultRawBranchSelections = vi.mocked(getDefaultRawBranchSelections);

function makeMsg(id: string, type: 'user' | 'assistant' = 'assistant'): HistoryMessage {
  return { id, type, content: `msg-${id}`, timestamp: new Date().toISOString() };
}

describe('SessionBufferManager', () => {
  let manager: SessionBufferManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionBufferManager();
  });

  describe('create()', () => {
    it('should create a new buffer', () => {
      const buffer = manager.create('s1');
      expect(buffer).toEqual({ sessionId: 's1', messages: [], streaming: false });
      expect(manager.size).toBe(1);
    });

    it('should reuse existing buffer', () => {
      const b1 = manager.create('s1');
      b1.messages.push(makeMsg('1'));
      const b2 = manager.create('s1');
      expect(b2).toBe(b1);
      expect(b2.messages).toHaveLength(1);
    });
  });

  describe('get()', () => {
    it('should return undefined for nonexistent session', () => {
      expect(manager.get('nonexistent')).toBeUndefined();
    });

    it('should return existing buffer', () => {
      manager.create('s1');
      expect(manager.get('s1')).toBeDefined();
      expect(manager.get('s1')!.sessionId).toBe('s1');
    });
  });

  describe('setMessages()', () => {
    it('should set messages on existing buffer', () => {
      manager.create('s1');
      const msgs = [makeMsg('1'), makeMsg('2')];
      manager.setMessages('s1', msgs);
      expect(manager.get('s1')!.messages).toEqual(msgs);
    });

    it('should no-op for nonexistent session', () => {
      manager.setMessages('nonexistent', [makeMsg('1')]);
      expect(manager.get('nonexistent')).toBeUndefined();
    });
  });

  describe('addMessage()', () => {
    it('should append message to existing buffer', () => {
      manager.create('s1');
      manager.addMessage('s1', makeMsg('1'));
      manager.addMessage('s1', makeMsg('2'));
      expect(manager.get('s1')!.messages).toHaveLength(2);
    });

    it('should no-op for nonexistent session', () => {
      manager.addMessage('nonexistent', makeMsg('1'));
      expect(manager.size).toBe(0);
    });
  });

  describe('setStreaming()', () => {
    it('should update streaming state', () => {
      manager.create('s1');
      expect(manager.get('s1')!.streaming).toBe(false);
      manager.setStreaming('s1', true);
      expect(manager.get('s1')!.streaming).toBe(true);
      manager.setStreaming('s1', false);
      expect(manager.get('s1')!.streaming).toBe(false);
    });
  });

  describe('rekey()', () => {
    it('should re-key buffer from old to new id', () => {
      manager.create('old-id');
      manager.setMessages('old-id', [makeMsg('1')]);
      manager.rekey('old-id', 'new-id');
      expect(manager.get('old-id')).toBeUndefined();
      expect(manager.get('new-id')).toBeDefined();
      expect(manager.get('new-id')!.sessionId).toBe('new-id');
      expect(manager.get('new-id')!.messages).toHaveLength(1);
    });

    it('should no-op for nonexistent old id', () => {
      manager.rekey('nonexistent', 'new-id');
      expect(manager.size).toBe(0);
    });
  });

  describe('destroy()', () => {
    it('should remove buffer', () => {
      manager.create('s1');
      expect(manager.size).toBe(1);
      manager.destroy('s1');
      expect(manager.size).toBe(0);
      expect(manager.get('s1')).toBeUndefined();
    });

    it('should no-op for nonexistent session', () => {
      manager.destroy('nonexistent');
      expect(manager.size).toBe(0);
    });
  });

  describe('reloadFromJSONL()', () => {
    it('should parse JSONL and set messages', async () => {
      manager.create('s1');
      const rawMessages = [{ uuid: '1', type: 'user' }];
      const historyMessages = [makeMsg('1', 'user'), makeMsg('2')];

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue(rawMessages as any);
      mockBuildRawMessageTree.mockReturnValue({ roots: [{ message: rawMessages[0], children: [] }], nodeMap: new Map() } as any);
      mockGetDefaultRawBranchSelections.mockReturnValue({});
      mockGetActiveRawBranch.mockReturnValue({ messages: rawMessages, branchPoints: {} } as any);
      mockTransformToHistoryMessages.mockReturnValue(historyMessages);

      const result = await manager.reloadFromJSONL('s1', 'test-project');

      expect(mockGetSessionFilePath).toHaveBeenCalledWith('test-project', 's1');
      expect(result).toEqual(historyMessages);
      expect(manager.get('s1')!.messages).toEqual(historyMessages);
    });

    it('should return empty array for empty JSONL', async () => {
      manager.create('s1');
      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue([]);

      const result = await manager.reloadFromJSONL('s1', 'test-project');

      expect(result).toEqual([]);
      expect(manager.get('s1')!.messages).toEqual([]);
    });

    it('should merge custom branchSelections with defaults', async () => {
      manager.create('s1');
      const rawMessages = [{ uuid: '1', type: 'user' }];
      const historyMessages = [makeMsg('1', 'user')];

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue(rawMessages as any);
      mockBuildRawMessageTree.mockReturnValue({ roots: [{ message: rawMessages[0], children: [] }], nodeMap: new Map() } as any);
      mockGetDefaultRawBranchSelections.mockReturnValue({ key1: 0, key2: 1 });
      mockGetActiveRawBranch.mockReturnValue({ messages: rawMessages, branchPoints: {} } as any);
      mockTransformToHistoryMessages.mockReturnValue(historyMessages);

      await manager.reloadFromJSONL('s1', 'test-project', { key1: 2 });

      // Should merge: defaults { key1: 0, key2: 1 } + override { key1: 2 } = { key1: 2, key2: 1 }
      expect(mockGetActiveRawBranch).toHaveBeenCalledWith(
        expect.anything(),
        { key1: 2, key2: 1 },
      );
    });

    it('should NOT update buffer messages when custom branchSelections is provided', async () => {
      manager.create('s1');
      const originalMessages = [makeMsg('original')];
      manager.setMessages('s1', originalMessages);

      const rawMessages = [{ uuid: '1', type: 'user' }];
      const viewerMessages = [makeMsg('viewer')];

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue(rawMessages as any);
      mockBuildRawMessageTree.mockReturnValue({ roots: [{ message: rawMessages[0], children: [] }], nodeMap: new Map() } as any);
      mockGetDefaultRawBranchSelections.mockReturnValue({});
      mockGetActiveRawBranch.mockReturnValue({ messages: rawMessages, branchPoints: {} } as any);
      mockTransformToHistoryMessages.mockReturnValue(viewerMessages);

      const result = await manager.reloadFromJSONL('s1', 'test-project', {});

      // Should return viewer messages but NOT update the buffer
      expect(result).toEqual(viewerMessages);
      expect(manager.get('s1')!.messages).toEqual(originalMessages);
    });

    it('should update buffer messages when no branchSelections is provided', async () => {
      manager.create('s1');
      manager.setMessages('s1', [makeMsg('old')]);

      const rawMessages = [{ uuid: '1', type: 'user' }];
      const newMessages = [makeMsg('new')];

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue(rawMessages as any);
      mockBuildRawMessageTree.mockReturnValue({ roots: [{ message: rawMessages[0], children: [] }], nodeMap: new Map() } as any);
      mockGetDefaultRawBranchSelections.mockReturnValue({});
      mockGetActiveRawBranch.mockReturnValue({ messages: rawMessages, branchPoints: {} } as any);
      mockTransformToHistoryMessages.mockReturnValue(newMessages);

      await manager.reloadFromJSONL('s1', 'test-project');

      expect(manager.get('s1')!.messages).toEqual(newMessages);
    });

    it('should attach branchInfo to messages matching branchPoints', async () => {
      manager.create('s1');
      const rawMessages = [{ uuid: 'u1', type: 'user' }, { uuid: 'u2', type: 'user' }];
      const msg1 = makeMsg('u1', 'user');
      const msg2 = makeMsg('a1');
      const msg3 = makeMsg('u2', 'user');
      const historyMessages = [msg1, msg2, msg3];

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue(rawMessages as any);
      mockBuildRawMessageTree.mockReturnValue({ roots: [], nodeMap: new Map() } as any);
      mockGetDefaultRawBranchSelections.mockReturnValue({});
      mockGetActiveRawBranch.mockReturnValue({
        messages: rawMessages,
        branchPoints: {
          u1: { total: 3, current: 1, selectionKey: 'u1' },
          u2: { total: 2, current: 0, selectionKey: 'parent-uuid' },
        },
      } as any);
      mockTransformToHistoryMessages.mockReturnValue(historyMessages);

      const result = await manager.reloadFromJSONL('s1', 'test-project');

      expect(result[0].branchInfo).toEqual({ total: 3, current: 1, selectionKey: 'u1' });
      expect(result[1].branchInfo).toBeUndefined();
      expect(result[2].branchInfo).toEqual({ total: 2, current: 0, selectionKey: 'parent-uuid' });
    });

    it('should attach ROOT_BRANCH_KEY branchInfo to the first message', async () => {
      manager.create('s1');
      const rawMessages = [{ uuid: 'r1', type: 'user' }];
      const msg1 = makeMsg('r1', 'user');
      const msg2 = makeMsg('a1');
      const historyMessages = [msg1, msg2];

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue(rawMessages as any);
      mockBuildRawMessageTree.mockReturnValue({ roots: [], nodeMap: new Map() } as any);
      mockGetDefaultRawBranchSelections.mockReturnValue({});
      mockGetActiveRawBranch.mockReturnValue({
        messages: rawMessages,
        branchPoints: {
          __root__: { total: 2, current: 1, selectionKey: '__root__' },
        },
      } as any);
      mockTransformToHistoryMessages.mockReturnValue(historyMessages);

      const result = await manager.reloadFromJSONL('s1', 'test-project');

      expect(result[0].branchInfo).toEqual({ total: 2, current: 1, selectionKey: '__root__' });
      expect(result[1].branchInfo).toBeUndefined();
    });

    it('should not setMessages for empty JSONL when branchSelections is provided', async () => {
      manager.create('s1');
      const originalMessages = [makeMsg('keep')];
      manager.setMessages('s1', originalMessages);

      mockGetSessionFilePath.mockReturnValue('/path/to/s1.jsonl');
      mockParseJSONLFile.mockResolvedValue([]);

      const result = await manager.reloadFromJSONL('s1', 'test-project', {});

      expect(result).toEqual([]);
      // Buffer should remain unchanged
      expect(manager.get('s1')!.messages).toEqual(originalMessages);
    });
  });

  describe('multiple sessions independence', () => {
    it('should manage sessions independently', () => {
      manager.create('s1');
      manager.create('s2');
      manager.setMessages('s1', [makeMsg('a')]);
      manager.setMessages('s2', [makeMsg('b'), makeMsg('c')]);
      manager.setStreaming('s1', true);

      expect(manager.get('s1')!.messages).toHaveLength(1);
      expect(manager.get('s2')!.messages).toHaveLength(2);
      expect(manager.get('s1')!.streaming).toBe(true);
      expect(manager.get('s2')!.streaming).toBe(false);
    });
  });

  describe('server restart (fresh manager)', () => {
    it('should start empty', () => {
      const fresh = new SessionBufferManager();
      expect(fresh.size).toBe(0);
      expect(fresh.get('any')).toBeUndefined();
    });
  });
});
