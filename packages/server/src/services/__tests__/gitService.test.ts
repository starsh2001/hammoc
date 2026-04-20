/**
 * Git Service Tests
 * [Source: Story 16.1 - Task 7.1]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock simple-git
const mockCheckIsRepo = vi.fn();
const mockStatus = vi.fn();
const mockLog = vi.fn();
const mockBranchLocal = vi.fn();
const mockBranch = vi.fn();
const mockDiff = vi.fn();
const mockInit = vi.fn();
const mockAdd = vi.fn();
const mockReset = vi.fn();
const mockCommit = vi.fn();
const mockPush = vi.fn();
const mockPull = vi.fn();
const mockCheckout = vi.fn();

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    checkIsRepo: mockCheckIsRepo,
    status: mockStatus,
    log: mockLog,
    branchLocal: mockBranchLocal,
    branch: mockBranch,
    diff: mockDiff,
    init: mockInit,
    add: mockAdd,
    reset: mockReset,
    commit: mockCommit,
    push: mockPush,
    pull: mockPull,
    checkout: mockCheckout,
  })),
}));

import { gitService } from '../gitService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('gitService.getStatus', () => {
  // TC-GIT-1: Non-git repo returns { initialized: false }
  it('returns { initialized: false } for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const result = await gitService.getStatus('/fake/path');

    expect(result).toEqual({ initialized: false });
    expect(mockStatus).not.toHaveBeenCalled();
  });

  // TC-GIT-2: Returns branch, staged, unstaged, untracked files
  it('returns branch, staged, unstaged, untracked files for git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockStatus.mockResolvedValue({
      current: 'main',
      ahead: 0,
      behind: 0,
      staged: ['file1.ts'],
      modified: ['file2.ts'],
      deleted: [],
      not_added: ['file3.ts'],
      files: [
        { path: 'file1.ts', index: 'M', working_dir: ' ' },
        { path: 'file2.ts', index: ' ', working_dir: 'M' },
      ],
    });

    const result = await gitService.getStatus('/fake/path');

    expect(result.initialized).toBe(true);
    expect(result.branch).toBe('main');
    expect(result.staged).toEqual([{ path: 'file1.ts', index: 'M', working_dir: ' ' }]);
    expect(result.unstaged).toEqual([{ path: 'file2.ts', index: ' ', working_dir: 'M' }]);
    expect(result.untracked).toEqual(['file3.ts']);
  });

  // TC-GIT-3: Returns ahead/behind counts
  it('returns ahead/behind counts', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockStatus.mockResolvedValue({
      current: 'feature',
      ahead: 3,
      behind: 1,
      staged: [],
      modified: [],
      deleted: [],
      not_added: [],
      files: [],
    });

    const result = await gitService.getStatus('/fake/path');

    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(1);
  });
});

describe('gitService.getLog', () => {
  // TC-GIT-4: Returns commit history with default limit 20
  it('returns commit history with default limit 20', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockLog.mockResolvedValue({
      all: [
        { hash: 'abc123', message: 'Initial commit', body: '', author_name: 'Dev', date: '2026-01-01T00:00:00Z' },
        { hash: 'def456', message: 'Second commit', body: 'Detailed body', author_name: 'Dev', date: '2026-01-02T00:00:00Z' },
      ],
    });

    const result = await gitService.getLog('/fake/path');

    expect(result.commits).toHaveLength(2);
    expect(result.commits[0]).toEqual({
      hash: 'abc123',
      message: 'Initial commit',
      author: 'Dev',
      date: '2026-01-01T00:00:00Z',
    });
    // message field is always used (body is not mapped)
    expect(result.commits[1].message).toBe('Second commit');
    expect(mockLog).toHaveBeenCalledWith({ maxCount: 20 });
  });

  // TC-GIT-5: Respects limit and offset parameters
  it('respects limit and offset parameters', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockLog.mockResolvedValue({ all: [] });

    await gitService.getLog('/fake/path', 10, 5);

    expect(mockLog).toHaveBeenCalledWith({ maxCount: 10, '--skip': 5 });
  });

  // TC-GIT-6: Non-git repo returns { commits: [] }
  it('returns { commits: [] } for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const result = await gitService.getLog('/fake/path');

    expect(result).toEqual({ commits: [] });
    expect(mockLog).not.toHaveBeenCalled();
  });
});

describe('gitService.getBranches', () => {
  // TC-GIT-7: Returns current, local, remote branches
  it('returns current, local, remote branches', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockBranchLocal.mockResolvedValue({
      current: 'main',
      all: ['main', 'feature/test'],
    });
    mockBranch.mockResolvedValue({
      all: ['origin/main', 'origin/feature/test'],
    });

    const result = await gitService.getBranches('/fake/path');

    expect(result.current).toBe('main');
    expect(result.local).toEqual(['main', 'feature/test']);
    expect(result.remote).toEqual(['origin/main', 'origin/feature/test']);
  });

  // TC-GIT-10b: Non-git repo returns empty result
  it('returns empty result for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const result = await gitService.getBranches('/fake/path');

    expect(result).toEqual({ current: '', local: [], remote: [] });
    expect(mockBranchLocal).not.toHaveBeenCalled();
    expect(mockBranch).not.toHaveBeenCalled();
  });
});

describe('gitService.getDiff', () => {
  // TC-GIT-8: Returns unstaged diff by default
  it('returns unstaged diff by default', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockDiff.mockResolvedValue('diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts');

    const result = await gitService.getDiff('/fake/path', 'file.ts');

    expect(result.initialized).toBe(true);
    expect(result.diff).toContain('diff --git');
    expect(result.file).toBe('file.ts');
    expect(result.staged).toBe(false);
    expect(mockDiff).toHaveBeenCalledWith(['--', 'file.ts']);
    expect(result.isBinary).toBe(false);
  });

  // TC-GIT-9: Returns staged diff when staged=true
  it('returns staged diff when staged=true', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockDiff.mockResolvedValue('staged diff content');

    const result = await gitService.getDiff('/fake/path', 'file.ts', true);

    expect(result.staged).toBe(true);
    expect(mockDiff).toHaveBeenCalledWith(['--cached', '--', 'file.ts']);
  });

  // Binary file detection via "Binary files … differ" marker
  it('sets isBinary=true when git emits the binary marker', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockDiff.mockResolvedValue('Binary files a/archive.zip and b/archive.zip differ');

    const result = await gitService.getDiff('/fake/path', 'archive.zip');

    expect(result.isBinary).toBe(true);
  });

  // TC-GIT-10: Returns empty string for unchanged files
  it('returns empty string for unchanged files', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockDiff.mockResolvedValue('');

    const result = await gitService.getDiff('/fake/path', 'unchanged.ts');

    expect(result.diff).toBe('');
  });

  // TC-GIT-10a: Non-git repo returns { initialized: false }
  it('returns { initialized: false } for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const result = await gitService.getDiff('/fake/path', 'file.ts');

    expect(result).toEqual({ initialized: false });
    expect(mockDiff).not.toHaveBeenCalled();
  });
});

// ── Write operation tests (Story 16.2) ──

describe('gitService.init', () => {
  // TC-GIT-W1: init calls git.init() successfully
  it('calls git.init() successfully', async () => {
    mockInit.mockResolvedValue(undefined);

    await gitService.init('/fake/path');

    expect(mockInit).toHaveBeenCalled();
  });

  // TC-GIT-W2: init does NOT call checkIsRepo()
  it('does not call checkIsRepo()', async () => {
    mockInit.mockResolvedValue(undefined);

    await gitService.init('/fake/path');

    expect(mockCheckIsRepo).not.toHaveBeenCalled();
  });
});

describe('gitService.stage', () => {
  // TC-GIT-W3: stage calls git.add(files) with file array
  it('calls git.add(files) with file array', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockAdd.mockResolvedValue(undefined);

    await gitService.stage('/fake/path', ['file1.ts', 'file2.ts']);

    expect(mockAdd).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
  });

  // TC-GIT-W4: stage throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    await expect(gitService.stage('/fake/path', ['file.ts'])).rejects.toThrow('Project is not a Git repository');
    const error = await gitService.stage('/fake/path', ['file.ts']).catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });
});

describe('gitService.unstage', () => {
  // TC-GIT-W5: unstage calls git.reset(['--', ...files])
  it('calls git.reset with correct arguments', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockReset.mockResolvedValue(undefined);

    await gitService.unstage('/fake/path', ['file1.ts', 'file2.ts']);

    expect(mockReset).toHaveBeenCalledWith(['--', 'file1.ts', 'file2.ts']);
  });

  // TC-GIT-W6: unstage throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const error = await gitService.unstage('/fake/path', ['file.ts']).catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });
});

describe('gitService.commit', () => {
  // TC-GIT-W7: commit calls git.commit(message) successfully
  it('calls git.commit(message) successfully', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockCommit.mockResolvedValue(undefined);

    await gitService.commit('/fake/path', 'test commit message');

    expect(mockCommit).toHaveBeenCalledWith('test commit message');
  });

  // TC-GIT-W8: commit throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const error = await gitService.commit('/fake/path', 'msg').catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });

  // TC-GIT-W20: commit wraps "nothing to commit" error appropriately
  it('wraps "nothing to commit" error with GIT_NOTHING_TO_COMMIT code', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockCommit.mockRejectedValue(new Error('nothing to commit, working tree clean'));

    const error = await gitService.commit('/fake/path', 'msg').catch((e) => e);
    expect(error.code).toBe('GIT_NOTHING_TO_COMMIT');
  });
});

describe('gitService.push', () => {
  // TC-GIT-W9: push calls git.push() successfully
  it('calls git.push() successfully', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockPush.mockResolvedValue(undefined);

    await gitService.push('/fake/path');

    expect(mockPush).toHaveBeenCalled();
  });

  // TC-GIT-W10: push throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const error = await gitService.push('/fake/path').catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });

  // TC-GIT-W18: push wraps error with descriptive message on failure
  it('wraps error with descriptive message on failure', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockPush.mockRejectedValue(new Error('push rejected'));

    await expect(gitService.push('/fake/path')).rejects.toThrow('Git push failed');
  });
});

describe('gitService.pull', () => {
  // TC-GIT-W11: pull calls git.pull() successfully
  it('calls git.pull() successfully', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockPull.mockResolvedValue(undefined);

    await gitService.pull('/fake/path');

    expect(mockPull).toHaveBeenCalled();
  });

  // TC-GIT-W12: pull throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const error = await gitService.pull('/fake/path').catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });

  // TC-GIT-W19: pull wraps error with descriptive message on failure
  it('wraps error with descriptive message on failure', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockPull.mockRejectedValue(new Error('CONFLICT in file.ts'));

    await expect(gitService.pull('/fake/path')).rejects.toThrow('Git pull failed');
  });
});

describe('gitService.checkout', () => {
  // TC-GIT-W13: checkout calls git.checkout(branch) successfully
  it('calls git.checkout(branch) successfully', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockCheckout.mockResolvedValue(undefined);

    await gitService.checkout('/fake/path', 'feature-branch');

    expect(mockCheckout).toHaveBeenCalledWith('feature-branch');
  });

  // TC-GIT-W14: checkout throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const error = await gitService.checkout('/fake/path', 'main').catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });
});

describe('gitService.createBranch', () => {
  // TC-GIT-W15: createBranch calls git.branch([name]) for new branch
  it('calls git.branch([name]) for new branch', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockBranch.mockResolvedValue(undefined);

    await gitService.createBranch('/fake/path', 'new-branch');

    expect(mockBranch).toHaveBeenCalledWith(['new-branch']);
  });

  // TC-GIT-W16: createBranch with startPoint calls git.branch([name, startPoint])
  it('calls git.branch([name, startPoint]) with startPoint', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockBranch.mockResolvedValue(undefined);

    await gitService.createBranch('/fake/path', 'new-branch', 'main');

    expect(mockBranch).toHaveBeenCalledWith(['new-branch', 'main']);
  });

  // TC-GIT-W17: createBranch throws GIT_NOT_INITIALIZED for non-git repo
  it('throws GIT_NOT_INITIALIZED for non-git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);

    const error = await gitService.createBranch('/fake/path', 'new-branch').catch((e) => e);
    expect(error.code).toBe('GIT_NOT_INITIALIZED');
  });

  it('throws GIT_BRANCH_EXISTS when branch already exists', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockBranch.mockRejectedValue(new Error("fatal: a branch named 'main' already exists"));

    const error = await gitService.createBranch('/fake/path', 'main').catch((e) => e);
    expect(error.code).toBe('GIT_BRANCH_EXISTS');
  });
});
