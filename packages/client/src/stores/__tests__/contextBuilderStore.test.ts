/**
 * Story 31.2 (Task B.3): tests for contextBuilderStore — load, optimistic +
 * debounced whole-manifest save, debounce collapse, STALE_WRITE capture +
 * overwrite retry, external-change routing, disable, secret warning capture,
 * and the approximateTokens / assembledSizeLevel utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiError } from '../../services/api/client';
import { createDefaultContextBuilderManifest } from '@hammoc/shared';

vi.mock('../../services/api/contextBuilderApi', () => ({
  readContextBuilder: vi.fn(),
  saveContextBuilder: vi.fn(),
  disableContextBuilder: vi.fn(),
}));

import {
  readContextBuilder,
  saveContextBuilder,
  disableContextBuilder,
} from '../../services/api/contextBuilderApi';
import {
  useContextBuilderStore,
  approximateTokens,
  TOKEN_APPROXIMATION_IS_HEURISTIC,
  assembledSizeLevel,
  CONTEXT_BUILDER_EXTERNAL_PATH,
  CONTEXT_BUILDER_SOFT_LIMIT_CHARS,
  CONTEXT_BUILDER_HARD_CAP_CHARS,
} from '../contextBuilderStore';

const mockRead = readContextBuilder as unknown as ReturnType<typeof vi.fn>;
const mockSave = saveContextBuilder as unknown as ReturnType<typeof vi.fn>;
const mockDisable = disableContextBuilder as unknown as ReturnType<typeof vi.fn>;

function readResponse(overrides = {}) {
  return {
    manifest: { ...createDefaultContextBuilderManifest(), enabled: true },
    mtime: 'M1',
    scriptExists: true,
    entryRegistered: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useContextBuilderStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('load', () => {
  it('populates manifest + mtime + artifact flags on success', async () => {
    mockRead.mockResolvedValue(readResponse());
    await useContextBuilderStore.getState().load('slug');
    const s = useContextBuilderStore.getState();
    expect(s.manifest.enabled).toBe(true);
    expect(s.mtime).toBe('M1');
    expect(s.scriptExists).toBe(true);
    expect(s.entryRegistered).toBe(true);
    expect(s.error).toBeUndefined();
  });

  it('records an error on failure', async () => {
    mockRead.mockRejectedValue(new ApiError(403, 'HARNESS_FORBIDDEN', 'denied'));
    await useContextBuilderStore.getState().load('slug');
    expect(useContextBuilderStore.getState().error?.code).toBe('HARNESS_FORBIDDEN');
  });
});

describe('mutate (debounced whole-manifest save)', () => {
  it('toggles a variable optimistically and saves once after the debounce', async () => {
    vi.useFakeTimers();
    useContextBuilderStore.setState({ projectSlug: 'slug', mtime: 'M1' });
    mockSave.mockResolvedValue({ mtime: 'M2', scriptPath: '/abs/context-builder.mjs', settingsMtime: 'S2' });

    useContextBuilderStore.getState().toggleVariable('gitBranch', true);
    expect(useContextBuilderStore.getState().manifest.variables.gitBranch).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(useContextBuilderStore.getState().mtime).toBe('M2');
  });

  it('collapses rapid edits into a single save carrying the latest manifest', async () => {
    vi.useFakeTimers();
    useContextBuilderStore.setState({ projectSlug: 'slug', mtime: 'M1' });
    mockSave.mockResolvedValue({ mtime: 'M2', scriptPath: '/abs/x.mjs', settingsMtime: 'S2' });

    const store = useContextBuilderStore.getState();
    store.addFile('a.md');
    store.addFile('b.md');
    store.toggleVariable('today', true);

    await vi.advanceTimersByTimeAsync(300);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const savedManifest = mockSave.mock.calls[0][1];
    expect(savedManifest.files).toEqual(['a.md', 'b.md']);
    expect(savedManifest.variables.today).toBe(true);
  });

  it('captures STALE_WRITE then overwrite-retries with the server mtime', async () => {
    vi.useFakeTimers();
    useContextBuilderStore.setState({ projectSlug: 'slug', mtime: 'M1' });
    mockSave.mockRejectedValueOnce(new ApiError(409, 'HARNESS_STALE_WRITE', 'stale', { currentMtime: 'M9' }));

    useContextBuilderStore.getState().addFile('a.md');
    await vi.advanceTimersByTimeAsync(300);
    expect(useContextBuilderStore.getState().staleConflict?.currentMtime).toBe('M9');

    mockSave.mockResolvedValueOnce({ mtime: 'M10', scriptPath: '', settingsMtime: 'S10' });
    await useContextBuilderStore.getState().resolveStale('overwrite');
    expect(mockSave).toHaveBeenLastCalledWith('slug', expect.objectContaining({ files: ['a.md'] }), 'M9');
    expect(useContextBuilderStore.getState().mtime).toBe('M10');
  });

  it('captures non-blocking secret warnings from the save response (AC5.c)', async () => {
    vi.useFakeTimers();
    useContextBuilderStore.setState({ projectSlug: 'slug', mtime: 'M1' });
    mockSave.mockResolvedValue({ mtime: 'M2', scriptPath: '/abs/x.mjs', settingsMtime: 'S2', secretWarningCommandIndices: [0] });

    useContextBuilderStore.getState().addCustomCommand('echo $TOKEN', true);
    await vi.advanceTimersByTimeAsync(300);
    expect(useContextBuilderStore.getState().secretWarningCommandIndices).toEqual([0]);
  });
});

describe('disable', () => {
  it('calls the disable endpoint and reloads', async () => {
    useContextBuilderStore.setState({ projectSlug: 'slug', mtime: 'M1' });
    mockDisable.mockResolvedValue({ success: true });
    mockRead.mockResolvedValue(readResponse({ manifest: { ...createDefaultContextBuilderManifest(), enabled: false }, scriptExists: false, entryRegistered: false }));

    await useContextBuilderStore.getState().disable();
    expect(mockDisable).toHaveBeenCalledWith('slug', 'M1');
    expect(useContextBuilderStore.getState().manifest.enabled).toBe(false);
    expect(useContextBuilderStore.getState().scriptExists).toBe(false);
  });
});

describe('handleExternalChange', () => {
  it('flags only the matching manifest path', () => {
    useContextBuilderStore.setState({ projectSlug: 'slug' });
    useContextBuilderStore.getState().handleExternalChange({ scope: 'project', projectSlug: 'slug', path: '../CLAUDE.md', type: 'modified' });
    expect(useContextBuilderStore.getState().externalChangePending).toBe(false);
    useContextBuilderStore.getState().handleExternalChange({ scope: 'project', projectSlug: 'slug', path: CONTEXT_BUILDER_EXTERNAL_PATH, type: 'modified' });
    expect(useContextBuilderStore.getState().externalChangePending).toBe(true);
  });
});

describe('approximateTokens / assembledSizeLevel (AC4.b/4.c · Story 31.3 AC-B2.b)', () => {
  it('estimates tokens as ceil(byteSize / 4) — byte-based heuristic, positional input unchanged', () => {
    // Story 31.3 F.1: the parameter is bytes (renamed charCount→byteSize); the
    // positional call site is unchanged and the size/4 behavior is preserved.
    expect(approximateTokens(0)).toBe(0);
    expect(approximateTokens(10)).toBe(3);
    expect(approximateTokens(4000)).toBe(1000);
  });

  it('remains a permanent heuristic (not promoted to a tokenizer — AC-B2.b)', () => {
    // The inline approximation is NEVER upgraded in place (no text at the call
    // site); tokenizer-grade precision is the server count_tokens path instead.
    expect(TOKEN_APPROXIMATION_IS_HEURISTIC).toBe(true);
  });

  it('classifies assembled size against the soft/hard caps', () => {
    expect(assembledSizeLevel(0)).toBe('ok');
    expect(assembledSizeLevel(CONTEXT_BUILDER_SOFT_LIMIT_CHARS - 1)).toBe('ok');
    expect(assembledSizeLevel(CONTEXT_BUILDER_SOFT_LIMIT_CHARS)).toBe('warn');
    expect(assembledSizeLevel(CONTEXT_BUILDER_HARD_CAP_CHARS)).toBe('over');
  });
});
