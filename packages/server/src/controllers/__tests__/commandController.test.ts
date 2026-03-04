/**
 * Command Controller Tests
 * [Source: Story 5.1 - Task 1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import type { SlashCommand } from '@bmad-studio/shared';

const { mockGetCommandsWithStarCommands } = vi.hoisted(() => ({
  mockGetCommandsWithStarCommands: vi.fn(),
}));

vi.mock('../../services/commandService', () => ({
  commandService: {
    getCommandsWithStarCommands: mockGetCommandsWithStarCommands,
  },
}));

import { commandController } from '../commandController';

describe('commandController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: { projectSlug: 'test-slug' },
      t: vi.fn((key: string) => key),
      language: 'en',
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
    it('should return 200 with commands and starCommands on success', async () => {
      const mockCommands: SlashCommand[] = [
        {
          command: '/BMad:agents:pm',
          name: 'PM',
          description: 'Product Manager',
          category: 'agent',
          icon: '\uD83D\uDCCB',
        },
      ];
      const mockStarCommands = {
        sm: [
          { agentId: 'sm', command: 'help', description: 'Show help' },
        ],
      };
      mockGetCommandsWithStarCommands.mockResolvedValue({
        commands: mockCommands,
        starCommands: mockStarCommands,
      });

      await commandController.list(mockReq as Request, mockRes as Response);

      expect(mockGetCommandsWithStarCommands).toHaveBeenCalledWith('test-slug');
      expect(mockRes.json).toHaveBeenCalledWith({
        commands: mockCommands,
        starCommands: mockStarCommands,
      });
    });

    it('should return 500 on service error', async () => {
      mockGetCommandsWithStarCommands.mockRejectedValue(new Error('Service error'));

      await commandController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'COMMAND_LIST_ERROR',
          message: 'command.error.listFailed',
        },
      });
    });
  });
});
