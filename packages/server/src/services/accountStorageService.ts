/**
 * Account Storage Service (Story BS-8)
 *
 * Multi-account credential store at `~/.hammoc/accounts.json`. Each Claude Code login
 * accumulates its `claudeAiOauth` credential block here keyed by account email (or an
 * `account:<hash>` fallback when the email is unavailable — AC1a). Switching writes the
 * chosen account's credential back to the single-account `~/.claude/.credentials.json`
 * the CLI binary reads (it has no `--profile` flag — see Dev Notes › CLI Credential Path).
 *
 * Follows the `preferencesService` JSON-file pattern (`~/.hammoc/*.json`) and the
 * `rateLimitProbeService` credential-read path. Token material never leaves this layer:
 * the controller projects entries through {@link toSummary} before responding.
 *
 * Data safety (AC13): the store file is hardened after every write — `chmod 0600` on Unix,
 * `icacls /inheritance:r /grant:r` on Windows. The credentials file is written atomically
 * (temp file in the same dir + rename) so a concurrent CLI read never sees a partial file.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type {
  AccountsStore,
  StoredAccount,
  AccountSummary,
  ClaudeOAuthCredential,
} from '@hammoc/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('accountStorageService');

/** Metadata supplied alongside a credential on upsert. */
export interface UpsertAccountMeta {
  /** Account email, or null when unavailable (AC1a → fallback key). */
  email: string | null;
  /** Subscription tier (from `credential.claudeAiOauth.subscriptionType`). */
  tier: string | null;
}

const EMPTY_STORE: AccountsStore = { activeKey: null, accounts: {} };

class AccountStorageService {
  private getDataDir(): string {
    return path.join(os.homedir(), '.hammoc');
  }

  private getStorePath(): string {
    return path.join(this.getDataDir(), 'accounts.json');
  }

  private getCredentialsPath(): string {
    return path.join(os.homedir(), '.claude', '.credentials.json');
  }

  /** Read the store, returning an empty store when the file is absent/unreadable. */
  private async readStore(): Promise<AccountsStore> {
    try {
      const content = await fs.readFile(this.getStorePath(), 'utf-8');
      const parsed = JSON.parse(content) as AccountsStore;
      // Defensive normalization: guarantee the shape downstream code relies on.
      return {
        activeKey: typeof parsed.activeKey === 'string' ? parsed.activeKey : null,
        accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
      };
    } catch {
      return { ...EMPTY_STORE, accounts: {} };
    }
  }

  /** Write the store as pretty JSON, then harden file permissions (AC13). */
  private async writeStore(store: AccountsStore): Promise<void> {
    const dataDir = this.getDataDir();
    await fs.mkdir(dataDir, { recursive: true });
    const storePath = this.getStorePath();
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8');
    await this.hardenFilePermissions(storePath);
  }

