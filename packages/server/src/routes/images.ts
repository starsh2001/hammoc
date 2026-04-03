/**
 * Image Serving Routes
 * Story 27.2: Serve stored session images with immutable cache headers
 */

import { Router, Request, Response } from 'express';
import { access, constants } from 'fs/promises';
import path from 'path';
import { sessionService } from '../services/sessionService.js';
import { imageStorageService } from '../services/imageStorageService.js';

const router = Router();

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * GET /api/projects/:projectSlug/sessions/:sessionId/images/:filename
 * Serves stored session images with immutable cache headers.
 */
router.get(
  '/:projectSlug/sessions/:sessionId/images/:filename',
  async (req: Request, res: Response) => {
    const { projectSlug, sessionId, filename } = req.params;

    // Validate path params
    if (!sessionService.isValidPathParam(projectSlug) || !sessionService.isValidPathParam(sessionId)) {
      res.status(400).json({ error: 'Invalid path parameters' });
      return;
    }

    // Validate filename format (also prevents path traversal)
    const imagePath = imageStorageService.getImagePath(projectSlug, sessionId, filename);
    if (!imagePath) {
      res.status(400).json({ error: 'Invalid filename format' });
      return;
    }

    // Check file exists (async to avoid blocking event loop)
    try {
      await access(imagePath, constants.R_OK);
    } catch {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    // Set content type and immutable cache headers
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(imagePath);
  },
);

export default router;
