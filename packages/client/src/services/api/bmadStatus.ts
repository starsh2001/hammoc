/**
 * BMad Status API Service
 * Client-side API service for BMad project status
 * [Source: Story 12.2 - Task 1]
 */

import { api } from './client.js';
import type { BmadStatusResponse } from '@hammoc/shared';

export const bmadStatusApi = {
  /** Fetch BMad project status (documents, epics, stories) */
  getStatus: (projectSlug: string) =>
    api.get<BmadStatusResponse>(`/projects/${projectSlug}/bmad-status`),
};
