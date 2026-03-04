/**
 * QueueController Tests
 * Story 15.2: Queue Runner Engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock QueueService
const mockStart = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockAbort = vi.fn();
const mockGetState = vi.fn();
let mockIsRunning = false;

vi.mock('../../services/queueService.js', () => ({
  QueueService: vi.fn().mockImplementation(() => ({
    start: mockStart,
    pause: mockPause,
    resume: mockResume,
    abort: mockAbort,
    getState: mockGetState,
    get isRunning() { return mockIsRunning; },
  })),
}));

vi.mock('../../services/projectService.js', () => ({
  projectService: {},
}));

vi.mock('../../services/notificationService.js', () => ({
  notificationService: {},
}));

vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: {},
}));

vi.mock('../../handlers/websocket.js', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  }),
}));

import { startQueue, pauseQueue, resumeQueue, abortQueue, getQueueStatus } from '../queueController.js';

function createMockReq(params: Record<string, string> = {}, body: Record<string, unknown> = {}): Request {
  return { params, body, t: (key: string) => key, language: 'en' } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('QueueController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRunning = false;
    mockStart.mockResolvedValue(undefined);
    mockPause.mockResolvedValue(undefined);
    mockResume.mockResolvedValue(undefined);
    mockAbort.mockResolvedValue(undefined);
    mockGetState.mockReturnValue({
      isRunning: false,
      isPaused: false,
      currentIndex: 0,
      totalItems: 0,
      lockedSessionId: null,
    });
  });

  describe('startQueue', () => {
    it('should return 400 when items array is empty', async () => {
      const req = createMockReq({ projectSlug: 'test' }, { items: [] });
      const res = createMockRes();

      await startQueue(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when projectSlug is missing', async () => {
      const req = createMockReq({}, { items: [{ prompt: 'hi', isNewSession: false }] });
      const res = createMockRes();

      await startQueue(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 on valid request', async () => {
      const req = createMockReq(
        { projectSlug: 'test' },
        { items: [{ prompt: 'hello', isNewSession: false }] }
      );
      const res = createMockRes();

      await startQueue(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'started',
        totalItems: 1,
      }));
    });

    it('should return 409 when queue is already running', async () => {
      mockIsRunning = true;

      const req = createMockReq(
        { projectSlug: 'test' },
        { items: [{ prompt: 'hello', isNewSession: false }] }
      );
      const res = createMockRes();

      await startQueue(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('pauseQueue', () => {
    it('should return 404 when no running queue', async () => {
      const req = createMockReq({ projectSlug: 'test' });
      const res = createMockRes();

      await pauseQueue(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getQueueStatus', () => {
    it('should return default state when no queue exists', async () => {
      const req = createMockReq({ projectSlug: 'nonexistent' });
      const res = createMockRes();

      await getQueueStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        isRunning: false,
      }));
    });
  });
});
