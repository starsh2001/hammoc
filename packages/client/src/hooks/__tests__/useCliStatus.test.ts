import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCliStatus } from '../useCliStatus';
import { api } from '../../services/api/client';

vi.mock('../../services/api/client', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('useCliStatus', () => {
  const mockCliStatus = {
    cliInstalled: true,
    authenticated: true,
    apiKeySet: false,
    setupCommands: {
      install: 'npm install -g @anthropic-ai/claude-code',
      login: 'claude (then type /login in interactive mode)',
      apiKey: 'export ANTHROPIC_API_KEY=<your-api-key>',
    },
  };

  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue(mockCliStatus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should start with loading state', () => {
    const { result } = renderHook(() => useCliStatus());

    expect(result.current.isLoading).toBe(true);
  });

  it('should fetch CLI status on mount', async () => {
    const { result } = renderHook(() => useCliStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/cli-status');
    expect(result.current.cliStatus).toEqual(mockCliStatus);
  });

  it('should return isReady true when cli installed and authenticated', async () => {
    const { result } = renderHook(() => useCliStatus());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  it('should return isReady false when cli not installed', async () => {
    vi.mocked(api.get).mockResolvedValue({
      ...mockCliStatus,
      cliInstalled: false,
    });

    const { result } = renderHook(() => useCliStatus());

    await waitFor(() => {
      expect(result.current.isReady).toBe(false);
    });
  });

  it('should return isReady false when not authenticated', async () => {
    vi.mocked(api.get).mockResolvedValue({
      ...mockCliStatus,
      authenticated: false,
    });

    const { result } = renderHook(() => useCliStatus());

    await waitFor(() => {
      expect(result.current.isReady).toBe(false);
    });
  });

  it('should handle API error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCliStatus());

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.cliStatus).toBeNull();
  });

  it('should refetch status when refetch is called', async () => {
    const { result } = renderHook(() => useCliStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('should skip initial fetch when skip option is true', () => {
    const { result } = renderHook(() => useCliStatus({ skip: true }));

    expect(result.current.isLoading).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });
});
