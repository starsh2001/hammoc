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
  query: Record<string, string> = {}
): Request {
  return { params, query } as unknown as Request;
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
