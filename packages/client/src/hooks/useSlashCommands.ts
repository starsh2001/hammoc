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
 * Story 28.5: Externally invalidate the slash-command response cache.
 *
 * The harness command workbench mutates `.claude/commands/**\/*.md` files via
 * REST. Without explicit invalidation those mutations would not show up in the
 * chat slash palette until the next visibility-change trigger (1.5s) or page
 * reload. Pair this call with the global `hammoc:slashCommandsChanged` event
 * (dispatched by `harnessCommandStore` and the workbench components) so any
 * mounted `useSlashCommands` hook re-fetches fresh data on the next palette
 * open.
 *
 * @param slug Project slug to invalidate. Pass `undefined` to clear everything.
 */
export function invalidateSlashCommandsCache(slug?: string): void {
  if (slug === undefined) {
    cache.clear();
    return;
  }
  cache.delete(slug);
}

export const SLASH_COMMANDS_CHANGED_EVENT = 'hammoc:slashCommandsChanged';

interface SlashCommandsChangedDetail {
  projectSlug?: string;
}

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

  // Story 28.5: react to harness workbench mutations dispatched by the
  // harnessCommandStore (load / copy / external file change) — `cache` is
  // cleared by the dispatcher via `invalidateSlashCommandsCache`, so this
  // handler just kicks a fresh fetch when the slug matches.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SlashCommandsChangedDetail>).detail ?? {};
      const slug = slugRef.current;
      if (!slug) return;
      if (detail.projectSlug !== undefined && detail.projectSlug !== slug) return;
      fetchCommands(slug);
    };
    window.addEventListener(SLASH_COMMANDS_CHANGED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(SLASH_COMMANDS_CHANGED_EVENT, handler as EventListener);
    };
  }, [fetchCommands]);

  return { commands, starCommands, isLoading, refresh };
}
