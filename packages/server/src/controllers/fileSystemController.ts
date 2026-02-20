/**
 * File System Controller
 * HTTP handlers for file read and directory list endpoints.
 * [Source: Story 11.1 - Task 5]
 */

import path from 'path';
import { Request, Response } from 'express';
import { FILE_SYSTEM_ERRORS } from '@bmad-studio/shared';
import { projectService } from '../services/projectService.js';
import { fileSystemService } from '../services/fileSystemService.js';

/**
 * Resolve projectSlug to actual project disk path.
 * Uses projectService.parseSessionsIndex() to extract originalPath.
 */
async function resolveProjectPath(projectSlug: string): Promise<string> {
  const projectDir = path.join(projectService.getClaudeProjectsDir(), projectSlug);
  const info = await projectService.parseSessionsIndex(projectDir, projectSlug);
  if (!info) {
    const err = new Error('프로젝트를 찾을 수 없습니다.');
    (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
    throw err;
  }
  return info.originalPath;
}

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

      const projectRoot = await resolveProjectPath(projectSlug);
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

      const projectRoot = await resolveProjectPath(projectSlug);
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
};
