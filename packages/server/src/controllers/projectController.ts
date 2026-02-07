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
} from '@bmad-studio/shared';
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
};
