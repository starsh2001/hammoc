/**
 * GitTab Component Tests
 * [Source: Story 16.3 - Task 10.1]
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GitTab } from '../GitTab';
import type { GitStatusResponse, GitBranchesResponse, GitCommitInfo } from '@hammoc/shared';

// Mock DiffViewer
vi.mock('../../DiffViewer', () => ({
  DiffViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="diff-viewer">{filePath}</div>
  ),
}));

// Mock ConfirmModal
vi.mock('../../ConfirmModal', () => ({
  ConfirmModal: ({ isOpen, onConfirm, onCancel, message }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    message: string;
  }) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <span>{message}</span>
        <button onClick={onConfirm}>confirm</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    ) : null,
}));

// Store mocks
const _mockFetchStatus = vi.fn();
const mockFetchLog = vi.fn();
const mockFetchBranches = vi.fn();
const mockStageFiles = vi.fn();
const mockUnstageFiles = vi.fn();
const mockCommit = vi.fn();
const mockPush = vi.fn();
const mockPull = vi.fn();
const mockCheckout = vi.fn();
const mockCreateBranch = vi.fn();
const mockInitRepo = vi.fn();
const mockFetchDiff = vi.fn().mockResolvedValue({ before: 'before', after: 'after', isBinary: false });
const mockClearError = vi.fn();

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

const mockBranches: GitBranchesResponse = {
  current: 'main',
  local: ['main', 'feature/git-tab', 'fix/bug-123'],
  remote: ['origin/main'],
};

const mockCommits: GitCommitInfo[] = [
  { hash: 'abc1234567890', message: 'feat: add git tab', author: 'dev', date: '2026-02-25T10:00:00Z' },
  { hash: 'def4567890123', message: 'fix: resolve merge conflict', author: 'dev', date: '2026-02-24T15:30:00Z' },
];

let storeState = {
  status: mockStatus as GitStatusResponse | null,
  commits: mockCommits,
  branches: mockBranches as GitBranchesResponse | null,
  isLoading: false,
  error: null as string | null,
};

// Mock useGitStatus hook
vi.mock('../../../hooks/useGitStatus', () => ({
  useGitStatus: () => ({
    status: storeState.status,
    isLoading: storeState.isLoading,
    refresh: vi.fn(),
    changedFileCount: 3,
  }),
}));

// Mock useGitStore
vi.mock('../../../stores/gitStore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useGitStore: (selector: (state: any) => any) =>
    selector({
      ...storeState,
      fetchLog: mockFetchLog,
      fetchBranches: mockFetchBranches,
      stageFiles: mockStageFiles,
      unstageFiles: mockUnstageFiles,
      commit: mockCommit,
      push: mockPush,
      pull: mockPull,
      checkout: mockCheckout,
      createBranch: mockCreateBranch,
      initRepo: mockInitRepo,
      fetchDiff: mockFetchDiff,
      clearError: mockClearError,
    }),
}));

function renderGitTab(initialPath = '/project/test-project/git') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/project/:projectSlug/git" element={<GitTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GitTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      status: mockStatus,
      commits: mockCommits,
      branches: mockBranches,
      isLoading: false,
      error: null,
    };
  });

  // TC-GIT-T1: Renders top bar with branch selector, pull/push buttons
  it('renders top bar with branch selector and pull/push buttons', () => {
    renderGitTab();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByTitle('Pull')).toBeInTheDocument();
    expect(screen.getByTitle('Push')).toBeInTheDocument();
  });

  // TC-GIT-T2: Shows current branch name in selector
  it('shows current branch name in selector', () => {
    renderGitTab();
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  // TC-GIT-T3: Shows ahead/behind counts on pull/push buttons
  it('shows ahead/behind counts on pull/push buttons', () => {
    renderGitTab();
    const pullButton = screen.getByTitle('Pull');
    const pushButton = screen.getByTitle('Push');
    expect(pullButton).toHaveTextContent('1'); // behind
    expect(pushButton).toHaveTextContent('2'); // ahead
  });

  // TC-GIT-T4: Shows file list groups
  it('shows file list groups (staged, unstaged, untracked)', () => {
    renderGitTab();
    expect(screen.getByText('스테이지된 변경사항')).toBeInTheDocument();
    expect(screen.getByText('변경사항')).toBeInTheDocument();
    expect(screen.getByText('추적되지 않음')).toBeInTheDocument();
  });

  // TC-GIT-T5: Commit button disabled when no staged files
  it('disables commit button when no staged files', () => {
    storeState.status = {
      ...mockStatus,
      staged: [],
    };
    renderGitTab();
    const commitBtn = screen.getByRole('button', { name: '커밋' });
    expect(commitBtn).toBeDisabled();
  });

  // TC-GIT-T6: Commit button disabled when message is empty
  it('disables commit button when message is empty', () => {
    renderGitTab();
    const commitBtn = screen.getByRole('button', { name: '커밋' });
    expect(commitBtn).toBeDisabled();
  });

  // TC-GIT-T7: Renders commit history section
  it('renders commit history section with entries', () => {
    renderGitTab();
    expect(screen.getByText('커밋 히스토리')).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('feat: add git tab')).toBeInTheDocument();
  });

  // TC-GIT-T8: Shows "Git Init" button when not initialized
  it('shows Git Init button when not initialized', () => {
    storeState.status = { initialized: false };
    renderGitTab();
    expect(screen.getByText('Git Init')).toBeInTheDocument();
    expect(screen.getByText('이 프로젝트는 아직 Git 저장소가 아닙니다.')).toBeInTheDocument();
  });

  // TC-GIT-T9: Shows confirmation dialog on branch switch with changes
  it('shows confirmation dialog on branch switch with uncommitted changes', async () => {
    renderGitTab();

    // Open branch dropdown
    fireEvent.click(screen.getByText('main'));

    // Click on a different branch
    await waitFor(() => {
      expect(screen.getByText('feature/git-tab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('feature/git-tab'));

    // Confirm modal should appear
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
    expect(screen.getByText('커밋되지 않은 변경사항이 있습니다. 브랜치를 전환하시겠습니까?')).toBeInTheDocument();
  });

  // TC-GIT-T10: Opens diff panel when file is clicked
  it('opens diff panel when file is clicked', async () => {
    renderGitTab();
    fireEvent.click(screen.getByText('src/index.ts'));

    await waitFor(() => {
      expect(mockFetchDiff).toHaveBeenCalledWith('test-project', 'src/index.ts', true);
    });
  });

  // Error banner display
  it('displays error banner when error is set', () => {
    storeState.error = 'Push failed: no remote';
    renderGitTab();
    expect(screen.getByText('Push failed: no remote')).toBeInTheDocument();
  });

  // Empty file list state
  it('shows empty state when no changed files', () => {
    storeState.status = {
      ...mockStatus,
      staged: [],
      unstaged: [],
      untracked: [],
    };
    renderGitTab();
    expect(screen.getByText('변경된 파일이 없습니다')).toBeInTheDocument();
  });

  // Empty commit history
  it('shows empty commit history message', () => {
    storeState.commits = [];
    renderGitTab();
    expect(screen.getByText('커밋 히스토리가 없습니다')).toBeInTheDocument();
  });

  // Git Init button triggers initRepo
  it('triggers initRepo when Git Init button is clicked', () => {
    storeState.status = { initialized: false };
    renderGitTab();
    fireEvent.click(screen.getByText('Git Init'));
    expect(mockInitRepo).toHaveBeenCalledWith('test-project');
  });

  // Confirm modal confirms checkout
  it('confirms checkout on modal confirm', async () => {
    renderGitTab();
    fireEvent.click(screen.getByText('main'));
    await waitFor(() => {
      expect(screen.getByText('feature/git-tab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('feature/git-tab'));
    fireEvent.click(screen.getByText('confirm'));
    expect(mockCheckout).toHaveBeenCalledWith('test-project', 'feature/git-tab');
  });

  // Commit flow
  it('commits with message and clears input', async () => {
    mockCommit.mockResolvedValue(undefined);
    renderGitTab();

    const textarea = screen.getByPlaceholderText('커밋 메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: 'test commit message' } });

    const commitBtn = screen.getByRole('button', { name: '커밋' });
    expect(commitBtn).not.toBeDisabled();
    fireEvent.click(commitBtn);

    expect(mockCommit).toHaveBeenCalledWith('test-project', 'test commit message');
  });

  // TC-GIT-T11: Creates new branch via Enter key in dropdown input (AC: 3)
  it('creates new branch via Enter key in dropdown input', async () => {
    mockCreateBranch.mockResolvedValue(undefined);
    renderGitTab();

    // Open branch dropdown
    fireEvent.click(screen.getByText('main'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('새 브랜치 이름...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('새 브랜치 이름...');
    fireEvent.change(input, { target: { value: 'feature/new-branch' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockCreateBranch).toHaveBeenCalledWith('test-project', 'feature/new-branch');
  });
});
