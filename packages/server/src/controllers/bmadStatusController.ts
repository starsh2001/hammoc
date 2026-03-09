import { Request, Response } from 'express';
import { BMAD_STATUS_ERRORS } from '@hammoc/shared';
import { projectService } from '../services/projectService.js';
import { bmadStatusService } from '../services/bmadStatusService.js';

export const bmadStatusController = {
  async getBmadStatus(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      if (!projectSlug) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_REQUEST', message: req.t!('project.validation.slugRequired') } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await bmadStatusService.scanProject(projectRoot);
      res.json(result);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res
          .status(404)
          .json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('project.error.notFound') } });
        return;
      }
      if (nodeError.code === BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.code) {
        res.status(BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.httpStatus).json({
          error: {
            code: BMAD_STATUS_ERRORS.NOT_BMAD_PROJECT.code,
            message: req.t!('bmadStatus.error.notBmadProject'),
          },
        });
        return;
      }
      if (nodeError.code === BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.code) {
        res.status(BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.httpStatus).json({
          error: {
            code: BMAD_STATUS_ERRORS.CONFIG_PARSE_ERROR.code,
            message: req.t!('bmadStatus.error.configParseError'),
          },
        });
        return;
      }
      res.status(BMAD_STATUS_ERRORS.SCAN_ERROR.httpStatus).json({
        error: {
          code: BMAD_STATUS_ERRORS.SCAN_ERROR.code,
          message: req.t!('bmadStatus.error.scanError'),
        },
      });
    }
  },
};
