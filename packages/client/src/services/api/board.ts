/**
 * Board API Service
 * Client-side API service for Board operations
 * [Source: Story 21.2 - Task 1]
 */

import { api } from './client.js';
import type {
  BoardResponse,
  BoardItem,
  CreateIssueRequest,
  UpdateIssueRequest,
} from '@bmad-studio/shared';

export const boardApi = {
  getBoard: (projectSlug: string) =>
    api.get<BoardResponse>(`/projects/${projectSlug}/board`),

  createIssue: (projectSlug: string, data: CreateIssueRequest) =>
    api.post<BoardItem>(`/projects/${projectSlug}/board/issues`, data),

  updateIssue: (projectSlug: string, issueId: string, data: UpdateIssueRequest) =>
    api.patch<BoardItem>(`/projects/${projectSlug}/board/issues/${issueId}`, data),

  deleteIssue: (projectSlug: string, issueId: string) =>
    api.delete<{ message: string }>(`/projects/${projectSlug}/board/issues/${issueId}`),

  normalizeStoryStatus: (projectSlug: string, storyNum: string) =>
    api.post<{ status: string }>(`/projects/${projectSlug}/board/stories/${storyNum}/normalize-status`),
};
