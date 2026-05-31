/**
 * Story 31.1: Tests for bmadCoreConfigStore — load, debounced patchKey,
 * STALE_WRITE → staleConflict capture + overwrite retry, mode toggle, and
 * external-change routing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiError } from '../../services/api/client';

vi.mock('../../services/api/bmadCoreConfigApi', () => ({
  readBmadConfig: vi.fn(),
  patchBmadConfig: vi.fn(),
  writeRawBmadConfig: vi.fn(),
}));

import {
  readBmadConfig,
  patchBmadConfig,
  writeRawBmadConfig,
} from '../../services/api/bmadCoreConfigApi';
import { useBmadCoreConfigStore } from '../bmadCoreConfigStore';

const mockRead = readBmadConfig as unknown as ReturnType<typeof vi.fn>;
const mockPatch = patchBmadConfig as unknown as ReturnType<typeof vi.fn>;
const mockWriteRaw = writeRawBmadConfig as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  useBmadCoreConfigStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('load', () => {
  it('populates known/unknown keys + mtime on success', async () => {
    mockRead.mockResolvedValue({
      content: 'devStoryLocation: docs/stories\n',
      mtime: 'M1',
      knownKeys: { devStoryLocation: 'docs/stories' },
      unknownKeys: { customFooBar: 'hello' },
    });
    await useBmadCoreConfigStore.getState().load('slug');
    const s = useBmadCoreConfigStore.getState();
    expect(s.knownKeys.devStoryLocation).toBe('docs/stories');
    expect(s.unknownKeys).toEqual({ customFooBar: 'hello' });
    expect(s.mtime).toBe('M1');
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeUndefined();
  });

  it('records an error on failure', async () => {
    mockRead.mockRejectedValue(new ApiError(404, 'HARNESS_FILE_NOT_FOUND', 'not found'));
    await useBmadCoreConfigStore.getState().load('slug');
    const s = useBmadCoreConfigStore.getState();
    expect(s.error?.code).toBe('HARNESS_FILE_NOT_FOUND');
    expect(s.isLoading).toBe(false);
  });
});

describe('patchKey (debounced)', () => {
  it('updates the value optimistically and calls the API once after the debounce', async () => {
    vi.useFakeTimers();
    useBmadCoreConfigStore.setState({ projectSlug: 'slug', mtime: 'M1', knownKeys: {} });
    mockPatch.mockResolvedValue({ mtime: 'M2' });

    useBmadCoreConfigStore.getState().patchKey(['devStoryLocation'], 'docs/v2-stories');
    // Optimistic: reflected immediately, no API call yet.
    expect(useBmadCoreConfigStore.getState().knownKeys.devStoryLocation).toBe('docs/v2-stories');
    expect(mockPatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith('slug', [{ path: ['devStoryLocation'], value: 'docs/v2-stories' }], 'M1');
    expect(useBmadCoreConfigStore.getState().mtime).toBe('M2');
  });

  it('collapses rapid edits of the same key into a single op', async () => {
    vi.useFakeTimers();
    useBmadCoreConfigStore.setState({ projectSlug: 'slug', mtime: 'M1', knownKeys: {} });
    mockPatch.mockResolvedValue({ mtime: 'M2' });

    const patchKey = useBmadCoreConfigStore.getState().patchKey;
    patchKey(['slashPrefix'], 'B');
    patchKey(['slashPrefix'], 'BM');
    patchKey(['slashPrefix'], 'BMad');

    await vi.advanceTimersByTimeAsync(300);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith('slug', [{ path: ['slashPrefix'], value: 'BMad' }], 'M1');
  });

  it('captures a STALE_WRITE conflict with the pending ops for retry', async () => {
    vi.useFakeTimers();
    useBmadCoreConfigStore.setState({ projectSlug: 'slug', mtime: 'M1', knownKeys: {} });
    mockPatch.mockRejectedValue(new ApiError(409, 'HARNESS_STALE_WRITE', 'stale', { currentMtime: 'M9' }));

    useBmadCoreConfigStore.getState().patchKey(['slashPrefix'], 'X');
    await vi.advanceTimersByTimeAsync(300);

    const s = useBmadCoreConfigStore.getState();
    expect(s.staleConflict?.currentMtime).toBe('M9');
    expect(s.staleConflict?.pendingOps).toEqual([{ path: ['slashPrefix'], value: 'X' }]);
  });
});

describe('setMode', () => {
  it('toggles between form and raw', () => {
    expect(useBmadCoreConfigStore.getState().mode).toBe('form');
    useBmadCoreConfigStore.getState().setMode('raw');
    expect(useBmadCoreConfigStore.getState().mode).toBe('raw');
  });
});

describe('handleExternalChange', () => {
  it('flags externalChangePending for the matching core-config path', () => {
    useBmadCoreConfigStore.setState({ projectSlug: 'slug' });
    useBmadCoreConfigStore.getState().handleExternalChange({
      scope: 'project',
      projectSlug: 'slug',
      path: '../.bmad-core/core-config.yaml',
      type: 'modified',
    });
    expect(useBmadCoreConfigStore.getState().externalChangePending).toBe(true);
  });

  it('ignores non-matching paths and other projects', () => {
    useBmadCoreConfigStore.setState({ projectSlug: 'slug' });
    const handle = useBmadCoreConfigStore.getState().handleExternalChange;
    handle({ scope: 'project', projectSlug: 'slug', path: '../CLAUDE.md', type: 'modified' });
    handle({ scope: 'project', projectSlug: 'other', path: '../.bmad-core/core-config.yaml', type: 'modified' });
    expect(useBmadCoreConfigStore.getState().externalChangePending).toBe(false);
  });
});

describe('resolveStale', () => {
  it('overwrite retries the captured ops with the server mtime', async () => {
    useBmadCoreConfigStore.setState({
      projectSlug: 'slug',
      staleConflict: { currentMtime: 'M9', pendingOps: [{ path: ['slashPrefix'], value: 'X' }] },
    });
    mockPatch.mockResolvedValue({ mtime: 'M10' });

    await useBmadCoreConfigStore.getState().resolveStale('overwrite');

    expect(mockPatch).toHaveBeenCalledWith('slug', [{ path: ['slashPrefix'], value: 'X' }], 'M9');
    const s = useBmadCoreConfigStore.getState();
    expect(s.mtime).toBe('M10');
    expect(s.staleConflict).toBeUndefined();
  });

  it('reload discards the conflict and re-reads', async () => {
    useBmadCoreConfigStore.setState({
      projectSlug: 'slug',
      staleConflict: { currentMtime: 'M9', pendingOps: [{ path: ['slashPrefix'], value: 'X' }] },
    });
    mockRead.mockResolvedValue({ content: '', mtime: 'M9', knownKeys: {}, unknownKeys: {} });

    await useBmadCoreConfigStore.getState().resolveStale('reload');

    expect(mockRead).toHaveBeenCalledWith('slug');
    expect(useBmadCoreConfigStore.getState().staleConflict).toBeUndefined();
    expect(mockWriteRaw).not.toHaveBeenCalled();
  });
});
