/**
 * Git Controller Tests
 * [Source: Story 16.1 - Task 7.2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { GIT_ERRORS, FILE_SYSTEM_ERRORS } from '@bmad-studio/shared';

// Mock services
const mockResolveOriginalPath = vi.fn();
const mockGetStatus = vi.fn();
const mockGetLog = vi.fn();
const mockGetBranches = vi.fn();
const mockGetDiff = vi.fn();
const mockInit = vi.fn();
const mockStage = vi.fn();
const mockUnstage = vi.fn();
const mockCommit = vi.fn();
const mockPush = vi.fn();
const mockPull = vi.fn();
const mockCheckout = vi.fn();
const mockCreateBranch = vi.fn();

vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveOriginalPath: (...args: unknown[]) => mockResolveOriginalPath(...args),
  },
}));

vi.mock('../../services/gitService.js', () => ({
  gitService: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    getLog: (...args: unknown[]) => mockGetLog(...args),
    getBranches: (...args: unknown[]) => mockGetBranches(...args),
    getDiff: (...args: unknown[]) => mockGetDiff(...args),
    init: (...args: unknown[]) => mockInit(...args),
    stage: (...args: unknown[]) => mockStage(...args),
    unstage: (...args: unknown[]) => mockUnstage(...args),
    commit: (...args: unknown[]) => mockCommit(...args),
    push: (...args: unknown[]) => mockPush(...args),
    pull: (...args: unknown[]) => mockPull(...args),
    checkout: (...args: unknown[]) => mockCheckout(...args),
    createBranch: (...args: unknown[]) => mockCreateBranch(...args),
  },
}));

vi.mock('../../middleware/pathGuard.js', () => ({
  validateProjectPath: vi.fn((projectRoot: string, requestedPath: string) => {
    if (requestedPath.includes('..')) {
      const err = new Error('Invalid path: path traversal detected');
      (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
      throw err;
    }
    return `${projectRoot}/${requestedPath}`;
  }),
}));

import { gitController } from '../gitController.js';

function createMockReq(
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
): Request {
  return { params, query, body } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveOriginalPath.mockResolvedValue('/projects/test');
});

describe('gitController.getStatus', () => {
  // TC-GIT-11: GET /git/status returns 200 with git status
  it('returns 200 with git status', async () => {
    const statusResult = {
      initialized: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    };
    mockGetStatus.mockResolvedValue(statusResult);

    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.getStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(statusResult);
    expect(mockResolveOriginalPath).toHaveBeenCalledWith('test-project');
  });

  // TC-GIT-12: Returns 200 with { initialized: false } for non-git repo
  it('returns 200 with { initialized: false } for non-git repo', async () => {
    mockGetStatus.mockResolvedValue({ initialized: false });

    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.getStatus(req, res);

    expect(res.json).toHaveBeenCalledWith({ initialized: false });
  });

  // TC-GIT-13: Returns 404 for unknown project
  it('returns 404 for unknown project', async () => {
    const err = new Error('Project not found');
    (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
    mockResolveOriginalPath.mockRejectedValue(err);

    const req = createMockReq({ projectSlug: 'unknown' });
    const res = createMockRes();

    await gitController.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    });
  });

  // TC-GIT-20: Returns 400 when projectSlug missing (defensive guard — Express route
  // pattern /:projectSlug would not match without it, but controller validates anyway)
  it('returns 400 when projectSlug missing (defensive guard)', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await gitController.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' },
    });
  });
});

describe('gitController.getLog', () => {
  // TC-GIT-14: Returns 200 with commits
  it('returns 200 with commits', async () => {
    const logResult = {
      commits: [
        { hash: 'abc123', message: 'test', author: 'Dev', date: '2026-01-01T00:00:00Z' },
      ],
    };
    mockGetLog.mockResolvedValue(logResult);

    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.getLog(req, res);

    expect(res.json).toHaveBeenCalledWith(logResult);
    expect(mockGetLog).toHaveBeenCalledWith('/projects/test', 20, 0);
  });

  // TC-GIT-15: Parses limit and offset query params
  it('parses limit and offset query params', async () => {
    mockGetLog.mockResolvedValue({ commits: [] });

    const req = createMockReq({ projectSlug: 'test-project' }, { limit: '10', offset: '5' });
    const res = createMockRes();

    await gitController.getLog(req, res);

    expect(mockGetLog).toHaveBeenCalledWith('/projects/test', 10, 5);
  });
});

describe('gitController.getBranches', () => {
  // TC-GIT-16: Returns 200 with branches
  it('returns 200 with branches', async () => {
    const branchesResult = {
      current: 'main',
      local: ['main', 'feature'],
      remote: ['origin/main'],
    };
    mockGetBranches.mockResolvedValue(branchesResult);

    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.getBranches(req, res);

    expect(res.json).toHaveBeenCalledWith(branchesResult);
  });
});

describe('gitController.getDiff', () => {
  // TC-GIT-17: Returns 200 with diff content
  it('returns 200 with diff content', async () => {
    const diffResult = {
      initialized: true,
      diff: 'diff content',
      file: 'src/index.ts',
      staged: false,
    };
    mockGetDiff.mockResolvedValue(diffResult);

    const req = createMockReq({ projectSlug: 'test-project' }, { file: 'src/index.ts' });
    const res = createMockRes();

    await gitController.getDiff(req, res);

    expect(res.json).toHaveBeenCalledWith(diffResult);
    expect(mockGetDiff).toHaveBeenCalledWith('/projects/test', 'src/index.ts', false);
  });

  // TC-GIT-18: Returns 400 when file param missing
  it('returns 400 when file param missing', async () => {
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.getDiff(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'file query parameter is required' },
    });
  });

  // TC-GIT-19: Returns 403 for path traversal attempt
  it('returns 403 for path traversal attempt', async () => {
    const req = createMockReq(
      { projectSlug: 'test-project' },
      { file: '../../etc/passwd' }
    );
    const res = createMockRes();

    await gitController.getDiff(req, res);

    expect(res.status).toHaveBeenCalledWith(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.message },
    });
  });

  // TC-GIT-20a: Returns 200 with { initialized: false } for non-git repo
  it('returns 200 with { initialized: false } for non-git repo', async () => {
    mockGetDiff.mockResolvedValue({ initialized: false });

    const req = createMockReq({ projectSlug: 'test-project' }, { file: 'src/index.ts' });
    const res = createMockRes();

    await gitController.getDiff(req, res);

    expect(res.json).toHaveBeenCalledWith({ initialized: false });
  });

  // TC-GIT-21: Returns 500 with GIT_ERROR on unexpected exception
  it('returns 500 with GIT_ERROR on unexpected exception', async () => {
    mockGetDiff.mockRejectedValue(new Error('Unexpected git failure'));

    const req = createMockReq({ projectSlug: 'test-project' }, { file: 'src/index.ts' });
    const res = createMockRes();

    await gitController.getDiff(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_ERROR.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_ERROR.code, message: 'Unexpected git failure' },
    });
  });
});

describe('gitController.getBranches - error handling', () => {
  // TC-GIT-22: Returns 404 for unknown project
  it('returns 404 for unknown project', async () => {
    const err = new Error('Project not found');
    (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
    mockResolveOriginalPath.mockRejectedValue(err);

    const req = createMockReq({ projectSlug: 'unknown' });
    const res = createMockRes();

    await gitController.getBranches(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    });
  });

  // TC-GIT-23: Returns 500 with GIT_ERROR on unexpected exception
  it('returns 500 with GIT_ERROR on unexpected exception', async () => {
    mockGetBranches.mockRejectedValue(new Error('Unexpected branch error'));

    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.getBranches(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_ERROR.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_ERROR.code, message: 'Unexpected branch error' },
    });
  });
});

describe('gitController.getLog - input validation', () => {
  // TC-GIT-24: Clamps negative limit to 1
  it('clamps negative limit to minimum 1', async () => {
    mockGetLog.mockResolvedValue({ commits: [] });

    const req = createMockReq({ projectSlug: 'test-project' }, { limit: '-5', offset: '-3' });
    const res = createMockRes();

    await gitController.getLog(req, res);

    expect(mockGetLog).toHaveBeenCalledWith('/projects/test', 1, 0);
  });
});

// ── Write handler tests (Story 16.2) ──

function makeGitError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('gitController.init', () => {
  // TC-GIT-W21: POST /git/init returns 200 with success response
  it('returns 200 with success response', async () => {
    mockInit.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.init(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Git repository initialized' });
  });

  // TC-GIT-W22: POST /git/init returns 404 for unknown project
  it('returns 404 for unknown project', async () => {
    mockResolveOriginalPath.mockRejectedValue(makeGitError('PROJECT_NOT_FOUND', 'Project not found'));
    const req = createMockReq({ projectSlug: 'unknown' });
    const res = createMockRes();

    await gitController.init(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('gitController.stage', () => {
  // TC-GIT-W23: POST /git/stage returns 200 with success response
  it('returns 200 with success response', async () => {
    mockStage.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: ['src/index.ts'] });
    const res = createMockRes();

    await gitController.stage(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Files staged successfully' });
    expect(mockStage).toHaveBeenCalledWith('/projects/test', ['src/index.ts']);
  });

  // TC-GIT-W24: POST /git/stage returns 400 when files missing in body
  it('returns 400 when files missing in body', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, {});
    const res = createMockRes();

    await gitController.stage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'files array is required and must not be empty' },
    });
  });

  // TC-GIT-W25: POST /git/stage returns 400 when files is empty array
  it('returns 400 when files is empty array', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: [] });
    const res = createMockRes();

    await gitController.stage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // TC-GIT-W26: POST /git/stage returns 403 for path traversal attempt
  it('returns 403 for path traversal attempt', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: ['../../etc/passwd'] });
    const res = createMockRes();

    await gitController.stage(req, res);

    expect(res.status).toHaveBeenCalledWith(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus);
  });

  // TC-GIT-W27: POST /git/stage returns 400 for non-git repo (GIT_NOT_INITIALIZED)
  it('returns 400 for non-git repo', async () => {
    mockStage.mockRejectedValue(makeGitError('GIT_NOT_INITIALIZED', 'Project is not a Git repository'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: ['file.ts'] });
    const res = createMockRes();

    await gitController.stage(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
    });
  });
});

describe('gitController.unstage', () => {
  // TC-GIT-W28: POST /git/unstage returns 200 with success response
  it('returns 200 with success response', async () => {
    mockUnstage.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: ['src/index.ts'] });
    const res = createMockRes();

    await gitController.unstage(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Files unstaged successfully' });
  });

  // TC-GIT-W29: POST /git/unstage returns 400 when files missing in body
  it('returns 400 when files missing in body', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, {});
    const res = createMockRes();

    await gitController.unstage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // TC-GIT-W29b: POST /git/unstage returns 403 for path traversal attempt
  it('returns 403 for path traversal attempt', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: ['../../etc/passwd'] });
    const res = createMockRes();

    await gitController.unstage(req, res);

    expect(res.status).toHaveBeenCalledWith(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus);
  });
});

describe('gitController.commit', () => {
  // TC-GIT-W30: POST /git/commit returns 200 with success response
  it('returns 200 with success response', async () => {
    mockCommit.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { message: 'test commit' });
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Changes committed successfully' });
    expect(mockCommit).toHaveBeenCalledWith('/projects/test', 'test commit');
  });

  // TC-GIT-W31: POST /git/commit returns 400 when message missing in body
  it('returns 400 when message missing in body', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, {});
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'commit message is required and must not be empty' },
    });
  });

  // TC-GIT-W32: POST /git/commit returns 400 when message is empty string
  it('returns 400 when message is empty string', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { message: '' });
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // TC-GIT-W32b: POST /git/commit returns 400 when message is whitespace-only string
  it('returns 400 when message is whitespace-only', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { message: '   ' });
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // TC-GIT-W44: POST /git/commit returns 400 when message exceeds 10,000 characters
  it('returns 400 when message exceeds 10,000 characters', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { message: 'a'.repeat(10001) });
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'Commit message exceeds maximum length of 10,000 characters' },
    });
  });

  it('returns 400 for nothing to commit error', async () => {
    mockCommit.mockRejectedValue(makeGitError('GIT_NOTHING_TO_COMMIT', 'Nothing to commit'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { message: 'test' });
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOTHING_TO_COMMIT.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_NOTHING_TO_COMMIT.code, message: GIT_ERRORS.GIT_NOTHING_TO_COMMIT.message },
    });
  });
});

describe('gitController.push', () => {
  // TC-GIT-W33: POST /git/push returns 200 with success response
  it('returns 200 with success response', async () => {
    mockPush.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.push(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Pushed to remote successfully' });
  });

  // TC-GIT-W34: POST /git/push returns 409 on conflict error
  it('returns 409 on conflict error', async () => {
    mockPush.mockRejectedValue(new Error('Git push failed: rejected'));
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.push(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_CONFLICT.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: 'Git push failed: rejected' },
    });
  });
});

describe('gitController.pull', () => {
  // TC-GIT-W35: POST /git/pull returns 200 with success response
  it('returns 200 with success response', async () => {
    mockPull.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.pull(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Pulled from remote successfully' });
  });

  // TC-GIT-W36: POST /git/pull returns 409 on conflict error
  it('returns 409 on conflict error', async () => {
    mockPull.mockRejectedValue(new Error('CONFLICT in src/file.ts'));
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.pull(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_CONFLICT.httpStatus);
  });
});

describe('gitController.checkout', () => {
  // TC-GIT-W37: POST /git/checkout returns 200 with success response
  it('returns 200 with success response', async () => {
    mockCheckout.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { branch: 'feature' });
    const res = createMockRes();

    await gitController.checkout(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Switched to branch feature' });
  });

  // TC-GIT-W38: POST /git/checkout returns 400 when branch missing in body
  it('returns 400 when branch missing in body', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, {});
    const res = createMockRes();

    await gitController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'branch name is required' },
    });
  });

  // TC-GIT-W39: POST /git/checkout returns 409 on uncommitted changes error
  it('returns 409 on uncommitted changes error', async () => {
    mockCheckout.mockRejectedValue(new Error('error: Your local changes to the following files would be overwritten'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { branch: 'main' });
    const res = createMockRes();

    await gitController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_CONFLICT.httpStatus);
  });
});

describe('gitController.createBranch', () => {
  // TC-GIT-W40: POST /git/branch returns 200 with success response
  it('returns 200 with success response', async () => {
    mockCreateBranch.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'new-branch' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Branch new-branch created successfully' });
    expect(mockCreateBranch).toHaveBeenCalledWith('/projects/test', 'new-branch', undefined);
  });

  // TC-GIT-W41: POST /git/branch returns 400 when name missing in body
  it('returns 400 when name missing in body', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, {});
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'branch name is required' },
    });
  });

  // TC-GIT-W41b: POST /git/branch returns 400 for invalid branch name
  it('returns 400 for invalid branch name (contains spaces)', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'bad branch' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'Invalid branch name: contains invalid characters' },
    });
  });

  it('returns 400 for invalid branch name (contains ..)', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'branch..name' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid branch name (contains ~)', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'branch~1' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // TC-GIT-W41c: POST /git/branch returns 400 for invalid startPoint
  it('returns 400 for invalid startPoint', async () => {
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'new-branch', startPoint: 'bad..ref' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'Invalid startPoint: contains invalid characters' },
    });
  });

  // TC-GIT-W42: POST /git/branch returns 409 when branch already exists
  it('returns 409 when branch already exists', async () => {
    mockCreateBranch.mockRejectedValue(makeGitError('GIT_BRANCH_EXISTS', 'Branch already exists'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'main' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_BRANCH_EXISTS.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_BRANCH_EXISTS.code, message: GIT_ERRORS.GIT_BRANCH_EXISTS.message },
    });
  });

  it('passes startPoint to service when provided', async () => {
    mockCreateBranch.mockResolvedValue(undefined);
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'new-branch', startPoint: 'main' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(mockCreateBranch).toHaveBeenCalledWith('/projects/test', 'new-branch', 'main');
  });
});

describe('gitController write handlers - common error handling', () => {
  // TC-GIT-W43: Write handler returns 500 on unexpected gitService error
  it('returns 500 on unexpected gitService error', async () => {
    mockStage.mockRejectedValue(new Error('Unexpected error'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { files: ['file.ts'] });
    const res = createMockRes();

    await gitController.stage(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_ERROR.httpStatus);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: GIT_ERRORS.GIT_ERROR.code, message: 'Unexpected error' },
    });
  });

  it('push returns 400 for non-git repo', async () => {
    mockPush.mockRejectedValue(makeGitError('GIT_NOT_INITIALIZED', 'Project is not a Git repository'));
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.push(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus);
  });

  it('pull returns 400 for non-git repo', async () => {
    mockPull.mockRejectedValue(makeGitError('GIT_NOT_INITIALIZED', 'Project is not a Git repository'));
    const req = createMockReq({ projectSlug: 'test-project' });
    const res = createMockRes();

    await gitController.pull(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus);
  });

  it('checkout returns 400 for non-git repo', async () => {
    mockCheckout.mockRejectedValue(makeGitError('GIT_NOT_INITIALIZED', 'Project is not a Git repository'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { branch: 'main' });
    const res = createMockRes();

    await gitController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus);
  });

  it('commit returns 400 for non-git repo', async () => {
    mockCommit.mockRejectedValue(makeGitError('GIT_NOT_INITIALIZED', 'Project is not a Git repository'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { message: 'test' });
    const res = createMockRes();

    await gitController.commit(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus);
  });

  it('createBranch returns 400 for non-git repo', async () => {
    mockCreateBranch.mockRejectedValue(makeGitError('GIT_NOT_INITIALIZED', 'Project is not a Git repository'));
    const req = createMockReq({ projectSlug: 'test-project' }, {}, { name: 'new-branch' });
    const res = createMockRes();

    await gitController.createBranch(req, res);

    expect(res.status).toHaveBeenCalledWith(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus);
  });
});
