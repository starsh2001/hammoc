/**
 * Story 30.7 (Task B.3): tests for the secret-on-shared router.
 *
 * Three concerns:
 *   1. `getActionLabelKey` returns the correct i18n key per domain.
 *   2. `routeToLocal` dispatches to the right API per domain.
 *   3. The pre-flight share-scope check surfaces `gitignorePatternMissing`
 *      when the would-be local sibling is still classified as `shared`, and
 *      the API failure path surfaces `apiError`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      put: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    },
  };
});

vi.mock('../api/harnessShareScopeApi', () => ({
  fetchShareScope: vi.fn(),
}));

vi.mock('../api/harnessMcpsApi', () => ({
  updateMcp: vi.fn(),
}));

import { api, ApiError } from '../api/client';
import { fetchShareScope } from '../api/harnessShareScopeApi';
import { updateMcp } from '../api/harnessMcpsApi';
import { getActionLabelKey, routeToLocal } from '../secretOnSharedRouter';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the sibling is gitignored (verdict 'local') so routing proceeds.
  vi.mocked(fetchShareScope).mockResolvedValue({
    mode: 'A',
    cards: { '.mcp.local.json': 'local', '.claude/settings.local.json': 'local' },
  });
});

describe('getActionLabelKey', () => {
  it('returns routeToLocalMcp for the mcp domain', () => {
    expect(getActionLabelKey('mcp')).toBe('harness.tools.secretOnShared.action.routeToLocalMcp');
  });
  it('returns routeToLocalHook for the hook domain', () => {
    expect(getActionLabelKey('hook')).toBe('harness.tools.secretOnShared.action.routeToLocalHook');
  });
  it('returns replaceWithEnvRefCommand for the command domain', () => {
    expect(getActionLabelKey('command')).toBe(
      'harness.tools.secretOnShared.action.replaceWithEnvRefCommand',
    );
  });
  it('returns replaceWithEnvRefAgent for the agent domain', () => {
    expect(getActionLabelKey('agent')).toBe(
      'harness.tools.secretOnShared.action.replaceWithEnvRefAgent',
    );
  });
});

describe('routeToLocal', () => {
  it('mcp: pre-checks share-scope, then calls updateMcp with {scope:"local"}', async () => {
    vi.mocked(updateMcp).mockResolvedValue({ success: true, mtime: 't' } as never);
    const result = await routeToLocal({
      domain: 'mcp',
      projectSlug: 'slug',
      card: { name: 'context7' },
      payload: { mcpConfig: { command: 'node' } },
    });
    expect(result).toEqual({ ok: true });
    expect(fetchShareScope).toHaveBeenCalledWith('slug', ['.mcp.local.json']);
    expect(updateMcp).toHaveBeenCalledWith(
      'context7',
      { scope: 'project', projectSlug: 'slug' },
      expect.objectContaining({ scope: 'local', config: { command: 'node' } }),
    );
  });

  it('hook: pre-checks share-scope, then PUTs the {scope:"local"} body branch', async () => {
    vi.mocked(api.put).mockResolvedValue({ success: true });
    const result = await routeToLocal({
      domain: 'hook',
      projectSlug: 'slug',
      card: { hookEvent: 'PreToolUse', matcher: 'Bash' },
      payload: { hookConfig: { type: 'command', command: 'echo' } },
    });
    expect(result).toEqual({ ok: true });
    expect(fetchShareScope).toHaveBeenCalledWith('slug', ['.claude/settings.local.json']);
    expect(api.put).toHaveBeenCalledWith(
      expect.stringContaining('/harness/hooks/PreToolUse/0/0?scope=project&projectSlug=slug'),
      expect.objectContaining({ scope: 'local', config: { type: 'command', command: 'echo' } }),
    );
  });

  it('command: skips the share-scope pre-check and POSTs to replace-secret-with-env-ref', async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true });
    const result = await routeToLocal({
      domain: 'command',
      projectSlug: 'slug',
      card: { relativePath: 'BMad/agents/dev.md', expectedMtime: 'mt' },
      payload: {},
    });
    expect(result).toEqual({ ok: true });
    expect(fetchShareScope).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith(
      '/harness/commands/replace-secret-with-env-ref',
      expect.objectContaining({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: 'BMad/agents/dev.md',
        expectedMtime: 'mt',
      }),
    );
  });

  it('agent: skips the share-scope pre-check and POSTs to replace-secret-with-env-ref', async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true });
    const result = await routeToLocal({
      domain: 'agent',
      projectSlug: 'slug',
      card: { name: 'dev' },
      payload: {},
    });
    expect(result).toEqual({ ok: true });
    expect(fetchShareScope).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith(
      '/harness/agents/replace-secret-with-env-ref',
      expect.objectContaining({ scope: 'project', projectSlug: 'slug', name: 'dev' }),
    );
  });

  it('returns gitignorePatternMissing when the mcp sibling is still classified as shared', async () => {
    vi.mocked(fetchShareScope).mockResolvedValue({
      mode: 'A',
      cards: { '.mcp.local.json': 'shared' },
    });
    const result = await routeToLocal({
      domain: 'mcp',
      projectSlug: 'slug',
      card: { name: 'context7' },
      payload: { mcpConfig: { command: 'node' } },
    });
    expect(result).toEqual({
      ok: false,
      reason: 'gitignorePatternMissing',
      siblingRelativePath: '.mcp.local.json',
    });
    expect(updateMcp).not.toHaveBeenCalled();
  });

  it('returns gitignorePatternMissing when the hook sibling is still classified as shared', async () => {
    vi.mocked(fetchShareScope).mockResolvedValue({
      mode: 'A',
      cards: { '.claude/settings.local.json': 'shared' },
    });
    const result = await routeToLocal({
      domain: 'hook',
      projectSlug: 'slug',
      card: { hookEvent: 'PreToolUse' },
      payload: { hookConfig: { type: 'command', command: 'echo' } },
    });
    expect(result).toEqual({
      ok: false,
      reason: 'gitignorePatternMissing',
      siblingRelativePath: '.claude/settings.local.json',
    });
    expect(api.put).not.toHaveBeenCalled();
  });

  it('returns apiError when the share-scope pre-check itself rejects', async () => {
    vi.mocked(fetchShareScope).mockRejectedValue(new Error('network down'));
    const result = await routeToLocal({
      domain: 'mcp',
      projectSlug: 'slug',
      card: { name: 'context7' },
      payload: { mcpConfig: { command: 'node' } },
    });
    expect(result).toEqual({ ok: false, reason: 'apiError', message: 'network down' });
  });

  it('returns apiError when the dispatched call rejects with a non-secret error', async () => {
    vi.mocked(updateMcp).mockRejectedValue(new Error('boom'));
    const result = await routeToLocal({
      domain: 'mcp',
      projectSlug: 'slug',
      card: { name: 'context7' },
      payload: { mcpConfig: { command: 'node' } },
    });
    expect(result).toEqual({ ok: false, reason: 'apiError', message: 'boom' });
  });

  it('re-surfaces gitignorePatternMissing when the server races and re-throws SECRET_ON_SHARED', async () => {
    // Pre-check passed (verdict 'local') but the server re-evaluated and
    // returned SECRET_ON_SHARED because the .gitignore was edited under us.
    vi.mocked(updateMcp).mockRejectedValue(
      new ApiError(409, 'HARNESS_SECRET_ON_SHARED', 'still shared', { relativePath: '.mcp.local.json' }),
    );
    const result = await routeToLocal({
      domain: 'mcp',
      projectSlug: 'slug',
      card: { name: 'context7' },
      payload: { mcpConfig: { command: 'node' } },
    });
    expect(result).toEqual({
      ok: false,
      reason: 'gitignorePatternMissing',
      siblingRelativePath: '.mcp.local.json',
    });
  });
});
