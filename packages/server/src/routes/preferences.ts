/**
 * Preferences Routes
 * Global user preferences endpoints
 */

import { Router, Request, Response } from 'express';
import { preferencesService } from '../services/preferencesService.js';
import { notificationService } from '../services/notificationService.js';
import type { UpdateTelegramSettingsRequest } from '@bmad-studio/shared';

const router = Router();

// GET /api/preferences/telegram — Get Telegram settings (masked)
router.get('/telegram', async (req: Request, res: Response) => {
  try {
    const settings = await preferencesService.getTelegramSettings();
    res.json(settings);
  } catch {
    res.status(500).json({
      error: { code: 'TELEGRAM_SETTINGS_READ_ERROR', message: req.t!('preferences.telegram.readError') },
    });
  }
});

// PATCH /api/preferences/telegram — Update Telegram settings
router.patch('/telegram', async (req: Request, res: Response) => {
  try {
    const { botToken, chatId, enabled, notifyPermission, notifyComplete, notifyError } = req.body as UpdateTelegramSettingsRequest;
    const update: UpdateTelegramSettingsRequest = { botToken, chatId, enabled, notifyPermission, notifyComplete, notifyError };

    if (update.botToken !== undefined && update.botToken !== null) {
      if (typeof update.botToken !== 'string' || update.botToken.trim().length === 0) {
        res.status(400).json({
          error: { code: 'INVALID_BOT_TOKEN', message: req.t!('preferences.telegram.invalidBotToken') },
        });
        return;
      }
    }

    if (update.chatId !== undefined && update.chatId !== null) {
      if (typeof update.chatId !== 'string' || update.chatId.trim().length === 0) {
        res.status(400).json({
          error: { code: 'INVALID_CHAT_ID', message: req.t!('preferences.telegram.invalidChatId') },
        });
        return;
      }
    }

    const settings = await preferencesService.updateTelegramSettings(update);
    await notificationService.reload();
    res.json(settings);
  } catch {
    res.status(500).json({
      error: { code: 'TELEGRAM_SETTINGS_WRITE_ERROR', message: req.t!('preferences.telegram.writeError') },
    });
  }
});

// POST /api/preferences/telegram/test — Send test notification
router.post('/telegram/test', async (req: Request, res: Response) => {
  try {
    const overrides = req.body && (req.body.botToken || req.body.chatId)
      ? { botToken: req.body.botToken as string | undefined, chatId: req.body.chatId as string | undefined }
      : undefined;
    const result = await notificationService.sendTest(overrides);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch {
    res.status(500).json({
      success: false,
      error: req.t!('preferences.telegram.testError'),
    });
  }
});

// GET /api/preferences — Read all preferences (with env var overrides)
router.get('/', async (req: Request, res: Response) => {
  try {
    const preferences = await preferencesService.getEffectivePreferences();
    const overrides: string[] = [];
    if (process.env.CHAT_TIMEOUT_MS) overrides.push('chatTimeoutMs');
    if (process.env.TERMINAL_ENABLED) overrides.push('terminalEnabled');
    res.json({ ...preferences, _overrides: overrides });
  } catch {
    res.status(500).json({ error: { code: 'PREFERENCES_READ_ERROR', message: req.t!('preferences.readError') } });
  }
});

// PATCH /api/preferences — Update preferences (merge)
router.patch('/', async (req: Request, res: Response) => {
  try {
    const updated = await preferencesService.writePreferences(req.body);
    res.json(updated);
  } catch {
    res.status(500).json({ error: { code: 'PREFERENCES_WRITE_ERROR', message: req.t!('preferences.writeError') } });
  }
});

export default router;
