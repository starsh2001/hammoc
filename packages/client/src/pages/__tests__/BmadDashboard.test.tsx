/**
 * BmadDashboard Tests
 * [Source: Story 12.2 - Task 5.2]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BmadDashboard } from '../BmadDashboard';
import { useBmadStatus } from '../../hooks/useBmadStatus';
import { useProjectStore } from '../../stores/projectStore';
import type { BmadStatusResponse } from '@bmad-studio/shared';
import type { ProjectInfo } from '@bmad-studio/shared';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectSlug: 'test-slug' }),
    useNavigate: () => mockNavigate,
  };
});

// Mock hooks and stores
vi.mock('../../hooks/useBmadStatus.js');
vi.mock('../../stores/projectStore.js');

// Mock ProjectDashboardPage
vi.mock('../ProjectDashboardPage.js', () => ({
  ProjectDashboardPage: () => <div data-testid="project-dashboard-page">Non-BMad Dashboard</div>,
}));

// Mock uuid
vi.mock('../../utils/uuid.js', () => ({
  generateUUID: () => 'mock-uuid-1234',
}));

// Mock DocumentStatusCard (Story 12.3)
vi.mock('../../components/dashboard/DocumentStatusCard.js', () => ({
  DocumentStatusCard: () => (
    <div role="region" aria-label="문서 현황">문서 현황</div>
  ),
}));

// Mock EpicProgressCard (Story 12.4)
vi.mock('../../components/dashboard/EpicProgressCard.js', () => ({
  EpicProgressCard: () => (
    <div role="region" aria-label="에픽 진행률">에픽 진행률</div>
  ),
}));

const mockBmadData: BmadStatusResponse = {
  config: { prdFile: 'docs/prd.md' },
  documents: {
    prd: { exists: true, path: 'docs/prd.md' },
    architecture: { exists: false, path: 'docs/architecture.md' },
  },
  auxiliaryDocuments: [{ type: 'stories', path: 'docs/stories', fileCount: 3 }],
  epics: [
    {
      number: 1,
      name: 'Foundation',
      stories: [
        { file: '1.1.story.md', status: 'Done' },
        { file: '1.2.story.md', status: 'Done' },
        { file: '1.3.story.md', status: 'In Progress' },
      ],
    },
    {
      number: 2,
      name: 'Chat',
      stories: [
        { file: '2.1.story.md', status: 'Done' },
        { file: '2.2.story.md', status: 'Approved' },
      ],
    },
  ],
};

const bmadProject: ProjectInfo = {
  originalPath: '/Users/user/my-bmad-project',
  projectSlug: 'test-slug',
  sessionCount: 3,
  lastModified: '2026-02-22T10:00:00Z',
  isBmadProject: true,
};

const nonBmadProject: ProjectInfo = {
  originalPath: '/Users/user/plain-project',
  projectSlug: 'test-slug',
  sessionCount: 1,
  lastModified: '2026-02-22T10:00:00Z',
  isBmadProject: false,
};

const mockRetry = vi.fn();

function setupMocks(opts: {
  project: ProjectInfo;
  data?: BmadStatusResponse | null;
  isLoading?: boolean;
  error?: string | null;
}) {
  vi.mocked(useProjectStore).mockReturnValue({
    projects: [opts.project],
  } as ReturnType<typeof useProjectStore>);

  vi.mocked(useBmadStatus).mockReturnValue({
    data: opts.data ?? null,
    isLoading: opts.isLoading ?? false,
    error: opts.error ?? null,
    retry: mockRetry,
  });
}

describe('BmadDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-BD-1: BMad project renders BMad dashboard
  it('renders BMad dashboard for BMad projects', () => {
    setupMocks({ project: bmadProject, data: mockBmadData });

    render(<BmadDashboard />);

    expect(screen.getByText('my-bmad-project')).toBeInTheDocument();
    expect(screen.getByText('BMad')).toBeInTheDocument();
    expect(screen.queryByTestId('project-dashboard-page')).not.toBeInTheDocument();
  });

  // TC-BD-2: Non-BMad project renders ProjectDashboardPage
  it('renders ProjectDashboardPage for non-BMad projects', () => {
    setupMocks({ project: nonBmadProject });

    render(<BmadDashboard />);

    expect(screen.getByTestId('project-dashboard-page')).toBeInTheDocument();
    expect(screen.queryByText('BMad')).not.toBeInTheDocument();
  });

  // TC-BD-3: Loading shows skeleton
  it('shows skeleton UI during loading', () => {
    setupMocks({ project: bmadProject, isLoading: true });

    const { container } = render(<BmadDashboard />);

    // Skeleton should have animate-pulse elements
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
    // Project name is shown even during loading
    expect(screen.getByText('my-bmad-project')).toBeInTheDocument();
  });

  // TC-BD-4: Error shows error message and retry button
  it('shows error message and retry button on error', () => {
    setupMocks({ project: bmadProject, error: '스캔 실패' });

    render(<BmadDashboard />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('스캔 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  // TC-BD-5: Retry button calls retry()
  it('calls retry when retry button is clicked', () => {
    setupMocks({ project: bmadProject, error: '에러 발생' });

    render(<BmadDashboard />);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  // TC-BD-6: Success shows document, epic, and quick action sections
  it('shows document status, epic progress, and quick action sections on success', () => {
    setupMocks({ project: bmadProject, data: mockBmadData });

    render(<BmadDashboard />);

    // Document status section (mocked DocumentStatusCard)
    expect(screen.getByText('문서 현황')).toBeInTheDocument();

    // Epic progress section (mocked EpicProgressCard)
    expect(screen.getByText('에픽 진행률')).toBeInTheDocument();

    // Epic summary in header
    expect(screen.getByText(/에픽 2개 · 스토리 3\/5 Done/)).toBeInTheDocument();

    // Quick actions section
    expect(screen.getByText('빠른 시작')).toBeInTheDocument();
    expect(screen.getByText('새 세션 시작')).toBeInTheDocument();
    expect(screen.getByText('세션 목록')).toBeInTheDocument();
  });

  it('navigates to new session on "새 세션 시작" click', () => {
    setupMocks({ project: bmadProject, data: mockBmadData });

    render(<BmadDashboard />);

    fireEvent.click(screen.getByText('새 세션 시작'));
    expect(mockNavigate).toHaveBeenCalledWith('/project/test-slug/session/mock-uuid-1234');
  });

  it('navigates to sessions list on "세션 목록" click', () => {
    setupMocks({ project: bmadProject, data: mockBmadData });

    render(<BmadDashboard />);

    fireEvent.click(screen.getByText('세션 목록'));
    expect(mockNavigate).toHaveBeenCalledWith('/project/test-slug/sessions');
  });
});
