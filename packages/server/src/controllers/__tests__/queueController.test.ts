/**
 * QueueController Tests
 * Story 15.2: Queue Runner Engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock QueueService
const mockGetState = vi.fn();

vi.mock('../../services/queueService.js', () => ({
  QueueService: vi.fn().mockImplementation(() => ({
    getState: mockGetState,
    get isRunning() { return false; },
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

import { getQueueStatus } from '../queueController.js';

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
    mockGetState.mockReturnValue({
      isRunning: false,
      isPaused: false,
      currentIndex: 0,
      totalItems: 0,
      lockedSessionId: null,
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

    it('should return 400 when projectSlug is missing', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await getQueueStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
