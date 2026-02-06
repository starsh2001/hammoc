/**
 * Command Controller Tests
 * [Source: Story 5.1 - Task 1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import type { SlashCommand } from '@bmad-studio/shared';

const { mockGetCommands } = vi.hoisted(() => ({
  mockGetCommands: vi.fn(),
}));

vi.mock('../../services/commandService', () => ({
  commandService: {
    getCommands: mockGetCommands,
  },
}));

import { commandController } from '../commandController';

describe('commandController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: { projectSlug: 'test-slug' },
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list', () => {
    it('should return 200 with commands array on success', async () => {
      const mockCommands: SlashCommand[] = [
        {
          command: '/BMad:agents:pm',
          name: 'PM',
          description: 'Product Manager',
          category: 'agent',
          icon: '\uD83D\uDCCB',
        },
      ];
      mockGetCommands.mockResolvedValue(mockCommands);

      await commandController.list(mockReq as Request, mockRes as Response);

      expect(mockGetCommands).toHaveBeenCalledWith('test-slug');
      expect(mockRes.json).toHaveBeenCalledWith({ commands: mockCommands });
    });

    it('should return 500 on service error', async () => {
      mockGetCommands.mockRejectedValue(new Error('Service error'));

      await commandController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'COMMAND_LIST_ERROR',
          message: 'Failed to list commands',
        },
      });
    });
  });
});
