/**
 * Git Controller
 * HTTP handlers for Git read and write API endpoints.
 * [Source: Story 16.1 - Task 4, Story 16.2 - Task 3]
 */

import { Request, Response } from 'express';
import { GIT_ERRORS, FILE_SYSTEM_ERRORS } from '@bmad-studio/shared';
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
   * Returns current branch, staged/unstaged/untracked files, ahead/behind counts.
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await gitService.getStatus(projectRoot);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/git/log?limit=&offset=
   * Returns commit history with pagination.
   */
  async getLog(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
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
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/git/branches
   * Returns local and remote branches with current branch.
   */
  async getBranches(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await gitService.getBranches(projectRoot);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/git/diff?file=&staged=
   * Returns diff for a specific file (staged or unstaged).
   */
  async getDiff(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const file = req.query.file as string;
      if (!file) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'file query parameter is required' } });
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
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code) {
        res.status(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  // ── Write operations (Story 16.2) ──

  /**
   * POST /api/projects/:projectSlug/git/init
   * Initialize a Git repository in the project directory.
   */
  async init(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.init(projectRoot);
      res.json({ success: true, message: 'Git repository initialized' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/stage
   * Stage files for commit.
   */
  async stage(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const { files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: 'files array is required and must not be empty' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      for (const file of files) {
        validateProjectPath(projectRoot, file);
      }

      await gitService.stage(projectRoot, files);
      res.json({ success: true, message: 'Files staged successfully' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code) {
        res.status(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/unstage
   * Unstage files from the index.
   */
  async unstage(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const { files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: 'files array is required and must not be empty' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      for (const file of files) {
        validateProjectPath(projectRoot, file);
      }

      await gitService.unstage(projectRoot, files);
      res.json({ success: true, message: 'Files unstaged successfully' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code) {
        res.status(FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.code, message: FILE_SYSTEM_ERRORS.PATH_TRAVERSAL.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/commit
   * Commit staged changes with a message.
   */
  async commit(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: 'commit message is required and must not be empty' } });
        return;
      }

      if (message.length > 10000) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Commit message exceeds maximum length of 10,000 characters',
          },
        });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.commit(projectRoot, message.trim());
      res.json({ success: true, message: 'Changes committed successfully' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (nodeError.code === 'GIT_NOTHING_TO_COMMIT') {
        res.status(GIT_ERRORS.GIT_NOTHING_TO_COMMIT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOTHING_TO_COMMIT.code, message: GIT_ERRORS.GIT_NOTHING_TO_COMMIT.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/push
   * Push current branch to remote.
   */
  async push(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.push(projectRoot);
      res.json({ success: true, message: 'Pushed to remote successfully' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (isConflictError(nodeError)) {
        res.status(GIT_ERRORS.GIT_CONFLICT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: nodeError.message || GIT_ERRORS.GIT_CONFLICT.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/pull
   * Pull current branch from remote.
   */
  async pull(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.pull(projectRoot);
      res.json({ success: true, message: 'Pulled from remote successfully' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (isConflictError(nodeError)) {
        res.status(GIT_ERRORS.GIT_CONFLICT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: nodeError.message || GIT_ERRORS.GIT_CONFLICT.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/checkout
   * Switch to an existing branch.
   */
  async checkout(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const { branch } = req.body;
      if (!branch || typeof branch !== 'string' || branch.trim().length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'branch name is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.checkout(projectRoot, branch);
      res.json({ success: true, message: `Switched to branch ${branch}` });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (isConflictError(nodeError)) {
        res.status(GIT_ERRORS.GIT_CONFLICT.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_CONFLICT.code, message: nodeError.message || GIT_ERRORS.GIT_CONFLICT.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/git/branch
   * Create a new branch (without switching to it).
   */
  async createBranch(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'projectSlug is required' } });
        return;
      }

      const { name, startPoint } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'branch name is required' } });
        return;
      }

      if (!isValidBranchName(name)) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid branch name: contains invalid characters' },
        });
        return;
      }

      if (startPoint !== undefined) {
        if (typeof startPoint !== 'string' || startPoint.trim().length === 0) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: 'startPoint must be a non-empty string if provided' },
          });
          return;
        }
        if (!isValidBranchName(startPoint.trim())) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: 'Invalid startPoint: contains invalid characters' },
          });
          return;
        }
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await gitService.createBranch(projectRoot, name, startPoint?.trim());
      res.json({ success: true, message: `Branch ${name} created successfully` });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === 'GIT_NOT_INITIALIZED') {
        res.status(GIT_ERRORS.GIT_NOT_INITIALIZED.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_NOT_INITIALIZED.code, message: GIT_ERRORS.GIT_NOT_INITIALIZED.message },
        });
        return;
      }
      if (nodeError.code === 'GIT_BRANCH_EXISTS') {
        res.status(GIT_ERRORS.GIT_BRANCH_EXISTS.httpStatus).json({
          error: { code: GIT_ERRORS.GIT_BRANCH_EXISTS.code, message: GIT_ERRORS.GIT_BRANCH_EXISTS.message },
        });
        return;
      }
      res.status(GIT_ERRORS.GIT_ERROR.httpStatus).json({
        error: { code: GIT_ERRORS.GIT_ERROR.code, message: nodeError.message || GIT_ERRORS.GIT_ERROR.message },
      });
    }
  },
};
