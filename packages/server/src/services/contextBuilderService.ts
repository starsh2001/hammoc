/**
 * Story 31.2: SessionStart context-builder service (Epic 31).
 *
 * Domain: the declarative `<projectRoot>/.hammoc/context-builder.json` manifest
 * (single source of truth) and its two GENERATED artifacts —
 *   - `<projectRoot>/.hammoc/hooks/context-builder.mjs`   (the SessionStart script)
 *   - `<projectRoot>/.claude/settings.json` `hooks.SessionStart` entry pointing at it
 *
 * The manifest + script live under `.hammoc/`, a SIBLING of `.claude/` (outside
 * the harness whitelist), so they get dedicated canonical-path resolvers
 * (`resolveContextBuilderManifestPath` / `resolveContextBuilderScriptPath`) and
 * are read/written with direct `fs` — exactly like Story 31.1's
 * `.bmad-core/core-config.yaml`. `settings.json` IS inside `.claude/`, so its
 * entry registration routes through `harnessService` + `applyJsoncPatch` (JSONC
 * round-trip preserving comments/order).
 *
 * Ownership is identified purely by the command path marker
 * (`CONTEXT_BUILDER_SCRIPT_MARKER`) — no extra metadata key is written into
 * settings.json (AC1.e / AC3.a: the path IS the ownership identifier). A
 * Hammoc-managed SessionStart group is updated in place; foreign (user-authored)
 * groups are never touched.
 */

import fs from 'fs/promises';
import path from 'path';
import { parse as parseJsonc } from 'jsonc-parser';
import {
  HARNESS_ERRORS,
  CONTEXT_BUILDER_SCRIPT_MARKER,
  CONTEXT_BUILDER_VARIABLE_IDS,
  createDefaultContextBuilderManifest,
  type ContextBuilderManifest,
  type ContextBuilderReadResponse,
  type ContextBuilderGenerateResponse,
  type ContextBuilderVariableId,
  type HarnessPathRef,
} from '@hammoc/shared';
import {
  resolveContextBuilderManifestPath,
  resolveContextBuilderScriptPath,
} from '../utils/harnessPaths.js';
import { harnessService } from './harnessService.js';
import { applyJsoncPatch } from '../utils/structuredEditor.js';
import { detectSecretsInText } from '../utils/secretHeuristic.js';
import { fileWatcherService } from './fileWatcherService.js';
import { buildContextBuilderScript } from './contextBuilderScriptTemplate.js';

function throwMapped(code: string, message: string, extras?: Record<string, unknown>): never {
  const err = new Error(message) as NodeJS.ErrnoException & Record<string, unknown>;
  err.code = code;
  if (extras) Object.assign(err, extras);
  throw err;
}

function isFileNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code;
}

/** Forward-slash a path so the ownership marker match works cross-platform. */
function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Normalize an arbitrary parsed manifest into a fully-populated, well-typed
 * shape: all 5 variable keys present, arrays defaulted, version pinned. Guards
 * against partial on-disk manifests and hand-edits.
 */
function normalizeManifest(input: unknown): ContextBuilderManifest {
  const base = createDefaultContextBuilderManifest();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return base;
  }
  const raw = input as Record<string, unknown>;

  const files = Array.isArray(raw.files)
    ? raw.files.filter((f): f is string => typeof f === 'string')
    : base.files;

  const variables = { ...base.variables };
  if (raw.variables && typeof raw.variables === 'object' && !Array.isArray(raw.variables)) {
    const rv = raw.variables as Record<string, unknown>;
    for (const id of CONTEXT_BUILDER_VARIABLE_IDS) {
      if (typeof rv[id] === 'boolean') variables[id as ContextBuilderVariableId] = rv[id] as boolean;
    }
  }

  const customCommands = Array.isArray(raw.customCommands)
    ? raw.customCommands
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({
          command: typeof c.command === 'string' ? c.command : '',
          acknowledged: c.acknowledged === true,
        }))
        .filter((c) => c.command.length > 0)
    : base.customCommands;

  const recentCommitsCount =
    typeof raw.recentCommitsCount === 'number' && raw.recentCommitsCount > 0
      ? Math.floor(raw.recentCommitsCount)
      : base.recentCommitsCount;

  return {
    version: 1,
    enabled: raw.enabled === true,
    files,
    variables,
    recentCommitsCount,
    customCommands,
  };
}

const SETTINGS_REL = 'settings.json';

function settingsRef(projectSlug: string): HarnessPathRef {
  return { scope: 'project', projectSlug, relativePath: SETTINGS_REL };
}

/** Read settings.json via harnessService; missing file → empty content. */
async function readSettings(
  projectSlug: string,
): Promise<{ content: string; mtime: string; exists: boolean }> {
  try {
    const res = await harnessService.read(settingsRef(projectSlug));
    return { content: res.content ?? '', mtime: res.mtime, exists: true };
  } catch (err) {
    if (isFileNotFound(err)) return { content: '', mtime: '', exists: false };
    throw err;
  }
}

