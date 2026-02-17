/**
 * ProjectListPage Tests
 * [Source: Story 3.2 - Task 4]
 * [Extended: Story 3.6 - Task 7: New project dialog integration]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ProjectListPage } from '../ProjectListPage';
import { useProjectStore } from '../../stores/projectStore';
import type { ProjectInfo } from '@bmad-studio/shared';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the project store
vi.mock('../../stores/projectStore');

// Mock NewProjectDialog - capture props for testing
let capturedDialogProps: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectSlug: string, isExisting: boolean) => void;
} | null = null;

vi.mock('../../components/NewProjectDialog', () => ({
  NewProjectDialog: (props: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (projectSlug: string, isExisting: boolean) => void;
  }) => {
    capturedDialogProps = props;
    return props.isOpen ? (
      <div data-testid="new-project-dialog">
        <button onClick={props.onClose}>닫기</button>
        <button onClick={() => props.onSuccess('new-project-slug', false)}>새 프로젝트 생성</button>
        <button onClick={() => props.onSuccess('existing-slug', true)}>기존 프로젝트</button>
      </div>
    ) : null;
  },
}));

describe('ProjectListPage', () => {
  const mockProjects: ProjectInfo[] = [
    {
      originalPath: '/Users/user/my-project',
      projectSlug: 'abc123',
      sessionCount: 5,
      lastModified: '2026-02-01T10:00:00Z',
      isBmadProject: true,
    },
    {
      originalPath: '/Users/user/another-project',
      projectSlug: 'def456',
      sessionCount: 2,
      lastModified: '2026-01-31T15:00:00Z',
      isBmadProject: false,
    },
  ];

  const mockFetchProjects = vi.fn();
  const mockClearError = vi.fn();

  // Helper to create mock store state with defaults
  const createMockState = (overrides: Partial<ReturnType<typeof useProjectStore>> = {}) => ({
    projects: [] as ProjectInfo[],
    isLoading: false,
    error: null,
    fetchProjects: mockFetchProjects,
    clearError: mockClearError,
    isCreating: false,
    createError: null,
    pathValidation: null,
    isValidating: false,
    createProject: vi.fn(),
    validatePath: vi.fn(),
    clearCreateError: vi.fn(),
    clearPathValidation: vi.fn(),
    abortCreation: vi.fn(),
    deleteProject: vi.fn(),
    setupBmad: vi.fn().mockResolvedValue({ success: true }),
    bmadVersions: [],
    fetchBmadVersions: vi.fn(),
    showHidden: false,
    hideProject: vi.fn(),
    unhideProject: vi.fn(),
    setShowHidden: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
    vi.clearAllMocks();
    capturedDialogProps = null;
    // Set default mock state
    vi.mocked(useProjectStore).mockReturnValue(createMockState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <ProjectListPage />
      </BrowserRouter>
    );
  };

  describe('loading state', () => {
    it('renders skeleton loading state', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ isLoading: true }));

      renderPage();

      expect(screen.getByRole('status', { name: '로딩 중' })).toBeInTheDocument();
    });

    it('shows spinner on refresh button while loading', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ isLoading: true }));

      renderPage();

      const refreshButton = screen.getByLabelText('새로고침 중...');
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('error state', () => {
    it('renders error message', () => {
      vi.mocked(useProjectStore).mockReturnValue(
        createMockState({ error: '프로젝트 목록을 불러오는 중 오류가 발생했습니다.' })
      );

      renderPage();

      expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
      expect(screen.getByText('프로젝트 목록을 불러오는 중 오류가 발생했습니다.')).toBeInTheDocument();
    });

    it('renders retry button on error', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ error: '에러 발생' }));

      renderPage();

      expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    });

    it('calls clearError and fetchProjects on retry', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ error: '에러 발생' }));

      renderPage();

      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

      expect(mockClearError).toHaveBeenCalled();
      expect(mockFetchProjects).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('renders empty state message when no projects', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState());

      renderPage();

      expect(screen.getByText('프로젝트가 없습니다')).toBeInTheDocument();
      expect(screen.getByText('Claude Code로 프로젝트를 시작하면 여기에 표시됩니다.')).toBeInTheDocument();
    });

    it('renders new project button in empty state', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState());

      renderPage();

      expect(screen.getByRole('button', { name: '새 프로젝트 만들기' })).toBeInTheDocument();
    });

    it('opens new project dialog when empty state button clicked', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState());

      renderPage();

      expect(screen.queryByTestId('new-project-dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '새 프로젝트 만들기' }));

      expect(screen.getByTestId('new-project-dialog')).toBeInTheDocument();
    });
  });

  describe('project list', () => {
    it('renders project cards', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      expect(screen.getByText('~/my-project')).toBeInTheDocument();
      expect(screen.getByText('~/another-project')).toBeInTheDocument();
    });

    it('renders BMad badge for BMad projects', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      // There are two "BMad" texts: brand logo and badge. Look for the badge specifically.
      const bmadElements = screen.getAllByText('BMad');
      // Brand logo + 1 badge (only first mockProject has isBmadProject: true)
      expect(bmadElements.length).toBeGreaterThanOrEqual(2);
      // The badge has specific badge styling
      const badge = bmadElements.find(el => el.classList.contains('bg-blue-100'));
      expect(badge).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('fetches projects on mount', () => {
      renderPage();

      expect(mockFetchProjects).toHaveBeenCalledTimes(1);
    });

    it('calls fetchProjects on refresh button click', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      fireEvent.click(screen.getByLabelText('새로고침'));

      // Called twice: once on mount, once on click
      expect(mockFetchProjects).toHaveBeenCalledTimes(2);
    });

    it('navigates to project detail on card click', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      // Click first project card
      const projectCards = screen.getAllByRole('button');
      // Find the project card (not the refresh/settings buttons)
      const projectCard = projectCards.find(btn =>
        btn.getAttribute('aria-label')?.includes('프로젝트:')
      );

      if (projectCard) {
        fireEvent.click(projectCard);
        expect(mockNavigate).toHaveBeenCalledWith('/project/abc123');
      }
    });
  });

  describe('header', () => {
    it('renders page title', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: '프로젝트' })).toBeInTheDocument();
    });

    it('renders settings button', () => {
      renderPage();

      expect(screen.getByLabelText('설정')).toBeInTheDocument();
    });

    it('renders refresh button', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      expect(screen.getByLabelText('새로고침')).toBeInTheDocument();
    });

    it('renders new project button', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      expect(screen.getByRole('button', { name: '새 프로젝트' })).toBeInTheDocument();
    });

    it('opens new project dialog when header button clicked', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      expect(screen.queryByTestId('new-project-dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }));

      expect(screen.getByTestId('new-project-dialog')).toBeInTheDocument();
    });
  });

  describe('new project dialog', () => {
    it('closes dialog when close button clicked', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }));
      expect(screen.getByTestId('new-project-dialog')).toBeInTheDocument();

      // Close dialog
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
      expect(screen.queryByTestId('new-project-dialog')).not.toBeInTheDocument();
    });

    it('navigates to new session when new project created', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }));

      // Simulate new project creation success
      fireEvent.click(screen.getByRole('button', { name: '새 프로젝트 생성' }));

      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/project/new-project-slug/session/'));
    });

    it('navigates to existing project session list', () => {
      vi.mocked(useProjectStore).mockReturnValue(createMockState({ projects: mockProjects }));

      renderPage();

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }));

      // Simulate existing project navigation
      fireEvent.click(screen.getByRole('button', { name: '기존 프로젝트' }));

      expect(mockNavigate).toHaveBeenCalledWith('/project/existing-slug');
    });
  });
});
