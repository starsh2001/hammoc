/**
 * Story 28.4: harnessHookStore tests.
 *
 * Covers:
 *  - load populates cardsByEvent / promptTypeSupport / backupMtimeByScope
 *  - copy refetches with the last-known slug
 *  - handleExternalChange refetches on tracked file patterns
 *  - toggleEnabled echoes expectedBackupMtime and persists the response mtime
 *  - showFreshSpawnBanner / dismissBanner toggle the banner
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HARNESS_HOOK_EVENTS,
  type HarnessHookCard,
  type HarnessHookListResponse,
} from '@hammoc/shared';

vi.mock('../../services/api/harnessHooksApi', () => ({
  listHooks: vi.fn(),
  copyHook: vi.fn(),
  updateHook: vi.fn(),
}));

import { listHooks, copyHook, updateHook } from '../../services/api/harnessHooksApi';
import { useHarnessHookStore } from '../harnessHookStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listHooks);
const mockedCopy = vi.mocked(copyHook);
const mockedUpdate = vi.mocked(updateHook);

function sampleCard(): HarnessHookCard {
  return {
    scope: 'project',
    absoluteFile: '/tmp/.claude/settings.json',
    projectSlug: 'slug',
    event: 'PreToolUse',
    groupIndex: 0,
    hookIndex: 0,
    disabledByBackup: false,
    matcher: 'Write',
    config: { type: 'command', command: 'echo' },
    mtime: '2026-04-24T00:00:00Z',
    enabled: true,
  };
}

function sampleResponse(): HarnessHookListResponse {
  const cardsByEvent: HarnessHookListResponse['cardsByEvent'] = {} as never;
  for (const e of HARNESS_HOOK_EVENTS) (cardsByEvent as never)[e] = [] as never;
  cardsByEvent.PreToolUse = [sampleCard()];
  return {
    cardsByEvent,
    malformed: [],
    promptTypeSupport: 'unsupported',
    backupMtimeByScope: { project: '2026-04-25T00:00:00Z' },
  };
}

describe('harnessHookStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessHookStore.getState().reset();
  });
  afterEach(() => {
    useHarnessHookStore.getState().reset();
  });

  it('load: populates cardsByEvent / promptTypeSupport / backupMtimeByScope / lastProjectSlug', async () => {
    mockedList.mockResolvedValueOnce(sampleResponse());
    await useHarnessHookStore.getState().load('slug');
    const s = useHarnessHookStore.getState();
    expect(s.cardsByEvent.PreToolUse).toHaveLength(1);
    expect(s.promptTypeSupport).toBe('unsupported');
    expect(s.backupMtimeByScope.project).toBe('2026-04-25T00:00:00Z');
    expect(s.lastProjectSlug).toBe('slug');
  });

  it('load: surfaces error code/message on failure', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    await useHarnessHookStore.getState().load();
    const s = useHarnessHookStore.getState();
    expect(s.error?.code).toBe('INTERNAL_ERROR');
    expect(s.error?.message).toBe('boom');
  });

  it('copy: triggers a follow-up load with the last project slug', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessHookStore.getState().load('slug');
    mockedCopy.mockResolvedValueOnce({
      success: true,
      newGroupIndex: 0,
      newHookIndex: 0,
      skipped: false,
    });
    await useHarnessHookStore.getState().copy({
      sourceScope: 'user',
      sourceEvent: 'PreToolUse',
      sourceGroupIndex: 0,
      sourceHookIndex: 0,
      targetScope: 'project',
      targetProjectSlug: 'slug',
      onConflict: 'duplicate',
      acknowledgedWarning: true,
    });
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(mockedList).toHaveBeenLastCalledWith('slug');
  });

  it('handleExternalChange: refetches on settings.json and hooks.disabled.json', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessHookStore.getState().load('slug');
    expect(mockedList).toHaveBeenCalledTimes(1);

    useHarnessHookStore.getState().handleExternalChange({
      scope: 'user',
      path: 'settings.json',
      type: 'modified',
      mtime: '2026-04-26',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockedList).toHaveBeenCalledTimes(2);

    useHarnessHookStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'slug',
      path: 'hooks.disabled.json',
      type: 'modified',
      mtime: '2026-04-27',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockedList).toHaveBeenCalledTimes(3);
  });

  it('handleExternalChange: ignores non-tracked paths', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessHookStore.getState().load();
    useHarnessHookStore.getState().handleExternalChange({
      scope: 'user',
      path: 'other-file.json',
      type: 'modified',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('showFreshSpawnBanner / dismissBanner toggle bannerVisible', () => {
    expect(useHarnessHookStore.getState().bannerVisible).toBe(false);
    useHarnessHookStore.getState().showFreshSpawnBanner();
    expect(useHarnessHookStore.getState().bannerVisible).toBe(true);
    useHarnessHookStore.getState().dismissBanner();
    expect(useHarnessHookStore.getState().bannerVisible).toBe(false);
  });

  it('toggleEnabled: echoes expectedBackupMtime and refreshes from the post-toggle list', async () => {
    mockedList.mockResolvedValueOnce(sampleResponse());
    await useHarnessHookStore.getState().load('slug');
    expect(useHarnessHookStore.getState().backupMtimeByScope.project).toBe('2026-04-25T00:00:00Z');

    // The second list call (triggered by toggleEnabled's follow-up load)
    // returns the post-toggle mtime so the store ends up holding it.
    const refreshed = sampleResponse();
    refreshed.backupMtimeByScope = { project: '2026-04-26T00:00:00Z' };
    mockedList.mockResolvedValueOnce(refreshed);

    mockedUpdate.mockResolvedValueOnce({
      success: true,
      mtime: '2026-04-26T00:00:00Z',
      backupMtime: '2026-04-26T00:00:00Z',
    });
    const card = sampleCard();
    await useHarnessHookStore.getState().toggleEnabled(card, false);

    // updateHook was called with both mtime guards.
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const callArgs = mockedUpdate.mock.calls[0];
    expect(callArgs[1]).toEqual({
      enabled: false,
      expectedMtime: card.mtime,
      expectedBackupMtime: '2026-04-25T00:00:00Z',
    });
    // After the post-toggle load, backupMtimeByScope reflects the latest state.
    expect(useHarnessHookStore.getState().backupMtimeByScope.project).toBe(
      '2026-04-26T00:00:00Z',
    );
    // freshSpawn banner is shown.
    expect(useHarnessHookStore.getState().bannerVisible).toBe(true);
  });
});
