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
} from '@hammoc/shared';
import type { PermissionMode } from '@hammoc/shared';
import { validateBoardConfig } from '@hammoc/shared';
import { projectService } from '../services/projectService.js';
import { DEFAULT_WORKSPACE_TEMPLATE, TEMPLATE_VARIABLES, resolveTemplateVariables } from '../services/chatService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('projectController');

export const projectController = {
  /**
   * GET /api/projects
   * List all available projects
   */
  async list(req: Request, res: Response): Promise<void> {
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
            message: req.t!('project.error.permissionDenied'),
          },
        });
        return;
      }

      if (nodeError.code === 'INVALID_SESSION_INDEX') {
        res.status(PROJECT_ERRORS.INVALID_SESSION_INDEX.httpStatus).json({
          error: {
            code: PROJECT_ERRORS.INVALID_SESSION_INDEX.code,
            message: req.t!('project.error.invalidSessionIndex'),
          },
        });
        return;
      }

      // Generic error
      res.status(PROJECT_ERRORS.SCAN_ERROR.httpStatus).json({
        error: {
          code: PROJECT_ERRORS.SCAN_ERROR.code,
          message: req.t!('project.error.scanError'),
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
            message: req.t!('project.validation.pathRequired'),
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
            message: req.t!('project.validation.invalidPathFormat'),
          },
        });
        return;
      }

      // Generic error
      res.status(500).json({
        error: {
          code: 'PROJECT_CREATE_ERROR',
          message: req.t!('project.error.createFailed'),
        },
      });
    }
  },

  /**
   * GET /api/projects/bmad-versions
   * List available BMad method versions
   */
  async bmadVersions(req: Request, res: Response): Promise<void> {
    try {
      const versions = await projectService.getBmadVersions();
      const response: BmadVersionsResponse = { versions };
      res.json(response);
    } catch {
      res.status(500).json({
        error: {
          code: 'BMAD_VERSIONS_ERROR',
          message: req.t!('project.error.bmadVersionsFailed'),
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
            message: req.t!('project.validation.slugRequired'),
          },
        });
        return;
      }

      const success = await projectService.deleteProject(projectSlug, deleteFiles);

      if (!success) {
        res.status(404).json({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: req.t!('project.error.notFound'),
          },
        });
        return;
      }

      const response: DeleteProjectResponse = { success: true };
      res.json(response);
    } catch (error) {
      log.error('Error deleting project:', error);
      res.status(500).json({
        error: {
          code: 'PROJECT_DELETE_ERROR',
          message: req.t!('project.error.deleteFailed'),
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
          error: { code: 'INVALID_REQUEST', message: req.t!('project.validation.slugRequired') },
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
          error: { code: 'ALREADY_BMAD', message: req.t!('project.error.alreadyBmad') },
        });
        return;
      }

      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') },
        });
        return;
      }

      if (nodeError.code === 'NO_BMAD_VERSION') {
        res.status(500).json({
          error: { code: 'NO_BMAD_VERSION', message: req.t!('project.error.bmadVersionsFailed') },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'BMAD_SETUP_ERROR', message: req.t!('project.error.bmadSetupFailed') },
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
            message: req.t!('project.validation.pathParameterRequired'),
          },
        });
        return;
      }

      const result = await projectService.validatePath(path);
      // Wrap service-level error text with translated message (Task 4.3)
      if (result.error) {
        result.error = req.t!('project.validation.invalidPathFormat');
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: req.t!('project.error.validatePathFailed'),
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
          error: { code: 'INVALID_REQUEST', message: req.t!('project.validation.slugRequired') },
        });
        return;
      }
      const settings = await projectService.getProjectSettingsWithEffective(projectSlug);
      res.json(settings);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') },
        });
        return;
      }
      res.status(500).json({
        error: { code: 'SETTINGS_READ_ERROR', message: req.t!('project.error.settingsLoadFailed') },
      });
    }
  },

  /**
   * PATCH /api/projects/:projectSlug/settings
   * Update project settings (.hammoc/settings.json)
   */
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const settings = req.body as UpdateProjectSettingsRequest;

      if (!projectSlug) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: req.t!('project.validation.slugRequired') },
        });
        return;
      }

      // Validate permissionModeOverride (null is allowed = clear override)
      const VALID_PERMISSION_MODES: PermissionMode[] = ['plan', 'default', 'acceptEdits'];
      if (settings.permissionModeOverride !== undefined && settings.permissionModeOverride !== null) {
        if (!VALID_PERMISSION_MODES.includes(settings.permissionModeOverride)) {
          res.status(400).json({
            error: { code: 'INVALID_PERMISSION_MODE', message: req.t!('project.validation.invalidPermissionMode', { value: settings.permissionModeOverride }) },
          });
          return;
        }
      }

      // Validate modelOverride (null is allowed = clear override, '' is allowed = CLI default)
      if (settings.modelOverride !== undefined && settings.modelOverride !== null) {
        if (typeof settings.modelOverride !== 'string') {
          res.status(400).json({
            error: { code: 'INVALID_MODEL', message: req.t!('project.validation.invalidModelId') },
          });
          return;
        }
      }

      // Validate boardConfig if provided (null = clear override)
      if (settings.boardConfig !== undefined && settings.boardConfig !== null) {
        const configErrors = validateBoardConfig(settings.boardConfig);
        if (configErrors.length > 0) {
          res.status(400).json({
            error: { code: 'INVALID_BOARD_CONFIG', message: configErrors.join(', ') },
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
          error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'SETTINGS_UPDATE_ERROR', message: req.t!('project.error.settingsSaveFailed') },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/system-prompt
   * Return the default template and resolved preview for the project
   */
  async getSystemPrompt(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: req.t!('project.validation.slugRequired') },
        });
        return;
      }

      const projectPath = await projectService.resolveProjectPath(projectSlug);
      if (!projectPath) {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') },
        });
        return;
      }

      const resolved = resolveTemplateVariables(DEFAULT_WORKSPACE_TEMPLATE, projectPath);
      res.json({
        template: DEFAULT_WORKSPACE_TEMPLATE,
        resolved,
        variables: TEMPLATE_VARIABLES,
      });
    } catch (error) {
      log.error('Error getting system prompt:', error);
      res.status(500).json({
        error: { code: 'SYSTEM_PROMPT_ERROR', message: req.t!('project.error.systemPromptFailed') },
      });
    }
  },
};
