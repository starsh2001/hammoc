/**
 * Dashboard Controller Tests
 * Story 20.1: Server Dashboard Status Aggregation API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockGetStatus } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
}));

vi.mock('../../services/dashboardService', () => ({
  dashboardService: {
    getStatus: mockGetStatus,
  },
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { dashboardController } from '../dashboardController';

describe('dashboardController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      t: vi.fn((key: string) => key),
      language: 'en',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    vi.clearAllMocks();
  });

  it('returns 200 with DashboardStatusResponse on success', async () => {
    const mockResponse = {
      projects: [
        {
          projectSlug: 'test-project',
          activeSessionCount: 1,
          totalSessionCount: 5,
          queueStatus: 'idle',
          terminalCount: 2,
        },
      ],
    };
    mockGetStatus.mockResolvedValue(mockResponse);

    await dashboardController.getStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith(mockResponse);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('returns 500 with DASHBOARD_ERROR on failure', async () => {
    mockGetStatus.mockRejectedValue(new Error('Something went wrong'));

    await dashboardController.getStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { code: 'DASHBOARD_ERROR', message: 'dashboard.error.statusFailed' },
    });
  });
});
