/**
 * Preferences Routes Tests
 * GET /api/preferences surfaces server-only metadata (_overrides). The engine-mode
 * billing gate was removed, so the response no longer carries _engineModeToggleEnabled.
 *
 * The router surfaces the default workspace template (now from the lightweight
 * workspaceContext module); peer services are mocked to isolate the route handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: {
    getEffectivePreferences: vi.fn(),
    readPreferences: vi.fn(),
  },
}));
vi.mock('../../services/notificationService.js', () => ({ notificationService: { reload: vi.fn() } }));
vi.mock('../../services/webPushService.js', () => ({ webPushService: {} }));
vi.mock('../../middleware/i18n.js', () => ({ invalidateI18nCache: vi.fn() }));
vi.mock('../../services/workspaceContext.js', () => ({
  SECTION_COMMON: 'common-section',
  SECTION_SDK: 'sdk-section',
  SECTION_CLI: 'cli-section',
  SECTION_BMAD: 'bmad-section',
  TEMPLATE_VARIABLES: [{ name: 'gitBranch', description: 'Current git branch name' }],
}));
vi.mock('../../handlers/websocket.js', () => ({ broadcastPreferencesChange: vi.fn() }));

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

describe('Preferences Routes — GET /system-prompt', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/preferences', preferencesRoutes);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns structured sections with all 4 keys and variables', async () => {
    vi.mocked(preferencesService.readPreferences).mockResolvedValue({});

    const response = await request(app).get('/api/preferences/system-prompt');

    expect(response.status).toBe(200);
    expect(response.body.sections).toBeDefined();
    expect(response.body.sections.common).toBe('common-section');
    expect(response.body.sections.sdk).toBe('sdk-section');
    expect(response.body.sections.cli).toBe('cli-section');
    expect(response.body.sections.bmad).toBe('bmad-section');
    expect(Array.isArray(response.body.variables)).toBe(true);
    expect(response.body.variables[0].name).toBe('gitBranch');
  });

  it('includes userArea from stored preferences', async () => {
    vi.mocked(preferencesService.readPreferences).mockResolvedValue({
      customSystemPrompt: 'my custom instructions',
    });

    const response = await request(app).get('/api/preferences/system-prompt');

    expect(response.status).toBe(200);
    expect(response.body.userArea).toBe('my custom instructions');
  });

  it('returns undefined userArea when no customSystemPrompt is set', async () => {
    vi.mocked(preferencesService.readPreferences).mockResolvedValue({});

    const response = await request(app).get('/api/preferences/system-prompt');

    expect(response.status).toBe(200);
    expect(response.body.userArea).toBeUndefined();
  });
});
