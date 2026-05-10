/**
 * Story 30.1 (Task 3.3): harnessShareScopeStore tests.
 *
 * Covers:
 *   - `load`: populates `mode` + `cards` from the API
 *   - `handleExternalChange`: `'../.gitignore'` triggers a full reload (one
 *     fetch covering every known path)
 *   - `handleExternalChange`: harness file modify/created/deleted triggers
 *     a single-path re-evaluation (the new sibling badge case from Task 6.4)
 *   - `handleExternalChange`: events for a different project / scope are
 *     ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessExternalChangeEvent, HarnessShareScopeResponse } from '@hammoc/shared';

vi.mock('../../services/api/harnessShareScopeApi', () => ({
  fetchShareScope: vi.fn(),
}));

import { fetchShareScope } from '../../services/api/harnessShareScopeApi';
import { useHarnessShareScopeStore } from '../harnessShareScopeStore';

const mockedFetch = vi.mocked(fetchShareScope);

function modeAResponse(extras: Record<string, 'shared' | 'local' | 'fullyIgnored'> = {}): HarnessShareScopeResponse {
  return {
    mode: 'A',
    cards: {
      '.claude/settings.json': 'shared',
      '.claude/settings.local.json': 'local',
      ...extras,
    },
  };
}

beforeEach(() => {
  useHarnessShareScopeStore.getState().reset();
  mockedFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('harnessShareScopeStore.load', () => {
  it('populates mode and cards on success', async () => {
    mockedFetch.mockResolvedValue(modeAResponse());
    await useHarnessShareScopeStore.getState().load('slug');
    const s = useHarnessShareScopeStore.getState();
    expect(s.mode).toBe('A');
    expect(s.cards['.claude/settings.json']).toBe('shared');
    expect(s.cards['.claude/settings.local.json']).toBe('local');
    expect(s.error).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  it('falls back to mode=unknown on error when cards were empty', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    await useHarnessShareScopeStore.getState().load('slug');
    const s = useHarnessShareScopeStore.getState();
    expect(s.mode).toBe('unknown');
    expect(s.error).toContain('network');
    expect(s.isLoading).toBe(false);
  });
});

describe('harnessShareScopeStore.handleExternalChange', () => {
  it('triggers full reload when `.gitignore` changes', async () => {
    mockedFetch.mockResolvedValueOnce(modeAResponse());
    await useHarnessShareScopeStore.getState().load('slug');
    mockedFetch.mockClear();

    mockedFetch.mockResolvedValueOnce({
      mode: 'B',
      cards: {
        '.claude/settings.json': 'fullyIgnored',
        '.claude/settings.local.json': 'fullyIgnored',
      },
    });
    const event: HarnessExternalChangeEvent = {
      scope: 'project',
      projectSlug: 'slug',
      path: '../.gitignore',
      type: 'modified',
    };
    useHarnessShareScopeStore.getState().handleExternalChange(event, 'slug');

    await vi.waitFor(() => {
      expect(useHarnessShareScopeStore.getState().mode).toBe('B');
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    // Full-reload path should pass every known path so verdicts stay coherent.
    const [, paths] = mockedFetch.mock.calls[0];
    expect(paths).toEqual(expect.arrayContaining(['.claude/settings.json']));
  });

  it('re-evaluates a single path on harness file create/modify', async () => {
    mockedFetch.mockResolvedValueOnce(modeAResponse());
    await useHarnessShareScopeStore.getState().load('slug');
    mockedFetch.mockClear();

    mockedFetch.mockResolvedValueOnce({
      mode: 'A',
      cards: { '.claude/agents/dev.md': 'shared' },
    });
    const event: HarnessExternalChangeEvent = {
      scope: 'project',
      projectSlug: 'slug',
      path: '.claude/agents/dev.md',
      type: 'created',
    };
    useHarnessShareScopeStore.getState().handleExternalChange(event, 'slug');

    await vi.waitFor(() => {
      expect(useHarnessShareScopeStore.getState().cards['.claude/agents/dev.md']).toBe('shared');
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, paths] = mockedFetch.mock.calls[0];
    expect(paths).toEqual(['.claude/agents/dev.md']);
  });

  it('ignores events from a different project slug', () => {
    const event: HarnessExternalChangeEvent = {
      scope: 'project',
      projectSlug: 'other',
      path: '../.gitignore',
      type: 'modified',
    };
    useHarnessShareScopeStore.getState().handleExternalChange(event, 'slug');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('ignores user-scope events (no `.gitignore` for ~/.claude)', () => {
    const event: HarnessExternalChangeEvent = {
      scope: 'user',
      path: 'CLAUDE.md',
      type: 'modified',
    };
    useHarnessShareScopeStore.getState().handleExternalChange(event, 'slug');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
