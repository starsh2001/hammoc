/**
 * useBmadStatus Hook Tests
 * [Source: Story 12.2 - Task 5.1]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBmadStatus } from '../useBmadStatus';
import { bmadStatusApi } from '../../services/api/bmadStatus';
import { ApiError } from '../../services/api/client';
import type { BmadStatusResponse } from '@bmad-studio/shared';

vi.mock('../../services/api/bmadStatus.js', () => ({
  bmadStatusApi: {
    getStatus: vi.fn(),
  },
}));

const mockData: BmadStatusResponse = {
  config: { prdFile: 'docs/prd.md' },
  documents: {
    prd: { exists: true, path: 'docs/prd.md' },
    architecture: { exists: true, path: 'docs/architecture.md' },
  },
  auxiliaryDocuments: [{ type: 'stories', path: 'docs/stories', fileCount: 5 }],
  epics: [
    {
      number: 1,
      name: 'Setup',
      stories: [
        { file: '1.1.story.md', status: 'Done' },
        { file: '1.2.story.md', status: 'In Progress' },
      ],
    },
  ],
};

describe('useBmadStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-BH-1: Mount triggers getStatus call
  it('calls bmadStatusApi.getStatus on mount', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockResolvedValue(mockData);

    const { result } = renderHook(() => useBmadStatus('test-project'));

    expect(bmadStatusApi.getStatus).toHaveBeenCalledWith('test-project');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  // TC-BH-2: Loading state management
  it('sets isLoading true initially, then false after fetch completes', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockResolvedValue(mockData);

    const { result } = renderHook(() => useBmadStatus('test-project'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  // TC-BH-3: Success sets data
  it('sets data on successful fetch', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockResolvedValue(mockData);

    const { result } = renderHook(() => useBmadStatus('test-project'));

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });
    expect(result.current.error).toBeNull();
  });

  // TC-BH-4: Error sets error message
  it('sets error message on ApiError', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockRejectedValue(
      new ApiError(500, 'SCAN_ERROR', '프로젝트 스캔 중 오류가 발생했습니다.'),
    );

    const { result } = renderHook(() => useBmadStatus('test-project'));

    await waitFor(() => {
      expect(result.current.error).toBe('프로젝트 스캔 중 오류가 발생했습니다.');
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('sets default error message on non-ApiError', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useBmadStatus('test-project'));

    await waitFor(() => {
      expect(result.current.error).toBe(
        'BMad 프로젝트 현황을 불러오는 중 오류가 발생했습니다.',
      );
    });
  });

  // TC-BH-5: retry resets error and refetches
  it('retries fetch when retry is called', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockRejectedValueOnce(
      new ApiError(500, 'SCAN_ERROR', '스캔 오류'),
    );

    const { result } = renderHook(() => useBmadStatus('test-project'));

    await waitFor(() => {
      expect(result.current.error).toBe('스캔 오류');
    });

    vi.mocked(bmadStatusApi.getStatus).mockResolvedValueOnce(mockData);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
    });
    expect(bmadStatusApi.getStatus).toHaveBeenCalledTimes(2);
  });

  // TC-BH-6: Refetches when projectSlug changes
  it('refetches when projectSlug changes', async () => {
    vi.mocked(bmadStatusApi.getStatus).mockResolvedValue(mockData);

    const { rerender } = renderHook(
      ({ slug }) => useBmadStatus(slug),
      { initialProps: { slug: 'project-a' as string | undefined } },
    );

    await waitFor(() => {
      expect(bmadStatusApi.getStatus).toHaveBeenCalledWith('project-a');
    });

    rerender({ slug: 'project-b' });

    await waitFor(() => {
      expect(bmadStatusApi.getStatus).toHaveBeenCalledWith('project-b');
    });
    expect(bmadStatusApi.getStatus).toHaveBeenCalledTimes(2);
  });

  it('skips fetch when projectSlug is undefined', () => {
    const { result } = renderHook(() => useBmadStatus(undefined));

    expect(bmadStatusApi.getStatus).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });
});
