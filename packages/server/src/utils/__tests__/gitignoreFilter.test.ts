/**
 * Story 28.0.5 (Task 5): smoke test for gitignoreFilter.
 * Confirms the node-ignore wrapper is wired up. Full pattern-combination
 * tests will land when Epic 30 Story 10 consumes this utility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { loadGitignore, isIgnored } from '../gitignoreFilter.js';

describe('gitignoreFilter smoke', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-ign-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('ignores paths listed in .gitignore', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), 'node_modules/\n');
    const matcher = await loadGitignore(tmp);
    expect(isIgnored(matcher, 'node_modules/foo')).toBe(true);
    expect(isIgnored(matcher, 'src/index.ts')).toBe(false);
  });

  it('returns a no-op matcher when .gitignore is missing', async () => {
    const matcher = await loadGitignore(tmp);
    expect(isIgnored(matcher, 'anything')).toBe(false);
  });
});
