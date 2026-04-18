/**
 * Account Info Service
 *
 * Fetches Claude Code account information (subscription type, API provider,
 * email) via the SDK control-initialize response.
 *
 * A lightweight bootstrap query (AsyncIterable prompt that never yields) is
 * used to access the control interface without sending a real prompt; the
 * query is aborted as soon as initializationResult returns.
 *
 * Kept in memory only — refreshed on server startup and on explicit user
 * action. No disk persistence: a restart is cheaper than stale cache bugs.
 */

import os from 'node:os';
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AccountInfo } from '@hammoc/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('accountInfoService');

const FETCH_TIMEOUT_MS = 15 * 1000;

class AccountInfoService {
  private memory: { account: AccountInfo | null; fetchedAt: number } | null = null;
  private inflight: Promise<AccountInfo | null> | null = null;

  getCached(): { account: AccountInfo | null; fetchedAt: number | null } {
    return {
      account: this.memory?.account ?? null,
      fetchedAt: this.memory?.fetchedAt ?? null,
    };
  }

  /**
   * Run a bootstrap query on server startup (fire-and-forget, never throws).
   */
  async initOnStartup(): Promise<void> {
    try {
      log.info('startup: fetching Claude Code account info...');
      const account = await this.refresh();
      if (account) {
        log.info(`startup: account info fetched (subscription=${account.subscriptionType ?? 'unknown'}, provider=${account.apiProvider ?? 'unknown'})`);
      } else {
        log.warn('startup: account info bootstrap returned null');
      }
    } catch (err) {
      log.warn(`startup refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Force-refresh via a short bootstrap query. Dedupes concurrent callers.
   */
  async refresh(): Promise<AccountInfo | null> {
    if (this.inflight) return this.inflight;
    this.inflight = this.bootstrapFetch()
      .then((account) => {
        this.memory = { account, fetchedAt: Date.now() };
        return account;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /**
   * Start a streaming-input query with an AsyncIterable that never yields,
   * call initializationResult() to get the account, then abort.
   */
  private async bootstrapFetch(): Promise<AccountInfo | null> {
    const controller = new AbortController();
    const pendingPrompt: AsyncIterable<SDKUserMessage> = {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<SDKUserMessage>> {
            return new Promise((_resolve, reject) => {
              controller.signal.addEventListener('abort', () => {
                reject(new Error('bootstrap aborted'));
              });
            });
          },
        };
      },
    };

    const q = query({
      prompt: pendingPrompt,
      options: {
        cwd: os.homedir(),
        abortController: controller,
        includePartialMessages: false,
      },
    });

    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const iter = q[Symbol.asyncIterator]();
      const first = await iter.next();
      if (first.done) {
        log.warn('bootstrap query ended before init message');
        return null;
      }
      const initResult = await q.initializationResult();
      return initResult?.account ?? null;
    } catch (err) {
      log.warn(`bootstrap fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      clearTimeout(timeout);
      if (!controller.signal.aborted) controller.abort();
      try {
        await q.return(undefined);
      } catch {
        // ignore
      }
    }
  }
}

export const accountInfoService = new AccountInfoService();
