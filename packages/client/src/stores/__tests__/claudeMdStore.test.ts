/**
 * Story 29.1: claudeMdStore tests.
 *
 * Covers:
 *  - load happy path + 404-as-empty (AC4)
 *  - save STALE_WRITE → staleBanner
 *  - reload / overwrite resolution paths
 *  - external-change matching rule:
 *      user-scope CLAUDE.md   → user column
 *      project-scope ../CLAUDE.md → project column
 *      project-scope CLAUDE.md → IGNORED (that is the .claude/-internal sibling)
 *  - copyAppendSections + copyOverwrite write-through
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessReadResponse, HarnessWriteResponse } from '@hammoc/shared';

vi.mock('../../services/api/claudeMdApi', () => ({
  readClaudeMd: vi.fn(),
  writeClaudeMd: vi.fn(),
  createClaudeMd: vi.fn(),
}));

import {
  readClaudeMd,
  writeClaudeMd,
  createClaudeMd,
} from '../../services/api/claudeMdApi';
import { useClaudeMdStore } from '../claudeMdStore';
import { ApiError } from '../../services/api/client';

const mockedRead = vi.mocked(readClaudeMd);
const mockedWrite = vi.mocked(writeClaudeMd);
const mockedCreate = vi.mocked(createClaudeMd);

function readResponse(content: string, mtime = '2026-05-06T00:00:00Z'): HarnessReadResponse {
  return {
    scope: 'project',
    projectSlug: 'slug',
    path: 'CLAUDE.md',
    content,
    isBinary: false,
    isTruncated: false,
    size: content.length,
    mtime,
    mimeType: 'text/markdown',
    absolutePath: '/abs/path/CLAUDE.md',
  };
}

function writeResponse(mtime = '2026-05-06T00:01:00Z'): HarnessWriteResponse {
  return { success: true, size: 0, mtime };
}

describe('claudeMdStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClaudeMdStore.getState().reset();
  });
  afterEach(() => {
    useClaudeMdStore.getState().reset();
  });

  it('load populates the column on success', async () => {
    mockedRead.mockResolvedValueOnce(readResponse('# project content'));
    await useClaudeMdStore.getState().load('project', 'slug');
    const col = useClaudeMdStore.getState().project;
    expect(col.exists).toBe(true);
    expect(col.content).toBe('# project content');
    expect(col.mtime).toBe('2026-05-06T00:00:00Z');
    expect(col.isLoading).toBe(false);
    expect(col.error).toBeUndefined();
  });

  it('load surfaces 404 as exists:false (empty-state CTA, AC4)', async () => {
    mockedRead.mockRejectedValueOnce(
      new ApiError(404, 'HARNESS_FILE_NOT_FOUND', 'file not found'),
    );
    await useClaudeMdStore.getState().load('user');
    const col = useClaudeMdStore.getState().user;
    expect(col.exists).toBe(false);
    expect(col.content).toBe('');
    expect(col.error).toBeUndefined();
  });

  // AC4.c: the empty-state confirm dialog must show the resolved absolute
  // path. The server includes it in 404 details so the client can render it
  // before any file exists on disk.
  it('load captures absolutePath from 404 details (AC4.c)', async () => {
    mockedRead.mockRejectedValueOnce(
      new ApiError(404, 'HARNESS_FILE_NOT_FOUND', 'file not found', {
        absolutePath: '/home/user/.claude/CLAUDE.md',
      }),
    );
    await useClaudeMdStore.getState().load('user');
    const col = useClaudeMdStore.getState().user;
    expect(col.exists).toBe(false);
    expect(col.absolutePath).toBe('/home/user/.claude/CLAUDE.md');
  });

  it('load captures absolutePath from 200 response body', async () => {
    mockedRead.mockResolvedValueOnce(readResponse('hi'));
    await useClaudeMdStore.getState().load('user');
    expect(useClaudeMdStore.getState().user.absolutePath).toBe('/abs/path/CLAUDE.md');
  });

  it('save bumps mtime on success and sets saveAcked', async () => {
    mockedRead.mockResolvedValueOnce(readResponse('hello'));
    await useClaudeMdStore.getState().load('user');
    useClaudeMdStore.getState().setDraft('user', 'hello edited');
    mockedWrite.mockResolvedValueOnce(writeResponse('2026-05-06T00:02:00Z'));
    await useClaudeMdStore.getState().save('user');
    const col = useClaudeMdStore.getState().user;
    expect(col.mtime).toBe('2026-05-06T00:02:00Z');
    expect(col.saveAcked).toBe(true);
  });

  it('save with STALE_WRITE re-reads disk and shows the staleBanner', async () => {
    mockedRead.mockResolvedValueOnce(readResponse('original'));
    await useClaudeMdStore.getState().load('user');
    useClaudeMdStore.getState().setDraft('user', 'mine');
    mockedWrite.mockRejectedValueOnce(
      new ApiError(409, 'HARNESS_STALE_WRITE', 'stale', { currentMtime: '2026-05-06T00:05:00Z' }),
    );
    mockedRead.mockResolvedValueOnce(readResponse('disk-version', '2026-05-06T00:05:00Z'));
    await useClaudeMdStore.getState().save('user');
    const col = useClaudeMdStore.getState().user;
    expect(col.staleBanner).toEqual({
      freshContent: 'disk-version',
      freshMtime: '2026-05-06T00:05:00Z',
    });
    expect(col.content).toBe('mine'); // draft preserved until user picks
  });

  it('applyReload swaps draft for disk content and clears staleBanner', async () => {
    // Set up a column with a stale banner.
    useClaudeMdStore.setState({
      user: {
        content: 'mine',
        mtime: '2026-05-06T00:00:00Z',
        exists: true,
        absolutePath: '/abs/CLAUDE.md',
        isLoading: false,
        saveAcked: false,
        staleBanner: { freshContent: 'disk', freshMtime: '2026-05-06T00:05:00Z' },
      },
      project: useClaudeMdStore.getState().project,
    });
    useClaudeMdStore.getState().applyReload('user');
    const col = useClaudeMdStore.getState().user;
    expect(col.content).toBe('disk');
    expect(col.mtime).toBe('2026-05-06T00:05:00Z');
    expect(col.staleBanner).toBeNull();
  });

  it('applyOverwrite bumps expected mtime to disk and re-tries save', async () => {
    useClaudeMdStore.setState({
      user: {
        content: 'mine',
        mtime: '2026-05-06T00:00:00Z',
        exists: true,
        absolutePath: '/abs/CLAUDE.md',
        isLoading: false,
        saveAcked: false,
        staleBanner: { freshContent: 'disk', freshMtime: '2026-05-06T00:05:00Z' },
      },
      project: useClaudeMdStore.getState().project,
    });
    mockedWrite.mockResolvedValueOnce(writeResponse('2026-05-06T00:06:00Z'));
    await useClaudeMdStore.getState().applyOverwrite('user');
    expect(mockedWrite).toHaveBeenCalledWith(
      { scope: 'user', projectSlug: undefined },
      'mine',
      '2026-05-06T00:05:00Z',
    );
    expect(useClaudeMdStore.getState().user.mtime).toBe('2026-05-06T00:06:00Z');
  });

  it('create transitions empty-state column to exists:true', async () => {
    mockedCreate.mockResolvedValueOnce(writeResponse('2026-05-06T00:10:00Z'));
    await useClaudeMdStore.getState().create('user');
    const col = useClaudeMdStore.getState().user;
    expect(col.exists).toBe(true);
    expect(col.content).toBe('');
    expect(col.mtime).toBe('2026-05-06T00:10:00Z');
  });

  // ────────── handleExternalChange matching ──────────

  it('handleExternalChange routes user "CLAUDE.md" to the user column', async () => {
    mockedRead.mockResolvedValueOnce(readResponse('disk-user'));
    useClaudeMdStore.getState().handleExternalChange({
      scope: 'user',
      path: 'CLAUDE.md',
      type: 'modified',
      mtime: '2026-05-06T00:00:00Z',
    });
    // Allow the async callback inside handleExternalChange to flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockedRead).toHaveBeenCalledWith({ scope: 'user', projectSlug: undefined });
  });

  it('handleExternalChange routes project "../CLAUDE.md" to the project column', async () => {
    mockedRead.mockResolvedValueOnce(readResponse('disk-proj'));
    useClaudeMdStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'slug',
      path: '../CLAUDE.md',
      type: 'modified',
      mtime: '2026-05-06T00:00:00Z',
    }, 'slug');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockedRead).toHaveBeenCalledWith({ scope: 'project', projectSlug: 'slug' });
  });

  it('handleExternalChange IGNORES project "CLAUDE.md" (the inner .claude/ sibling)', () => {
    useClaudeMdStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'slug',
      path: 'CLAUDE.md', // NOT the outer one — outer is `../CLAUDE.md`
      type: 'modified',
    }, 'slug');
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it('handleExternalChange IGNORES events for a different projectSlug', () => {
    useClaudeMdStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'other',
      path: '../CLAUDE.md',
      type: 'modified',
    }, 'slug');
    expect(mockedRead).not.toHaveBeenCalled();
  });

  // ────────── copy actions ──────────

  it('copyAppendSections appends source sections to target and writes through', async () => {
    useClaudeMdStore.setState({
      user: {
        content: '# global\n',
        mtime: '2026-05-06T00:00:00Z',
        exists: true,
        absolutePath: '/abs/CLAUDE.md',
        isLoading: false,
        saveAcked: false,
        staleBanner: null,
      },
      project: useClaudeMdStore.getState().project,
    });
    mockedWrite.mockResolvedValueOnce(writeResponse('2026-05-06T00:11:00Z'));
    await useClaudeMdStore.getState().copyAppendSections(
      'toUser',
      [{ heading: '## Alpha', body: 'a' }],
      'slug',
    );
    expect(mockedWrite).toHaveBeenCalledWith(
      { scope: 'user', projectSlug: undefined },
      '# global\n\n## Alpha\na\n',
      '2026-05-06T00:00:00Z',
    );
    expect(useClaudeMdStore.getState().user.content).toBe('# global\n\n## Alpha\na\n');
  });

  it('copyOverwrite writes the source content to the target', async () => {
    useClaudeMdStore.setState({
      user: {
        content: 'global content',
        mtime: '2026-05-06T00:00:00Z',
        exists: true,
        absolutePath: '/abs/user/CLAUDE.md',
        isLoading: false,
        saveAcked: false,
        staleBanner: null,
      },
      project: {
        content: 'project content',
        mtime: '2026-05-06T00:00:00Z',
        exists: true,
        absolutePath: '/abs/project/CLAUDE.md',
        isLoading: false,
        saveAcked: false,
        staleBanner: null,
      },
    });
    mockedWrite.mockResolvedValueOnce(writeResponse('2026-05-06T00:12:00Z'));
    await useClaudeMdStore.getState().copyOverwrite('toUser', 'slug');
    expect(mockedWrite).toHaveBeenCalledWith(
      { scope: 'user', projectSlug: undefined },
      'project content',
      '2026-05-06T00:00:00Z',
    );
    expect(useClaudeMdStore.getState().user.content).toBe('project content');
  });
});
