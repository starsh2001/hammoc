/**
 * Session Controller Branch Pagination Tests
 * Story 25.4: Branch-aware Message Pagination — Task 8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Create hoisted mocks
const {
  mockIsValidPathParam,
  mockGetSessionMessages,
  mockGetStreamStartedAt,
  mockGetRunningStreamStartedAt,
  mockGetCompletedBuffer,
  mockTransformBufferToHistoryMessages,
  mockReadSessionNamesBySlug,
  mockGetActiveStreamSessionIds,
} = vi.hoisted(() => ({
  mockIsValidPathParam: vi.fn(() => true),
  mockGetSessionMessages: vi.fn(),
  mockGetStreamStartedAt: vi.fn(),
  mockGetRunningStreamStartedAt: vi.fn(),
  mockGetCompletedBuffer: vi.fn(),
  mockTransformBufferToHistoryMessages: vi.fn(),
  mockReadSessionNamesBySlug: vi.fn(),
  mockGetActiveStreamSessionIds: vi.fn(),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    isValidPathParam: mockIsValidPathParam,
    getSessionMessages: mockGetSessionMessages,
  },
}));

// Mock projectService
vi.mock('../../services/projectService', () => ({
  projectService: {
    readSessionNamesBySlug: mockReadSessionNamesBySlug,
  },
}));

// Mock websocket handler
vi.mock('../../handlers/websocket', () => ({
  getActiveStreamSessionIds: mockGetActiveStreamSessionIds,
  getStreamStartedAt: mockGetStreamStartedAt,
  getRunningStreamStartedAt: mockGetRunningStreamStartedAt,
  getCompletedBuffer: mockGetCompletedBuffer,
}));

// Mock historyParser
vi.mock('../../services/historyParser', () => ({
  transformBufferToHistoryMessages: mockTransformBufferToHistoryMessages,
}));

import { sessionController } from '../sessionController';

describe('sessionController.getMessages — branch pagination', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  const baseServiceResult = {
    messages: [
      { id: 'msg-1', type: 'user', content: 'hello', timestamp: '2024-01-01T00:00:00Z' },
      { id: 'msg-2', type: 'assistant', content: 'hi', timestamp: '2024-01-01T00:01:00Z' },
    ],
    pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
    lastAgentCommand: null,
    branchPoints: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      params: { projectSlug: 'test-project', sessionId: 'session-1' },
      query: {},
      t: vi.fn((key: string) => key),
      language: 'en',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockGetStreamStartedAt.mockReturnValue(null);
    mockGetRunningStreamStartedAt.mockReturnValue(null);
    mockGetCompletedBuffer.mockReturnValue(null);
    mockGetSessionMessages.mockResolvedValue(baseServiceResult);
  });

  // --- Basic branch pagination ---

  it('should work without branchSelections (backward compatible)', async () => {
    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-1', {
      limit: 50,
      offset: 0,
      streamStartedAt: null,
      runningStreamStartedAt: null,
      branchSelections: undefined,
    });
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      messages: baseServiceResult.messages,
    }));
  });

  it('should parse and pass branchSelections query parameter', async () => {
    mockReq.query = { branchSelections: JSON.stringify({ 'msg-2': 1, '__root__': 0 }) };

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-1', expect.objectContaining({
      branchSelections: { 'msg-2': 1, '__root__': 0 },
    }));
  });

  it('should ignore invalid branchSelections JSON (fallback to default)', async () => {
    mockReq.query = { branchSelections: 'not-valid-json' };

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-1', expect.objectContaining({
      branchSelections: undefined,
    }));
    // Should not error
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should include branchPoints in response', async () => {
    const resultWithBranches = {
      ...baseServiceResult,
      branchPoints: { 'msg-1': { total: 3, current: 1 } },
    };
    mockGetSessionMessages.mockResolvedValue(resultWithBranches);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      branchPoints: { 'msg-1': { total: 3, current: 1 } },
    }));
  });

  it('should handle linear conversation (empty branchPoints)', async () => {
    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    const response = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.branchPoints).toEqual({});
  });

  // --- Pagination with offset ---

  it('should pass offset for load-more on active branch', async () => {
    mockReq.query = { offset: '50', limit: '50' };

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-1', expect.objectContaining({
      limit: 50,
      offset: 50,
    }));
  });

  // --- CompletedBuffer merge ---

  it('should merge completedBuffer on default branch (no branchSelections)', async () => {
    const bufferMessages = [
      { id: 'buf-1', type: 'assistant', content: 'buffered', timestamp: '2024-01-01T00:02:00Z' },
    ];
    mockGetCompletedBuffer.mockReturnValue(['some-buffer-events']);
    mockTransformBufferToHistoryMessages.mockReturnValue(bufferMessages);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockTransformBufferToHistoryMessages).toHaveBeenCalled();
    const response = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Should include buffer message
    expect(response.messages.some((m: { id: string }) => m.id === 'buf-1')).toBe(true);
  });

  it('should skip completedBuffer merge on non-default branch', async () => {
    mockReq.query = { branchSelections: JSON.stringify({ 'msg-2': 0 }) };
    mockGetCompletedBuffer.mockReturnValue(['some-buffer-events']);
    mockTransformBufferToHistoryMessages.mockReturnValue([
      { id: 'buf-1', type: 'assistant', content: 'buffered', timestamp: '2024-01-01T00:02:00Z' },
    ]);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    // transformBufferToHistoryMessages should NOT be called
    expect(mockTransformBufferToHistoryMessages).not.toHaveBeenCalled();
  });

  it('should preserve branchPoints after completedBuffer merge', async () => {
    const resultWithBranches = {
      ...baseServiceResult,
      branchPoints: { 'msg-1': { total: 2, current: 1 } },
    };
    mockGetSessionMessages.mockResolvedValue(resultWithBranches);
    mockGetCompletedBuffer.mockReturnValue(['events']);
    mockTransformBufferToHistoryMessages.mockReturnValue([
      { id: 'buf-1', type: 'assistant', content: 'buf', timestamp: '2024-01-01T00:02:00Z' },
    ]);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    const response = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // branchPoints should be preserved (not modified by buffer merge)
    expect(response.branchPoints).toEqual({ 'msg-1': { total: 2, current: 1 } });
  });

  it('should re-paginate after completedBuffer merge (slice -limit)', async () => {
    // Create a scenario where buffer + existing > limit
    const manyMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg-${i}`, type: 'user', content: `m${i}`, timestamp: `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`,
    }));
    mockGetSessionMessages.mockResolvedValue({
      messages: manyMessages,
      pagination: { total: 50, limit: 50, offset: 0, hasMore: false },
      lastAgentCommand: null,
      branchPoints: {},
    });
    mockGetCompletedBuffer.mockReturnValue(['events']);
    mockTransformBufferToHistoryMessages.mockReturnValue([
      { id: 'buf-1', type: 'assistant', content: 'buf', timestamp: '2024-01-01T01:00:00Z' },
    ]);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    const response = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // After merge: 51 messages → sliced to last 50
    expect(response.messages).toHaveLength(50);
    // Last message should be the buffer message (latest timestamp)
    expect(response.messages[response.messages.length - 1].id).toBe('buf-1');
  });

  // --- Streaming + active branch ---

  it('should pass streamStartedAt to service (filters applied on active branch)', async () => {
    mockGetStreamStartedAt.mockReturnValue(1704067260000);
    mockGetRunningStreamStartedAt.mockReturnValue(1704067260000);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-1', expect.objectContaining({
      streamStartedAt: 1704067260000,
      runningStreamStartedAt: 1704067260000,
    }));
  });

  // --- Non-existent session ---

  it('should return empty response for non-existent session', async () => {
    mockGetSessionMessages.mockResolvedValue(null);

    await sessionController.getMessages(mockReq as Request, mockRes as Response);

    const response = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.messages).toEqual([]);
    expect(response.pagination.total).toBe(0);
  });
});
