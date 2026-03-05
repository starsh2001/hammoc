/**
 * useGitStatus - Git status auto-polling hook
 * [Source: Story 16.3 - Task 3]
 */

import { useEffect, useCallback, useMemo } from 'react';
import type { GitStatusResponse } from '@bmad-studio/shared';
import { useGitStore } from '../stores/gitStore';

const POLL_INTERVAL = 30_000; // 30 seconds

interface UseGitStatusReturn {
  status: GitStatusResponse | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  changedFileCount: number;
}

export function useGitStatus(projectSlug: string | undefined): UseGitStatusReturn {
  const status = useGitStore((s) => s.status);
  const isLoading = useGitStore((s) => s.isLoading);
  const fetchStatus = useGitStore((s) => s.fetchStatus);

  const refresh = useCallback(async () => {
    if (projectSlug) {
      await fetchStatus(projectSlug);
    }
  }, [projectSlug, fetchStatus]);

  // Fetch on mount and auto-poll; clear stale data on project switch
  useEffect(() => {
    if (!projectSlug) return;

    // Clear previous project's data to prevent stale UI
    useGitStore.getState().resetData();

    fetchStatus(projectSlug);
    const intervalId = setInterval(() => {
      fetchStatus(projectSlug);
    }, POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, [projectSlug, fetchStatus]);

  const changedFileCount = useMemo(() => {
    if (!status) return 0;
    return (
      (status.staged?.length ?? 0) +
      (status.unstaged?.length ?? 0) +
      (status.untracked?.length ?? 0)
    );
  }, [status]);

  return { status, isLoading, refresh, changedFileCount };
}
