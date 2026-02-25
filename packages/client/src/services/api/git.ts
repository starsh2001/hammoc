/**
 * Git API Service
 * Client-side API service for Git operations
 * [Source: Story 16.3 - Task 1]
 */

import { api } from './client.js';
import type {
  GitStatusResponse,
  GitLogResponse,
  GitBranchesResponse,
  GitDiffResponse,
  GitOperationResponse,
} from '@bmad-studio/shared';

export const gitApi = {
  // Read operations (Story 16.1)
  getStatus: (projectSlug: string) =>
    api.get<GitStatusResponse>(`/projects/${projectSlug}/git/status`),

  getLog: (projectSlug: string, limit = 20, offset = 0) =>
    api.get<GitLogResponse>(`/projects/${projectSlug}/git/log?limit=${limit}&offset=${offset}`),

  getBranches: (projectSlug: string) =>
    api.get<GitBranchesResponse>(`/projects/${projectSlug}/git/branches`),

  getDiff: (projectSlug: string, file: string, staged = false) =>
    api.get<GitDiffResponse>(`/projects/${projectSlug}/git/diff?file=${encodeURIComponent(file)}&staged=${staged}`),

  // Write operations (Story 16.2)
  init: (projectSlug: string) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/init`),

  stage: (projectSlug: string, files: string[]) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/stage`, { files }),

  unstage: (projectSlug: string, files: string[]) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/unstage`, { files }),

  commit: (projectSlug: string, message: string) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/commit`, { message }),

  push: (projectSlug: string) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/push`),

  pull: (projectSlug: string) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/pull`),

  checkout: (projectSlug: string, branch: string) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/checkout`, { branch }),

  createBranch: (projectSlug: string, name: string, startPoint?: string) =>
    api.post<GitOperationResponse>(`/projects/${projectSlug}/git/branch`, { name, startPoint }),
};
