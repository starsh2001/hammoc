/**
 * Commands Routes Unit Tests
 * [Source: Story 5.1 - Task 1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { SlashCommand } from '@bmad-studio/shared';

const { mockGetCommands } = vi.hoisted(() => ({
  mockGetCommands: vi.fn(),
}));

vi.mock('../../services/commandService', () => ({
  commandService: {
    getCommands: mockGetCommands,
  },
}));

import commandsRoutes from '../commands';

describe('Commands Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects', commandsRoutes);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/projects/:projectSlug/commands', () => {
    it('should return 200 with commands array', async () => {
      const mockCommands: SlashCommand[] = [
        {
          command: '/BMad:agents:pm',
          name: 'PM',
          description: 'Product Manager',
          category: 'agent',
          icon: '\uD83D\uDCCB',
        },
        {
          command: '/BMad:tasks:create-doc',
          name: 'create-doc',
          description: 'create-doc task',
          category: 'task',
        },
      ];
      mockGetCommands.mockResolvedValue(mockCommands);

      const response = await request(app).get('/api/projects/test-slug/commands');

      expect(response.status).toBe(200);
      expect(response.body.commands).toHaveLength(2);
      expect(mockGetCommands).toHaveBeenCalledWith('test-slug');
    });

    it('should return empty commands for non-bmad project', async () => {
      mockGetCommands.mockResolvedValue([]);

      const response = await request(app).get('/api/projects/unknown-slug/commands');

      expect(response.status).toBe(200);
      expect(response.body.commands).toEqual([]);
    });

    it('should return 500 on service error', async () => {
      mockGetCommands.mockRejectedValue(new Error('Service error'));

      const response = await request(app).get('/api/projects/test-slug/commands');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('COMMAND_LIST_ERROR');
    });
  });
});
