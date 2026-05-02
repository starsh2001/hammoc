/**
 * Story 28.3: harnessMcpStore tests.
 *
 * Covers:
 *  - load success populates cards/malformed/spike outcomes
 *  - load failure surfaces ApiError code/message
 *  - copy refetches with the last-known slug
 *  - handleExternalChange refetches on the four tracked path forms
 *  - non-tracked paths are ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessMcpCard, HarnessMcpListResponse } from '@hammoc/shared';

vi.mock('../../services/api/harnessMcpsApi', () => ({
  listMcps: vi.fn(),
  copyMcp: vi.fn(),
}));

import { listMcps, copyMcp } from '../../services/api/harnessMcpsApi';
import { useHarnessMcpStore } from '../harnessMcpStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listMcps);
const mockedCopy = vi.mocked(copyMcp);

function sampleCard(name: string): HarnessMcpCard {
  return {
    name,
    activeType: 'stdio',
    enabled: true,
    activeScope: 'user',
    sources: [
      {
        scope: 'user',
        absoluteFile: `/tmp/${name}/.mcp.json`,
        sourceFileKind: 'mcp.json',
        config: { command: 'echo' },
        mtime: '2026-04-24T00:00:00Z',
        disabledByBackup: false,
      },
    ],
  };
}

function sampleResponse(name = 'alpha'): HarnessMcpListResponse {
  return {
    cards: [sampleCard(name)],
    malformed: [],
    userFileKind: 'mcp.json',
    disableStrategy: 'backup',
  };
}

describe('harnessMcpStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessMcpStore.getState().reset();
  });
  afterEach(() => {
    useHarnessMcpStore.getState().reset();
  });

  it('load: populates cards / malformed / spike outcomes / lastProjectSlug', async () => {
    mockedList.mockResolvedValueOnce(sampleResponse('alpha'));
    await useHarnessMcpStore.getState().load('proj');
    const s = useHarnessMcpStore.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0].name).toBe('alpha');
    expect(s.userFileKind).toBe('mcp.json');
    expect(s.disableStrategy).toBe('backup');
    expect(s.lastProjectSlug).toBe('proj');
  });

  it('load: surfaces error code/message on failure', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    await useHarnessMcpStore.getState().load();
    const s = useHarnessMcpStore.getState();
    expect(s.error?.code).toBe('INTERNAL_ERROR');
    expect(s.error?.message).toBe('boom');
  });

  it('copy: refetches with the last-known slug after success', async () => {
    mockedList.mockResolvedValue(sampleResponse('alpha'));
    mockedCopy.mockResolvedValue({ success: true, finalName: 'alpha', skipped: false });
    await useHarnessMcpStore.getState().load('slug-keep');
    mockedList.mockClear();
    await useHarnessMcpStore.getState().copy({
      sourceScope: 'user',
      sourceName: 'alpha',
      targetScope: 'project',
      targetProjectSlug: 'slug-keep',
      targetName: 'alpha',
      onConflict: 'overwrite',
    });
    expect(mockedList).toHaveBeenCalledWith('slug-keep');
  });

  describe('handleExternalChange', () => {
    beforeEach(() => {
      mockedList.mockResolvedValue(sampleResponse('alpha'));
    });

    const tracked = [
      { scope: 'user' as const, path: '.mcp.json' },
      { scope: 'project' as const, path: '.mcp.json' },
      { scope: 'user' as const, path: 'settings.json' },
      { scope: 'user' as const, path: 'mcp.disabled.json' },
      { scope: 'project' as const, path: 'mcp.disabled.json' },
    ];
    for (const { scope, path } of tracked) {
      it(`reloads on ${scope} ${path}`, async () => {
        await useHarnessMcpStore.getState().load('proj');
        mockedList.mockClear();
        useHarnessMcpStore.getState().handleExternalChange({
          scope,
          projectSlug: scope === 'project' ? 'proj' : undefined,
          path,
          type: 'modified',
        });
        await new Promise((r) => setTimeout(r, 0));
        expect(mockedList).toHaveBeenCalledWith('proj');
      });
    }

    it('ignores unrelated paths', async () => {
      await useHarnessMcpStore.getState().load('proj');
      mockedList.mockClear();
      useHarnessMcpStore.getState().handleExternalChange({
        scope: 'user',
        path: 'settings.local.json',
        type: 'modified',
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(mockedList).not.toHaveBeenCalled();
    });
  });

  describe('freshSpawn banner', () => {
    it('starts hidden', () => {
      expect(useHarnessMcpStore.getState().bannerVisible).toBe(false);
    });

    it('showFreshSpawnBanner / dismissBanner toggle bannerVisible', () => {
      useHarnessMcpStore.getState().showFreshSpawnBanner();
      expect(useHarnessMcpStore.getState().bannerVisible).toBe(true);
      useHarnessMcpStore.getState().dismissBanner();
      expect(useHarnessMcpStore.getState().bannerVisible).toBe(false);
    });

    it('reset clears bannerVisible', () => {
      useHarnessMcpStore.getState().showFreshSpawnBanner();
      useHarnessMcpStore.getState().reset();
      expect(useHarnessMcpStore.getState().bannerVisible).toBe(false);
    });
  });
});
