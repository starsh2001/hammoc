/**
 * Story BS-8: accountStorageService unit tests.
 *
 * Runs against a real temp `~/.hammoc` + `~/.claude` by spying os.homedir() to a tmp dir
 * (the precedent used by other service tests). Covers: email-keyed upsert; missing-email
 * fallback key (AC1a); idempotent update (AC2); removeAccount refusing the active account;
 * atomic credential write (temp + rename) leaving no partial file; expiry detection without
 * any network call (AC12); token-free listing (AC14); and the Windows icacls non-fatal path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { ClaudeOAuthCredential } from '@hammoc/shared';
import { accountStorageService } from '../accountStorageService.js';

// Mock child_process so the Windows icacls hardening path is deterministic across platforms
// (ESM named exports can't be spied in place). Default: a fake process that exits 0 (success).
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => makeFakeChild('exit', 0)),
}));

/** A minimal child-process stand-in that emits one lifecycle event on registration. */
function makeFakeChild(event: 'exit' | 'error', arg: unknown) {
  const fake = {
    on(ev: string, cb: (a: unknown) => void) {
      if (ev === event) queueMicrotask(() => cb(arg));
      return fake;
    },
  };
  return fake as unknown as ReturnType<typeof spawn>;
}

function makeCredential(overrides: Partial<ClaudeOAuthCredential['claudeAiOauth']> = {}): ClaudeOAuthCredential {
  return {
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-test-token',
      refreshToken: 'sk-ant-ort01-test-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1h ahead
      scopes: ['user:inference'],
      subscriptionType: 'max',
      rateLimitTier: 'default_test',
      ...overrides,
    },
  };
}

