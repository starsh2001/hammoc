/**
 * BmadOverview Tests
 * [Source: Story 12.2 - Task 5.2]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BmadOverview } from '../BmadOverview';
import { useBmadStatus } from '../../hooks/useBmadStatus';
import { useProjectStore } from '../../stores/projectStore';
import type { BmadStatusResponse } from '@hammoc/shared';
import type { ProjectInfo } from '@hammoc/shared';

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

// Mock ProjectOverviewPage
vi.mock('../ProjectOverviewPage.js', () => ({
  ProjectOverviewPage: () => <div data-testid="project-dashboard-page">Base Dashboard</div>,
}));

// Mock uuid
vi.mock('../../utils/uuid.js', () => ({
  generateUUID: () => 'mock-uuid-1234',
}));

// Mock DocumentStatusCard (Story 12.3)
vi.mock('../../components/overview/DocumentStatusCard.js', () => ({
  DocumentStatusCard: () => (
    <div role="region" aria-label="문서 현황">문서 현황</div>
  ),
}));

// Mock EpicProgressCard (Story 12.4)
vi.mock('../../components/overview/EpicProgressCard.js', () => ({
  EpicProgressCard: () => (
    <div role="region" aria-label="에픽 진행률">에픽 진행률</div>
  ),
}));

const mockBmadData: BmadStatusResponse = {
  config: { prdFile: 'docs/prd.md' },
  documents: {
    prd: { exists: true, path: 'docs/prd.md' },
    architecture: { exists: false, path: 'docs/architecture.md' },
    supplementary: [],
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
    isRefreshing: false,
    error: opts.error ?? null,
    retry: mockRetry,
  });
}

describe('BmadOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-BD-1: BMad project renders BMad section + base dashboard
  it('renders BMad section with badge alongside base dashboard for BMad projects', () => {
    setupMocks({ project: bmadProject, data: mockBmadData });

    render(<BmadOverview />);

    expect(screen.getByText('BMad')).toBeInTheDocument();
    expect(screen.getByTestId('project-dashboard-page')).toBeInTheDocument();
  });

  // TC-BD-2: Non-BMad project renders only base dashboard (no BMad section)
  it('renders only base dashboard for non-BMad projects', () => {
    setupMocks({ project: nonBmadProject });

    render(<BmadOverview />);

    expect(screen.getByTestId('project-dashboard-page')).toBeInTheDocument();
    expect(screen.queryByText('BMad')).not.toBeInTheDocument();
  });

  // TC-BD-3: Loading shows BMad skeleton without blocking base dashboard
  it('shows BMad skeleton during loading alongside base dashboard', () => {
    setupMocks({ project: bmadProject, isLoading: true });

    const { container } = render(<BmadOverview />);

    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
    expect(screen.getByTestId('project-dashboard-page')).toBeInTheDocument();
  });

  // TC-BD-4: Error shows inline error without blocking base dashboard
  it('shows inline BMad error alongside base dashboard on error', () => {
    setupMocks({ project: bmadProject, error: '스캔 실패' });

    render(<BmadOverview />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('스캔 실패')).toBeInTheDocument();
    expect(screen.getByTestId('project-dashboard-page')).toBeInTheDocument();
  });

  // TC-BD-5: Retry button calls retry()
  it('calls retry when retry button is clicked', () => {
    setupMocks({ project: bmadProject, error: '에러 발생' });

    render(<BmadOverview />);

    fireEvent.click(screen.getByText('다시 시도'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  // TC-BD-6: Success shows BMad cards with summary
  it('shows document status, epic progress, and summary on success', () => {
    setupMocks({ project: bmadProject, data: mockBmadData });

    render(<BmadOverview />);

    // BMad badge
    expect(screen.getByText('BMad')).toBeInTheDocument();

    // Document status section (mocked DocumentStatusCard)
    expect(screen.getByText('문서 현황')).toBeInTheDocument();

    // Epic progress section (mocked EpicProgressCard)
    expect(screen.getByText('에픽 진행률')).toBeInTheDocument();

    // Summary card: overall progress percentage
    expect(screen.getByText('60%')).toBeInTheDocument();

    // Base dashboard still present
    expect(screen.getByTestId('project-dashboard-page')).toBeInTheDocument();
  });

  // TC-BD-7: BMad section not rendered when data is null (non-BMad)
  it('does not render BMad cards for non-BMad projects', () => {
    setupMocks({ project: nonBmadProject });

    render(<BmadOverview />);

    expect(screen.queryByText('문서 현황')).not.toBeInTheDocument();
    expect(screen.queryByText('에픽 진행률')).not.toBeInTheDocument();
  });

  // TC-BD-8: BMad skeleton visible during loading state
  it('shows skeleton during loading state', () => {
    setupMocks({ project: bmadProject, isLoading: true });

    const { container } = render(<BmadOverview />);

    // Skeleton should render with animate-pulse
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
