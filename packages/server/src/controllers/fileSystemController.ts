/**
 * File System Controller
 * HTTP handlers for file system read and write endpoints.
 * [Source: Story 11.1 - Task 5, Story 11.2 - Task 4]
 */

import { Request, Response } from 'express';
import { FILE_SYSTEM_ERRORS } from '@bmad-studio/shared';
import { projectService } from '../services/projectService.js';
import { fileSystemService } from '../services/fileSystemService.js';

export const fileSystemController = {
  /**
   * GET /api/projects/:projectSlug/fs/read?path=
   * Read file content within a project.
   */
  async readFile(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const filePath = req.query.path as string;

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'path query parameter is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.readFile(projectRoot, filePath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_READ_ERROR.message },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/fs/list?path=
   * List directory entries within a project.
   */
  async listDirectory(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const dirPath = (req.query.path as string) || '.';

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.listDirectory(projectRoot, dirPath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code) {
        res.status(FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code, message: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_READ_ERROR.message },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/fs/tree?path=
   * Get full recursive directory tree within a project.
   */
  async listDirectoryTree(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const dirPath = (req.query.path as string) || '.';

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.listDirectoryTree(projectRoot, dirPath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code) {
        res.status(FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code, message: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_READ_ERROR.message },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/fs/search?query=
   * Search files and directories by name within a project.
   */
  async searchFiles(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const query = req.query.query as string;

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }
      if (!query || !query.trim()) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'query parameter is required' } });
        return;
      }

      const includeHidden = req.query.includeHidden === 'true';
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.searchFiles(projectRoot, query.trim(), 100, includeHidden);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_READ_ERROR.message },
      });
    }
  },

  /**
   * PUT /api/projects/:projectSlug/fs/write?path=
   * Write content to a file within a project.
   */
  async writeFile(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const filePath = req.query.path as string;
      const { content } = req.body || {};

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'path query parameter is required' } });
        return;
      }
      if (content === undefined || content === null || typeof content !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'content must be a string in request body' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.writeFile(projectRoot, filePath, content);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.message },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/fs/create?path=
   * Create a file or directory within a project.
   */
  async createEntry(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const entryPath = req.query.path as string;
      const { type } = req.body || {};
      const entryType = type || 'file';

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }
      if (!entryPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'path query parameter is required' } });
        return;
      }
      if (type !== undefined && type !== 'file' && type !== 'directory') {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'type must be "file" or "directory"' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.createEntry(projectRoot, entryPath, entryType);
      res.status(201).json(result);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.code, message: FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.message },
      });
    }
  },

  /**
   * DELETE /api/projects/:projectSlug/fs/delete?path=&force=
   * Delete a file or directory within a project.
   */
  async deleteEntry(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const entryPath = req.query.path as string;
      const force = req.query.force === 'true';

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }
      if (!entryPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'path query parameter is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.deleteEntry(projectRoot, entryPath, force);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PROTECTED_PATH.code) {
        res.status(FILE_SYSTEM_ERRORS.PROTECTED_PATH.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PROTECTED_PATH.code, message: FILE_SYSTEM_ERRORS.PROTECTED_PATH.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.message },
      });
    }
  },

  /**
   * PATCH /api/projects/:projectSlug/fs/rename?path=&newPath=
   * Rename a file or directory within a project.
   */
  async renameEntry(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const entryPath = req.query.path as string;
      const newPath = req.query.newPath as string;

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }
      if (!entryPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'path query parameter is required' } });
        return;
      }
      if (!newPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'newPath query parameter is required' } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.renameEntry(projectRoot, entryPath, newPath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.code) {
        res.status(FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.code, message: FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.message },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.message },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.message },
      });
    }
  },
};
