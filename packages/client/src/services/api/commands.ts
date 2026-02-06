/**
 * Commands API - Slash command list endpoint
 * [Source: Story 5.1 - Task 2]
 */

import { api } from './client';
import type { CommandListResponse } from '@bmad-studio/shared';

export const commandsApi = {
  /** List available slash commands for a project */
  list: (projectSlug: string) =>
    api.get<CommandListResponse>(`/projects/${projectSlug}/commands`),
};
