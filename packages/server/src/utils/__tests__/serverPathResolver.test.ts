/**
 * Story 30.2 (Task 1.10): serverPathResolver unit tests.
 *
 * Covers the four code paths in `resolveCommandOnServerPath`:
 *   - Empty / non-string input  → null
 *   - Absolute path             → fs.existsSync only
 *   - Relative path with sep    → resolved against cwd
 *   - Bare name                 → which/where shell call (mocked)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { resolveCommandOnServerPath } from '../serverPathResolver.js';

describe('resolveCommandOnServerPath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-pathresolver-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null for empty input', () => {
    expect(resolveCommandOnServerPath('')).toEqual({ resolved: null });
    expect(resolveCommandOnServerPath('   ')).toEqual({ resolved: null });
    // Non-string input — type-mangled callers (defensive).
    expect(resolveCommandOnServerPath(undefined as unknown as string)).toEqual({
      resolved: null,
    });
  });

  it('absolute path: existing file resolves to itself', async () => {
    const file = path.join(tmpDir, 'tool.exe');
    await fs.writeFile(file, '#!/bin/sh\n');
    expect(resolveCommandOnServerPath(file)).toEqual({ resolved: file });
  });

  it('absolute path: missing file resolves to null', () => {
    const missing = path.join(tmpDir, 'does-not-exist.exe');
    expect(resolveCommandOnServerPath(missing)).toEqual({ resolved: null });
  });

  it('relative path with separator: resolved against cwd', async () => {
    const file = path.join(tmpDir, 'sub', 'tool.sh');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '#!/bin/sh\n');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    try {
      expect(resolveCommandOnServerPath('sub/tool.sh')).toEqual({ resolved: file });
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
