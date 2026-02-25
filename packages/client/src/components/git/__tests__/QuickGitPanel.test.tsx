/**
 * QuickGitPanel Component Tests
 * [Source: Story 16.4 - Task 4]
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickGitPanel } from '../QuickGitPanel';
import type { GitStatusResponse, GitCommitInfo } from '@bmad-studio/shared';

// Mock formatRelativeTime
vi.mock('../../../utils/formatters', () => ({
  formatRelativeTime: (date: string) => '1일 전',
}));

// Store mocks
const mockStageFiles = vi.fn().mockResolvedValue(undefined);
const mockCommit = vi.fn().mockResolvedValue(undefined);
const mockInitRepo = vi.fn().mockResolvedValue(undefined);
const mockFetchLog = vi.fn().mockResolvedValue(undefined);
const mockRefresh = vi.fn().mockResolvedValue(undefined);

const mockStatus: GitStatusResponse = {
  initialized: true,
  branch: 'main',
  ahead: 2,
  behind: 1,
  staged: [
    { path: 'src/index.ts', index: 'M', working_dir: ' ' },
  ],
  unstaged: [
    { path: 'src/utils.ts', index: ' ', working_dir: 'M' },
  ],
  untracked: ['src/temp.ts'],
};

const mockUninitializedStatus: GitStatusResponse = {
  initialized: false,
};

const mockCommits: GitCommitInfo[] = [
  { hash: 'abc1234567890', message: 'feat: add git tab', author: 'dev', date: '2026-02-25T10:00:00Z' },
  { hash: 'def4567890123', message: 'fix: resolve merge conflict', author: 'dev', date: '2026-02-24T15:30:00Z' },
  { hash: 'ghi7890123456', message: 'chore: update deps', author: 'dev', date: '2026-02-23T09:00:00Z' },
];

let storeState = {
  status: mockStatus as GitStatusResponse | null,
  commits: mockCommits as GitCommitInfo[],
  isLoading: false,
  error: null as string | null,
};

// Mock useGitStatus hook
vi.mock('../../../hooks/useGitStatus', () => ({
  useGitStatus: () => ({
    status: storeState.status,
    isLoading: storeState.isLoading,
    refresh: mockRefresh,
    changedFileCount:
      (storeState.status?.staged?.length ?? 0) +
      (storeState.status?.unstaged?.length ?? 0) +
      (storeState.status?.untracked?.length ?? 0),
  }),
}));

// Mock useGitStore — also mock getState for post-commit error check
const mockGetState = vi.fn(() => ({ error: null }));

vi.mock('../../../stores/gitStore', () => ({
  useGitStore: Object.assign(
    (selector: (state: any) => any) =>
      selector({
        ...storeState,
        stageFiles: mockStageFiles,
        commit: mockCommit,
        initRepo: mockInitRepo,
        fetchLog: mockFetchLog,
      }),
    { getState: () => mockGetState() },
  ),
}));

const defaultProps = {
  isOpen: true,
  projectSlug: 'test-project',
  onClose: vi.fn(),
  onNavigateToGitTab: vi.fn(),
};

function renderPanel(props = {}) {
  return render(<QuickGitPanel {...defaultProps} {...props} />);
}

describe('QuickGitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      status: mockStatus,
      commits: mockCommits,
      isLoading: false,
      error: null,
    };
    mockGetState.mockReturnValue({ error: null });
  });

  // TC-QGP-1: Renders panel with status summary when open
  it('renders panel with status summary when open', () => {
    renderPanel();
    expect(screen.getByTestId('quick-git-panel')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
  });

  // TC-QGP-2: Shows current branch name
  it('shows current branch name', () => {
    renderPanel();
    expect(screen.getByTestId('current-branch')).toHaveTextContent('main');
  });

  // TC-QGP-3: Shows changed file count
  it('shows changed file count badge', () => {
    renderPanel();
    expect(screen.getByTestId('changed-file-badge')).toHaveTextContent('3 변경');
  });

  // TC-QGP-4: Shows recent 3 commits
  it('shows recent 3 commits', () => {
    renderPanel();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('def4567')).toBeInTheDocument();
    expect(screen.getByText('ghi7890')).toBeInTheDocument();
    expect(screen.getByText('feat: add git tab')).toBeInTheDocument();
  });

  // TC-QGP-5: Commit message textarea and button present
  it('shows commit message textarea and "Stage All & Commit" button', () => {
    renderPanel();
    expect(screen.getByTestId('commit-message-input')).toBeInTheDocument();
    expect(screen.getByTestId('stage-commit-button')).toBeInTheDocument();
    expect(screen.getByText('Stage All & Commit')).toBeInTheDocument();
  });

  // TC-QGP-6: Button disabled when message empty
  it('disables commit button when message is empty', () => {
    renderPanel();
    expect(screen.getByTestId('stage-commit-button')).toBeDisabled();
  });

  // TC-QGP-7: Button disabled when no changed files
  it('disables commit button when no changed files', () => {
    storeState.status = {
      initialized: true,
      branch: 'main',
      staged: [],
      unstaged: [],
      untracked: [],
    };
    renderPanel();
    const textarea = screen.getByTestId('commit-message-input');
    fireEvent.change(textarea, { target: { value: 'test commit' } });
    expect(screen.getByTestId('stage-commit-button')).toBeDisabled();
  });

  // TC-QGP-8: Calls stageFiles then commit on button click
  it('calls stageFiles then commit on button click', async () => {
    renderPanel();
    const textarea = screen.getByTestId('commit-message-input');
    fireEvent.change(textarea, { target: { value: 'test commit message' } });

    const button = screen.getByTestId('stage-commit-button');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockStageFiles).toHaveBeenCalledWith('test-project', ['src/utils.ts', 'src/temp.ts']);
      expect(mockCommit).toHaveBeenCalledWith('test-project', 'test commit message');
    });
  });

  // TC-QGP-9: Shows "Git 탭에서 상세 보기" link
  it('shows footer link to Git tab', () => {
    renderPanel();
    expect(screen.getByText('Git 탭에서 상세 보기')).toBeInTheDocument();
  });

  // TC-QGP-10: Calls onClose when Escape pressed
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // TC-QGP-11: Calls onClose when backdrop clicked
  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTestId('git-panel-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  // TC-QGP-12: Shows "Git Init" button when not initialized
  it('shows Git Init button when not initialized', () => {
    storeState.status = mockUninitializedStatus;
    renderPanel();
    expect(screen.getByText('Git 저장소가 초기화되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByText('Git Init')).toBeInTheDocument();
  });

  // TC-QGP-13: Shows error banner when gitStore.error is set
  it('shows error banner when error is set', () => {
    storeState.error = 'Git 작업 중 오류가 발생했습니다.';
    renderPanel();
    expect(screen.getByTestId('git-error-banner')).toHaveTextContent('Git 작업 중 오류가 발생했습니다.');
  });

  // TC-QGP-14: Clears commit message on successful commit
  it('clears commit message and shows success on successful commit', async () => {
    renderPanel();
    const textarea = screen.getByTestId('commit-message-input');
    fireEvent.change(textarea, { target: { value: 'my commit' } });
    fireEvent.click(screen.getByTestId('stage-commit-button'));

    await waitFor(() => {
      expect(mockCommit).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('commit-success')).toHaveTextContent('커밋 완료');
    });
  });

  it('does not render when isOpen is false', () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByTestId('quick-git-panel')).not.toBeInTheDocument();
  });

  it('calls onNavigateToGitTab and onClose when footer link clicked', () => {
    const onNavigateToGitTab = vi.fn();
    const onClose = vi.fn();
    renderPanel({ onNavigateToGitTab, onClose });
    fireEvent.click(screen.getByText('Git 탭에서 상세 보기'));
    expect(onNavigateToGitTab).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('fetches log with limit 3 when panel opens', () => {
    renderPanel();
    expect(mockFetchLog).toHaveBeenCalledWith('test-project', 3);
  });
});
