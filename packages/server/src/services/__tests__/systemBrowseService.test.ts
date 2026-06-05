/**
 * System Browse Service Tests (Story 34.1)
 * Uses real temporary directories. Platform-dependent cases (chmod / symlink)
 * are POSIX-gated and additionally skipped under root, where permission bits do
 * not apply. [Source: docs/stories/34.1.story.md#Task 7;
 *            packages/server/src/services/__tests__/fileSystemService.test.ts:20-36, 424-447]
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { systemBrowseService } from '../systemBrowseService.js';

const isWin = process.platform === 'win32';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sysbrowse-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('systemBrowseService.listDirectory', () => {
  // Case ①: directories only (files excluded) + accurate hasChildren
  it('returns only subdirectories with accurate hasChildren (AC1)', async () => {
    await fs.mkdir(path.join(tmpDir, 'sub1'));
    await fs.mkdir(path.join(tmpDir, 'sub1', 'nested'));
    await fs.mkdir(path.join(tmpDir, 'sub2'));
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'x');

    const res = await systemBrowseService.listDirectory(tmpDir);

    expect(res.isDriveRoots).toBe(false);
    expect(res.path).toBe(path.resolve(tmpDir));
    expect(res.home).toBe(os.homedir());
    expect(res.parent).toBe(path.dirname(path.resolve(tmpDir)));

    const names = res.entries.map((e) => e.name);
    expect(names).toEqual(['sub1', 'sub2']); // sorted, file.txt excluded
    expect(res.entries.find((e) => e.name === 'sub1')!.hasChildren).toBe(true);
    expect(res.entries.find((e) => e.name === 'sub2')!.hasChildren).toBe(false);
    expect(res.entries.find((e) => e.name === 'sub1')!.path).toBe(
      path.join(path.resolve(tmpDir), 'sub1'),
    );
  });

  it('returns null parent at a filesystem root', async () => {
    const rootPath = isWin ? path.parse(path.resolve(tmpDir)).root : '/';
    const res = await systemBrowseService.listDirectory(rootPath);
    expect(res.parent).toBeNull();
    expect(res.isDriveRoots).toBe(false);
  });

  // Case ②: missing path / file path
  it('throws NOT_FOUND for a missing path and NOT_A_DIRECTORY for a file (AC8)', async () => {
    await expect(
      systemBrowseService.listDirectory(path.join(tmpDir, 'missing')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const file = path.join(tmpDir, 'f.txt');
    await fs.writeFile(file, 'x');
    await expect(systemBrowseService.listDirectory(file)).rejects.toMatchObject({
      code: 'NOT_A_DIRECTORY',
    });
  });

  it('rejects non-absolute, null-byte, and UNC paths with INVALID_PATH', async () => {
    await expect(systemBrowseService.listDirectory('relative/dir')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(systemBrowseService.listDirectory(tmpDir + '\u0000')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(systemBrowseService.listDirectory('\\\\server\\share')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(systemBrowseService.listDirectory('//server/share')).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });

  // Case ③: symlink cycle terminates + broken symlink skipped (POSIX)
  it('resolves symlinks, terminates on cycles, skips broken symlinks (AC3)', async () => {
    if (isWin) return; // POSIX-only symlink semantics
    await fs.mkdir(path.join(tmpDir, 'real'));
    try {
      // self-referential cycle: cycle -> tmpDir
      await fs.symlink(tmpDir, path.join(tmpDir, 'cycle'), 'dir');
      // broken: target does not exist
      await fs.symlink(path.join(tmpDir, 'nope'), path.join(tmpDir, 'broken'), 'dir');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EPERM') return; // restricted runner
      throw err;
    }

    const res = await systemBrowseService.listDirectory(tmpDir); // must terminate, no recursion
    const names = res.entries.map((e) => e.name);
    expect(names).toContain('real');
    expect(names).toContain('cycle'); // resolves to a real directory
    expect(names).not.toContain('broken'); // unresolvable → skipped
  });

  // Case ④: EACCES entry skipped → partial result (POSIX, non-root)
  it('skips inaccessible entries and returns a partial result (AC4)', async () => {
    if (isWin || isRoot) return;
    await fs.mkdir(path.join(tmpDir, 'ok'));
    const secret = path.join(tmpDir, 'secret');
    await fs.mkdir(secret);
    await fs.mkdir(path.join(secret, 'inner'));
    try {
      await fs.symlink(path.join(secret, 'inner'), path.join(tmpDir, 'link'), 'dir');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
      throw err;
    }
    await fs.chmod(secret, 0o000); // resolving `link` now throws EACCES (cannot traverse secret)

    // .finally restores perms whether the call resolves or rejects (cleanup safety).
    const res = await systemBrowseService
      .listDirectory(tmpDir)
      .finally(() => fs.chmod(secret, 0o755));

    const names = res.entries.map((e) => e.name);
    expect(names).toContain('ok'); // listing did not error — sibling returned
    expect(names).not.toContain('link'); // EACCES on resolve → entry skipped
  });
});

describe('systemBrowseService.listDriveRoots', () => {
  // Case ⑦: non-empty, each entry absolute
  it('returns non-empty absolute drive roots (AC2)', async () => {
    const res = await systemBrowseService.listDriveRoots();
    expect(res.isDriveRoots).toBe(true);
    expect(res.path).toBeNull();
    expect(res.parent).toBeNull();
    expect(res.home).toBe(os.homedir());
    expect(res.entries.length).toBeGreaterThan(0);
    for (const e of res.entries) {
      expect(path.isAbsolute(e.path)).toBe(true);
      expect(e.hasChildren).toBe(true);
    }
    if (isWin) {
      expect(res.entries.every((e) => /^[A-Z]:$/.test(e.name))).toBe(true);
    } else {
      expect(res.entries.some((e) => e.path === '/')).toBe(true);
    }
  });
});

describe('systemBrowseService.makeDirectory', () => {
  // Case ⑤: create + duplicate conflict
  it('creates a folder and rejects duplicates with ALREADY_EXISTS (AC5)', async () => {
    const res = await systemBrowseService.makeDirectory(tmpDir, 'created');
    expect(res.success).toBe(true);
    expect(res.path).toBe(path.join(path.resolve(tmpDir), 'created'));
    expect((await fs.stat(path.join(tmpDir, 'created'))).isDirectory()).toBe(true);

    await expect(systemBrowseService.makeDirectory(tmpDir, 'created')).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });
  });

  it('rejects missing parent (NOT_FOUND) and traversal/invalid names (INVALID_NAME)', async () => {
    await expect(
      systemBrowseService.makeDirectory(path.join(tmpDir, 'nope'), 'x'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(systemBrowseService.makeDirectory(tmpDir, '../escape')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(systemBrowseService.makeDirectory(tmpDir, 'a/b')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(systemBrowseService.makeDirectory(tmpDir, '')).rejects.toMatchObject({ code: 'INVALID_NAME' });
  });

  // Case ⑧: AC9 — write to a non-writable parent → PERMISSION_DENIED (POSIX, non-root)
  it('refuses writes to a non-writable parent with PERMISSION_DENIED (AC9)', async () => {
    if (isWin || isRoot) return;
    const ro = path.join(tmpDir, 'ro');
    await fs.mkdir(ro);
    await fs.chmod(ro, 0o500); // r-x, no write

    await expect(
      systemBrowseService.makeDirectory(ro, 'child').finally(() => fs.chmod(ro, 0o755)),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

describe('systemBrowseService.rename', () => {
  // Case ⑥: rename success + target-exists conflict + traversal name rejection
  it('renames within the same parent and rejects target-exists (AC6)', async () => {
    await fs.mkdir(path.join(tmpDir, 'old'));
    const res = await systemBrowseService.rename(path.join(tmpDir, 'old'), 'renamed');
    expect(res.success).toBe(true);
    expect(res.oldPath).toBe(path.join(path.resolve(tmpDir), 'old'));
    expect(res.newPath).toBe(path.join(path.resolve(tmpDir), 'renamed'));
    expect((await fs.stat(path.join(tmpDir, 'renamed'))).isDirectory()).toBe(true);

    await fs.mkdir(path.join(tmpDir, 'a'));
    await fs.mkdir(path.join(tmpDir, 'b'));
    await expect(systemBrowseService.rename(path.join(tmpDir, 'a'), 'b')).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });
  });

  it('rejects missing source (NOT_FOUND) and traversal names (INVALID_NAME)', async () => {
    await expect(
      systemBrowseService.rename(path.join(tmpDir, 'ghost'), 'x'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await fs.mkdir(path.join(tmpDir, 'src'));
    await expect(systemBrowseService.rename(path.join(tmpDir, 'src'), '../escape')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(systemBrowseService.rename(path.join(tmpDir, 'src'), 'a/b')).rejects.toMatchObject({ code: 'INVALID_NAME' });
  });
});
