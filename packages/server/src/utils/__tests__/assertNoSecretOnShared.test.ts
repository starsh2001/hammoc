/**
 * Story 30.1 (Task 6.7): unit tests for the share-scope-aware secret guard.
 *
 * Covers the four branches the helper has to get right:
 *   - secretDetected = false → never throws
 *   - user scope → never throws (no `.gitignore`)
 *   - shared verdict + secretDetected = true → throws HARNESS_SECRET_ON_SHARED
 *   - local / fullyIgnored verdict + secretDetected = true → does NOT throw
 *     (existing per-service acknowledgement flow keeps owning that case)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertNoSecretOnShared } from '../assertNoSecretOnShared.js';
import { harnessShareScopeService } from '../../services/harnessShareScopeService.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assertNoSecretOnShared', () => {
  it('does nothing when secretDetected is false', async () => {
    const spy = vi.spyOn(harnessShareScopeService, 'evaluate');
    await expect(
      assertNoSecretOnShared({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: '.claude/settings.json',
        secretDetected: false,
      }),
    ).resolves.toBeUndefined();
    // No share-scope query should run when there is no secret to escalate.
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing for user scope (no `.gitignore` axis)', async () => {
    const spy = vi.spyOn(harnessShareScopeService, 'evaluate');
    await expect(
      assertNoSecretOnShared({
        scope: 'user',
        relativePath: 'settings.json',
        secretDetected: true,
      }),
    ).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws HARNESS_SECRET_ON_SHARED when the file is shared', async () => {
    vi.spyOn(harnessShareScopeService, 'evaluate').mockResolvedValueOnce({
      mode: 'A',
      cards: { '.claude/settings.json': 'shared' },
    });
    await expect(
      assertNoSecretOnShared({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: '.claude/settings.json',
        secretDetected: true,
        detectedAt: { lines: [42] },
      }),
    ).rejects.toMatchObject({
      code: 'HARNESS_SECRET_ON_SHARED',
      relativePath: '.claude/settings.json',
      lines: [42],
    });
  });

  it('does NOT throw when verdict is local (existing acknowledgement flow keeps it)', async () => {
    vi.spyOn(harnessShareScopeService, 'evaluate').mockResolvedValueOnce({
      mode: 'A',
      cards: { '.claude/settings.local.json': 'local' },
    });
    await expect(
      assertNoSecretOnShared({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: '.claude/settings.local.json',
        secretDetected: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('does NOT throw when verdict is fullyIgnored (Mode B project)', async () => {
    vi.spyOn(harnessShareScopeService, 'evaluate').mockResolvedValueOnce({
      mode: 'B',
      cards: { '.claude/agents/dev.md': 'fullyIgnored' },
    });
    await expect(
      assertNoSecretOnShared({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: '.claude/agents/dev.md',
        secretDetected: true,
      }),
    ).resolves.toBeUndefined();
  });
});
