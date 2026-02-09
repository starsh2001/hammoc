/**
 * Sessions API - Session list and history endpoints
 * [Source: Story 3.4 - Task 1, Story 3.5 - Task 4]
 */

import { api } from './client';
import type { SessionListResponse, HistoryMessagesResponse, DeleteSessionResponse, DeleteSessionsBatchResponse } from '@bmad-studio/shared';

export const sessionsApi = {
  /**
   * List all sessions for a project
   */
  list: (projectSlug: string) =>
    api.get<SessionListResponse>(`/projects/${projectSlug}/sessions`),

  /**
   * Get session messages with pagination
   * [Source: Story 3.5 - Task 4]
   *
   * @param projectSlug The project slug
   * @param sessionId The session ID
   * @param options Pagination options (limit, offset)
   */
  getMessages: (
    projectSlug: string,
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `/projects/${projectSlug}/sessions/${sessionId}/messages${
      queryString ? `?${queryString}` : ''
    }`;

    return api.get<HistoryMessagesResponse>(url);
  },

  /** Delete a single session */
  delete: (projectSlug: string, sessionId: string) =>
    api.delete<DeleteSessionResponse>(`/projects/${projectSlug}/sessions/${sessionId}`),

  /** Delete multiple sessions at once */
  deleteBatch: (projectSlug: string, sessionIds: string[]) =>
    api.post<DeleteSessionsBatchResponse>(`/projects/${projectSlug}/sessions/delete-batch`, { sessionIds }),
};
