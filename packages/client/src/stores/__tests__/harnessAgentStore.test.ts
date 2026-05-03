/**
 * Story 28.6: harnessAgentStore tests.
 *
 * Covers:
 *  - load populates cards / lastProjectSlug
 *  - load surfaces ApiError code/message on failure
 *  - copy refetches with the last-known slug
 *  - handleExternalChange triggers reload only for `agents/.*\.md` paths
 *    (subdirectories are NOT matched per AC1.a flat-only policy)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  HarnessAgentCard,
  HarnessAgentListResponse,
} from '@hammoc/shared';

vi.mock('../../services/api/harnessAgentsApi', () => ({
  listAgents: vi.fn(),
  copyAgent: vi.fn(),
}));

import { listAgents, copyAgent } from '../../services/api/harnessAgentsApi';
import { useHarnessAgentStore } from '../harnessAgentStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listAgents);
const mockedCopy = vi.mocked(copyAgent);

function sampleCard(): HarnessAgentCard {
  return {
    scope: 'project',
    absoluteFile: '/tmp/.claude/agents/code-reviewer.md',
    projectSlug: 'slug',
    name: 'code-reviewer',
    description: 'Reviews code.',
    model: 'sonnet',
    color: 'blue',
    toolsState: 'omitted',
    tools: [],
    hasExampleBlock: true,
    mtime: '2026-05-03T00:00:00Z',
  };
}

function sampleResponse(): HarnessAgentListResponse {
  return {
    cards: [sampleCard()],
    malformed: [],
  };
}

describe('harnessAgentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessAgentStore.getState().reset();
  });
  afterEach(() => {
    useHarnessAgentStore.getState().reset();
  });

  it('load: populates cards / lastProjectSlug', async () => {
    mockedList.mockResolvedValueOnce(sampleResponse());
    await useHarnessAgentStore.getState().load('slug');
    const s = useHarnessAgentStore.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0].name).toBe('code-reviewer');
    expect(s.lastProjectSlug).toBe('slug');
  });

  it('load: surfaces error code/message on failure', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    await useHarnessAgentStore.getState().load();
    const s = useHarnessAgentStore.getState();
    expect(s.error?.code).toBe('INTERNAL_ERROR');
    expect(s.error?.message).toBe('boom');
  });

  it('copy: triggers a follow-up load with the last project slug', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessAgentStore.getState().load('slug');
    mockedCopy.mockResolvedValueOnce({
      success: true,
      target: {
        scope: 'user',
        absoluteFile: '/tmp/user/.claude/agents/code-reviewer.md',
        name: 'code-reviewer',
      },
      skipped: false,
    });
    mockedList.mockClear();
    await useHarnessAgentStore.getState().copy({
      sourceScope: 'project',
      sourceProjectSlug: 'slug',
      sourceName: 'code-reviewer',
      targetScope: 'user',
      onConflict: 'overwrite',
    });
    expect(mockedList).toHaveBeenCalledWith('slug');
  });

  it('handleExternalChange: reloads when path matches agents/<file>.md', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessAgentStore.getState().load('slug');
    mockedList.mockClear();
    useHarnessAgentStore.getState().handleExternalChange({
      scope: 'project',
      path: 'agents/code-reviewer.md',
      type: 'modified',
    });
    // load() is async — wait one microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedList).toHaveBeenCalled();
  });

  it('handleExternalChange: does NOT reload when path is a subdirectory', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessAgentStore.getState().load('slug');
    mockedList.mockClear();
    useHarnessAgentStore.getState().handleExternalChange({
      scope: 'project',
      path: 'agents/sub/foo.md',
      type: 'modified',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('handleExternalChange: preserves last project slug', async () => {
    mockedList.mockResolvedValue(sampleResponse());
    await useHarnessAgentStore.getState().load('my-project');
    mockedList.mockClear();
    useHarnessAgentStore.getState().handleExternalChange({
      scope: 'user',
      path: 'agents/global.md',
      type: 'modified',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedList).toHaveBeenCalledWith('my-project');
  });
});
