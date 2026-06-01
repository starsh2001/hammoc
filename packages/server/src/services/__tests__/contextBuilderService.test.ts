/**
 * Story 31.2 (Task A.6): tests for contextBuilderService — manifest round-trip,
 * script generation + actual execution, settings.json entry register/conflict
 * (AC1.e) / cleanup (AC1.f), secret scan (AC5.c), and missing-file placeholder
 * (AC2.c). Runs against real temp `.hammoc/` + `.claude/` trees.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { execFileSync } from 'child_process';
import {
  HARNESS_ERRORS,
  createDefaultContextBuilderManifest,
  CONTEXT_BUILDER_SCRIPT_MARKER,
  type ContextBuilderManifest,
} from '@hammoc/shared';
import { contextBuilderService } from '../contextBuilderService.js';
import { fileWatcherService } from '../fileWatcherService.js';
import { projectService } from '../projectService.js';

let tmpProject: string;
let manifestPath: string;
let scriptPath: string;
let settingsPath: string;

function makeManifest(overrides: Partial<ContextBuilderManifest> = {}): ContextBuilderManifest {
  return { ...createDefaultContextBuilderManifest(), enabled: true, ...overrides };
}

async function readSettings(): Promise<Record<string, unknown>> {
  const text = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(text) as Record<string, unknown>;
}

function sessionStartGroups(parsed: Record<string, unknown>): Array<{ hooks?: Array<{ command?: string }> }> {
  const hooks = (parsed as { hooks?: { SessionStart?: unknown } }).hooks?.SessionStart;
  return Array.isArray(hooks) ? hooks : [];
}

beforeEach(async () => {
  tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'ctxbuilder-'));
  manifestPath = path.join(tmpProject, '.hammoc', 'context-builder.json');
  scriptPath = path.join(tmpProject, '.hammoc', 'hooks', 'context-builder.mjs');
  settingsPath = path.join(tmpProject, '.claude', 'settings.json');
  vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpProject, { recursive: true, force: true });
});

describe('contextBuilderService.readManifest', () => {
  it('returns the default (disabled, empty) manifest when no file exists', async () => {
    const res = await contextBuilderService.readManifest('slug');
    expect(res.manifest).toEqual(createDefaultContextBuilderManifest());
    expect(res.mtime).toBe('');
    expect(res.scriptExists).toBe(false);
    expect(res.entryRegistered).toBe(false);
  });

  it('reports scriptExists + entryRegistered after an enabled save', async () => {
    await contextBuilderService.writeManifest('slug', makeManifest({ variables: { ...createDefaultContextBuilderManifest().variables, today: true } }));
    const res = await contextBuilderService.readManifest('slug');
    expect(res.manifest.enabled).toBe(true);
    expect(res.scriptExists).toBe(true);
    expect(res.entryRegistered).toBe(true);
    expect(res.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws HARNESS_PARSE_ERROR on a corrupt manifest', async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, '{ not valid json', 'utf-8');
    await expect(contextBuilderService.readManifest('slug')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
    });
  });
});

describe('contextBuilderService.writeManifest (AC1.c/d)', () => {
  it('writes the manifest, generates the script, and registers the settings entry', async () => {
    const res = await contextBuilderService.writeManifest('slug', makeManifest({ files: ['README.md'] }));
    expect(res.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.scriptPath).toBe(scriptPath);

    // manifest on disk
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    expect(manifest.files).toEqual(['README.md']);

    // generated script on disk references the SessionStart envelope
    const script = await fs.readFile(scriptPath, 'utf-8');
    expect(script).toContain('hookSpecificOutput');
    expect(script).toContain('SessionStart');

    // settings.json has a single Hammoc-managed group
    const groups = sessionStartGroups(await readSettings());
    expect(groups).toHaveLength(1);
    const command = groups[0]?.hooks?.[0]?.command ?? '';
    expect(command).toContain(CONTEXT_BUILDER_SCRIPT_MARKER);
    expect(command.startsWith('node "')).toBe(true);
  });

  it('throws HARNESS_STALE_WRITE when expectedMtime does not match the manifest', async () => {
    await contextBuilderService.writeManifest('slug', makeManifest());
    await expect(
      contextBuilderService.writeManifest('slug', makeManifest(), '1999-01-01T00:00:00.000Z'),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('updates the managed entry in place and preserves a foreign SessionStart entry (AC1.e)', async () => {
    // Seed a foreign (user-authored) SessionStart entry.
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }] } }, null, 2),
      'utf-8',
    );

    await contextBuilderService.writeManifest('slug', makeManifest({ files: ['a.md'] }));
    let groups = sessionStartGroups(await readSettings());
    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.hooks?.[0]?.command === 'echo user-hook')).toBe(true);
    expect(groups.some((g) => (g.hooks?.[0]?.command ?? '').includes(CONTEXT_BUILDER_SCRIPT_MARKER))).toBe(true);

    // Second save must UPDATE the managed group, not append a third.
    await contextBuilderService.writeManifest('slug', makeManifest({ files: ['b.md'] }));
    groups = sessionStartGroups(await readSettings());
    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.hooks?.[0]?.command === 'echo user-hook')).toBe(true);
  });

  it('flags secrets in acknowledged commands without blocking the save (AC5.c)', async () => {
    const res = await contextBuilderService.writeManifest(
      'slug',
      makeManifest({
        customCommands: [
          { command: 'echo hello', acknowledged: true },
          { command: 'curl -H "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz0123"', acknowledged: true },
        ],
      }),
    );
    expect(res.secretWarningCommandIndices).toEqual([1]);
    // Save still succeeded — manifest + script exist.
    expect(res.scriptPath).toBe(scriptPath);
    const script = await fs.readFile(scriptPath, 'utf-8');
    expect(script).toContain('Authorization');
  });

  it('removes the entry + script when the manifest is saved disabled', async () => {
    await contextBuilderService.writeManifest('slug', makeManifest());
    await contextBuilderService.writeManifest('slug', makeManifest({ enabled: false }));
    await expect(fs.stat(scriptPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const groups = sessionStartGroups(await readSettings());
    expect(groups).toHaveLength(0);
  });

  it('notes a local write so the watcher suppresses the manifest self-write echo', async () => {
    const noteSpy = vi.spyOn(fileWatcherService, 'noteLocalWrite');
    await contextBuilderService.writeManifest('slug', makeManifest());
    expect(noteSpy).toHaveBeenCalledWith(manifestPath);
  });
});

describe('contextBuilderService.disable (AC1.f)', () => {
  it('removes the script + managed entry, keeps the declaration, preserves foreign entries', async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }] } }, null, 2),
      'utf-8',
    );
    await contextBuilderService.writeManifest('slug', makeManifest({ files: ['a.md'] }));

    await contextBuilderService.disable('slug');

    // manifest retained but disabled
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    expect(manifest.enabled).toBe(false);
    expect(manifest.files).toEqual(['a.md']);
    // script gone
    await expect(fs.stat(scriptPath)).rejects.toMatchObject({ code: 'ENOENT' });
    // foreign entry survives, managed entry gone
    const groups = sessionStartGroups(await readSettings());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.hooks?.[0]?.command).toBe('echo user-hook');
  });
});

describe('generated script execution (AC1.c/2.b/2.c)', () => {
  it('emits a valid SessionStart envelope with reference file content + today + missing-file placeholder', async () => {
    await fs.writeFile(path.join(tmpProject, 'present.md'), '# Present file\nhello world', 'utf-8');
    await contextBuilderService.writeManifest(
      'slug',
      makeManifest({
        files: ['present.md', 'gone.md'],
        variables: { ...createDefaultContextBuilderManifest().variables, today: true },
      }),
    );

    const stdout = execFileSync('node', [scriptPath], { cwd: tmpProject, encoding: 'utf-8' });
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    // reference file content read fresh at runtime
    expect(ctx).toContain('hello world');
    // missing reference file → placeholder, no crash
    expect(ctx).toContain('gone.md');
    expect(ctx).toContain('파일을 찾을 수 없음');
    // today variable computed at runtime
    expect(ctx).toMatch(/## Today\n\n\d{4}-\d{2}-\d{2}/);
  });
});
