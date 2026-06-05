/**
 * Preferences Routes Tests
 * Story 33.1: GET /api/preferences surfaces the engine-mode billing gate as
 * server-only metadata (_engineModeToggleEnabled) alongside _overrides.
 *
 * The router imports chatService (which pulls in the SDK) at module load, so the
 * dependency modules are mocked to isolate the route handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: {
    getEffectivePreferences: vi.fn(),
    getEngineModeToggleEnabled: vi.fn(),
  },
}));
vi.mock('../../services/notificationService.js', () => ({ notificationService: { reload: vi.fn() } }));
vi.mock('../../services/webPushService.js', () => ({ webPushService: {} }));
vi.mock('../../middleware/i18n.js', () => ({ invalidateI18nCache: vi.fn() }));
vi.mock('../../services/chatService.js', () => ({ DEFAULT_WORKSPACE_TEMPLATE: 'tmpl', TEMPLATE_VARIABLES: [] }));

import preferencesRoutes from '../preferences.js';
import { preferencesService } from '../../services/preferencesService.js';

describe('Preferences Routes — GET / engine-mode gate metadata (Story 33.1)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CHAT_TIMEOUT_MS;
    app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/preferences', preferencesRoutes);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes _engineModeToggleEnabled=true when the billing gate is ON', async () => {
    vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ theme: 'dark' });
    vi.mocked(preferencesService.getEngineModeToggleEnabled).mockReturnValue(true);

    const response = await request(app).get('/api/preferences');

    expect(response.status).toBe(200);
    expect(response.body._engineModeToggleEnabled).toBe(true);
    expect(response.body.theme).toBe('dark');
    expect(Array.isArray(response.body._overrides)).toBe(true);
  });

  it('includes _engineModeToggleEnabled=false when the billing gate is OFF', async () => {
    vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ theme: 'dark' });
    vi.mocked(preferencesService.getEngineModeToggleEnabled).mockReturnValue(false);

    const response = await request(app).get('/api/preferences');

    expect(response.status).toBe(200);
    expect(response.body._engineModeToggleEnabled).toBe(false);
  });
});
