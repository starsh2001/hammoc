/**
 * useGitStatus Hook Tests
 * [Source: Story 16.3 - Task 8.1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGitStatus } from '../useGitStatus';
import { useGitStore } from '../../stores/gitStore';

const mockStatus = {
  initialized: true,
  branch: 'main',
  ahead: 2,
  behind: 1,
  staged: [
    { path: 'src/index.ts', index: 'M', working_dir: ' ' },
    { path: 'src/new-file.ts', index: 'A', working_dir: ' ' },
  ],
  unstaged: [
    { path: 'src/utils.ts', index: ' ', working_dir: 'M' },
  ],
  untracked: ['src/temp.ts', 'notes.md'],
};

describe('useGitStatus', () => {
  let mockFetchStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchStatus = vi.fn().mockResolvedValue(undefined);
    useGitStore.setState({
      status: null,
      isLoading: false,
      error: null,
      commits: [],
      branches: null,
      fetchStatus: mockFetchStatus,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // TC-GIT-H1: Calls fetchStatus on mount
  it('calls gitStore.fetchStatus on mount with projectSlug', () => {
    renderHook(() => useGitStatus('test-project'));
    expect(mockFetchStatus).toHaveBeenCalledWith('test-project');
  });

  // TC-GIT-H2: Auto-polls every 30 seconds
  it('auto-polls every 30 seconds via setInterval', () => {
    renderHook(() => useGitStatus('test-project'));
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(30000); });
    expect(mockFetchStatus).toHaveBeenCalledTimes(2);

    act(() => { vi.advanceTimersByTime(30000); });
    expect(mockFetchStatus).toHaveBeenCalledTimes(3);
  });

  // TC-GIT-H3: Cleans up interval on unmount
  it('clears interval on unmount', () => {
    const { unmount } = renderHook(() => useGitStatus('test-project'));
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);

    unmount();

    act(() => { vi.advanceTimersByTime(60000); });
    // No additional calls after unmount
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);
  });

  // TC-GIT-H4: Computes changedFileCount correctly
  it('computes changedFileCount as staged + unstaged + untracked', () => {
    useGitStore.setState({ status: mockStatus } as any);
    const { result } = renderHook(() => useGitStatus('test-project'));
    // 2 staged + 1 unstaged + 2 untracked = 5
    expect(result.current.changedFileCount).toBe(5);
  });

  // TC-GIT-H5: Returns changedFileCount = 0 when status is null
  it('returns changedFileCount = 0 when status is null', () => {
    useGitStore.setState({ status: null } as any);
    const { result } = renderHook(() => useGitStatus('test-project'));
    expect(result.current.changedFileCount).toBe(0);
  });

  // TC-GIT-H6: refresh() calls fetchStatus manually
  it('refresh() calls gitStore.fetchStatus', async () => {
    const { result } = renderHook(() => useGitStatus('test-project'));
    mockFetchStatus.mockClear();

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockFetchStatus).toHaveBeenCalledWith('test-project');
  });

  // TC-GIT-H7: Resets interval when projectSlug changes
  it('resets interval when projectSlug changes', () => {
    const { rerender } = renderHook(
      ({ slug }: { slug: string }) => useGitStatus(slug),
      { initialProps: { slug: 'project-a' } },
    );
    expect(mockFetchStatus).toHaveBeenCalledWith('project-a');

    mockFetchStatus.mockClear();
    rerender({ slug: 'project-b' });
    expect(mockFetchStatus).toHaveBeenCalledWith('project-b');

    // Old interval should be cleared, new one active
    mockFetchStatus.mockClear();
    act(() => { vi.advanceTimersByTime(30000); });
    expect(mockFetchStatus).toHaveBeenCalledWith('project-b');
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);
  });

  // No polling when projectSlug is undefined
  it('does not poll when projectSlug is undefined', () => {
    renderHook(() => useGitStatus(undefined));
    expect(mockFetchStatus).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });
});
