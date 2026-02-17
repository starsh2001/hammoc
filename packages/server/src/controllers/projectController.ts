/**
 * Project Controller
 * Handles project list endpoints
 * [Source: Story 3.1 - Task 3]
 * [Extended: Story 3.6 - Task 3: Project creation endpoints]
 */

import { Request, Response } from 'express';
import {
  PROJECT_ERRORS,
  ProjectListResponse,
  CreateProjectRequest,
  ValidatePathRequest,
  BmadVersionsResponse,
  DeleteProjectResponse,
  UpdateProjectSettingsRequest,
  SetupBmadRequest,
  SetupBmadResponse,
} from '@bmad-studio/shared';
import type { PermissionMode } from '@bmad-studio/shared';
import { projectService } from '../services/projectService.js';

export const projectController = {
  /**
   * GET /api/projects
   * List all available projects
   */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const projects = await projectService.scanProjects();

      const response: ProjectListResponse = { projects };
      res.json(response);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      // Handle specific error codes
      if (nodeError.code === 'PERMISSION_DENIED') {
        res.status(PROJECT_ERRORS.PERMISSION_DENIED.httpStatus).json({
          error: {
            code: PROJECT_ERRORS.PERMISSION_DENIED.code,
            message: PROJECT_ERRORS.PERMISSION_DENIED.message,
          },
        });
        return;
      }

      if (nodeError.code === 'INVALID_SESSION_INDEX') {
        res.status(PROJECT_ERRORS.INVALID_SESSION_INDEX.httpStatus).json({
          error: {
            code: PROJECT_ERRORS.INVALID_SESSION_INDEX.code,
            message: PROJECT_ERRORS.INVALID_SESSION_INDEX.message,
          },
        });
        return;
      }

      // Generic error
      res.status(PROJECT_ERRORS.SCAN_ERROR.httpStatus).json({
        error: {
          code: PROJECT_ERRORS.SCAN_ERROR.code,
          message: PROJECT_ERRORS.SCAN_ERROR.message,
        },
      });
    }
  },

  /**
   * POST /api/projects
   * Create a new project
   * [Source: Story 3.6 - Task 3]
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { path, setupBmad, bmadVersion } = req.body as CreateProjectRequest;

      if (!path || typeof path !== 'string') {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: '프로젝트 경로가 필요합니다.',
          },
        });
        return;
      }

      const result = await projectService.createProject({ path, setupBmad, bmadVersion });

      // Return 201 for new project, 200 for existing
      const status = result.isExisting ? 200 : 201;
      res.status(status).json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      // Handle specific error codes
      if (nodeError.code === 'INVALID_PATH') {
        res.status(PROJECT_ERRORS.INVALID_PATH_FORMAT.httpStatus).json({
          error: {
            code: PROJECT_ERRORS.INVALID_PATH_FORMAT.code,
            message: nodeError.message || PROJECT_ERRORS.INVALID_PATH_FORMAT.message,
          },
        });
        return;
      }

      // Generic error
      res.status(500).json({
        error: {
          code: 'PROJECT_CREATE_ERROR',
          message: '프로젝트 생성 중 오류가 발생했습니다.',
        },
      });
    }
  },

  /**
   * GET /api/projects/bmad-versions
   * List available BMad method versions
   */
  async bmadVersions(_req: Request, res: Response): Promise<void> {
    try {
      const versions = await projectService.getBmadVersions();
      const response: BmadVersionsResponse = { versions };
      res.json(response);
    } catch {
      res.status(500).json({
        error: {
          code: 'BMAD_VERSIONS_ERROR',
          message: 'BMad 버전 목록을 가져오는 중 오류가 발생했습니다.',
        },
      });
    }
  },

  /**
   * DELETE /api/projects/:projectSlug?deleteFiles=true
   * Delete a project. Optionally also deletes project files on disk.
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const deleteFiles = req.query.deleteFiles === 'true';

      if (!projectSlug) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: '프로젝트 식별자가 필요합니다.',
          },
        });
        return;
      }

      const success = await projectService.deleteProject(projectSlug, deleteFiles);

      if (!success) {
        res.status(404).json({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '해당 프로젝트를 찾을 수 없습니다.',
          },
        });
        return;
      }

      const response: DeleteProjectResponse = { success: true };
      res.json(response);
    } catch (error) {
      console.error('[projectController] Error deleting project:', error);
      res.status(500).json({
        error: {
          code: 'PROJECT_DELETE_ERROR',
          message: '프로젝트 삭제 중 오류가 발생했습니다.',
        },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/setup-bmad
   * Setup BMad for an existing non-BMad project
   */
  async setupBmad(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const { bmadVersion, force } = req.body as SetupBmadRequest;

      if (!projectSlug) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' },
        });
        return;
      }

      const result = await projectService.setupBmadForProject(projectSlug, bmadVersion, Boolean(force));
      const response: SetupBmadResponse = {
        project: result.project,
        installedVersion: result.installedVersion,
      };
      res.json(response);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ALREADY_BMAD') {
        res.status(409).json({
          error: { code: 'ALREADY_BMAD', message: nodeError.message },
        });
        return;
      }

      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message },
        });
        return;
      }

      if (nodeError.code === 'NO_BMAD_VERSION') {
        res.status(500).json({
          error: { code: 'NO_BMAD_VERSION', message: nodeError.message },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'BMAD_SETUP_ERROR', message: 'BMad 설정 중 오류가 발생했습니다.' },
      });
    }
  },

  /**
   * POST /api/projects/validate-path
   * Validate a directory path
   * [Source: Story 3.6 - Task 3]
   */
  async validatePath(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.body as ValidatePathRequest;

      if (!path || typeof path !== 'string') {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: '경로가 필요합니다.',
          },
        });
        return;
      }

      const result = await projectService.validatePath(path);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '경로 검증 중 오류가 발생했습니다.',
        },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/settings
   * Get project settings with effective (merged) values
   */
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' },
        });
        return;
      }
      const settings = await projectService.getProjectSettingsWithEffective(projectSlug);
      res.json(settings);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message },
        });
        return;
      }
      res.status(500).json({
        error: { code: 'SETTINGS_READ_ERROR', message: '설정을 불러오는 중 오류가 발생했습니다.' },
      });
    }
  },

  /**
   * PATCH /api/projects/:projectSlug/settings
   * Update project settings (.bmad-studio/settings.json)
   */
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const settings = req.body as UpdateProjectSettingsRequest;

      if (!projectSlug) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' },
        });
        return;
      }

      // Validate permissionModeOverride (null is allowed = clear override)
      const VALID_PERMISSION_MODES: PermissionMode[] = ['plan', 'default', 'acceptEdits'];
      if (settings.permissionModeOverride !== undefined && settings.permissionModeOverride !== null) {
        if (!VALID_PERMISSION_MODES.includes(settings.permissionModeOverride)) {
          res.status(400).json({
            error: { code: 'INVALID_PERMISSION_MODE', message: `유효하지 않은 Permission Mode: ${settings.permissionModeOverride}` },
          });
          return;
        }
      }

      // Validate modelOverride (null is allowed = clear override, '' is allowed = CLI default)
      if (settings.modelOverride !== undefined && settings.modelOverride !== null) {
        if (typeof settings.modelOverride !== 'string') {
          res.status(400).json({
            error: { code: 'INVALID_MODEL', message: '유효하지 않은 모델 ID입니다.' },
          });
          return;
        }
      }

      const updated = await projectService.updateProjectSettings(projectSlug, settings);
      res.json(updated);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'SETTINGS_UPDATE_ERROR', message: '설정 저장 중 오류가 발생했습니다.' },
      });
    }
  },
};
