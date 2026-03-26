/**
 * Queue API Client - REST API for queue runner
 * [Source: Story 15.3 - Task 2]
 */

import { api } from './client';
import type { QueueExecutionState, QueueStoryInfo, QueueTemplate } from '@hammoc/shared';

export const queueApi = {
  getStatus: (projectSlug: string) =>
    api.get<QueueExecutionState>(`/projects/${projectSlug}/queue/status`),

  dismiss: (projectSlug: string) =>
    api.post<void>(`/projects/${projectSlug}/queue/dismiss`),

  // Story 15.5: Template and story extraction
  getStories: (projectSlug: string) =>
    api.get<{ stories: QueueStoryInfo[] }>(`/projects/${projectSlug}/queue/stories`),

  // Project-level templates
  getTemplates: (projectSlug: string) =>
    api.get<QueueTemplate[]>(`/projects/${projectSlug}/queue/templates`),

  saveTemplate: (projectSlug: string, name: string, template: string) =>
    api.post<QueueTemplate>(`/projects/${projectSlug}/queue/templates`, { name, template }),

  updateTemplate: (projectSlug: string, id: string, name: string, template: string) =>
    api.put<QueueTemplate>(`/projects/${projectSlug}/queue/templates/${id}`, { name, template }),

  deleteTemplate: (projectSlug: string, id: string) =>
    api.delete<void>(`/projects/${projectSlug}/queue/templates/${id}`),

  // Global templates
  getGlobalTemplates: (projectSlug: string) =>
    api.get<QueueTemplate[]>(`/projects/${projectSlug}/queue/global-templates`),

  saveGlobalTemplate: (projectSlug: string, name: string, template: string) =>
    api.post<QueueTemplate>(`/projects/${projectSlug}/queue/global-templates`, { name, template }),

  updateGlobalTemplate: (projectSlug: string, id: string, name: string, template: string) =>
    api.put<QueueTemplate>(`/projects/${projectSlug}/queue/global-templates/${id}`, { name, template }),

  deleteGlobalTemplate: (projectSlug: string, id: string) =>
    api.delete<void>(`/projects/${projectSlug}/queue/global-templates/${id}`),
};
