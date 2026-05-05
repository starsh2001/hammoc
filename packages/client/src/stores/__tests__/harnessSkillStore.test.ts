/**
 * Story 28.2: harnessSkillStore tests.
 *
 * Covers:
 *  - load success populates cards/malformed/lastProjectSlug
 *  - load failure surfaces ApiError code/message
 *  - handleExternalChange refetches on tracked paths in both scopes
 *  - non-tracked / wrong-scope paths are ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessSkillCard, HarnessSkillListResponse } from '@hammoc/shared';

vi.mock('../../services/api/harnessSkillsApi', () => ({
  listSkills: vi.fn(),
  copySkill: vi.fn(),
}));

import { listSkills, copySkill } from '../../services/api/harnessSkillsApi';
import { useHarnessSkillStore } from '../harnessSkillStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listSkills);
const mockedCopy = vi.mocked(copySkill);

function sampleCard(name: string, overrides: Partial<HarnessSkillCard> = {}): HarnessSkillCard {
  return {
    name,
    description: `desc for ${name}`,
    version: undefined,
    sources: [
      {
        scope: 'user',
        absoluteRoot: `/tmp/${name}`,
        frontmatter: { name, description: `desc for ${name}` },
        skillMdMtime: '2026-04-24T00:00:00Z',
      },
    ],
    activeScope: 'user',
    ...overrides,
  };
}

describe('harnessSkillStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessSkillStore.getState().reset();
  });
  afterEach(() => {
    useHarnessSkillStore.getState().reset();
  });

  it('load: populates cards / malformed / lastProjectSlug', async () => {
    const resp: HarnessSkillListResponse = {
      cards: [sampleCard('alpha')],
      malformed: [],
    };
    mockedList.mockResolvedValueOnce(resp);

    await useHarnessSkillStore.getState().load('proj');
    const s = useHarnessSkillStore.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0].name).toBe('alpha');
    expect(s.lastProjectSlug).toBe('proj');
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeUndefined();
  });

  it('load: surfaces error code/message on failure', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    await useHarnessSkillStore.getState().load();
    const s = useHarnessSkillStore.getState();
    expect(s.error?.code).toBe('INTERNAL_ERROR');
    expect(s.error?.message).toBe('boom');
    expect(s.isLoading).toBe(false);
  });

  it('handleExternalChange: user-scope SKILL.md triggers reload with retained slug', async () => {
    mockedList.mockResolvedValueOnce({ cards: [], malformed: [] });
    await useHarnessSkillStore.getState().load('my-slug');
    mockedList.mockClear();

    mockedList.mockResolvedValueOnce({ cards: [], malformed: [] });
    useHarnessSkillStore.getState().handleExternalChange({
      scope: 'user',
      path: 'skills/foo/SKILL.md',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedList).toHaveBeenCalledWith('my-slug');
  });

  it('handleExternalChange: project-scope bundle file triggers reload', async () => {
    mockedList.mockResolvedValueOnce({ cards: [], malformed: [] });
    await useHarnessSkillStore.getState().load('s');
    mockedList.mockClear();

    mockedList.mockResolvedValueOnce({ cards: [], malformed: [] });
    useHarnessSkillStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 's',
      path: 'skills/bar/references/note.md',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('handleExternalChange: non-tracked path is ignored', async () => {
    mockedList.mockResolvedValue({ cards: [], malformed: [] });
    useHarnessSkillStore.getState().handleExternalChange({
      scope: 'user',
      path: 'plugins/installed_plugins.json',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(0);
  });

  it('copy: triggers a reload after success', async () => {
    mockedCopy.mockResolvedValueOnce({
      success: true,
      copied: 3,
      skipped: false,
      finalName: 'foo',
    });
    mockedList.mockResolvedValueOnce({ cards: [], malformed: [] });

    await useHarnessSkillStore.getState().copy({
      sourceScope: 'user',
      sourceName: 'foo',
      targetScope: 'project',
      targetProjectSlug: 's',
      targetName: 'foo',
      onConflict: 'overwrite',
    });

    expect(mockedList).toHaveBeenCalledTimes(1);
  });
});

async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}
