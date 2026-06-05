/**
 * System Browse Controller
 * HTTP handlers for the directory-only system browse API (Epic 34, Story 34.1).
 *
 * Unlike fileSystemController, this controller does NOT resolve a projectSlug —
 * it receives ABSOLUTE paths directly (the API runs before a project exists).
 * Error → HTTP mapping follows the fileSystemController idiom (read the domain
 * `code` off the thrown error, map to SYSTEM_BROWSE_ERRORS.httpStatus + an i18n
 * message), but because every code maps to the same i18n key across all three
 * handlers, the mapping is centralized in one helper instead of repeated.
 * [Source: packages/server/src/controllers/fileSystemController.ts:34-55, 358-385;
 *          docs/architecture/18-error-handling-strategy.md#Error Response Format]
 */

import { Request, Response } from 'express';
import { SYSTEM_BROWSE_ERRORS } from '@hammoc/shared';
import { systemBrowseService } from '../services/systemBrowseService.js';

/** Sentinel for the client's virtual "My PC" node (explicit drive-roots request). */
const MYPC_SENTINEL = '__MYPC__';

/** Domain error code → i18n message key (systemBrowse.error.*). */
const ERROR_I18N_KEY: Record<string, string> = {
  INVALID_PATH: 'systemBrowse.error.invalidPath',
  NOT_FOUND: 'systemBrowse.error.notFound',
  NOT_A_DIRECTORY: 'systemBrowse.error.notADirectory',
  PERMISSION_DENIED: 'systemBrowse.error.permissionDenied',
  ALREADY_EXISTS: 'systemBrowse.error.alreadyExists',
  INVALID_NAME: 'systemBrowse.error.invalidName',
  BROWSE_ERROR: 'systemBrowse.error.browseError',
};

/**
 * Map a thrown service error to a consistent { error: { code, message } } body.
 * Unknown codes fall back to BROWSE_ERROR (500).
 */
function handleBrowseError(error: unknown, req: Request, res: Response): void {
  const code = (error as NodeJS.ErrnoException).code;
  const known =
    code && code in SYSTEM_BROWSE_ERRORS
      ? SYSTEM_BROWSE_ERRORS[code as keyof typeof SYSTEM_BROWSE_ERRORS]
      : SYSTEM_BROWSE_ERRORS.BROWSE_ERROR;
  const i18nKey = ERROR_I18N_KEY[known.code] ?? ERROR_I18N_KEY.BROWSE_ERROR!;
  res.status(known.httpStatus).json({
    error: { code: known.code, message: req.t!(i18nKey) },
  });
}

export const systemBrowseController = {
  /**
   * GET /api/system/browse?path=
   * No path (or the __MYPC__ sentinel) → drive roots; otherwise list the
   * absolute directory's child directories.
   */
  async browse(req: Request, res: Response): Promise<void> {
    try {
      const queryPath = typeof req.query.path === 'string' ? req.query.path : undefined;
      const result =
        !queryPath || queryPath === MYPC_SENTINEL
          ? await systemBrowseService.listDriveRoots()
          : await systemBrowseService.listDirectory(queryPath);
      res.json(result);
    } catch (error) {
      handleBrowseError(error, req, res);
    }
  },

  /**
   * POST /api/system/browse/mkdir  body { parentPath, name }
   * Create a new folder under an absolute parent directory.
   */
  async mkdir(req: Request, res: Response): Promise<void> {
    try {
      const { parentPath, name } = req.body ?? {};
      if (typeof parentPath !== 'string' || parentPath.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('systemBrowse.validation.parentPathRequired') } });
        return;
      }
      if (typeof name !== 'string' || name.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('systemBrowse.validation.nameRequired') } });
        return;
      }
      const result = await systemBrowseService.makeDirectory(parentPath, name);
      res.status(201).json(result);
    } catch (error) {
      handleBrowseError(error, req, res);
    }
  },

  /**
   * POST /api/system/browse/rename  body { path, newName }
   * Rename an entry within its same parent directory.
   */
  async rename(req: Request, res: Response): Promise<void> {
    try {
      const { path: targetPath, newName } = req.body ?? {};
      if (typeof targetPath !== 'string' || targetPath.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('systemBrowse.validation.pathRequired') } });
        return;
      }
      if (typeof newName !== 'string' || newName.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: req.t!('systemBrowse.validation.newNameRequired') } });
        return;
      }
      const result = await systemBrowseService.rename(targetPath, newName);
      res.json(result);
    } catch (error) {
      handleBrowseError(error, req, res);
    }
  },
};
