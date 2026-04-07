/**
 * useSlashCommands - Fetches and caches slash commands for a project
 * [Source: Story 5.1 - Task 2]
 *
 * Uses a module-level cache so HMR remounts don't flash loading states.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SlashCommand, StarCommand } from '@hammoc/shared';
import { toast } from 'sonner';
import { commandsApi } from '../services/api/commands';
import { debugLogger } from '../utils/debugLogger';
import i18n from '../i18n';

interface UseSlashCommandsResult {
  commands: SlashCommand[];
  starCommands: Record<string, StarCommand[]>;
  isLoading: boolean;
  refresh: () => void;
}

// Module-level cache survives HMR remounts.
const cache = new Map<string, { commands: SlashCommand[]; starCommands: Record<string, StarCommand[]> }>();
// Track which projects have already shown warnings (prevent duplicate toasts)
const warnedProjects = new Set<string>();

/**
 * Fetch slash commands for a project
 * Falls back to empty array on error (graceful degradation)
 *
 * @param projectSlug Project slug to fetch commands for
 */
export function useSlashCommands(projectSlug?: string): UseSlashCommandsResult {
  const cached = projectSlug ? cache.get(projectSlug) : undefined;
  const [commands, setCommands] = useState<SlashCommand[]>(cached?.commands ?? []);
  const [starCommands, setStarCommands] = useState<Record<string, StarCommand[]>>(cached?.starCommands ?? {});
  const [isLoading, setIsLoading] = useState(false);

  // Track the latest request so stale responses are discarded (#1, #2)
  const requestIdRef = useRef(0);

  const fetchCommands = useCallback(async (slug: string) => {
    const id = ++requestIdRef.current;

    // Only show loading when there's no cached data.
    if (!cache.has(slug)) {
      setIsLoading(true);
    }
    try {
      const response = await commandsApi.list(slug);
      if (requestIdRef.current !== id) return; // stale — discard
      cache.set(slug, { commands: response.commands, starCommands: response.starCommands ?? {} });
      setCommands(response.commands);
      setStarCommands(response.starCommands ?? {});

      // Show warning toast for missing .claude/commands/ (once per project)
      if (response.warnings?.includes('MISSING_CLAUDE_COMMANDS') && !warnedProjects.has(slug)) {
        warnedProjects.add(slug);
        toast.warning(i18n.t('common:project.missingClaudeCommands'));
      }
    } catch (error) {
      if (requestIdRef.current !== id) return; // stale — discard
      debugLogger.error('Failed to fetch slash commands', { error: error instanceof Error ? error.message : String(error) });
      // Only clear state when there's no cached data to fall back to.
      // Preserves existing commands on transient network failures (e.g. mobile resume).
      const fallback = cache.get(slug);
      if (fallback) {
        setCommands(fallback.commands);
        setStarCommands(fallback.starCommands);
      } else {
        setCommands([]);
        setStarCommands({});
      }
    } finally {
      if (requestIdRef.current === id) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (projectSlug) {
      fetchCommands(projectSlug);
    } else {
      setCommands([]);
      setStarCommands({});
    }
  }, [projectSlug, fetchCommands]);

  // Re-fetch commands when page resumes from background (mobile).
  // Delayed to allow useAppResumeRecovery to reconnect socket and refresh auth first.
  const slugRef = useRef(projectSlug);
  slugRef.current = projectSlug;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const slug = slugRef.current;
      if (!slug) return;
      // Clear any existing timer to prevent duplicate fetches (#3)
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fetchCommands(slug);
      }, 1500);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timer) clearTimeout(timer);
    };
  }, [fetchCommands]);

  const refresh = useCallback(() => {
    const slug = slugRef.current;
    if (slug) fetchCommands(slug);
  }, [fetchCommands]);

  return { commands, starCommands, isLoading, refresh };
}
