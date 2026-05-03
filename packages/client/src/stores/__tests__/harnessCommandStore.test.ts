/**
 * Story 28.5: harnessCommandStore tests.
 *
 * Covers:
 *  - load populates cards / paletteVisibleCount / lastProjectSlug
 *  - load surfaces ApiError code/message on failure
 *  - copy refetches with the last-known slug
 *  - handleExternalChange triggers reload only for `commands/.*\.md` paths
 *  - notifySlashCommandsChanged dispatches the cache-invalidation event
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessCommandCard, HarnessCommandListResponse } from '@hammoc/shared';

vi.mock('../../services/api/harnessCommandsApi', () => ({
  listCommands: vi.fn(),
  copyCommand: vi.fn(),
  copyCommandDirectory: vi.fn(),
}));

vi.mock('../../hooks/useSlashCommands', () => ({
  invalidateSlashCommandsCache: vi.fn(),
  SLASH_COMMANDS_CHANGED_EVENT: 'hammoc:slashCommandsChanged',
}));

import {
  listCommands,
  copyCommand,
  copyCommandDirectory,
} from '../../services/api/harnessCommandsApi';
import {
  invalidateSlashCommandsCache,
  SLASH_COMMANDS_CHANGED_EVENT,
} from '../../hooks/useSlashCommands';
import { useHarnessCommandStore } from '../harnessCommandStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listCommands);
const mockedCopy = vi.mocked(copyCommand);
const mockedDirCopy = vi.mocked(copyCommandDirectory);
const mockedInvalidate = vi.mocked(invalidateSlashCommandsCache);

function sampleCard(): HarnessCommandCard {
  return {
    scope: 'project',
    absoluteFile: '/tmp/.claude/commands/foo.md',
    projectSlug: 'slug',
    relativePath: 'foo.md',
    slashName: '/foo',
    frontmatter: {},
    tokens: {
      usesPositionalArgs: false,
      usesArgumentsAll: false,
      usesFileRefs: false,
      usesBashExec: false,
      usesPluginRoot: false,
    },
    mtime: '2026-04-24T00:00:00Z',
    isBmadMirror: false,
  };
}

function sampleResponse(): HarnessCommandListResponse {
  return {
    cards: [sampleCard()],
    malformed: [],
    paletteVisibleCount: 1,
  };
}

describe('harnessCommandStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessCommandStore.getState().reset();
  });
  afterEach(() => {
    useHarnessCommandStore.getState().reset();
  });

  it('load: populates cards / paletteVisibleCount / lastProjectSlug', async () => {
    mockedList.mockResolvedValueOnce(sampleResponse());
    await useHarnessCommandStore.getState().load('slug');
    const s = useHarnessCommandStore.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.paletteVisibleCount).toBe(1);
    expect(s.lastProjectSlug).toBe('slug');
  });

  it('load: surfaces error code/message on failure', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    await useHarnessCommandStore.getState().load();
    const s = useHarnessCommandStore.getState();
    expect(s.error?.code).toBe('INTERNAL_ERROR');
    expect(s.error?.message).toBe('boom');
  });

  it('copy: triggers a follow-up load with the last project slug', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessCommandStore.getState().load('slug');
    mockedCopy.mockResolvedValueOnce({
      success: true,
      target: {
        scope: 'user',
        absoluteFile: '/tmp/.claude/commands/foo.md',
        relativePath: 'foo.md',
        slashName: '/foo',
      },
      skipped: false,
    });
    await useHarnessCommandStore.getState().copy({
      sourceScope: 'project',
      sourceProjectSlug: 'slug',
      sourceRelativePath: 'foo.md',
      targetScope: 'user',
      onConflict: 'overwrite',
    });
    // Initial load + auto-reload after copy
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('copyDirectory: triggers reload + slash invalidation', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessCommandStore.getState().load('slug');
    mockedDirCopy.mockResolvedValueOnce({ success: true, copied: [], skipped: [] });
    await useHarnessCommandStore.getState().copyDirectory({
      sourceScope: 'project',
      sourceProjectSlug: 'slug',
      sourceDirectoryPath: 'sub',
      targetScope: 'user',
      onConflict: 'overwrite-all',
    });
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(mockedInvalidate).toHaveBeenCalledWith('slug');
  });

  it('handleExternalChange: reloads only for commands/.*\\.md paths', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessCommandStore.getState().load('slug');
    mockedList.mockClear();

    // Non-matching path — should NOT trigger a reload.
    useHarnessCommandStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'slug',
      path: 'settings.json',
      type: 'modified',
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(mockedList).toHaveBeenCalledTimes(0);

    // Matching path — triggers a reload.
    useHarnessCommandStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'slug',
      path: 'commands/foo.md',
      type: 'modified',
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('notifySlashCommandsChanged: invalidates cache + dispatches event', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessCommandStore.getState().load('slug');
    const dispatched: unknown[] = [];
    const handler = (e: Event) => dispatched.push((e as CustomEvent).detail);
    window.addEventListener(SLASH_COMMANDS_CHANGED_EVENT, handler);
    try {
      mockedInvalidate.mockClear();
      useHarnessCommandStore.getState().notifySlashCommandsChanged();
      expect(mockedInvalidate).toHaveBeenCalledWith('slug');
      expect(dispatched).toEqual([{ projectSlug: 'slug' }]);
    } finally {
      window.removeEventListener(SLASH_COMMANDS_CHANGED_EVENT, handler);
    }
  });
});