  /**
   * Restrict the credential file to the owning user only.
   * - Unix: `chmod 0600`.
   * - Windows: POSIX modes are a no-op, so strip inherited ACEs and grant only the current
   *   user via `icacls`. Failure is logged and non-fatal (never blocks the write).
   */
  private async hardenFilePermissions(filePath: string): Promise<void> {
    if (process.platform === 'win32') {
      await this.hardenWindowsAcl(filePath);
      return;
    }
    try {
      await fs.chmod(filePath, 0o600);
    } catch (err) {
      log.warn(`chmod 0600 failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** `icacls <file> /inheritance:r /grant:r "<USER>:F"` — best-effort, non-fatal. */
  private hardenWindowsAcl(filePath: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const user = process.env.USERNAME || process.env.USER;
      if (!user) {
        log.warn('icacls hardening skipped: no USERNAME/USER in environment');
        resolve();
        return;
      }
      try {
        const child = spawn('icacls', [filePath, '/inheritance:r', '/grant:r', `${user}:F`], {
          windowsHide: true,
        });
        child.on('error', (err) => {
          log.warn(`icacls hardening failed for ${filePath}: ${err.message}`);
          resolve();
        });
        child.on('exit', (code) => {
          if (code !== 0) log.warn(`icacls exited with code ${code} for ${filePath}`);
          resolve();
        });
      } catch (err) {
        log.warn(`icacls spawn failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
        resolve();
      }
    });
  }

  /** Deterministic fallback key for a credential whose email is unknown (AC1a). */
  private fallbackKey(credential: ClaudeOAuthCredential): string {
    const token = credential.claudeAiOauth?.accessToken ?? '';
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 8);
    return `account:${hash}`;
  }

  /** Project a stored entry to its token-free public summary (AC14/AC15). */
  private toSummary(key: string, account: StoredAccount, activeKey: string | null): AccountSummary {
    return {
      key,
      email: account.email,
      tier: account.tier,
      active: key === activeKey,
      lastUsedAt: account.lastUsedAt,
      ...(account.needsEmailBackfill ? { needsEmailBackfill: true } : {}),
    };
  }

  // ── Public API ──

  /** All stored accounts as token-free summaries (active account marked). */
  async listAccounts(): Promise<AccountSummary[]> {
    const store = await this.readStore();
    return Object.entries(store.accounts).map(([key, account]) =>
      this.toSummary(key, account, store.activeKey),
    );
  }

  /** The active store key (mirrors which credential is in `~/.claude/.credentials.json`). */
  async getActiveKey(): Promise<string | null> {
    return (await this.readStore()).activeKey;
  }

  /** Set the active store key (no credential file write — see {@link switchAccount}). */
  async setActiveKey(key: string | null): Promise<void> {
    const store = await this.readStore();
    store.activeKey = key;
    await this.writeStore(store);
  }

  /**
   * Insert or update an account entry (AC1, AC2, AC3). Keyed by email when present,
   * otherwise by the `account:<hash>` fallback (AC1a). Re-upserting the same key updates
   * in place — no duplicate (AC2). `Date()` is captured by the caller via `lastUsedAt`
   * defaulting to now here. Returns the resolved store key.
   */
  async upsertAccount(
    credential: ClaudeOAuthCredential,
    meta: UpsertAccountMeta,
  ): Promise<{ key: string; account: StoredAccount }> {
    const store = await this.readStore();
    const key = meta.email ?? this.fallbackKey(credential);
    const existing = store.accounts[key];

    const account: StoredAccount = {
      email: meta.email,
      tier: meta.tier,
      credential,
      lastUsedAt: Date.now(),
      ...(meta.email ? {} : { needsEmailBackfill: true }),
    };
    // Preserve nothing token-wise from the old entry — the fresh credential supersedes it.
    store.accounts[key] = account;
    void existing; // (in-place overwrite is intentional; AC2)
    await this.writeStore(store);
    return { key, account };
  }

  /**
   * Remove a stored account (AC8). Removing the currently active account is disallowed —
   * returns `{ removed: false, reason: 'active' }` so the caller can surface a 409.
   */
  async removeAccount(key: string): Promise<{ removed: boolean; reason?: 'active' | 'not-found' }> {
    const store = await this.readStore();
    if (!store.accounts[key]) return { removed: false, reason: 'not-found' };
    if (store.activeKey === key) return { removed: false, reason: 'active' };
    delete store.accounts[key];
    await this.writeStore(store);
    return { removed: true };
  }

  /**
   * Capture the CURRENTLY ACTIVE credential file into the store (Task 3 / AC1, AC1a, AC2, AC3).
   * Called right after a BS-7 login completes, when `~/.claude/.credentials.json` already holds
   * the new account's credential. Reads the full `claudeAiOauth` block verbatim, takes the tier
   * directly from it, and uses the email resolved by accountInfoService (or the fallback key).
   * Marks the captured account active. Returns null when no credential file is present.
   */
  async captureActiveCredential(email: string | null): Promise<{ key: string; account: StoredAccount } | null> {
    const credential = await this.readActiveCredential();
    if (!credential) {
      log.warn('captureActiveCredential: no active credential file to capture');
      return null;
    }
    const tier = credential.claudeAiOauth?.subscriptionType ?? null;
    const result = await this.upsertAccount(credential, { email, tier });
    await this.setActiveKey(result.key);
    log.info(`captured credential for account key=${result.key} (tier=${tier ?? 'unknown'})`);
    return result;
  }

  /**
   * Switch the active account (AC9, AC10, AC11, AC12). Writes the stored credential to
   * `~/.claude/.credentials.json` atomically (temp + rename) so concurrent CLI readers never
   * see a partial file, then updates the active marker and `lastUsedAt`. Running CLI sessions
   * are untouched — only NEW sessions pick up the switched credential (AC11).
   *
   * Expiry (AC12) is detected by `expiresAt < Date.now()` — NO custom OAuth refresh call in
   * Phase 1 (Dev Notes › Token Refresh). When expired, the switch still completes and
   * `reauthRequired` is true so the client can offer the BS-7 re-login flow.
   */
  async switchAccount(key: string): Promise<
    | { switched: true; reauthRequired: boolean; account: StoredAccount }
    | { switched: false; reason: 'not-found' }
  > {
    const store = await this.readStore();
    const account = store.accounts[key];
    if (!account) return { switched: false, reason: 'not-found' };

    await this.writeCredentialFileAtomic(account.credential);

    account.lastUsedAt = Date.now();
    store.activeKey = key;
    await this.writeStore(store);

    const expiresAt = account.credential.claudeAiOauth?.expiresAt;
    const reauthRequired = typeof expiresAt === 'number' && expiresAt < Date.now();

    return { switched: true, reauthRequired, account };
  }

  /**
   * Back-fill the email on the ACTIVE account when it was stored under the `account:<hash>`
   * fallback (AC1a / AC3). Called after a switch once accountInfoService resolves an email for
   * the now-active credential. Re-keys the entry from the fallback to the email key, clears the
   * back-fill flag, and moves the active marker. No-op when the active account already has an
   * email or no active account exists. Returns the (possibly new) active key.
   */
  async backfillActiveEmail(email: string): Promise<string | null> {
    if (!email) return (await this.readStore()).activeKey;
    const store = await this.readStore();
    const oldKey = store.activeKey;
    if (!oldKey) return null;
    const account = store.accounts[oldKey];
    if (!account || account.email) return oldKey; // already has an email — nothing to back-fill

    account.email = email;
    delete account.needsEmailBackfill;
    if (oldKey !== email) {
      delete store.accounts[oldKey];
      store.accounts[email] = account;
      store.activeKey = email;
    }
    await this.writeStore(store);
    log.info(`back-filled email for account: ${oldKey} → ${email}`);
    return store.activeKey;
  }

  // ── Credential file I/O ──

  /** Read & parse `~/.claude/.credentials.json` into a credential block, or null. */
  private async readActiveCredential(): Promise<ClaudeOAuthCredential | null> {
    try {
      const raw = await fs.readFile(this.getCredentialsPath(), 'utf-8');
      const parsed = JSON.parse(raw) as ClaudeOAuthCredential;
      const token = parsed?.claudeAiOauth?.accessToken;
      if (typeof token === 'string' && token.length > 0) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Atomically write the credential block to `~/.claude/.credentials.json`:
   * write to a temp file in the SAME directory, harden its perms, then `fs.rename`
   * (atomic on the same filesystem). Readers see either the old or the new complete file.
   */
  private async writeCredentialFileAtomic(credential: ClaudeOAuthCredential): Promise<void> {
    const target = this.getCredentialsPath();
    const dir = path.dirname(target);
    await fs.mkdir(dir, { recursive: true });
    // Vary the temp name by pid so two concurrent switches can't collide on one temp file.
    const tmp = path.join(dir, `.credentials.json.tmp-${process.pid}`);
    await fs.writeFile(tmp, JSON.stringify(credential, null, 2), 'utf-8');
    await this.hardenFilePermissions(tmp);
    try {
      await fs.rename(tmp, target);
    } catch (err) {
      // Clean up the temp file if the rename failed so we don't leak it.
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }
}

export const accountStorageService = new AccountStorageService();
