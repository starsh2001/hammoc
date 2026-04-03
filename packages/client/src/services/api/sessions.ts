/**
 * Sessions API - Session list and history endpoints
 * [Source: Story 3.4 - Task 1, Story 3.5 - Task 4]
 */

import { api } from './client';
import type { SessionListResponse, SessionListParams, DeleteSessionResponse, DeleteSessionsBatchResponse, UpdateSessionNameResponse, PromptHistoryData } from '@hammoc/shared';

export const sessionsApi = {
  /**
   * List all sessions for a project
   */
  list: (projectSlug: string, options?: SessionListParams) => {
    const params = new URLSearchParams();
    if (options?.includeEmpty) params.set('includeEmpty', 'true');
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.query) params.set('query', options.query);
    if (options?.searchContent) params.set('searchContent', 'true');
    const qs = params.toString();
    return api.get<SessionListResponse>(`/projects/${projectSlug}/sessions${qs ? `?${qs}` : ''}`);
  },

  /** Delete a single session */
  delete: (projectSlug: string, sessionId: string) =>
    api.delete<DeleteSessionResponse>(`/projects/${projectSlug}/sessions/${sessionId}`),

  /** Delete multiple sessions at once */
  deleteBatch: (projectSlug: string, sessionIds: string[]) =>
    api.post<DeleteSessionsBatchResponse>(`/projects/${projectSlug}/sessions/delete-batch`, { sessionIds }),

  /** Update or remove a session's custom name */
  updateName: (projectSlug: string, sessionId: string, name: string | null) =>
    api.patch<UpdateSessionNameResponse>(`/projects/${projectSlug}/sessions/${sessionId}/name`, { name }),

  /** Get prompt history for a session */
  getPromptHistory: (projectSlug: string, sessionId: string) =>
    api.get<PromptHistoryData>(`/projects/${projectSlug}/sessions/${sessionId}/prompt-history`),

  /** Save prompt history for a session */
  savePromptHistory: (projectSlug: string, sessionId: string, data: PromptHistoryData) =>
    api.put<void>(`/projects/${projectSlug}/sessions/${sessionId}/prompt-history`, data),
};
