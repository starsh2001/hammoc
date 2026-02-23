/**
 * Queue API Client - REST API for queue runner
 * [Source: Story 15.3 - Task 2]
 */

import { api } from './client';
import type { QueueItem, QueueExecutionState } from '@bmad-studio/shared';

export const queueApi = {
  getStatus: (projectSlug: string) =>
    api.get<QueueExecutionState>(`/projects/${projectSlug}/queue/status`),

  startQueue: (projectSlug: string, items: QueueItem[], sessionId?: string) =>
    api.post<{ queueId: string; totalItems: number }>(
      `/projects/${projectSlug}/queue/start`,
      { items, sessionId }
    ),

  pauseQueue: (projectSlug: string) =>
    api.post<void>(`/projects/${projectSlug}/queue/pause`),

  resumeQueue: (projectSlug: string) =>
    api.post<void>(`/projects/${projectSlug}/queue/resume`),

  abortQueue: (projectSlug: string) =>
    api.post<void>(`/projects/${projectSlug}/queue/abort`),
};
