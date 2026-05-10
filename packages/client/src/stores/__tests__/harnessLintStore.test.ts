/**
 * Story 30.2 (Task 4.6): harnessLintStore tests.
 *
 * Covers:
 *   - `load`: populates issues + rule preferences from the API
 *   - `handleExternalChange`: lint-input path triggers a debounced reload
 *   - `handleExternalChange`: non-lint path is ignored
 *   - `handleExternalChange`: `'../.gitignore'` is ignored (lint doesn't depend on it)
 *   - `toggleRule`: success path persists + reloads
 *   - `toggleRule`: failure rolls back optimistic state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessExternalChangeEvent, HarnessLintResponse, LintIssue } from '@hammoc/shared';

vi.mock('../../services/api/harnessLintApi', () => ({
  fetchLint: vi.fn(),
}));
vi.mock('../../services/api/preferences', () => ({
  preferencesApi: {
    update: vi.fn(),
  },
}));

import { fetchLint } from '../../services/api/harnessLintApi';
import { preferencesApi } from '../../services/api/preferences';
import { useHarnessLintStore } from '../harnessLintStore';

const mockedFetch = vi.mocked(fetchLint);
const mockedUpdate = vi.mocked(preferencesApi.update);

function sampleIssue(overrides: Partial<LintIssue> = {}): LintIssue {
  return {
    ruleId: 'mcp/url-invalid',
    severity: 'error',
    cardScope: 'project',
    cardName: 'remote',
    cardDomain: 'mcp',
    location: { kind: 'path', path: ['mcpServers', 'remote', 'url'] },
    messageI18nKey: 'harness.tools.lint.rule.mcp/url-invalid.message',
    ...overrides,
  };
}

function sampleResponse(issues: LintIssue[] = []): HarnessLintResponse {
  return {
    issues,
    rulePreferences: {
      'naming/duplicate-across-sources': true,
      'hook/matcher-regex-invalid': true,
      'parse/yaml-json-error': true,
      'mcp/command-not-on-path': false,
      'mcp/url-invalid': true,
      'agent/tools-non-standard': true,
      'hook/env-var-undefined': true,
    },
    evaluatedAt: '2026-05-11T00:00:00.000Z',
  };
}

beforeEach(() => {
  useHarnessLintStore.getState().reset();
  mockedFetch.mockReset();
  mockedUpdate.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('harnessLintStore.load', () => {
  it('populates issues + rulePreferences on success', async () => {
    mockedFetch.mockResolvedValue(sampleResponse([sampleIssue()]));
    await useHarnessLintStore.getState().load('slug');
    const s = useHarnessLintStore.getState();
    expect(s.issues).toHaveLength(1);
    expect(s.rulePreferences['mcp/command-not-on-path']).toBe(false);
    expect(s.error).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  it('records error message on failure without dropping isLoading=false', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    await useHarnessLintStore.getState().load('slug');
    const s = useHarnessLintStore.getState();
    expect(s.error).toContain('network');
    expect(s.isLoading).toBe(false);
  });
});

describe('harnessLintStore.handleExternalChange', () => {
  it('debounces and reloads on lint-input path change', async () => {
    mockedFetch.mockResolvedValueOnce(sampleResponse());
    await useHarnessLintStore.getState().load('slug');
    mockedFetch.mockClear();

    mockedFetch.mockResolvedValueOnce(sampleResponse([sampleIssue()]));
    const event: HarnessExternalChangeEvent = {
      scope: 'project',
      projectSlug: 'slug',
      path: '.mcp.json',
      type: 'modified',
    };
    useHarnessLintStore.getState().handleExternalChange(event, 'slug');
    // Before debounce flush — still no fetch yet.
    expect(mockedFetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(310);
    // Flush microtasks so the awaited load() resolves.
    await Promise.resolve();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('ignores non-lint paths (e.g. snippet writes)', () => {
    mockedFetch.mockResolvedValue(sampleResponse());
    const event: HarnessExternalChangeEvent = {
      scope: 'project',
      projectSlug: 'slug',
      path: '.hammoc/snippets/foo.md',
      type: 'modified',
    };
    useHarnessLintStore.getState().handleExternalChange(event, 'slug');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('ignores `../.gitignore` (share-scope drives that, not lint)', () => {
    const event: HarnessExternalChangeEvent = {
      scope: 'project',
      projectSlug: 'slug',
      path: '../.gitignore',
      type: 'modified',
    };
    useHarnessLintStore.getState().handleExternalChange(event, 'slug');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe('harnessLintStore.toggleRule', () => {
  it('persists the toggle and reloads on success', async () => {
    mockedFetch.mockResolvedValue(sampleResponse());
    await useHarnessLintStore.getState().load('slug');
    mockedFetch.mockClear();

    mockedUpdate.mockResolvedValue({} as never);
    // Reflect the persisted toggle in the second load — the real server would
    // re-evaluate with the new prefs and surface them in the response.
    const next = sampleResponse();
    next.rulePreferences['mcp/command-not-on-path'] = true;
    mockedFetch.mockResolvedValueOnce(next);

    await useHarnessLintStore.getState().toggleRule('mcp/command-not-on-path', true);

    expect(mockedUpdate).toHaveBeenCalledWith({
      harnessLintRules: expect.objectContaining({ 'mcp/command-not-on-path': true }),
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(useHarnessLintStore.getState().rulePreferences['mcp/command-not-on-path']).toBe(true);
  });

  it('rolls back optimistic state on persistence failure', async () => {
    mockedFetch.mockResolvedValue(sampleResponse());
    await useHarnessLintStore.getState().load('slug');
    const before = useHarnessLintStore.getState().rulePreferences['mcp/command-not-on-path'];

    mockedUpdate.mockRejectedValue(new Error('disk full'));

    await expect(
      useHarnessLintStore.getState().toggleRule('mcp/command-not-on-path', true),
    ).rejects.toThrow('disk full');

    expect(useHarnessLintStore.getState().rulePreferences['mcp/command-not-on-path']).toBe(before);
  });
});

describe('countsByDomain / issuesForCard selectors', () => {
  it('aggregates errors and warns across domains', async () => {
    mockedFetch.mockResolvedValue(
      sampleResponse([
        sampleIssue({ severity: 'error', cardDomain: 'mcp' }),
        sampleIssue({ severity: 'warn', cardDomain: 'mcp', ruleId: 'mcp/command-not-on-path' }),
        sampleIssue({ severity: 'warn', cardDomain: 'agent', ruleId: 'agent/tools-non-standard' }),
      ]),
    );
    await useHarnessLintStore.getState().load('slug');
    const counts = useHarnessLintStore.getState().countsByDomain();
    expect(counts.mcp).toEqual({ error: 1, warn: 1 });
    expect(counts.agent).toEqual({ error: 0, warn: 1 });
    expect(counts.skill).toEqual({ error: 0, warn: 0 });
  });
});
