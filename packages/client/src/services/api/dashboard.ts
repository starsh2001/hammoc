/**
 * Dashboard API - Dashboard status endpoints
 * [Source: Story 20.3 - Task 1]
 */

import type { DashboardStatusResponse } from '@hammoc/shared';
import { api } from './client';

export const dashboardApi = {
  /** Get aggregated dashboard status for all projects */
  getStatus: () => api.get<DashboardStatusResponse>('/dashboard/status'),
};
