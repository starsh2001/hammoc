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

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    checkIsRepo: mockCheckIsRepo,
    status: mockStatus,
    log: mockLog,
    branchLocal: mockBranchLocal,
    branch: mockBranch,
    diff: mockDiff,
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
    // body takes precedence over message when non-empty
    expect(result.commits[1].message).toBe('Detailed body');
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
  });

  // TC-GIT-9: Returns staged diff when staged=true
  it('returns staged diff when staged=true', async () => {
    mockCheckIsRepo.mockResolvedValue(true);
    mockDiff.mockResolvedValue('staged diff content');

    const result = await gitService.getDiff('/fake/path', 'file.ts', true);

    expect(result.staged).toBe(true);
    expect(mockDiff).toHaveBeenCalledWith(['--cached', '--', 'file.ts']);
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
