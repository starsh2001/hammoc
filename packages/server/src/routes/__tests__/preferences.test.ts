/**
 * Preferences Routes Tests
 * GET /api/preferences surfaces server-only metadata (_overrides). The engine-mode
 * billing gate was removed, so the response no longer carries _engineModeToggleEnabled.
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
  },
}));
vi.mock('../../services/notificationService.js', () => ({ notificationService: { reload: vi.fn() } }));
vi.mock('../../services/webPushService.js', () => ({ webPushService: {} }));
vi.mock('../../middleware/i18n.js', () => ({ invalidateI18nCache: vi.fn() }));
vi.mock('../../services/chatService.js', () => ({ DEFAULT_WORKSPACE_TEMPLATE: 'tmpl', TEMPLATE_VARIABLES: [] }));

import preferencesRoutes from '../preferences.js';
import { preferencesService } from '../../services/preferencesService.js';

describe('Preferences Routes — GET / metadata', () => {
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

  it('returns preferences with an _overrides array', async () => {
    vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ theme: 'dark' });

    const response = await request(app).get('/api/preferences');

    expect(response.status).toBe(200);
    expect(response.body.theme).toBe('dark');
    expect(Array.isArray(response.body._overrides)).toBe(true);
  });

  it('does not surface the removed engine-mode gate flag', async () => {
    vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ theme: 'dark' });

    const response = await request(app).get('/api/preferences');

    expect(response.status).toBe(200);
    expect(response.body._engineModeToggleEnabled).toBeUndefined();
  });

  it('flags CHAT_TIMEOUT_MS in _overrides when set via env', async () => {
    process.env.CHAT_TIMEOUT_MS = '60000';
    vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ theme: 'dark' });

    const response = await request(app).get('/api/preferences');

    expect(response.status).toBe(200);
    expect(response.body._overrides).toContain('chatTimeoutMs');
  });
});
