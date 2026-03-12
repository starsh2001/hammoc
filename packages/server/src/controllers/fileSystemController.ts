/**
 * File System Controller
 * HTTP handlers for file system read and write endpoints.
 * [Source: Story 11.1 - Task 5, Story 11.2 - Task 4]
 */

import { Request, Response } from 'express';
import { FILE_SYSTEM_ERRORS } from '@hammoc/shared';
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.readFile(projectRoot, filePath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: req.t!('fs.error.fileNotFound') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: req.t!('fs.error.readError') },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/fs/raw?path=
   * Serve raw file content with appropriate Content-Type header.
   */
  async readFileRaw(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const filePath = req.query.path as string;

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const { stream, size, mimeType } = await fileSystemService.readFileRaw(projectRoot, filePath);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', size);
      res.setHeader('Cache-Control', 'no-cache');

      // Support download mode with Content-Disposition header (RFC 5987)
      if (req.query.download === 'true') {
        const fileName = filePath.split('/').pop() || 'download';
        const encodedName = encodeURIComponent(fileName).replace(/['()]/g, escape);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedName}`);
      }

      stream.pipe(res);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: req.t!('fs.error.fileNotFound') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: req.t!('fs.error.readError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.listDirectory(projectRoot, dirPath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code, message: req.t!('fs.error.directoryNotFound') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code) {
        res.status(FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code, message: req.t!('fs.error.notADirectory') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: req.t!('fs.error.readError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.listDirectoryTree(projectRoot, dirPath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code, message: req.t!('fs.error.directoryNotFound') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code) {
        res.status(FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code, message: req.t!('fs.error.notADirectory') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: req.t!('fs.error.readError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!query || !query.trim()) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.queryRequired') } });
        return;
      }

      const includeHidden = req.query.includeHidden === 'true';
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.searchFiles(projectRoot, query.trim(), 100, includeHidden);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_READ_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_READ_ERROR.code, message: req.t!('fs.error.readError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }
      if (content === undefined || content === null || typeof content !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.contentRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.writeFile(projectRoot, filePath, content);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: req.t!('fs.error.parentNotFound') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: req.t!('fs.error.writeError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!entryPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }
      if (type !== undefined && type !== 'file' && type !== 'directory') {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.typeRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.createEntry(projectRoot, entryPath, entryType);
      res.status(201).json(result);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.code, message: req.t!('fs.error.fileAlreadyExists') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: req.t!('fs.error.parentNotFound') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: req.t!('fs.error.writeError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!entryPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.deleteEntry(projectRoot, entryPath, force);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: req.t!('fs.error.fileNotFound') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PROTECTED_PATH.code) {
        res.status(FILE_SYSTEM_ERRORS.PROTECTED_PATH.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PROTECTED_PATH.code, message: req.t!('fs.error.protectedPath') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: req.t!('fs.error.writeError') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/fs/copy?sourcePath=&destinationPath=
   * Copy a file or directory within a project.
   */
  async copyEntry(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const sourcePath = req.query.sourcePath as string;
      const destinationPath = req.query.destinationPath as string;

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!sourcePath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }
      if (!destinationPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.newPathRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.copyEntry(projectRoot, sourcePath, destinationPath);
      res.status(201).json(result);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: req.t!('fs.error.fileNotFound') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.COPY_TARGET_EXISTS.code) {
        res.status(FILE_SYSTEM_ERRORS.COPY_TARGET_EXISTS.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.COPY_TARGET_EXISTS.code, message: req.t!('fs.error.copyTargetExists') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: req.t!('fs.error.parentNotFound') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: req.t!('fs.error.writeError') },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/fs/upload?path=
   * Upload files to a directory within a project.
   */
  async uploadFiles(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const targetDir = (req.query.path as string) || '.';

      if (!projectSlug) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.filesRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.uploadFiles(projectRoot, targetDir, files);
      res.status(201).json(result);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_ALREADY_EXISTS.code, message: req.t!('fs.error.fileAlreadyExists') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.DIRECTORY_NOT_FOUND.code, message: req.t!('fs.error.directoryNotFound') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code) {
        res.status(FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.NOT_A_DIRECTORY.code, message: req.t!('fs.error.notADirectory') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.UPLOAD_ERROR.code) {
        res.status(FILE_SYSTEM_ERRORS.UPLOAD_ERROR.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.UPLOAD_ERROR.code, message: req.t!('fs.error.uploadError') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: req.t!('fs.error.writeError') },
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
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.slugRequired') } });
        return;
      }
      if (!entryPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.pathRequired') } });
        return;
      }
      if (!newPath) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('fs.validation.newPathRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await fileSystemService.renameEntry(projectRoot, entryPath, newPath);
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
      if (nodeError.code === FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.FILE_NOT_FOUND.code, message: req.t!('fs.error.fileNotFound') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.code) {
        res.status(FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.RENAME_TARGET_EXISTS.code, message: req.t!('fs.error.renameTargetExists') },
        });
        return;
      }
      if (nodeError.code === FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code) {
        res.status(FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.httpStatus).json({
          error: { code: FILE_SYSTEM_ERRORS.PARENT_NOT_FOUND.code, message: req.t!('fs.error.parentNotFound') },
        });
        return;
      }
      res.status(FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.httpStatus).json({
        error: { code: FILE_SYSTEM_ERRORS.FS_WRITE_ERROR.code, message: req.t!('fs.error.writeError') },
      });
    }
  },
};
