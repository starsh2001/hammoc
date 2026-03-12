/**
 * File System Routes
 * Endpoints for file reading, writing, and management within projects.
 * [Source: Story 11.1 - Task 6, Story 11.2 - Task 5]
 */

import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import multer from 'multer';
import { fileSystemController } from '../controllers/fileSystemController.js';

const router = Router();

// Write body size limit: 5MB (default 100KB is too small for file editing)
const largeBodyParser = express.json({ limit: '5mb' });

// File upload middleware: 10MB per file, max 10 files (100MB total max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

// Wrapper to convert multer errors to JSON responses
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.array('files')(req, res, (err: unknown) => {
    if (err && err instanceof Error && 'code' in err) {
      const code = (err as Error & { code: string }).code;
      const multerMessages: Record<string, string> = {
        LIMIT_FILE_SIZE: 'File size exceeds the 10MB limit',
        LIMIT_FILE_COUNT: 'Too many files (max 10)',
        LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
      };
      if (multerMessages[code]) {
        res.status(400).json({
          error: { code: 'UPLOAD_ERROR', message: multerMessages[code] },
        });
        return;
      }
    }
    if (err) {
      res.status(500).json({
        error: { code: 'UPLOAD_ERROR', message: (err as Error).message },
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