describe('accountStorageService', () => {
  let tmpHome: string;

  const storePath = () => path.join(tmpHome, '.hammoc', 'accounts.json');
  const credentialsPath = () => path.join(tmpHome, '.claude', '.credentials.json');

  const writeActiveCredential = async (cred: ClaudeOAuthCredential) => {
    await fs.mkdir(path.join(tmpHome, '.claude'), { recursive: true });
    await fs.writeFile(credentialsPath(), JSON.stringify(cred, null, 2), 'utf-8');
  };

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'acct-svc-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('upserts an account keyed by email', async () => {
    const cred = makeCredential();
    const { key } = await accountStorageService.upsertAccount(cred, { email: 'a@example.com', tier: 'max' });
    expect(key).toBe('a@example.com');

    const store = JSON.parse(await fs.readFile(storePath(), 'utf-8'));
    expect(store.accounts['a@example.com'].email).toBe('a@example.com');
    expect(store.accounts['a@example.com'].tier).toBe('max');
    expect(store.accounts['a@example.com'].credential.claudeAiOauth.accessToken).toBe(cred.claudeAiOauth.accessToken);
  });

  it('falls back to account:<hash> key when email is missing (AC1a)', async () => {
    const cred = makeCredential();
    const { key, account } = await accountStorageService.upsertAccount(cred, { email: null, tier: 'team' });
    expect(key).toMatch(/^account:[0-9a-f]{8}$/);
    expect(account.email).toBeNull();
    expect(account.needsEmailBackfill).toBe(true);
  });

  it('updates in place without duplicating on repeated upsert of the same key (AC2)', async () => {
    await accountStorageService.upsertAccount(makeCredential({ accessToken: 'old' }), { email: 'a@example.com', tier: 'pro' });
    await accountStorageService.upsertAccount(makeCredential({ accessToken: 'new' }), { email: 'a@example.com', tier: 'max' });

    const accounts = await accountStorageService.listAccounts();
    expect(accounts.filter((a) => a.key === 'a@example.com')).toHaveLength(1);
    expect(accounts[0].tier).toBe('max');
  });

  it('listAccounts returns only token-free summaries (AC14)', async () => {
    await accountStorageService.upsertAccount(makeCredential(), { email: 'a@example.com', tier: 'max' });
    const accounts = await accountStorageService.listAccounts();
    const serialized = JSON.stringify(accounts);
    expect(serialized).not.toContain('sk-ant-oat01');
    expect(serialized).not.toContain('sk-ant-ort01');
    expect(accounts[0]).not.toHaveProperty('credential');
  });

  it('refuses to remove the active account (AC8) and removes an inactive one', async () => {
    await accountStorageService.upsertAccount(makeCredential(), { email: 'active@example.com', tier: 'max' });
    await accountStorageService.upsertAccount(makeCredential({ accessToken: 'other' }), { email: 'other@example.com', tier: 'pro' });
    await accountStorageService.setActiveKey('active@example.com');

    const refused = await accountStorageService.removeAccount('active@example.com');
    expect(refused).toEqual({ removed: false, reason: 'active' });

    const removed = await accountStorageService.removeAccount('other@example.com');
    expect(removed).toEqual({ removed: true });

    const missing = await accountStorageService.removeAccount('nope@example.com');
    expect(missing).toEqual({ removed: false, reason: 'not-found' });
  });

  it('captureActiveCredential reads the active file, sets active, and takes tier from the credential (AC3)', async () => {
    await writeActiveCredential(makeCredential({ subscriptionType: 'team' }));
    const result = await accountStorageService.captureActiveCredential('cap@example.com');
    expect(result?.key).toBe('cap@example.com');
    expect(result?.account.tier).toBe('team');
    expect(await accountStorageService.getActiveKey()).toBe('cap@example.com');
  });

  it('captureActiveCredential returns null when no credential file exists', async () => {
    const result = await accountStorageService.captureActiveCredential('x@example.com');
    expect(result).toBeNull();
  });

  it('switchAccount writes the credential file atomically with no leftover temp file', async () => {
    const cred = makeCredential({ accessToken: 'sk-ant-oat01-switched' });
    await accountStorageService.upsertAccount(cred, { email: 'a@example.com', tier: 'max' });
    await accountStorageService.upsertAccount(makeCredential({ accessToken: 'b' }), { email: 'b@example.com', tier: 'pro' });

    const res = await accountStorageService.switchAccount('a@example.com');
    expect(res.switched).toBe(true);

    const written = JSON.parse(await fs.readFile(credentialsPath(), 'utf-8'));
    expect(written.claudeAiOauth.accessToken).toBe('sk-ant-oat01-switched');
    expect(await accountStorageService.getActiveKey()).toBe('a@example.com');

    // No partial/temp artifact left behind in the credentials dir.
    const dirEntries = await fs.readdir(path.join(tmpHome, '.claude'));
    expect(dirEntries.some((e) => e.includes('.tmp'))).toBe(false);
  });

  it('detects expiry by expiresAt < now and flags reauth without any network call (AC12)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const expired = makeCredential({ expiresAt: Date.now() - 1000 });
    await accountStorageService.upsertAccount(expired, { email: 'old@example.com', tier: 'max' });

    const res = await accountStorageService.switchAccount('old@example.com');
    expect(res.switched).toBe(true);
    if (res.switched) expect(res.reauthRequired).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switchAccount returns not-found for an unknown key', async () => {
    const res = await accountStorageService.switchAccount('ghost@example.com');
    expect(res).toEqual({ switched: false, reason: 'not-found' });
  });

  it('backfillActiveEmail re-keys a fallback entry to the resolved email (AC1a/AC3)', async () => {
    const { key } = await accountStorageService.upsertAccount(makeCredential(), { email: null, tier: 'max' });
    await accountStorageService.setActiveKey(key);

    const newKey = await accountStorageService.backfillActiveEmail('resolved@example.com');
    expect(newKey).toBe('resolved@example.com');

    const accounts = await accountStorageService.listAccounts();
    expect(accounts.map((a) => a.key)).toEqual(['resolved@example.com']);
    expect(accounts[0].email).toBe('resolved@example.com');
    expect(accounts[0].needsEmailBackfill).toBeUndefined();
  });

  it('Windows icacls failure is non-fatal — the write still succeeds', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    // Force the spawned icacls to emit an error so the harden path takes its catch branch.
    vi.mocked(spawn).mockImplementationOnce(() => makeFakeChild('error', new Error('icacls not found')));

    const { key } = await accountStorageService.upsertAccount(makeCredential(), { email: 'win@example.com', tier: 'max' });
    expect(key).toBe('win@example.com');
    // The store file was still written despite the icacls failure.
    const store = JSON.parse(await fs.readFile(storePath(), 'utf-8'));
    expect(store.accounts['win@example.com']).toBeDefined();
    expect(spawn).toHaveBeenCalled();

    platformSpy.mockRestore();
  });
});
