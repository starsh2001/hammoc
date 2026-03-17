/**
 * Web Push Service — VAPID key management, subscription storage, push delivery
 * Stores VAPID keys and push subscriptions in ~/.hammoc/ as JSON files.
 * Uses the web-push library for VAPID signing and push message delivery.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import webpush from 'web-push';
import { preferencesService } from './preferencesService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('webPushService');

interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

/** Known push service hostnames (strict matching for SSRF prevention) */
const PUSH_SERVICE_PATTERNS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
  /\.push\.samsung\.com$/,
];

/** Validate that an endpoint URL is a legitimate push service */
function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return false;
    return PUSH_SERVICE_PATTERNS.some(pattern => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

class WebPushService {
  private vapidKeys: VapidKeys | null = null;
  private subscriptions: StoredSubscription[] = [];
  private loaded = false;
  /** Single-flight guard for initial load */
  private loadPromise: Promise<void> | null = null;
  /** Async mutex: queued operations wait for the previous one to finish */
  private mutationQueue: Promise<void> = Promise.resolve();

  private getDataDir(): string {
    return path.join(os.homedir(), '.hammoc');
  }

  private getVapidPath(): string {
    return path.join(this.getDataDir(), 'vapid-keys.json');
  }

  private getSubscriptionsPath(): string {
    return path.join(this.getDataDir(), 'push-subscriptions.json');
  }

  /** Serialize subscription mutations to prevent concurrent read-modify-write races */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.mutationQueue = this.mutationQueue.then(fn, fn);
    return this.mutationQueue;
  }

  /** Single-flight subscription load — safe to call from anywhere without mutex */
  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = this.loadSubscriptions().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  /** Ensure VAPID keys exist; generate only if file does not exist */
  private async ensureVapidKeys(): Promise<VapidKeys> {
    if (this.vapidKeys) return this.vapidKeys;

    const vapidPath = this.getVapidPath();
    try {
      const content = await fs.readFile(vapidPath, 'utf-8');
      this.vapidKeys = JSON.parse(content) as VapidKeys;
      if (!this.vapidKeys.publicKey || !this.vapidKeys.privateKey) {
        throw new Error('Invalid VAPID keys file: missing publicKey or privateKey');
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // First run — generate new keys
        const keys = webpush.generateVAPIDKeys();
        this.vapidKeys = { publicKey: keys.publicKey, privateKey: keys.privateKey };
        const dataDir = this.getDataDir();
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(vapidPath, JSON.stringify(this.vapidKeys, null, 2), 'utf-8');
        logger.info('[WebPush] Generated new VAPID keys');
      } else {
        // Parse/permission error — don't silently regenerate, fail fast
        logger.error(`[WebPush] Failed to read VAPID keys: ${(err as Error).message}`);
        throw err;
      }
    }

    return this.vapidKeys;
  }

  /** Load subscriptions from disk (only ENOENT is treated as empty) */
  private async loadSubscriptions(): Promise<void> {
    try {
      const content = await fs.readFile(this.getSubscriptionsPath(), 'utf-8');
      this.subscriptions = JSON.parse(content) as StoredSubscription[];
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.subscriptions = [];
      } else {
        logger.error(`[WebPush] Failed to load subscriptions: ${(err as Error).message}`);
        throw err;
      }
    }
    this.loaded = true;
  }

  /** Persist subscriptions to disk */
  private async saveSubscriptions(): Promise<void> {
    const dataDir = this.getDataDir();
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(this.getSubscriptionsPath(), JSON.stringify(this.subscriptions, null, 2), 'utf-8');
  }

  /** Initialize: load VAPID keys and subscriptions */
  async init(): Promise<void> {
    await this.ensureVapidKeys();
    await this.loadSubscriptions();
  }

  /** Get the VAPID public key (needed by client for PushManager.subscribe) */
  async getVapidPublicKey(): Promise<string> {
    const keys = await this.ensureVapidKeys();
    return keys.publicKey;
  }

  /** Get number of stored subscriptions */
  getSubscriptionCount(): number {
    return this.subscriptions.length;
  }

  /** Validate and add a push subscription (deduplicate by endpoint) */
  async subscribe(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<void> {
    if (!isValidPushEndpoint(sub.endpoint)) {
      throw new Error('Invalid push endpoint: must be HTTPS from a known push service');
    }

    return this.enqueue(async () => {
      await this.ensureLoaded();

      // Copy-on-write: build new list, persist, then assign
      const next = this.subscriptions.filter(s => s.endpoint !== sub.endpoint);
      next.push({
        endpoint: sub.endpoint,
        keys: sub.keys,
        userAgent,
        createdAt: new Date().toISOString(),
      });
      const prev = this.subscriptions;
      this.subscriptions = next;
      try {
        await this.saveSubscriptions();
      } catch (err) {
        this.subscriptions = prev; // rollback on write failure
        throw err;
      }
      logger.info(`[WebPush] Subscription added (total: ${this.subscriptions.length})`);
    });
  }

  /** Remove a push subscription by endpoint */
  async unsubscribe(endpoint: string): Promise<boolean> {
    let removed = false;
    await this.enqueue(async () => {
      await this.ensureLoaded();
      const next = this.subscriptions.filter(s => s.endpoint !== endpoint);
      if (next.length < this.subscriptions.length) {
        const prev = this.subscriptions;
        this.subscriptions = next;
        try {
          await this.saveSubscriptions();
        } catch (err) {
          this.subscriptions = prev; // rollback on write failure
          throw err;
        }
        logger.info(`[WebPush] Subscription removed (total: ${this.subscriptions.length})`);
        removed = true;
      }
    });
    return removed;
  }

  /** Send a push notification to all subscriptions */
  async sendPush(payload: WebPushPayload): Promise<void> {
    await this.ensureLoaded();
    if (this.subscriptions.length === 0) return;

    const keys = await this.ensureVapidKeys();
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hammoc@localhost';
    webpush.setVapidDetails(vapidSubject, keys.publicKey, keys.privateKey);

    const body = JSON.stringify({
      ...payload,
      icon: payload.icon || '/favicon-192.png',
      badge: payload.badge || '/favicon-192.png',
    });

    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      this.subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            body,
            { TTL: 60 * 60 }, // 1 hour
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            // Subscription expired or invalid — mark for removal
            expiredEndpoints.push(sub.endpoint);
            logger.debug(`[WebPush] Subscription expired (${statusCode}): ${sub.endpoint.slice(0, 60)}...`);
          } else {
            logger.warn(`[WebPush] Send failed: ${(err as Error).message || err}`);
          }
        }
      }),
    );

    // Clean up expired subscriptions (serialized, with rollback)
    if (expiredEndpoints.length > 0) {
      await this.enqueue(async () => {
        const next = this.subscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
        const prev = this.subscriptions;
        this.subscriptions = next;
        try {
          await this.saveSubscriptions();
        } catch (err) {
          this.subscriptions = prev;
          throw err;
        }
        logger.info(`[WebPush] Removed ${expiredEndpoints.length} expired subscription(s)`);
      });
    }
  }

  /** Send a test push notification */
  async sendTest(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureLoaded();

      const prefs = await preferencesService.readPreferences();
      if (!prefs.webPush?.enabled) {
        return { success: false, error: 'Web Push is not enabled' };
      }
      if (this.subscriptions.length === 0) {
        return { success: false, error: 'No subscriptions registered' };
      }

      await this.sendPush({
        title: 'Hammoc',
        body: '🔔 Test push notification from Hammoc',
        tag: 'test',
        url: '/',
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

export const webPushService = new WebPushService();
