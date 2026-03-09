/**
 * BMad Status Controller Tests
 * [Source: Story 12.1 - Task 5.2]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import type { BmadStatusResponse } from '@hammoc/shared';

const { mockScanProject } = vi.hoisted(() => ({
  mockScanProject: vi.fn(),
}));

const { mockResolveOriginalPath } = vi.hoisted(() => ({
  mockResolveOriginalPath: vi.fn(),
}));

vi.mock('../../services/bmadStatusService', () => ({
  bmadStatusService: {
    scanProject: mockScanProject,
  },
}));

vi.mock('../../services/projectService', () => ({
  projectService: {
    resolveOriginalPath: mockResolveOriginalPath,
  },
}));

import { bmadStatusController } from '../bmadStatusController';

describe('bmadStatusController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: { projectSlug: 'test-project' },
      t: vi.fn((key: string) => key),
      language: 'en',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    vi.clearAllMocks();
    // Default: resolveOriginalPath succeeds
    mockResolveOriginalPath.mockResolvedValue('/real/path/to/project');
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
        supplementary: [],
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
      error: { code: 'INVALID_REQUEST', message: 'project.validation.slugRequired' },
    });
  });

  // TC-BC-3: 프로젝트 미존재 시 404를 반환한다
  it('returns 404 when project is not found', async () => {
    const err = new Error('project.error.notFound');
    (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
    mockResolveOriginalPath.mockRejectedValue(err);

    await bmadStatusController.getBmadStatus(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { code: 'PROJECT_NOT_FOUND', message: 'project.error.notFound' },
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
        message: 'bmadStatus.error.notBmadProject',
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
        message: 'bmadStatus.error.configParseError',
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
        message: 'bmadStatus.error.scanError',
      },
    });
  });
});
