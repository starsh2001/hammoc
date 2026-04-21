/**
 * Preferences Routes
 * Global user preferences endpoints
 */

import { Router, Request, Response } from 'express';
import { preferencesService } from '../services/preferencesService.js';
import { notificationService } from '../services/notificationService.js';
import { webPushService } from '../services/webPushService.js';
import { invalidateI18nCache } from '../middleware/i18n.js';
import { DEFAULT_WORKSPACE_TEMPLATE, TEMPLATE_VARIABLES } from '../services/chatService.js';
import type { UpdateTelegramSettingsRequest, WebPushSubscribeRequest } from '@hammoc/shared';

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
    const {
      botToken, chatId, enabled, baseUrl, alwaysNotify,
      notifyPermission, notifyComplete, notifyError,
      notifyQueueStart, notifyQueueComplete, notifyQueueError, notifyQueueInputRequired,
    } = req.body as UpdateTelegramSettingsRequest;
    const update: UpdateTelegramSettingsRequest = {
      botToken, chatId, enabled, baseUrl, alwaysNotify,
      notifyPermission, notifyComplete, notifyError,
      notifyQueueStart, notifyQueueComplete, notifyQueueError, notifyQueueInputRequired,
    };

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

// ── Web Push endpoints ───────────────────────────────────────────────

// GET /api/preferences/webpush — Get Web Push settings + VAPID public key
router.get('/webpush', async (_req: Request, res: Response) => {
  try {
    const prefs = await preferencesService.readPreferences();
    const vapidPublicKey = await webPushService.getVapidPublicKey();
    res.json({
      enabled: prefs.webPush?.enabled ?? false,
      vapidPublicKey,
      subscriptionCount: webPushService.getSubscriptionCount(),
    });
  } catch {
    res.status(500).json({ error: { code: 'WEBPUSH_SETTINGS_READ_ERROR', message: 'Failed to read Web Push settings' } });
  }
});

// PATCH /api/preferences/webpush — Toggle Web Push enabled
router.patch('/webpush', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    const prefs = await preferencesService.readPreferences();
    const webPush = { ...prefs.webPush, enabled: enabled ?? false };
    await preferencesService.writePreferences({ webPush });
    await notificationService.reload();
    const vapidPublicKey = await webPushService.getVapidPublicKey();
    res.json({
      enabled: webPush.enabled,
      vapidPublicKey,
      subscriptionCount: webPushService.getSubscriptionCount(),
    });
  } catch {
    res.status(500).json({ error: { code: 'WEBPUSH_SETTINGS_WRITE_ERROR', message: 'Failed to update Web Push settings' } });
  }
});

// POST /api/preferences/webpush/subscribe — Register a push subscription
router.post('/webpush/subscribe', async (req: Request, res: Response) => {
  try {
    const { subscription, userAgent } = req.body as WebPushSubscribeRequest;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: { code: 'INVALID_SUBSCRIPTION', message: 'Invalid push subscription' } });
      return;
    }
    await webPushService.subscribe(subscription, userAgent);
    res.json({ success: true, subscriptionCount: webPushService.getSubscriptionCount() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save push subscription';
    const isValidation = message.includes('Invalid push endpoint');
    res.status(isValidation ? 400 : 500).json({
      error: { code: isValidation ? 'INVALID_ENDPOINT' : 'WEBPUSH_SUBSCRIBE_ERROR', message },
    });
  }
});

// DELETE /api/preferences/webpush/subscribe — Remove a push subscription
router.delete('/webpush/subscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) {
      res.status(400).json({ error: { code: 'INVALID_ENDPOINT', message: 'Endpoint is required' } });
      return;
    }
    const removed = await webPushService.unsubscribe(endpoint);
    res.json({ success: removed, subscriptionCount: webPushService.getSubscriptionCount() });
  } catch {
    res.status(500).json({ error: { code: 'WEBPUSH_UNSUBSCRIBE_ERROR', message: 'Failed to remove push subscription' } });
  }
});

// POST /api/preferences/webpush/test — Send test push notification
router.post('/webpush/test', async (_req: Request, res: Response) => {
  try {
    const result = await webPushService.sendTest();
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: 'Failed to send test push notification' });
  }
});

// GET /api/preferences/system-prompt — Get default system prompt template (no project required)
router.get('/system-prompt', (_req: Request, res: Response) => {
  res.json({
    template: DEFAULT_WORKSPACE_TEMPLATE,
    variables: TEMPLATE_VARIABLES,
  });
});

// GET /api/preferences — Read all preferences (with env var overrides)
router.get('/', async (req: Request, res: Response) => {
  try {
    const preferences = await preferencesService.getEffectivePreferences();
    const overrides: string[] = [];
    if (process.env.CHAT_TIMEOUT_MS) overrides.push('chatTimeoutMs');
    res.json({ ...preferences, _overrides: overrides });
  } catch {
    res.status(500).json({ error: { code: 'PREFERENCES_READ_ERROR', message: req.t!('preferences.readError') } });
  }
});

// PATCH /api/preferences — Update preferences (merge)
router.patch('/', async (req: Request, res: Response) => {
  try {
    const updated = await preferencesService.writePreferences(req.body);
    // Invalidate cached language when preference changes
    if (req.body.language) {
      invalidateI18nCache();
    }
    // Reload notification service when telegram/webPush settings change via the merge endpoint,
    // so the in-memory service state matches the newly persisted file.
    if (req.body.telegram !== undefined || req.body.webPush !== undefined) {
      await notificationService.reload();
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: { code: 'PREFERENCES_WRITE_ERROR', message: req.t!('preferences.writeError') } });
  }
});

export default router;