interface SessionStartGroup {
  hooks?: Array<{ type?: string; command?: string }>;
}

function parseSessionStartGroups(settingsContent: string): SessionStartGroup[] {
  if (!settingsContent.trim()) return [];
  let parsed: unknown;
  try {
    parsed = parseJsonc(settingsContent);
  } catch {
    return [];
  }
  const hooks = (parsed as { hooks?: { SessionStart?: unknown } })?.hooks?.SessionStart;
  return Array.isArray(hooks) ? (hooks as SessionStartGroup[]) : [];
}

/** Index of the Hammoc-managed SessionStart group, or -1 when none exists. */
function findManagedIndex(groups: SessionStartGroup[]): number {
  for (let i = 0; i < groups.length; i += 1) {
    const hookList = groups[i]?.hooks;
    if (
      Array.isArray(hookList) &&
      hookList.some(
        (h) =>
          typeof h?.command === 'string' &&
          normalizeSlashes(h.command).includes(CONTEXT_BUILDER_SCRIPT_MARKER),
      )
    ) {
      return i;
    }
  }
  return -1;
}

class ContextBuilderService {
  /**
   * Read the manifest + derived artifact state. Missing manifest → a default
   * (disabled, empty) manifest with `mtime: ''` so the panel opens empty
   * instead of erroring.
   */
  async readManifest(projectSlug: string): Promise<ContextBuilderReadResponse> {
    const { absolutePath } = await resolveContextBuilderManifestPath(projectSlug);

    let manifest = createDefaultContextBuilderManifest();
    let mtime = '';
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) {
        const text = await fs.readFile(absolutePath, 'utf-8');
        try {
          manifest = normalizeManifest(JSON.parse(text));
        } catch {
          // Corrupt JSON on disk — surface as PARSE_ERROR so the client can
          // reset rather than silently dropping the user's declaration.
          throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'context-builder.json is not valid JSON');
        }
        mtime = stat.mtime.toISOString();
      }
    } catch (err) {
      if (!isFileNotFound(err)) {
        if ((err as NodeJS.ErrnoException).code === HARNESS_ERRORS.HARNESS_PARSE_ERROR.code) throw err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EACCES') throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
        throw err;
      }
    }

    const { absolutePath: scriptPath } = await resolveContextBuilderScriptPath(projectSlug);
    let scriptExists = false;
    try {
      const st = await fs.stat(scriptPath);
      scriptExists = st.isFile();
    } catch {
      scriptExists = false;
    }

    const { content } = await readSettings(projectSlug);
    const entryRegistered = findManagedIndex(parseSessionStartGroups(content)) >= 0;

    return { manifest, mtime, scriptExists, entryRegistered };
  }

  /**
   * Persist the manifest (SSoT) then regenerate its artifacts. When
   * `manifest.enabled` is false this is equivalent to `disable` (artifacts are
   * removed). Returns the new manifest mtime + generated artifact locations +
   * any non-blocking secret warnings (AC5.c).
   */
  async writeManifest(
    projectSlug: string,
    input: unknown,
    expectedMtime?: string,
  ): Promise<ContextBuilderGenerateResponse> {
    const manifest = normalizeManifest(input);

    // AC5.c — scan acknowledged command strings; NON-BLOCKING notice only.
    const secretWarningCommandIndices: number[] = [];
    manifest.customCommands.forEach((cc, idx) => {
      if (cc.acknowledged && detectSecretsInText(cc.command).matched) {
        secretWarningCommandIndices.push(idx);
      }
    });

    const mtime = await this.writeManifestFile(projectSlug, manifest, expectedMtime);

    if (!manifest.enabled) {
      const settingsMtime = await this.removeEntryAndScript(projectSlug);
      return { mtime, scriptPath: '', settingsMtime, secretWarningCommandIndices };
    }

    const { scriptPath, settingsMtime } = await this.generate(projectSlug, manifest);
    return { mtime, scriptPath, settingsMtime, secretWarningCommandIndices };
  }

  /**
   * AC1.f — disable: retain the declaration (`enabled: false`) but remove the
   * generated script + the Hammoc-managed SessionStart entry (other entries
   * preserved).
   */
  async disable(projectSlug: string, expectedMtime?: string): Promise<{ mtime: string }> {
    const current = await this.readManifest(projectSlug);
    const manifest: ContextBuilderManifest = { ...current.manifest, enabled: false };
    const mtime = await this.writeManifestFile(
      projectSlug,
      manifest,
      expectedMtime ?? (current.mtime || undefined),
    );
    await this.removeEntryAndScript(projectSlug);
    return { mtime };
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /** STALE_WRITE-guarded write of the manifest JSON via direct fs. */
  private async writeManifestFile(
    projectSlug: string,
    manifest: ContextBuilderManifest,
    expectedMtime?: string,
  ): Promise<string> {
    const { absolutePath } = await resolveContextBuilderManifestPath(projectSlug);

    if (expectedMtime !== undefined) {
      try {
        const existing = await fs.stat(absolutePath);
        const currentMtime = existing.mtime.toISOString();
        if (currentMtime !== expectedMtime) {
          throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'manifest changed on disk', { currentMtime });
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          // expectedMtime '' (the empty-state default) means "create" — only a
          // non-empty expectedMtime against a missing file is a real stale.
          if (expectedMtime !== '') {
            throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'manifest missing on disk', { currentMtime: '' });
          }
        } else if (code === HARNESS_ERRORS.HARNESS_STALE_WRITE.code) {
          throw error;
        } else if (code === 'EACCES') {
          throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
        }
      }
    }

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await fs.writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    } catch {
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to write manifest');
    }
    const stat = await fs.stat(absolutePath);
    fileWatcherService.noteLocalWrite(absolutePath);
    return stat.mtime.toISOString();
  }

  /**
   * Generate the `.mjs` script from the manifest, write it to disk, and
   * register/refresh the SessionStart entry in settings.json.
   */
  private async generate(
    projectSlug: string,
    manifest: ContextBuilderManifest,
  ): Promise<{ scriptPath: string; settingsMtime: string }> {
    const { resolvedRoot: projectRoot, absolutePath: scriptPath } =
      await resolveContextBuilderScriptPath(projectSlug);

    const scriptText = buildContextBuilderScript(projectRoot, manifest);
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    try {
      await fs.writeFile(scriptPath, scriptText, 'utf-8');
    } catch {
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to write script');
    }
    fileWatcherService.noteLocalWrite(scriptPath);

    const settingsMtime = await this.registerEntry(projectSlug, projectRoot, scriptPath);
    return { scriptPath, settingsMtime };
  }

  /**
   * Register (or refresh) the Hammoc-managed SessionStart entry. Updates the
   * managed group in place when present; otherwise appends a new group, leaving
   * any foreign groups untouched (AC1.e).
   */
  private async registerEntry(
    projectSlug: string,
    projectRoot: string,
    scriptPath: string,
  ): Promise<string> {
    // Context builder is NOT BMad-gated — `.claude/` may not exist yet on a
    // fresh project. Create it so the settings.json write has a parent dir.
    await fs.mkdir(path.join(projectRoot, '.claude'), { recursive: true });

    const { content, mtime, exists } = await readSettings(projectSlug);
    const command = `node "${normalizeSlashes(scriptPath)}"`;
    const group = { hooks: [{ type: 'command', command }] };

    const groups = parseSessionStartGroups(content);
    const managedIdx = findManagedIndex(groups);

    let patchOp: { path: (string | number)[]; value: unknown };
    if (managedIdx >= 0) {
      patchOp = { path: ['hooks', 'SessionStart', managedIdx], value: group };
    } else if (groups.length === 0) {
      patchOp = { path: ['hooks', 'SessionStart'], value: [group] };
    } else {
      patchOp = { path: ['hooks', 'SessionStart', groups.length], value: group };
    }

    const source = content.trim().length === 0 ? '{}' : content;
    const patched = applyJsoncPatch(source, [patchOp]);
    const written = await harnessService.write(settingsRef(projectSlug), {
      content: patched,
      // AC1.e — guard against an external settings.json edit landing between
      // our read and write. Omit on create (file did not exist).
      expectedMtime: exists ? mtime : undefined,
    });
    return written.mtime;
  }

  /**
   * Remove the Hammoc-managed SessionStart entry (preserving foreign groups)
   * and delete the generated script. Returns the new settings.json mtime (or
   * the unchanged/empty value when settings.json does not exist).
   */
  private async removeEntryAndScript(projectSlug: string): Promise<string> {
    // Delete the generated script (idempotent).
    const { absolutePath: scriptPath } = await resolveContextBuilderScriptPath(projectSlug);
    try {
      await fs.unlink(scriptPath);
      fileWatcherService.noteLocalWrite(scriptPath);
    } catch {
      // already gone — fine.
    }

    const { content, mtime, exists } = await readSettings(projectSlug);
    if (!exists) return '';
    const groups = parseSessionStartGroups(content);
    const managedIdx = findManagedIndex(groups);
    if (managedIdx < 0) return mtime; // nothing to remove.

    // Remove the managed group; if it was the only group, drop the SessionStart
    // key entirely so we don't leave an empty array behind.
    const ops: Array<{ path: (string | number)[]; value: unknown }> =
      groups.length === 1
        ? [{ path: ['hooks', 'SessionStart'], value: undefined }]
        : [{ path: ['hooks', 'SessionStart', managedIdx], value: undefined }];

    const patched = applyJsoncPatch(content, ops);
    const written = await harnessService.write(settingsRef(projectSlug), {
      content: patched,
      expectedMtime: mtime,
    });
    return written.mtime;
  }
}

export const contextBuilderService = new ContextBuilderService();
