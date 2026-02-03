/**
 * Projects API - Project list endpoints
 * [Source: Story 3.2 - Task 1]
 * [Extended: Story 3.6 - Task 4: Project creation API]
 */

import { api } from './client';
import type {
  ProjectListResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  ValidatePathResponse,
} from '@bmad-studio/shared';

export const projectsApi = {
  /** List all projects */
  list: () => api.get<ProjectListResponse>('/projects'),

  /** Create a new project */
  create: (data: CreateProjectRequest, options?: { signal?: AbortSignal }) =>
    api.post<CreateProjectResponse>('/projects', data, options),

  /** Validate a directory path */
  validatePath: (path: string, options?: { signal?: AbortSignal }) =>
    api.post<ValidatePathResponse>('/projects/validate-path', { path }, options),
};
