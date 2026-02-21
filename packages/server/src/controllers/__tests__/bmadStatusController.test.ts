/**
 * BMad Status Controller Tests
 * [Source: Story 12.1 - Task 5.2]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import type { BmadStatusResponse } from '@bmad-studio/shared';

const { mockScanProject } = vi.hoisted(() => ({
  mockScanProject: vi.fn(),
}));

const { mockGetClaudeProjectsDir, mockParseSessionsIndex } = vi.hoisted(() => ({
  mockGetClaudeProjectsDir: vi.fn().mockReturnValue('/test/projects'),
  mockParseSessionsIndex: vi.fn(),
}));

vi.mock('../../services/bmadStatusService', () => ({
  bmadStatusService: {
    scanProject: mockScanProject,
  },
}));

vi.mock('../../services/projectService', () => ({
  projectService: {
    getClaudeProjectsDir: mockGetClaudeProjectsDir,
    parseSessionsIndex: mockParseSessionsIndex,
  },
}));

import { bmadStatusController } from '../bmadStatusController';

describe('bmadStatusController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: { projectSlug: 'test-project' },
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockParseSessionsIndex.mockResolvedValue({ originalPath: '/real/path/to/project' });
    vi.clearAllMocks();
    // Re-setup default mock after clearAllMocks
    mockGetClaudeProjectsDir.mockReturnValue('/test/projects');
    mockParseSessionsIndex.mockResolvedValue({ originalPath: '/real/path/to/project' });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // TC-BC-1: 정상 요청 시 200과 BmadStatusResponse를 반환한다
  it('returns 200 with BmadStatusResponse on success', async () => {
    const mockResponse: BmadStatusResponse = {
      config: { prdFile: 'docs/prd.md' },
      documents: {
        prd: { exists: true, path: 'docs/prd.md' },
        architecture: { exists: true, path: 'docs/architecture.md' },
      },
      auxiliaryDocuments: [],
      epics: [],
    };
    mockScanProject.mockResolvedValue(mockResponse);

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith(mockResponse);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  // TC-BC-2: projectSlug 누락 시 400을 반환한다
  it('returns 400 when projectSlug is missing', async () => {
    mockReq.params = {};

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' },
    });
  });

  // TC-BC-3: 프로젝트 미존재 시 404를 반환한다
  it('returns 404 when project is not found', async () => {
    mockParseSessionsIndex.mockResolvedValue(null);

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { code: 'PROJECT_NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.' },
    });
  });

  // TC-BC-4: BMad 프로젝트가 아닌 경우 404를 반환한다
  it('returns 404 when project is not a BMad project', async () => {
    const err = new Error('Not BMad');
    (err as NodeJS.ErrnoException).code = 'NOT_BMAD_PROJECT';
    mockScanProject.mockRejectedValue(err);

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_BMAD_PROJECT',
        message: 'BMad 프로젝트가 아닙니다. (.bmad-core/core-config.yaml 없음)',
      },
    });
  });

  // TC-BC-5: config 파싱 에러 시 500을 반환한다
  it('returns 500 on config parse error', async () => {
    const err = new Error('Parse error');
    (err as NodeJS.ErrnoException).code = 'CONFIG_PARSE_ERROR';
    mockScanProject.mockRejectedValue(err);

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        code: 'CONFIG_PARSE_ERROR',
        message: 'core-config.yaml 파싱 중 오류가 발생했습니다.',
      },
    });
  });

  // TC-BC-6: 스캔 에러 시 500을 반환한다
  it('returns 500 on unexpected scan error', async () => {
    mockScanProject.mockRejectedValue(new Error('Unexpected'));

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        code: 'SCAN_ERROR',
        message: '프로젝트 스캔 중 오류가 발생했습니다.',
      },
    });
  });
});
