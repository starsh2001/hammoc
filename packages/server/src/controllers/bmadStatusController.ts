import path from 'path';
import { Request, Response } from 'express';
import { BMAD_STATUS_ERRORS } from '@bmad-studio/shared';
import { projectService } from '../services/projectService.js';
import { bmadStatusService } from '../services/bmadStatusService.js';

// Same pattern as fileSystemController.resolveProjectPath
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

export const bmadStatusController = {
  async getBmadStatus(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: '프로젝트 식별자가 필요합니다.' } });
        return;
      }

      const projectRoot = await resolveProjectPath(projectSlug);
      const result = await bmadStatusService.scanProject(projectRoot);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res
          .status(404)
          .json({ error: { code: 'PROJECT_NOT_FOUND', message: nodeError.message } });
        return;
      }
      if (nodeError.code === BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.code) {
        res.status(BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.httpStatus).json({
          error: {
            code: BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.code,
            message: BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.message,
          },
        });
        return;
      }
      if (nodeError.code === BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.code) {
        res.status(BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.httpStatus).json({
          error: {
            code: BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.code,
            message: BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.message,
          },
        });
        return;
      }
      res.status(BMAD_STATUS_ERRORS.SCAN_ERROR.httpStatus).json({
        error: {
          code: BMAD_STATUS_ERRORS.SCAN_ERROR.code,
          message: BMAD_STATUS_ERRORS.SCAN_ERROR.message,
        },
      });
    }
  },
};
