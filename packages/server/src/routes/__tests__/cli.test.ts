import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cliRoutes from '../cli.js';
import { cliService } from '../../services/cliService.js';
import { DEFAULT_SETUP_COMMANDS } from '@hammoc/shared';

// Mock cliService
vi.mock('../../services/cliService.js', () => ({
  cliService: {
    getStatus: vi.fn(),
  },
}));

describe('CLI Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api', cliRoutes);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/cli-status', () => {
    it('should return CLI status when all checks pass', async () => {
      vi.mocked(cliService.getStatus).mockResolvedValue({
        cliInstalled: true,
        authenticated: true,
        apiKeySet: true,
        setupCommands: { ...DEFAULT_SETUP_COMMANDS },
      });

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        cliInstalled: true,
        authenticated: true,
        apiKeySet: true,
        setupCommands: DEFAULT_SETUP_COMMANDS,
      });
    });

    it('should return status with CLI not installed', async () => {
      vi.mocked(cliService.getStatus).mockResolvedValue({
        cliInstalled: false,
        authenticated: false,
        apiKeySet: false,
        setupCommands: { ...DEFAULT_SETUP_COMMANDS },
      });

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(200);
      expect(response.body.cliInstalled).toBe(false);
      expect(response.body.authenticated).toBe(false);
      expect(response.body.apiKeySet).toBe(false);
      expect(response.body.setupCommands).toEqual(DEFAULT_SETUP_COMMANDS);
    });

    it('should return status with error field when CLI check fails', async () => {
      vi.mocked(cliService.getStatus).mockResolvedValue({
        cliInstalled: false,
        authenticated: false,
        apiKeySet: false,
        setupCommands: { ...DEFAULT_SETUP_COMMANDS },
        error: 'CLI 상태 확인 시간 초과. 잠시 후 다시 시도해주세요.',
      });

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(200);
      expect(response.body.error).toBe(
        'CLI 상태 확인 시간 초과. 잠시 후 다시 시도해주세요.'
      );
    });

    it('should return partial status (CLI installed, not authenticated)', async () => {
      vi.mocked(cliService.getStatus).mockResolvedValue({
        cliInstalled: true,
        authenticated: false,
        apiKeySet: true,
        setupCommands: { ...DEFAULT_SETUP_COMMANDS },
      });

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(200);
      expect(response.body.cliInstalled).toBe(true);
      expect(response.body.authenticated).toBe(false);
      expect(response.body.apiKeySet).toBe(true);
    });

    it('should return 500 when service throws unexpected error', async () => {
      vi.mocked(cliService.getStatus).mockRejectedValue(
        new Error('Unexpected error')
      );

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('CLI_EXECUTION_ERROR');
      expect(response.body.error.message).toBe(
        'cli.error.executionFailed'
      );
    });

    it('should include error details in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      vi.mocked(cliService.getStatus).mockRejectedValue(
        new Error('Detailed error message')
      );

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(500);
      expect(response.body.error.details).toBe('Detailed error message');

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include error details in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      vi.mocked(cliService.getStatus).mockRejectedValue(
        new Error('Detailed error message')
      );

      const response = await request(app).get('/api/cli-status');

      expect(response.status).toBe(500);
      expect(response.body.error.details).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include setupCommands in all responses', async () => {
      vi.mocked(cliService.getStatus).mockResolvedValue({
        cliInstalled: false,
        authenticated: false,
        apiKeySet: false,
        setupCommands: { ...DEFAULT_SETUP_COMMANDS },
      });

      const response = await request(app).get('/api/cli-status');

      expect(response.body.setupCommands).toBeDefined();
      expect(response.body.setupCommands.install).toBeDefined();
      expect(response.body.setupCommands.login).toBeDefined();
      expect(response.body.setupCommands.apiKey).toBeDefined();
    });
  });
});
