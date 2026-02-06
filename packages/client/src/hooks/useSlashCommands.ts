/**
 * useSlashCommands - Fetches and caches slash commands for a project
 * [Source: Story 5.1 - Task 2]
 */

import { useState, useEffect, useCallback } from 'react';
import type { SlashCommand } from '@bmad-studio/shared';
import { commandsApi } from '../services/api/commands';

interface UseSlashCommandsResult {
  commands: SlashCommand[];
  isLoading: boolean;
}

/**
 * Fetch slash commands for a project
 * Falls back to empty array on error (graceful degradation)
 *
 * @param projectSlug Project slug to fetch commands for
 */
export function useSlashCommands(projectSlug?: string): UseSlashCommandsResult {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCommands = useCallback(async (slug: string) => {
    setIsLoading(true);
    try {
      const response = await commandsApi.list(slug);
      setCommands(response.commands);
    } catch (error) {
      console.error('[useSlashCommands] Failed to fetch commands:', error);
      setCommands([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectSlug) {
      fetchCommands(projectSlug);
    } else {
      setCommands([]);
    }
  }, [projectSlug, fetchCommands]);

  return { commands, isLoading };
}
