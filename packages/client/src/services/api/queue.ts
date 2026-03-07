/**
 * Queue API Client - REST API for queue runner
 * [Source: Story 15.3 - Task 2]
 */

import { api } from './client';
import type { QueueExecutionState, QueueStoryInfo, QueueTemplate } from '@bmad-studio/shared';

export const queueApi = {
  getStatus: (projectSlug: string) =>
    api.get<QueueExecutionState>(`/projects/${projectSlug}/queue/status`),

  // Story 15.5: Template and story extraction
  getStories: (projectSlug: string) =>
    api.get<{ stories: QueueStoryInfo[] }>(`/projects/${projectSlug}/queue/stories`),

  getTemplates: (projectSlug: string) =>
    api.get<QueueTemplate[]>(`/projects/${projectSlug}/queue/templates`),

  saveTemplate: (projectSlug: string, name: string, template: string) =>
    api.post<QueueTemplate>(`/projects/${projectSlug}/queue/templates`, { name, template }),

  updateTemplate: (projectSlug: string, id: string, name: string, template: string) =>
    api.put<QueueTemplate>(`/projects/${projectSlug}/queue/templates/${id}`, { name, template }),

  deleteTemplate: (projectSlug: string, id: string) =>
    api.delete<void>(`/projects/${projectSlug}/queue/templates/${id}`),
};
