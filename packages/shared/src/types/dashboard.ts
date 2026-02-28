// Story 20.1: Dashboard status aggregation types

export interface DashboardProjectStatus {
  projectSlug: string;
  activeSessionCount: number;
  totalSessionCount: number;
  queueStatus: 'idle' | 'running' | 'paused' | 'error';
  terminalCount: number;
}

export interface DashboardStatusResponse {
  projects: DashboardProjectStatus[];
}

export interface DashboardStatusChangeEvent {
  projectSlug: string;
  status: DashboardProjectStatus;
}
