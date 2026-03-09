/**
 * Project Controller Tests
 * [Source: Story 3.1 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import type { ProjectInfo, ProjectSettingsApiResponse } from '@hammoc/shared';

// Create hoisted mock for projectService
const { mockScanProjects, mockUpdateProjectSettings } = vi.hoisted(() => ({
  mockScanProjects: vi.fn(),
  mockUpdateProjectSettings: vi.fn(),
}));

// Mock projectService
vi.mock('../../services/projectService', () => ({
  projectService: {
    scanProjects: mockScanProjects,
    updateProjectSettings: mockUpdateProjectSettings,
  },
}));

import { projectController } from '../projectController';

describe('projectController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      t: vi.fn((key: string) => key),
      language: 'en',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list', () => {
    it('should return 200 with projects array on success', async () => {
      const mockProjects: ProjectInfo[] = [
        {
          originalPath: '/Users/test/project1',
          projectSlug: 'project-hash-1',
          sessionCount: 5,
          lastModified: '2026-01-30T10:00:00Z',
          isBmadProject: true,
        },
        {
          originalPath: '/Users/test/project2',
          projectSlug: 'project-hash-2',
          sessionCount: 2,
          lastModified: '2026-01-29T08:00:00Z',
          isBmadProject: false,
        },
      ];
      mockScanProjects.mockResolvedValue(mockProjects);

      await projectController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ projects: mockProjects });
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 200 with empty array when no projects', async () => {
      mockScanProjects.mockResolvedValue([]);

      await projectController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ projects: [] });
    });

    it('should return 500 with PERMISSION_DENIED error', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'PERMISSION_DENIED';
      mockScanProjects.mockRejectedValue(error);

      await projectController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'project.error.permissionDenied',
        },
      });
    });

    it('should return 500 with INVALID_SESSION_INDEX error', async () => {
      const error = new Error('Invalid index') as NodeJS.ErrnoException;
      error.code = 'INVALID_SESSION_INDEX';
      mockScanProjects.mockRejectedValue(error);

      await projectController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_SESSION_INDEX',
          message: 'project.error.invalidSessionIndex',
        },
      });
    });

    it('should return 500 with generic error for unknown errors', async () => {
      const error = new Error('Unknown error');
      mockScanProjects.mockRejectedValue(error);

      await projectController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'PROJECT_SCAN_ERROR',
          message: 'project.error.scanError',
        },
      });
    });
  });

  describe('updateSettings', () => {
    const mockUpdatedResponse: ProjectSettingsApiResponse = {
      hidden: false,
      effectiveModel: 'sonnet',
      effectivePermissionMode: 'default',
      _overrides: [],
    };

    it('TC-S6: returns 400 for invalid permissionModeOverride', async () => {
      mockReq = {
        t: vi.fn((key: string) => key),
        language: 'en',
        params: { projectSlug: 'test-project' },
        body: { permissionModeOverride: 'invalidMode' },
      };

      await projectController.updateSettings(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_PERMISSION_MODE',
          message: 'project.validation.invalidPermissionMode',
        },
      });
      expect(mockUpdateProjectSettings).not.toHaveBeenCalled();
    });

    it('TC-S7: permissionModeOverride null clears override successfully', async () => {
      mockUpdateProjectSettings.mockResolvedValue(mockUpdatedResponse);
      mockReq = {
        t: vi.fn((key: string) => key),
        language: 'en',
        params: { projectSlug: 'test-project' },
        body: { permissionModeOverride: null },
      };

      await projectController.updateSettings(mockReq as Request, mockRes as Response);

      expect(mockUpdateProjectSettings).toHaveBeenCalledWith('test-project', { permissionModeOverride: null });
      expect(mockRes.json).toHaveBeenCalledWith(mockUpdatedResponse);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('returns 400 when projectSlug is missing', async () => {
      mockReq = {
        t: vi.fn((key: string) => key),
        language: 'en',
        params: {},
        body: { hidden: true },
      };

      await projectController.updateSettings(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'project.validation.slugRequired',
        },
      });
    });

    it('accepts valid permissionModeOverride values', async () => {
      mockUpdateProjectSettings.mockResolvedValue({
        ...mockUpdatedResponse,
        permissionModeOverride: 'plan',
        effectivePermissionMode: 'plan',
        _overrides: ['permissionModeOverride'],
      });
      mockReq = {
        t: vi.fn((key: string) => key),
        language: 'en',
        params: { projectSlug: 'test-project' },
        body: { permissionModeOverride: 'plan' },
      };

      await projectController.updateSettings(mockReq as Request, mockRes as Response);

      expect(mockUpdateProjectSettings).toHaveBeenCalledWith('test-project', { permissionModeOverride: 'plan' });
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
