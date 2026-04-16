/**
 * Commands Routes Unit Tests
 * [Source: Story 5.1 - Task 1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { SlashCommand } from '@hammoc/shared';

const { mockGetCommandsWithStarCommands } = vi.hoisted(() => ({
  mockGetCommandsWithStarCommands: vi.fn(),
}));

vi.mock('../../services/commandService', () => ({
  commandService: {
    getCommandsWithStarCommands: mockGetCommandsWithStarCommands,
  },
}));

import commandsRoutes from '../commands';

describe('Commands Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/projects', commandsRoutes);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/projects/:projectSlug/commands', () => {
    it('should return 200 with commands and starCommands', async () => {
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
      mockGetCommandsWithStarCommands.mockResolvedValue({
        commands: mockCommands,
        starCommands: { sm: [{ agentId: 'sm', command: 'help', description: 'Show help' }] },
      });

      const response = await request(app).get('/api/projects/test-slug/commands');

      expect(response.status).toBe(200);
      expect(response.body.commands).toHaveLength(2);
      expect(response.body.starCommands).toBeDefined();
      expect(mockGetCommandsWithStarCommands).toHaveBeenCalledWith('test-slug');
    });

    it('should return empty commands for non-bmad project', async () => {
      mockGetCommandsWithStarCommands.mockResolvedValue({
        commands: [],
        starCommands: {},
      });

      const response = await request(app).get('/api/projects/unknown-slug/commands');

      expect(response.status).toBe(200);
      expect(response.body.commands).toEqual([]);
      expect(response.body.starCommands).toEqual({});
    });

    it('should return 500 on service error', async () => {
      mockGetCommandsWithStarCommands.mockRejectedValue(new Error('Service error'));

      const response = await request(app).get('/api/projects/test-slug/commands');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('COMMAND_LIST_ERROR');
    });
  });
});
