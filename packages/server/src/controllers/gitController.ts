/**
 * Git Controller
 * HTTP handlers for Git read and write API endpoints.
 * [Source: Story 16.1 - Task 4, Story 16.2 - Task 3]
 */

import { Request, Response } from 'express';
import { GIT_ERRORS, FILE_SYSTEM_ERRORS } from '@hammoc/shared';
import { projectService } from '../services/projectService.js';
import { gitService } from '../services/gitService.js';
import { validateProjectPath } from '../middleware/pathGuard.js';

/** Detect Git conflict/rejection errors by message pattern matching */
function isConflictError(error: NodeJS.ErrnoException): boolean {
  const msg = (error.message || '').toLowerCase();
  return ['conflict', 'rejected', 'would be overwritten', 'not possible because you have unmerged files'].some(
    (pattern) => msg.includes(pattern),
  );
}

/** Validate branch/ref name format — reject invalid characters */
function isValidBranchName(name: string): boolean {
  if (!name || name.trim() !== name) return false;
  if (name.startsWith('/') || name.endsWith('/') || name.startsWith('.') || name.endsWith('.')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s~^:\\]|\.\./.test(name) || /[\x00-\x1f\x7f]/.test(name)) return false;
  return true;
}

export const gitController = {
  /**
   * GET /api/projects/:projectSlug/git/status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await gitService.getStatus(projectRoot);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/git/log?limit=&offset=
   */
  async getLog(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const limit = Math.max(1, parseInt(req.query.limit as string) || 20);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await gitService.getLog(projectRoot, limit, offset);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/git/branches
   */
  async getBranches(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await gitService.getBranches(projectRoot);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/git/diff?file=&staged=
   */
  async getDiff(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const file = req.query.file as string;
      if (!file) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.fileRequired') } });
        return;
      }

      const staged = req.query.staged === 'true';

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      validateProjectPath(projectRoot, file);

      const result = await gitService.getDiff(projectRoot, file, staged);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code) {
        res.status(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: req.t!('fs.error.pathTraversal') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  // ── Write operations (Story 16.2) ──

  /**
   * POST /api/projects/:projectSlug/git/init
   */
  async init(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.init(projectRoot);
      res.json({ success: true, message: req.t!('git.success.initialized') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/stage
   */
  async stage(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const { files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.filesRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      for (const file of files) {
        validateProjectPath(projectRoot, file);
      }

      await gitService.stage(projectRoot, files);
      res.json({ success: true, message: req.t!('git.success.staged') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code) {
        res.status(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: req.t!('fs.error.pathTraversal') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/unstage
   */
  async unstage(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const { files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.filesRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      for (const file of files) {
        validateProjectPath(projectRoot, file);
      }

      await gitService.unstage(projectRoot, files);
      res.json({ success: true, message: req.t!('git.success.unstaged') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code) {
        res.status(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: req.t!('fs.error.pathTraversal') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/commit
   */
  async commit(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.commitMessageRequired') } });
        return;
      }

      if (message.length > 10000) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: req.t!('git.validation.commitMessageTooLong'),
          },
        });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.commit(projectRoot, message.trim());
      res.json({ success: true, message: req.t!('git.success.committed') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (nodeError.code === 'GIT_NOTHING_TO_COMMIT') {
        res.status(GIT_ERRORS.GIT_NOTHING_TO_COMMIT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOTHING_TO_COMMIT.code, message: req.t!('git.error.nothingToCommit') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/push
   */
  async push(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.push(projectRoot);
      res.json({ success: true, message: req.t!('git.success.pushed') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (isConflictError(nodeError)) {
        res.status(GIT_ERRORS.GIT_CONFLICT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: req.t!('git.error.conflict') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/pull
   */
  async pull(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.pull(projectRoot);
      res.json({ success: true, message: req.t!('git.success.pulled') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (isConflictError(nodeError)) {
        res.status(GIT_ERRORS.GIT_CONFLICT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: req.t!('git.error.conflict') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/checkout
   */
  async checkout(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const { branch } = req.body;
      if (!branch || typeof branch !== 'string' || branch.trim().length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.branchRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.checkout(projectRoot, branch);
      res.json({ success: true, message: req.t!('git.success.switchedBranch', { value: branch }) });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (isConflictError(nodeError)) {
        res.status(GIT_ERRORS.GIT_CONFLICT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: req.t!('git.error.conflict') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/branch
   */
  async createBranch(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.slugRequired') } });
        return;
      }

      const { name, startPoint } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.branchRequired') } });
        return;
      }

      if (!isValidBranchName(name)) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.invalidBranchName') },
        });
        return;
      }

      if (startPoint !== undefined) {
        if (typeof startPoint !== 'string' || startPoint.trim().length === 0) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.startPointFormat') },
          });
          return;
        }
        if (!isValidBranchName(startPoint.trim())) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: req.t!('git.validation.invalidStartPoint') },
          });
          return;
        }
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.createBranch(projectRoot, name, startPoint?.trim());
      res.json({ success: true, message: req.t!('git.success.branchCreated', { value: name }) });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: req.t!('git.error.notInitialized') },
        });
        return;
      }
      if (nodeError.code === 'GIT_BRANCH_EXISTS') {
        res.status(GIT_ERRORS.GIT_BRANCH_EXISTS.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_BRANCH_EXISTS.code, message: req.t!('git.error.branchExists') },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: req.t!('git.error.operationFailed') },
      });
    }
  },
};
