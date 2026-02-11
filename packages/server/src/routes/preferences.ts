/**
 * Preferences Routes
 * Global user preferences endpoints
 */

import { Router, Request, Response } from 'express';
import { preferencesService } from '../services/preferencesService.js';

const router = Router();

// GET /api/preferences — Read all preferences
router.get('/', async (_req: Request, res: Response) => {
  try {
    const preferences = await preferencesService.readPreferences();
    res.json(preferences);
  } catch {
    res.status(500).json({ error: { code: 'PREFERENCES_READ_ERROR', message: 'Failed to read preferences' } });
  }
});

// PATCH /api/preferences — Update preferences (merge)
router.patch('/', async (req: Request, res: Response) => {
  try {
    const updated = await preferencesService.writePreferences(req.body);
    res.json(updated);
  } catch {
    res.status(500).json({ error: { code: 'PREFERENCES_WRITE_ERROR', message: 'Failed to write preferences' } });
  }
});

export default router;
