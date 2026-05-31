/**
 * Story 31.1: Tests for bmadCoreConfigService — read / patchKey / writeRaw /
 * parseUnknownKeys against a real temp `.bmad-core/core-config.yaml`. Verifies
 * the STALE_WRITE guard, comment/order preservation, unknown-key round-trip
 * (AC4), self-write echo suppression, and the cross-service scanProject
 * recalculation guard (F.10).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { bmadCoreConfigService } from '../bmadCoreConfigService.js';
import { bmadStatusService } from '../bmadStatusService.js';
import { fileWatcherService } from '../fileWatcherService.js';
import { projectService } from '../projectService.js';

const FIXTURE = `markdownExploder: true
qa:
  qaLocation: docs/qa
prd:
  prdFile: docs/prd.md
  prdVersion: v4
  prdSharded: true
  prdShardedLocation: docs/prd
  epicFilePattern: epic-{n}*.md
architecture:
  architectureFile: docs/architecture.md
  architectureVersion: v4
  architectureSharded: true
  architectureShardedLocation: docs/architecture
customTechnicalDocuments: null
devLoadAlwaysFiles:
  - docs/architecture/coding-standards.md
  - docs/architecture/tech-stack.md
brownfieldEpic:
  updateOnCreate:
    - docs/prd/5-epic-list.md
  doNotUpdate:
    - docs/prd
devDebugLog: .ai/debug-log.md
devStoryLocation: docs/stories
slashPrefix: BMad
`;

let tmpProject: string;
let configPath: string;

async function writeConfig(content: string): Promise<void> {
  await fs.writeFile(configPath, content, 'utf-8');
}

beforeEach(async () => {
  tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'bmadcfgsvc-'));
  await fs.mkdir(path.join(tmpProject, '.bmad-core'), { recursive: true });
  configPath = path.join(tmpProject, '.bmad-core', 'core-config.yaml');
  await writeConfig(FIXTURE);
  vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpProject, { recursive: true, force: true });
});

describe('bmadCoreConfigService.read', () => {
  it('returns content + mtime for an existing config', async () => {
    const result = await bmadCoreConfigService.read('slug');
    expect(result.content).toBe(FIXTURE);
    expect(result.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws HARNESS_FILE_NOT_FOUND when the config is absent', async () => {
    await fs.rm(configPath, { force: true });
    await expect(bmadCoreConfigService.read('slug')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code,
    });
  });

  it('maps EACCES to HARNESS_FORBIDDEN', async () => {
    vi.spyOn(fs, 'stat').mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );
    await expect(bmadCoreConfigService.read('slug')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
    });
  });
});

describe('bmadCoreConfigService.patchKey', () => {
  it('patches a single key and reflects it on disk', async () => {
    const { mtime } = await bmadCoreConfigService.patchKey('slug', [
      { path: ['devStoryLocation'], value: 'docs/v2-stories' },
    ]);
    expect(mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const onDisk = await fs.readFile(configPath, 'utf-8');
    expect(onDisk).toContain('devStoryLocation: docs/v2-stories');
  });

  it('throws HARNESS_STALE_WRITE when expectedMtime does not match disk', async () => {
    await expect(
      bmadCoreConfigService.patchKey(
        'slug',
        [{ path: ['slashPrefix'], value: 'X' }],
        '1999-01-01T00:00:00.000Z',
      ),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('preserves comments, key order, and quoting for untouched nodes (AC5.d)', async () => {
    const commented = `# top comment\nmarkdownExploder: true\nqa:\n  qaLocation: docs/qa # inline\ndevStoryLocation: "docs/stories"\nslashPrefix: BMad\n`;
    await writeConfig(commented);
    await bmadCoreConfigService.patchKey('slug', [
      { path: ['devStoryLocation'], value: 'docs/v2-stories' },
    ]);
    const onDisk = await fs.readFile(configPath, 'utf-8');
    expect(onDisk).toContain('# top comment');
    expect(onDisk).toContain('# inline');
    // Quote style preserved for the patched scalar; order of qa before devStoryLocation intact.
    expect(onDisk).toContain('devStoryLocation: "docs/v2-stories"');
    expect(onDisk.indexOf('qaLocation')).toBeLessThan(onDisk.indexOf('devStoryLocation'));
  });

  it('round-trips an unknown top-level key untouched (AC4.d)', async () => {
    await writeConfig(`${FIXTURE}customFooBar: "hello"\n`);
    await bmadCoreConfigService.patchKey('slug', [
      { path: ['devStoryLocation'], value: 'docs/v2-stories' },
    ]);
    const onDisk = await fs.readFile(configPath, 'utf-8');
    expect(onDisk).toContain('customFooBar: "hello"');
    expect(onDisk).toContain('devStoryLocation: docs/v2-stories');
  });

  it('lets bmadStatusService.scanProject recompute from the patched config (F.10)', async () => {
    const before = await bmadStatusService.scanProject(tmpProject);
    expect(before.config.devStoryLocation).toBe('docs/stories');

    await bmadCoreConfigService.patchKey('slug', [
      { path: ['devStoryLocation'], value: 'docs/v2-stories' },
    ]);

    const after = await bmadStatusService.scanProject(tmpProject);
    expect(after.config.devStoryLocation).toBe('docs/v2-stories');
  });
});

describe('bmadCoreConfigService.writeRaw', () => {
  it('overwrites the file with the supplied text', async () => {
    const next = `${FIXTURE}# appended by raw editor\n`;
    const { mtime } = await bmadCoreConfigService.writeRaw('slug', next);
    expect(mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const onDisk = await fs.readFile(configPath, 'utf-8');
    expect(onDisk).toBe(next);
  });

  it('throws HARNESS_STALE_WRITE when expectedMtime does not match disk', async () => {
    await expect(
      bmadCoreConfigService.writeRaw('slug', 'slashPrefix: X\n', '1999-01-01T00:00:00.000Z'),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('notes a local write so the watcher suppresses the self-write echo', async () => {
    const noteSpy = vi.spyOn(fileWatcherService, 'noteLocalWrite');
    await bmadCoreConfigService.writeRaw('slug', `${FIXTURE}\n`);
    expect(noteSpy).toHaveBeenCalledWith(configPath);
  });
});

describe('bmadCoreConfigService.parseUnknownKeys', () => {
  it('classifies all known keys with no unknowns', () => {
    const { knownKeys, unknownKeys } = bmadCoreConfigService.parseUnknownKeys(FIXTURE);
    expect(Object.keys(unknownKeys)).toHaveLength(0);
    expect(knownKeys.devStoryLocation).toBe('docs/stories');
    expect(knownKeys.prd?.epicFilePattern).toBe('epic-{n}*.md');
    expect(knownKeys.qa?.qaLocation).toBe('docs/qa');
    expect(knownKeys.customTechnicalDocuments).toBeNull();
  });

  it('partitions unknown top-level keys into unknownKeys with their parsed value', () => {
    const { knownKeys, unknownKeys } = bmadCoreConfigService.parseUnknownKeys(
      `${FIXTURE}customFooBar: "hello"\nexperimentalFlag: true\n`,
    );
    expect(knownKeys.slashPrefix).toBe('BMad');
    expect(unknownKeys).toEqual({ customFooBar: 'hello', experimentalFlag: true });
  });
});
