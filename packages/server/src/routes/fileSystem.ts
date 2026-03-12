/**
 * File System Routes
 * Endpoints for file reading, writing, and management within projects.
 * [Source: Story 11.1 - Task 6, Story 11.2 - Task 5]
 */

import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import multer from 'multer';
import i18next from '../i18n.js';
import { fileSystemController } from '../controllers/fileSystemController.js';

const router = Router();

// Write body size limit: 5MB (default 100KB is too small for file editing)
const largeBodyParser = express.json({ limit: '5mb' });

// File upload middleware: 10MB per file, max 10 files
// Uses disk storage to avoid holding large buffers in memory
const upload = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

// Wrapper to convert multer errors to JSON responses
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.array('files')(req, res, (err: unknown) => {
    if (err && err instanceof Error && 'code' in err) {
      const code = (err as Error & { code: string }).code;
      const t = i18next.getFixedT(req.language || 'en');
      const multerI18nKeys: Record<string, string> = {
        LIMIT_FILE_SIZE: 'fs.error.uploadLimitFileSize',
        LIMIT_FILE_COUNT: 'fs.error.uploadLimitFileCount',
        LIMIT_UNEXPECTED_FILE: 'fs.error.uploadLimitUnexpectedFile',
      };
      if (multerI18nKeys[code]) {
        res.status(400).json({
          error: { code: 'UPLOAD_ERROR', message: t(multerI18nKeys[code]) },
        });
        return;
      }
    }
    if (err) {
      const t = i18next.getFixedT(req.language || 'en');
      res.status(500).json({
        error: { code: 'UPLOAD_ERROR', message: t('fs.error.uploadError') },
      });
      return;
    }
    next();
  });
}

// Read routes (Story 11.1)
router.get('/:projectSlug/fs/read', fileSystemController.readFile);
router.get('/:projectSlug/fs/raw', fileSystemController.readFileRaw);
router.get('/:projectSlug/fs/list', fileSystemController.listDirectory);
router.get('/:projectSlug/fs/tree', fileSystemController.listDirectoryTree);
router.get('/:projectSlug/fs/search', fileSystemController.searchFiles);

// Write routes (Story 11.2)
router.put('/:projectSlug/fs/write', largeBodyParser, fileSystemController.writeFile);
router.post('/:projectSlug/fs/create', largeBodyParser, fileSystemController.createEntry);
router.delete('/:projectSlug/fs/delete', fileSystemController.deleteEntry);
router.patch('/:projectSlug/fs/rename', fileSystemController.renameEntry);

// Copy and upload routes
router.post('/:projectSlug/fs/copy', fileSystemController.copyEntry);
router.post('/:projectSlug/fs/upload', handleUpload, fileSystemController.uploadFiles);

export default router;
