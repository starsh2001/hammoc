/**
 * Rate Limit Probe Service
 * Reads OAuth credentials from ~/.claude/.credentials.json and calls
 * the Anthropic OAuth usage API to retrieve subscription rate limit data.
 * Supports periodic polling with broadcast callback for real-time updates.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SubscriptionRateLimit, ApiHealthStatus } from '@hammoc/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('rateLimitProbe');

const USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';
const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');
const POLL_INTERVAL_MS = 120_000; // 2min polling interval
const MAX_BACKOFF_MS = 1_800_000; // 30min max backoff on 429
const TOKEN_CACHE_TTL_MS = 300_000; // 5min token file cache
// Cross-check window for a screen-scraped usage-limit notice (see isLimitCorroborated).
const LIMIT_CORROBORATION_TTL_MS = 360_000; // 6min — tolerate one missed/backed-off poll
const LIMIT_CORROBORATION_THRESHOLD = 0.9; // a genuine "hit" sits at ~100%; 0.9 leaves cache-lag margin

class RateLimitProbeService {
  private cachedToken: string | null = null;
  private tokenCachedAt = 0;
  private lastProbeResult: SubscriptionRateLimit | null = null;
  private lastProbeAt = 0; // ms timestamp of the last successful probe (for limit corroboration freshness)
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private broadcastFn: ((data: SubscriptionRateLimit) => void) | null = null;
  private healthBroadcastFn: ((data: ApiHealthStatus) => void) | null = null;
  private apiHealthy = true;
  private healthLastCheckedAt = 0;
  private healthLastError: string | null = null;
  private consecutiveThrottles = 0;

  /**
   * Check if the user has OAuth credentials (Claude.ai subscriber).
   * Used to guard features unavailable for subscribers (e.g. max effort).
   */
  hasOAuthCredentials(): boolean {
    return this.readAccessToken() !== null;
  }

  /**
   * Read OAuth access token from ~/.claude/.credentials.json
   */
  private readAccessToken(): string | null {
    const now = Date.now();
    if (this.cachedToken && (now - this.tokenCachedAt) < TOKEN_CACHE_TTL_MS) {
      return this.cachedToken;
    }

    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        log.debug('Credentials file not found: %s', CREDENTIALS_PATH);
        return null;
      }
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const token = data?.claudeAiOauth?.accessToken;
      if (typeof token === 'string' && token.length > 0) {
        this.cachedToken = token;
        this.tokenCachedAt = now;
        log.debug('OAuth token loaded (length: %d)', token.length);
        return token;
      }
      log.debug('No claudeAiOauth.accessToken in credentials file');
      return null;
    } catch (err) {
      log.debug('Failed to read credentials: %s', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Call Anthropic OAuth Usage API and return rate limit data.
   * Returns null on failure (graceful degradation).
   */
  async probe(): Promise<SubscriptionRateLimit | null> {
    const token = this.readAccessToken();
    if (!token) return null;

    try {
      const response = await fetch(USAGE_API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'hammoc/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.cachedToken = null;
          this.tokenCachedAt = 0;
          this.consecutiveThrottles = 0;
          log.debug('Usage API auth failed (status: %d), token cache invalidated', response.status);
          // Auth errors mean the API is reachable, just credentials are invalid
          this.updateApiHealth(true);
        } else if (response.status === 429) {
          this.consecutiveThrottles++;
          log.debug('Usage API rate limited (429), consecutive: %d', this.consecutiveThrottles);
          // 429 means the API is reachable, just throttled
          this.updateApiHealth(true);
        } else {
          this.consecutiveThrottles = 0;
          log.debug('Usage API error (status: %d)', response.status);
          this.updateApiHealth(false, `API returned ${response.status}`);
        }
        return null;
      }

      const body = await response.json();
      const result = this.parseUsageResponse(body);
      this.lastProbeResult = result;
      this.lastProbeAt = Date.now();
      this.consecutiveThrottles = 0;
      this.updateApiHealth(true);
      log.debug('Rate limit probe success: 5h=%s, 7d=%s',
        result?.fiveHour?.utilization?.toFixed(2) ?? 'n/a',
        result?.sevenDay?.utilization?.toFixed(2) ?? 'n/a',
      );
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.consecutiveThrottles = 0;
      log.debug('Usage API fetch failed: %s', errMsg);
      this.updateApiHealth(false, errMsg);
      return null;
    }
  }

  /**
   * Start periodic polling. Calls broadcast function on each successful probe.
   * Safe to call multiple times — only one timer runs at a time.
   */
  startPolling(
    broadcast: (data: SubscriptionRateLimit) => void,
    healthBroadcast?: (data: ApiHealthStatus) => void,
  ): void {
    this.broadcastFn = broadcast;
    if (healthBroadcast) this.healthBroadcastFn = healthBroadcast;
    if (this.pollTimer) return; // already polling

    log.debug('Starting rate limit polling (interval: %dms)', POLL_INTERVAL_MS);

    // Immediate first probe
    this.pollOnce();

    this.pollTimer = setInterval(() => this.pollOnce(), POLL_INTERVAL_MS);
  }

  /**
   * Stop periodic polling.
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      log.debug('Rate limit polling stopped');
    }
    this.broadcastFn = null;
    this.healthBroadcastFn = null;
  }

  /**
   * Return last cached probe result (no API call).
   */
  getCachedResult(): SubscriptionRateLimit | null {
    return this.lastProbeResult;
  }

  /**
   * Cross-check a screen-scraped "usage limit" notice against the authoritative usage numbers.
   * The CLI engine reads the limit notice off the PTY *screen*, which cannot tell the genuine
   * TUI banner apart from the SAME words appearing as ordinary chat content (e.g. a session that
   * once quoted "You've hit your weekly limit · resets …"). This grounds that fragile scrape: a
   * real block sits at ~100% on some window, so when EVERY known window has ample headroom the
   * on-screen text must be content, not a live notice.
   *
   * Returns true (corroborated → caller should fail the turn) when we lack fresh data — null or
   * older than the TTL — so we cannot refute and must preserve prior fail-fast behavior; or when
   * some window is at/above the cap. Returns false (refuted → caller should ignore the scrape)
   * only when fresh data shows every window comfortably below the cap.
   */
  isLimitCorroborated(): boolean {
    const r = this.lastProbeResult;
    const fresh = r !== null && Date.now() - this.lastProbeAt < LIMIT_CORROBORATION_TTL_MS;
    if (!fresh || !r) return true; // no/stale data → cannot refute → trust the scrape (no regression)
    const maxUtil = Math.max(
      r.fiveHour?.utilization ?? 0,
      r.sevenDay?.utilization ?? 0,
      r.sevenDayOpus?.utilization ?? 0,
      r.sevenDaySonnet?.utilization ?? 0,
    );
    return maxUtil >= LIMIT_CORROBORATION_THRESHOLD;
  }

  /**
   * Return cached API health status (no API call).
   * Returns null if no probe has been performed yet.
   */
  getApiHealth(): ApiHealthStatus | null {
    if (this.healthLastCheckedAt === 0) return null;
    return {
      healthy: this.apiHealthy,
      lastCheckedAt: new Date(this.healthLastCheckedAt).toISOString(),
      ...(this.healthLastError && { error: this.healthLastError }),
    };
  }

  private updateApiHealth(healthy: boolean, error?: string): void {
    const changed = this.apiHealthy !== healthy;
    this.apiHealthy = healthy;
    this.healthLastCheckedAt = Date.now();
    this.healthLastError = error ?? null;

    if (changed) {
      log.info('API health changed: %s%s',
        healthy ? 'healthy' : 'unhealthy',
        error ? ` (${error})` : '');
    }

    if (this.healthBroadcastFn) {
      this.healthBroadcastFn(this.getApiHealth()!);
    }
  }

  private pollOnce(): void {
    // Exponential backoff on consecutive 429s: skip polls until backoff expires.
    // Backoff doubles each time: 4min, 8min, 16min, capped at 30min.
    if (this.consecutiveThrottles > 0) {
      const backoffMs = Math.min(
        POLL_INTERVAL_MS * Math.pow(2, this.consecutiveThrottles),
        MAX_BACKOFF_MS,
      );
      const elapsed = Date.now() - this.healthLastCheckedAt;
      if (elapsed < backoffMs) {
        log.debug('Skipping probe (backoff: %ds remaining)',
          Math.round((backoffMs - elapsed) / 1000));
        return;
      }
    }

    this.probe().then((result) => {
      if (result && this.broadcastFn) {
        this.broadcastFn(result);
      }
    }).catch(() => {/* silent */});
  }

  /**
   * Parse usage API JSON response into SubscriptionRateLimit
   */
  private parseUsageResponse(body: unknown): SubscriptionRateLimit | null {
    type RawWindow = { utilization: number; resets_at: string } | null | undefined;
    const data = body as {
      five_hour?: RawWindow;
      seven_day?: RawWindow;
      seven_day_opus?: RawWindow;
      seven_day_sonnet?: RawWindow;
    };

    // API returns utilization as a 0-100 percentage; normalize to 0-1. null/absent windows
    // (e.g. seven_day_opus on a plan with no separate Opus cap) are simply omitted.
    const toWindow = (w: RawWindow): NonNullable<SubscriptionRateLimit['fiveHour']> | undefined => {
      if (!w) return undefined;
      const util = w.utilization / 100;
      return { utilization: util, reset: w.resets_at, status: this.getStatus(util) };
    };

    const fiveHour = toWindow(data.five_hour);
    const sevenDay = toWindow(data.seven_day);
    const sevenDayOpus = toWindow(data.seven_day_opus);
    const sevenDaySonnet = toWindow(data.seven_day_sonnet);

    if (!fiveHour && !sevenDay && !sevenDayOpus && !sevenDaySonnet) return null;

    const result: SubscriptionRateLimit = {};
    if (fiveHour) result.fiveHour = fiveHour;
    if (sevenDay) result.sevenDay = sevenDay;
    if (sevenDayOpus) result.sevenDayOpus = sevenDayOpus;
    if (sevenDaySonnet) result.sevenDaySonnet = sevenDaySonnet;

    const maxUtil = Math.max(
      fiveHour?.utilization ?? 0,
      sevenDay?.utilization ?? 0,
      sevenDayOpus?.utilization ?? 0,
      sevenDaySonnet?.utilization ?? 0,
    );
    result.overallStatus = this.getStatus(maxUtil);

    return result;
  }

  private getStatus(utilization: number): string {
    if (utilization >= 0.8) return 'critical';
    if (utilization >= 0.5) return 'warning';
    return 'normal';
  }
}

export const rateLimitProbeService = new RateLimitProbeService();
