/**
 * Commands API - Slash command list endpoint
 * [Source: Story 5.1 - Task 2]
 */

import { api } from './client';
import type { CommandsResponse } from '@hammoc/shared';

export const commandsApi = {
  /** List available slash commands for a project */
  list: (projectSlug: string) =>
    api.get<CommandsResponse>(`/projects/${projectSlug}/commands`),
};
