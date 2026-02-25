/**
 * useSlashCommands - Fetches and caches slash commands for a project
 * [Source: Story 5.1 - Task 2]
 *
 * Uses a module-level cache so HMR remounts don't flash loading states.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SlashCommand, StarCommand } from '@bmad-studio/shared';
import { commandsApi } from '../services/api/commands';
import { debugLogger } from '../utils/debugLogger';

interface UseSlashCommandsResult {
  commands: SlashCommand[];
  starCommands: Record<string, StarCommand[]>;
  isLoading: boolean;
}

// Module-level cache survives HMR remounts.
const cache = new Map<string, { commands: SlashCommand[]; starCommands: Record<string, StarCommand[]> }>();

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

  const fetchCommands = useCallback(async (slug: string) => {
    // Only show loading when there's no cached data.
    if (!cache.has(slug)) {
      setIsLoading(true);
    }
    try {
      const response = await commandsApi.list(slug);
      cache.set(slug, { commands: response.commands, starCommands: response.starCommands ?? {} });
      setCommands(response.commands);
      setStarCommands(response.starCommands ?? {});
    } catch (error) {
      debugLogger.error('Failed to fetch slash commands', { error: error instanceof Error ? error.message : String(error) });
      setCommands([]);
      setStarCommands({});
    } finally {
      setIsLoading(false);
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

  return { commands, starCommands, isLoading };
}
