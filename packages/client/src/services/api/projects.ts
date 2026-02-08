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
} from '@bmad-studio/shared';

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
};
