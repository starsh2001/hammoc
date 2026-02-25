/**
 * Git Controller
 * HTTP handlers for Git read API endpoints.
 * [Source: Story 16.1 - Task 4]
 */

import { Request, Response } from 'express';
import { GIT_ERRORS, FILE_SYSTEM_ERRORS } from '@bmad-studio/shared';
import { projectService } from '../services/projectService.js';
import { gitService } from '../services/gitService.js';
import { validateProjectPath } from '../middleware/pathGuard.js';

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
};
