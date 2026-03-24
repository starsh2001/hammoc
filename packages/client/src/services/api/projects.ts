/**
 * Projects API - Project list endpoints
 * [Source: Story 3.2 - Task 1]
 * [Extended: Story 3.6 - Task 4: Project creation API]
 */

import { api } from './client';
import type {
  ProjectInfo,
  ProjectListResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  ValidatePathResponse,
  BmadVersionsResponse,
  UpdateProjectSettingsRequest,
  ProjectSettingsApiResponse,
} from '@hammoc/shared';

export const projectsApi = {
  /** List all projects */
  list: () => api.get<ProjectListResponse>('/projects'),

  /** Create a new project */
  create: (data: CreateProjectRequest, options?: { signal?: AbortSignal }) =>
    api.post<CreateProjectResponse>('/projects', data, options),

  /** Delete a project. Optionally also deletes project files on disk. */
  delete: (projectSlug: string, deleteFiles = false) =>
    api.delete<DeleteProjectResponse>(`/projects/${projectSlug}${deleteFiles ? '?deleteFiles=true' : ''}`),

  /** Validate a directory path */
  validatePath: (path: string, options?: { signal?: AbortSignal }) =>
    api.post<ValidatePathResponse>('/projects/validate-path', { path }, options),

  /** Setup BMad for an existing non-BMad project */
  setupBmad: (projectSlug: string, bmadVersion?: string) =>
    api.post<{ project: ProjectInfo }>(`/projects/${projectSlug}/setup-bmad`, { bmadVersion }),

  /** List available BMad method versions */
  bmadVersions: () => api.get<BmadVersionsResponse>('/projects/bmad-versions'),

  /** Get project settings with effective (merged) values */
  getSettings: (projectSlug: string) =>
    api.get<ProjectSettingsApiResponse>(`/projects/${projectSlug}/settings`),

  /** Update project settings (.hammoc/settings.json) */
  updateSettings: (projectSlug: string, settings: UpdateProjectSettingsRequest) =>
    api.patch<ProjectSettingsApiResponse>(`/projects/${projectSlug}/settings`, settings),

  /** Get default system prompt template and resolved preview */
  getSystemPrompt: (projectSlug: string) =>
    api.get<{
      template: string;
      resolved: string;
      variables: readonly { name: string; description: string }[];
    }>(`/projects/${projectSlug}/system-prompt`),

  /** Open project root directory in the system's default file explorer (localhost only) */
  openExplorer: (projectSlug: string) =>
    api.post<{ success: boolean }>(`/projects/${projectSlug}/open-explorer`),
};
