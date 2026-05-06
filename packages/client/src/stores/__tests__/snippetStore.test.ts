/**
 * Story 29.2 (Task 4.3): snippetStore unit tests.
 *
 * Covers:
 *  - load: populates cards / lastProjectSlug, reuses warm cache, surfaces errors
 *  - open: sets active draft from server content
 *  - save: roundtrips updateSnippet, refreshes the card list, handles errors
 *  - create / remove: trigger a follow-up load with the last slug
 *  - copy: surfaces HARNESS_FILE_EXISTS so the panel can render the conflict modal
 *  - bundled scope is rejected client-side (defensive guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  SnippetCard,
  SnippetCopyResponse,
  SnippetListResponse,
  SnippetReadResponse,
  SnippetWriteResponse,
} from '@hammoc/shared';

vi.mock('../../services/api/snippetsApi', () => ({
  listSnippets: vi.fn(),
  readSnippet: vi.fn(),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  copySnippet: vi.fn(),
}));

import {
  listSnippets,
  readSnippet,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  copySnippet,
} from '../../services/api/snippetsApi';
import { useSnippetStore } from '../snippetStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listSnippets);
const mockedRead = vi.mocked(readSnippet);
const mockedCreate = vi.mocked(createSnippet);
const mockedUpdate = vi.mocked(updateSnippet);
const mockedDelete = vi.mocked(deleteSnippet);
const mockedCopy = vi.mocked(copySnippet);

function sampleCard(overrides: Partial<SnippetCard> = {}): SnippetCard {
  return {
    scope: 'project',
    name: 'commit-and-done',
    preview: 'first line of body',
    mtime: '2026-05-07T00:00:00.000Z',
    size: 42,
    ...overrides,
  };
}

function sampleListResponse(cards: SnippetCard[] = [sampleCard()]): SnippetListResponse {
  return { snippets: cards };
}

function sampleReadResponse(overrides: Partial<SnippetReadResponse> = {}): SnippetReadResponse {
  return {
    scope: 'project',
    name: 'commit-and-done',
    content: 'body content',
    mtime: '2026-05-07T00:00:00.000Z',
    size: 12,
    absolutePath: '/tmp/.hammoc/snippets/commit-and-done.md',
    ...overrides,
  };
}

function sampleWriteResponse(): SnippetWriteResponse {
  return { success: true, size: 24, mtime: '2026-05-07T00:01:00.000Z' };
}

describe('snippetStore (Story 29.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSnippetStore.getState().reset();
  });
  afterEach(() => {
    useSnippetStore.getState().reset();
  });

  it('load populates cards and lastProjectSlug', async () => {
    mockedList.mockResolvedValueOnce(sampleListResponse());
    await useSnippetStore.getState().load('slug');
    const s = useSnippetStore.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0].name).toBe('commit-and-done');
    expect(s.lastProjectSlug).toBe('slug');
    expect(s.isLoading).toBe(false);
  });

  it('load surfaces ApiError code/message on failure', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    await useSnippetStore.getState().load('slug');
    const s = useSnippetStore.getState();
    expect(s.error?.code).toBe('INTERNAL_ERROR');
    expect(s.error?.message).toBe('boom');
    expect(s.isLoading).toBe(false);
  });

  it('load is warm when called twice with same slug — preserves cards while refetching', async () => {
    // First call populates the store.
    mockedList.mockResolvedValueOnce(sampleListResponse());
    await useSnippetStore.getState().load('slug');
    expect(useSnippetStore.getState().cards).toHaveLength(1);
    // Second call — simulate slow response and assert cards are NOT cleared
    // before the new payload arrives (stale-while-revalidate semantics).
    let resolveSecond!: (v: SnippetListResponse) => void;
    mockedList.mockReturnValueOnce(
      new Promise<SnippetListResponse>((r) => {
        resolveSecond = r;
      }),
    );
    const pending = useSnippetStore.getState().load('slug');
    expect(useSnippetStore.getState().cards).toHaveLength(1);
    expect(useSnippetStore.getState().isLoading).toBe(false);
    resolveSecond(sampleListResponse([sampleCard({ name: 'fresh' })]));
    await pending;
    expect(useSnippetStore.getState().cards[0].name).toBe('fresh');
  });

  it('open populates active.draft from the server content', async () => {
    mockedRead.mockResolvedValueOnce(sampleReadResponse());
    await useSnippetStore
      .getState()
      .open({ scope: 'project', name: 'commit-and-done', projectSlug: 'slug' });
    const s = useSnippetStore.getState();
    expect(s.active?.draft).toBe('body content');
    expect(s.active?.projectSlug).toBe('slug');
  });

  it('save updates the active snippet and refreshes the card list', async () => {
    // Seed: open a snippet so active is non-null.
    mockedRead.mockResolvedValueOnce(sampleReadResponse());
    await useSnippetStore
      .getState()
      .open({ scope: 'project', name: 'commit-and-done', projectSlug: 'slug' });

    useSnippetStore.getState().setActiveDraft('new body');
    mockedUpdate.mockResolvedValueOnce(sampleWriteResponse());
    mockedList.mockResolvedValueOnce(sampleListResponse());

    const result = await useSnippetStore.getState().save('/tmp/proj');
    expect(result.ok).toBe(true);
    expect(mockedUpdate).toHaveBeenCalledWith(
      { scope: 'project', name: 'commit-and-done', projectSlug: 'slug' },
      'new body',
      '2026-05-07T00:00:00.000Z',
      { workingDirectory: '/tmp/proj' },
    );
    expect(mockedList).toHaveBeenCalled();
    expect(useSnippetStore.getState().active?.content).toBe('new body');
    expect(useSnippetStore.getState().active?.mtime).toBe('2026-05-07T00:01:00.000Z');
  });

  it('save rejects bundled scope client-side without calling the API', async () => {
    mockedRead.mockResolvedValueOnce(sampleReadResponse({ scope: 'bundled' }));
    await useSnippetStore.getState().open({ scope: 'bundled', name: 'std' });
    useSnippetStore.getState().setActiveDraft('hacked');
    const result = await useSnippetStore.getState().save();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HARNESS_BUNDLED_READONLY');
    }
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('create triggers a follow-up load with the last project slug', async () => {
    mockedList.mockResolvedValue(sampleListResponse());
    await useSnippetStore.getState().load('slug');
    mockedCreate.mockResolvedValueOnce(sampleWriteResponse());
    mockedList.mockClear();
    await useSnippetStore.getState().create({
      scope: 'project',
      projectSlug: 'slug',
      name: 'new-one',
      content: 'hi',
    });
    expect(mockedCreate).toHaveBeenCalled();
    expect(mockedList).toHaveBeenCalledWith('slug');
  });

  it('remove drops the active snippet when it matches and reloads the list', async () => {
    mockedList.mockResolvedValue(sampleListResponse());
    await useSnippetStore.getState().load('slug');
    mockedRead.mockResolvedValueOnce(sampleReadResponse());
    await useSnippetStore
      .getState()
      .open({ scope: 'project', name: 'commit-and-done', projectSlug: 'slug' });
    expect(useSnippetStore.getState().active).not.toBeNull();
    mockedDelete.mockResolvedValueOnce({ success: true });
    mockedList.mockClear();
    await useSnippetStore.getState().remove({
      scope: 'project',
      projectSlug: 'slug',
      name: 'commit-and-done',
    });
    expect(useSnippetStore.getState().active).toBeNull();
    expect(mockedList).toHaveBeenCalledWith('slug');
  });

  it('copy surfaces HARNESS_FILE_EXISTS so the panel can render the conflict modal', async () => {
    mockedCopy.mockRejectedValueOnce(
      new ApiError(409, 'HARNESS_FILE_EXISTS', 'snippet exists at target'),
    );
    await expect(
      useSnippetStore.getState().copy({
        sourceScope: 'project',
        sourceName: 'a',
        sourceProjectSlug: 'slug',
        targetScope: 'user',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(useSnippetStore.getState().error?.code).toBe('HARNESS_FILE_EXISTS');
  });

  it('copy reload reuses the last project slug', async () => {
    mockedList.mockResolvedValue(sampleListResponse());
    await useSnippetStore.getState().load('slug');
    const ok: SnippetCopyResponse = {
      success: true,
      target: { scope: 'user', name: 'a', absolutePath: '/tmp/u/.hammoc/snippets/a.md' },
    };
    mockedCopy.mockResolvedValueOnce(ok);
    mockedList.mockClear();
    await useSnippetStore.getState().copy({
      sourceScope: 'project',
      sourceName: 'a',
      sourceProjectSlug: 'slug',
      targetScope: 'user',
    });
    expect(mockedList).toHaveBeenCalledWith('slug');
  });

  it('forceOverwriteNext rewrites the active mtime so the next save bypasses STALE_WRITE', async () => {
    mockedRead.mockResolvedValueOnce(sampleReadResponse());
    await useSnippetStore
      .getState()
      .open({ scope: 'project', name: 'commit-and-done', projectSlug: 'slug' });
    useSnippetStore.getState().forceOverwriteNext('2026-05-07T99:99:99.000Z');
    expect(useSnippetStore.getState().active?.mtime).toBe('2026-05-07T99:99:99.000Z');
  });
});
