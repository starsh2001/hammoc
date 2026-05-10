/**
 * Story 28.4: Harness Hook service.
 *
 * Combines three sources of hook definitions into a single 9-event card list:
 *   - <projectRoot>/.claude/settings.json     (hooks field)
 *   - ~/.claude/settings.json                 (hooks field)
 *   - <pluginInstallPath>/hooks/hooks.json    (hooks field, read-only)
 *
 * Disable-toggle mechanism follows Story 28.3 backup-file pattern (path 2):
 *   - <projectRoot>/.claude/hooks.disabled.json (project scope)
 *   - ~/.claude/hooks.disabled.json             (user scope)
 *
 * `prompt`-type hook GA status is cached as `promptTypeSupport` on every list
 * response — the spike result toggles a single constant here without touching
 * the rest of the service. Default is `'unsupported'` (per the static evidence
 * dossier — 5/5 official plugin bundles use `command` only).
 */

import path from 'path';
import fs from 'fs/promises';
import {
  HARNESS_ERRORS,
  HARNESS_HOOK_EVENTS,
  type HarnessHookCard,
  type HarnessHookConfig,
  type HarnessHookCopyRequest,
  type HarnessHookCopyResponse,
  type HarnessHookCreateRequest,
  type HarnessHookCreateResponse,
  type HarnessHookDeleteRequest,
  type HarnessHookEvent,
  type HarnessHookListResponse,
  type HarnessHookMalformedEntry,
  type HarnessHookReadResponse,
  type HarnessHookSourceLocation,
  type HarnessHookSourceScope,
  type HarnessHookUpdateRequest,
  type HarnessHookUpdateResponse,
  type HarnessInstalledPluginEntry,
  type HarnessPathRef,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';
import { applyJsoncPatch } from '../utils/structuredEditor.js';
import { createLogger } from '../utils/logger.js';
import { detectSecretsInText as detectSecretsInTextCanonical } from '../utils/secretHeuristic.js';
import { assertNoSecretOnShared } from '../utils/assertNoSecretOnShared.js';

const log = createLogger('harnessHookService');

/**
 * Spike result cache — flip to `'supported'` once the prompt-type hook spike
 * confirms Claude Code actually executes prompt-type entries. Default
 * `'unsupported'` matches the static evidence (5/5 official bundles use
 * command-type only).
 */
const PROMPT_TYPE_SUPPORT: 'supported' | 'unsupported' | 'unknown' = 'unsupported';

const SCOPE_PRIORITY: Record<HarnessHookSourceScope, number> = {
  project: 0,
  user: 1,
  plugin: 2,
};

interface InstalledPluginsFile {
  version?: number;
  plugins?: Record<string, HarnessInstalledPluginEntry[] | HarnessInstalledPluginEntry>;
}

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

function isStaleWrite(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_STALE_WRITE.code;
}

// ---------------------------------------------------------------------------
// Secret detection — Story 30.1 (Task 1.2) routed through
// `utils/secretHeuristic.ts` (canonical patterns shared with the agent /
// command / mcp services). The hook-specific shape (one matched-path string
// per scanned field) is preserved so the existing modal wiring needs no
// change.
// ---------------------------------------------------------------------------

export interface DetectSecretsResult {
  matched: boolean;
  paths: string[];
}

export function detectSecretsInHook(config: HarnessHookConfig): DetectSecretsResult {
  const paths: string[] = [];
  const fields: Array<['command' | 'prompt', string | undefined]> = [
    ['command', config.command],
    ['prompt', config.prompt],
  ];
  for (const [name, value] of fields) {
    if (typeof value !== 'string' || value.length === 0) continue;
    if (detectSecretsInTextCanonical(value).matched) {
      paths.push(name);
    }
  }
  return { matched: paths.length > 0, paths };
}

const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';

function containsPluginRootToken(config: HarnessHookConfig): boolean {
  return (
    (typeof config.command === 'string' && config.command.includes(PLUGIN_ROOT_TOKEN)) ||
    (typeof config.prompt === 'string' && config.prompt.includes(PLUGIN_ROOT_TOKEN))
  );
}

// ---------------------------------------------------------------------------
// File access helpers
// ---------------------------------------------------------------------------

interface MatcherGroup {
  matcher?: string;
  hooks: HarnessHookConfig[];
}

interface HooksFileShape {
  hooks?: Partial<Record<HarnessHookEvent, MatcherGroup[]>>;
  // ...other settings.json fields are passed through by jsonc-parser.
}

interface ParsedFile {
  groups: Record<HarnessHookEvent, MatcherGroup[]>;
  mtime: string;
  rawText: string;
  /** Absent file → present:false, mtime:''. */
  present: boolean;
}

function safeParseJsonc(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function emptyEventMap(): Record<HarnessHookEvent, MatcherGroup[]> {
  const out: Partial<Record<HarnessHookEvent, MatcherGroup[]>> = {};
  for (const event of HARNESS_HOOK_EVENTS) out[event] = [];
  return out as Record<HarnessHookEvent, MatcherGroup[]>;
}

function extractGroups(parsed: unknown): Record<HarnessHookEvent, MatcherGroup[]> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const wrapper = (parsed as HooksFileShape).hooks;
  const result = emptyEventMap();
  if (wrapper === undefined || wrapper === null) return result;
  if (typeof wrapper !== 'object' || Array.isArray(wrapper)) return null;
  for (const event of HARNESS_HOOK_EVENTS) {
    const list = (wrapper as Record<string, unknown>)[event];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      // Single malformed event — keep the rest, drop this one.
      continue;
    }
    const groups: MatcherGroup[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const group = raw as { matcher?: unknown; hooks?: unknown };
      if (!Array.isArray(group.hooks)) continue;
      const hooks: HarnessHookConfig[] = [];
      for (const h of group.hooks) {
        if (!h || typeof h !== 'object' || Array.isArray(h)) continue;
        const item = h as Record<string, unknown>;
        const t = item.type;
        if (t !== 'command' && t !== 'prompt') continue;
        const config: HarnessHookConfig = { type: t };
        if (typeof item.command === 'string') config.command = item.command;
        if (typeof item.prompt === 'string') config.prompt = item.prompt;
        if (typeof item.timeout === 'number' && Number.isFinite(item.timeout)) {
          config.timeout = item.timeout;
        }
        hooks.push(config);
      }
      const matcher = typeof group.matcher === 'string' ? group.matcher : undefined;
      groups.push({ matcher, hooks });
    }
    result[event] = groups;
  }
  return result;
}

async function readHarnessRefFile(ref: HarnessPathRef): Promise<ParsedFile> {
  try {
    const res = await harnessService.read(ref);
    const text = res.content ?? '';
    const trimmed = text.trim();
    if (!trimmed) {
      return { groups: emptyEventMap(), mtime: res.mtime, rawText: text, present: true };
    }
    const parsed = safeParseJsonc(trimmed);
    if (parsed === null) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, `failed to parse ${ref.relativePath}`);
    }
    const groups = extractGroups(parsed);
    return {
      groups: groups ?? emptyEventMap(),
      mtime: res.mtime,
      rawText: text,
      present: true,
    };
  } catch (err) {
    if (isFileNotFound(err)) {
      return { groups: emptyEventMap(), mtime: '', rawText: '', present: false };
    }
    throw err;
  }
}

async function readPluginHooksFile(absoluteFile: string): Promise<ParsedFile> {
  let stat;
  try {
    stat = await fs.stat(absoluteFile);
  } catch {
    return { groups: emptyEventMap(), mtime: '', rawText: '', present: false };
  }
  if (!stat.isFile()) {
    return { groups: emptyEventMap(), mtime: '', rawText: '', present: false };
  }
  let text: string;
  try {
    text = await fs.readFile(absoluteFile, 'utf-8');
  } catch {
    return { groups: emptyEventMap(), mtime: '', rawText: '', present: false };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      groups: emptyEventMap(),
      mtime: stat.mtime.toISOString(),
      rawText: text,
      present: true,
    };
  }
  const parsed = safeParseJsonc(trimmed);
  if (parsed === null) {
    return {
      groups: emptyEventMap(),
      mtime: stat.mtime.toISOString(),
      rawText: text,
      present: false,
    };
  }
  const groups = extractGroups(parsed);
  return {
    groups: groups ?? emptyEventMap(),
    mtime: stat.mtime.toISOString(),
    rawText: text,
    present: true,
  };
}

function buildSettingsRef(scope: 'project' | 'user', projectSlug?: string): HarnessPathRef {
  if (scope === 'user') {
    return { scope: 'user', relativePath: 'settings.json' };
  }
  if (!projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for project scope');
  }
  return { scope: 'project', projectSlug, relativePath: 'settings.json' };
}

function buildBackupRef(scope: 'project' | 'user', projectSlug?: string): HarnessPathRef {
  if (scope === 'user') {
    return { scope: 'user', relativePath: 'hooks.disabled.json' };
  }
  if (!projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for project scope');
  }
  return { scope: 'project', projectSlug, relativePath: 'hooks.disabled.json' };
}

async function getSettingsAbsolutePath(
  scope: 'project' | 'user',
  projectSlug?: string,
): Promise<string> {
  if (scope === 'user') {
    return path.join(getUserHarnessRoot(), 'settings.json');
  }
  if (!projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for project scope');
  }
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  return path.join(projectRoot, '.claude', 'settings.json');
}

async function getBackupAbsolutePath(
  scope: 'project' | 'user',
  projectSlug?: string,
): Promise<string> {
  if (scope === 'user') {
    return path.join(getUserHarnessRoot(), 'hooks.disabled.json');
  }
  if (!projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for project scope');
  }
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  return path.join(projectRoot, '.claude', 'hooks.disabled.json');
}

// ---------------------------------------------------------------------------
// JSONC patch helpers — every read-modify-write sequence flows through these
// so the round-trip preserves comments, key order, and trailing commas. The
// `applyHookPatches` helper bundles a sequence of structured ops into a single
// patchStructured call so empty-group cleanup happens atomically.
// ---------------------------------------------------------------------------

interface PatchTarget {
  ref: HarnessPathRef;
  /** ISO mtime for the STALE_WRITE guard. Empty string ⇒ create the file. */
  expectedMtime: string;
  /** Initial source text; pass current.rawText for an existing file or '' for a new one. */
  source: string;
}

interface PatchOpInput {
  /** AST path inside the hooks structure — caller does NOT prefix with `'hooks'`. */
  path: (string | number)[];
  /** undefined = delete. */
  value: unknown;
}

function buildHooksPatch(target: PatchTarget, ops: PatchOpInput[]): string {
  const sourceText = target.source.trim().length === 0 ? '{ "hooks": {} }' : target.source;
  // Ensure the `hooks` wrapper exists before applying nested patches; jsonc-parser's
  // `modify` does set intermediate objects, but explicitly seeding `hooks: {}` keeps
  // the diff deterministic when the file existed without a hooks field.
  const seeded = ensureHooksWrapper(sourceText);
  const patchOps = ops.map((op) => ({ path: ['hooks', ...op.path], value: op.value }));
  return applyJsoncPatch(seeded, patchOps);
}

function ensureHooksWrapper(source: string): string {
  const parsed = safeParseJsonc(source);
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.prototype.hasOwnProperty.call(parsed, 'hooks')
  ) {
    return source;
  }
  // Insert `hooks: {}` so subsequent ops see a settled wrapper.
  return applyJsoncPatch(source, [{ path: ['hooks'], value: {} }]);
}

async function writePatched(target: PatchTarget, patched: string): Promise<{ mtime: string }> {
  // Story 30.1 (AC4.b): block writes that would land plaintext secrets in
  // a git-tracked `settings.json`. The harness path-ref carries
  // `relativePath: 'settings.json'` (relative to `.claude/`); the share-scope
  // service expects the project-relative form, so we prefix.
  if (target.ref.scope === 'project' && target.ref.projectSlug) {
    const secrets = detectSecretsInTextCanonical(patched);
    await assertNoSecretOnShared({
      scope: 'project',
      projectSlug: target.ref.projectSlug,
      relativePath: `.claude/${target.ref.relativePath ?? 'settings.json'}`,
      secretDetected: secrets.matched,
      detectedAt: { lines: secrets.lines },
    });
  }

  // expectedMtime '' (file missing) → omit so harnessService.write does not refuse the create path.
  const expectedMtime = target.expectedMtime || undefined;
  const written = await harnessService.write(target.ref, {
    content: patched,
    expectedMtime,
  });
  return { mtime: written.mtime };
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class HarnessHookService {
  async listCards(currentProjectSlug?: string): Promise<HarnessHookListResponse> {
    const cardsByEvent: Record<HarnessHookEvent, HarnessHookCard[]> = emptyEventMap() as never;
    for (const e of HARNESS_HOOK_EVENTS) cardsByEvent[e] = [];
    const malformed: HarnessHookMalformedEntry[] = [];

    if (currentProjectSlug) {
      try {
        await this.enumerateProjectHooks(currentProjectSlug, cardsByEvent, malformed);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== HARNESS_ERRORS.HARNESS_ROOT_MISSING.code) {
          throw err;
        }
      }
    }

    await this.enumerateUserHooks(cardsByEvent, malformed);
    await this.enumeratePluginHooks(cardsByEvent, malformed);

    for (const e of HARNESS_HOOK_EVENTS) {
      cardsByEvent[e].sort((a, b) => {
        const sd = SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope];
        if (sd !== 0) return sd;
        if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;
        return a.hookIndex - b.hookIndex;
      });
    }

    const backupMtimeByScope = await this.collectBackupMtimes(currentProjectSlug);

    return {
      cardsByEvent,
      malformed,
      promptTypeSupport: PROMPT_TYPE_SUPPORT,
      backupMtimeByScope,
    };
  }

  async readHook(loc: HarnessHookSourceLocation): Promise<HarnessHookReadResponse> {
    const file = await readFileForLocation(loc);
    const groups = file.groups[loc.event];
    const group = groups?.[loc.groupIndex];
    if (!group) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code,
        `group not found at ${loc.event}[${loc.groupIndex}]`,
      );
    }
    const config = group.hooks[loc.hookIndex];
    if (!config) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code,
        `hook not found at ${loc.event}[${loc.groupIndex}].hooks[${loc.hookIndex}]`,
      );
    }
    const raw = JSON.stringify(
      group.matcher !== undefined ? { matcher: group.matcher, hooks: [config] } : { hooks: [config] },
      null,
      2,
    );
    return {
      source: loc,
      matcher: group.matcher,
      config,
      raw,
      mtime: file.mtime,
      disabledByBackup: loc.disabledByBackup,
    };
  }

  async createHook(req: HarnessHookCreateRequest): Promise<HarnessHookCreateResponse> {
    const ref = buildSettingsRef(req.scope, req.projectSlug);
    const file = await readHarnessRefFile(ref);
    const expectedMtime = req.expectedMtime ?? file.mtime;
    if (file.present && req.expectedMtime !== undefined && req.expectedMtime !== file.mtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: file.mtime,
        staleFile: 'main',
      });
    }
    validateConfigShape(req.config);
    const newGroup: MatcherGroup = req.matcher
      ? { matcher: req.matcher, hooks: [req.config] }
      : { hooks: [req.config] };
    const existing = file.groups[req.event] ?? [];
    const newGroupIndex = existing.length;
    const patched = buildHooksPatch(
      { ref, expectedMtime, source: file.rawText },
      [{ path: [req.event, newGroupIndex], value: newGroup }],
    );
    const result = await writePatched(
      { ref, expectedMtime: file.mtime, source: file.rawText },
      patched,
    );
    return { success: true, mtime: result.mtime, newGroupIndex, newHookIndex: 0 };
  }

  async updateHook(
    loc: HarnessHookSourceLocation,
    body: HarnessHookUpdateRequest,
  ): Promise<HarnessHookUpdateResponse> {
    if (loc.scope === 'plugin') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin-scope hooks are read-only');
    }
    const editableScope = loc.scope as 'project' | 'user';

    const provided = [body.config, body.matcher !== undefined ? 1 : undefined, body.raw, body.enabled].filter(
      (x) => x !== undefined,
    );
    if (provided.length !== 1) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'exactly one of config / matcher / raw / enabled is required',
      );
    }

    if (body.enabled !== undefined) {
      return this.toggleEnabled(loc, body.enabled, body.expectedMtime, body.expectedBackupMtime);
    }

    // matcher / config / raw paths all target the same main settings.json file.
    const ref = loc.disabledByBackup
      ? buildBackupRef(editableScope, loc.projectSlug)
      : buildSettingsRef(editableScope, loc.projectSlug);
    const file = await readHarnessRefFile(ref);
    if (body.expectedMtime !== undefined && body.expectedMtime !== file.mtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: file.mtime,
        staleFile: 'main',
      });
    }
    const groups = file.groups[loc.event] ?? [];
    const group = groups[loc.groupIndex];
    if (!group) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code,
        `group not found at ${loc.event}[${loc.groupIndex}]`,
      );
    }
    if (!group.hooks[loc.hookIndex]) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code,
        `hook not found at ${loc.event}[${loc.groupIndex}].hooks[${loc.hookIndex}]`,
      );
    }

    if (body.config !== undefined) {
      validateConfigShape(body.config);
      const patched = buildHooksPatch(
        { ref, expectedMtime: file.mtime, source: file.rawText },
        [{ path: [loc.event, loc.groupIndex, 'hooks', loc.hookIndex], value: body.config }],
      );
      const result = await writePatched(
        { ref, expectedMtime: file.mtime, source: file.rawText },
        patched,
      );
      return { success: true, mtime: result.mtime };
    }

    if (body.raw !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.raw);
      } catch (cause) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
          `raw payload is not valid JSON: ${(cause as Error).message}`,
        );
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'raw payload must be an object');
      }
      const obj = parsed as { matcher?: unknown; hooks?: unknown };
      if (!Array.isArray(obj.hooks) || obj.hooks.length !== 1) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
          'raw payload must contain a single-hook hooks array',
        );
      }
      const nextConfig = obj.hooks[0] as HarnessHookConfig;
      validateConfigShape(nextConfig);
      const ops: PatchOpInput[] = [
        { path: [loc.event, loc.groupIndex, 'hooks', loc.hookIndex], value: nextConfig },
      ];
      if (typeof obj.matcher === 'string') {
        ops.push({ path: [loc.event, loc.groupIndex, 'matcher'], value: obj.matcher });
      } else if (obj.matcher === undefined || obj.matcher === null) {
        ops.push({ path: [loc.event, loc.groupIndex, 'matcher'], value: undefined });
      }
      const patched = buildHooksPatch(
        { ref, expectedMtime: file.mtime, source: file.rawText },
        ops,
      );
      const result = await writePatched(
        { ref, expectedMtime: file.mtime, source: file.rawText },
        patched,
      );
      return { success: true, mtime: result.mtime };
    }

    // matcher path
    const newMatcher = body.matcher;
    const splitFromGroup = body.splitFromGroup === true;
    const groupHookCount = group.hooks.length;
    if (splitFromGroup && groupHookCount <= 1) {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'splitFromGroup is a no-op for single-hook groups', {
        cause: 'split-noop',
      });
    }

    if (splitFromGroup) {
      // Extract the hook into a new group, leaving siblings under the original matcher.
      const extracted = group.hooks[loc.hookIndex];
      const newGroupIndex = groups.length;
      const ops: PatchOpInput[] = [
        // Remove the extracted hook from its original group's hooks[].
        { path: [loc.event, loc.groupIndex, 'hooks', loc.hookIndex], value: undefined },
        // Append the extracted hook as a new single-hook group with the new matcher.
        {
          path: [loc.event, newGroupIndex],
          value:
            newMatcher !== null && newMatcher !== undefined && newMatcher !== ''
              ? { matcher: newMatcher, hooks: [extracted] }
              : { hooks: [extracted] },
        },
      ];
      const patched = buildHooksPatch(
        { ref, expectedMtime: file.mtime, source: file.rawText },
        ops,
      );
      const result = await writePatched(
        { ref, expectedMtime: file.mtime, source: file.rawText },
        patched,
      );
      return {
        success: true,
        mtime: result.mtime,
        newGroupIndex,
        newHookIndex: 0,
      };
    }

    // Default — update the parent group's matcher field; siblings inherit.
    const ops: PatchOpInput[] = [];
    if (newMatcher === null || newMatcher === '' || newMatcher === undefined) {
      ops.push({ path: [loc.event, loc.groupIndex, 'matcher'], value: undefined });
    } else {
      ops.push({ path: [loc.event, loc.groupIndex, 'matcher'], value: newMatcher });
    }
    const patched = buildHooksPatch(
      { ref, expectedMtime: file.mtime, source: file.rawText },
      ops,
    );
    const result = await writePatched(
      { ref, expectedMtime: file.mtime, source: file.rawText },
      patched,
    );
    const response: HarnessHookUpdateResponse = { success: true, mtime: result.mtime };
    if (groupHookCount >= 2) {
      response.affectedSiblings = groupHookCount - 1;
    }
    return response;
  }

  async copyHook(req: HarnessHookCopyRequest): Promise<HarnessHookCopyResponse> {
    const sourceLoc = await this.resolveCopySource(req);
    const sourceFile = await readFileForLocation(sourceLoc);
    const sourceGroup = sourceFile.groups[req.sourceEvent]?.[req.sourceGroupIndex];
    if (!sourceGroup) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code,
        `source group not found at ${req.sourceEvent}[${req.sourceGroupIndex}]`,
      );
    }
    const sourceConfig = sourceGroup.hooks[req.sourceHookIndex];
    if (!sourceConfig) {
      throwMapped(HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code, 'source hook not found');
    }

    if (req.acknowledgedWarning !== true) {
      const secrets = detectSecretsInHook(sourceConfig);
      throwMapped(
        HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        'client must show the type-warning modal and echo acknowledgedWarning',
        {
          cause: 'type-warning-not-acknowledged',
          details: {
            hookType: sourceConfig.type,
            ...(secrets.matched ? { secretPaths: secrets.paths } : {}),
          },
        },
      );
    }

    if (req.targetScope === 'plugin' as never) {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin destinations are forbidden');
    }
    const targetRef = buildSettingsRef(req.targetScope, req.targetProjectSlug);
    const targetFile = await readHarnessRefFile(targetRef);
    const targetGroups = targetFile.groups[req.sourceEvent] ?? [];

    const matcher = sourceGroup.matcher;
    // Conflict = matcher + body equality.
    const conflictIndex = targetGroups.findIndex((g) => {
      if ((g.matcher ?? '') !== (matcher ?? '')) return false;
      if (g.hooks.length !== 1) return false;
      return configsEqual(g.hooks[0], sourceConfig);
    });

    if (conflictIndex >= 0) {
      switch (req.onConflict) {
        case 'skip':
          return {
            success: true,
            newGroupIndex: conflictIndex,
            newHookIndex: 0,
            skipped: true,
          };
        case 'overwrite': {
          // Overwrite the existing matcher group's single hook in-place.
          const ops: PatchOpInput[] = [
            { path: [req.sourceEvent, conflictIndex, 'hooks', 0], value: sourceConfig },
          ];
          if (matcher !== undefined) {
            ops.push({ path: [req.sourceEvent, conflictIndex, 'matcher'], value: matcher });
          }
          const patched = buildHooksPatch(
            { ref: targetRef, expectedMtime: targetFile.mtime, source: targetFile.rawText },
            ops,
          );
          await writePatched(
            { ref: targetRef, expectedMtime: targetFile.mtime, source: targetFile.rawText },
            patched,
          );
          const warnings = collectCopyWarnings(req, sourceConfig);
          return {
            success: true,
            newGroupIndex: conflictIndex,
            newHookIndex: 0,
            skipped: false,
            ...(warnings.length > 0 ? { warnings } : {}),
          };
        }
        case 'duplicate':
          // Fall through to append a new group below.
          break;
      }
    }

    const newGroupIndex = targetGroups.length;
    const newGroup: MatcherGroup = matcher
      ? { matcher, hooks: [sourceConfig] }
      : { hooks: [sourceConfig] };
    const patched = buildHooksPatch(
      { ref: targetRef, expectedMtime: targetFile.mtime, source: targetFile.rawText },
      [{ path: [req.sourceEvent, newGroupIndex], value: newGroup }],
    );
    await writePatched(
      { ref: targetRef, expectedMtime: targetFile.mtime, source: targetFile.rawText },
      patched,
    );
    const warnings = collectCopyWarnings(req, sourceConfig);
    return {
      success: true,
      newGroupIndex,
      newHookIndex: 0,
      skipped: false,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async deleteHook(req: HarnessHookDeleteRequest): Promise<{ success: true }> {
    const ref = buildSettingsRef(req.scope, req.projectSlug);
    const file = await readHarnessRefFile(ref);
    if (req.expectedMtime !== undefined && req.expectedMtime !== file.mtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: file.mtime,
        staleFile: 'main',
      });
    }
    const groups = file.groups[req.event] ?? [];
    const group = groups[req.groupIndex];
    if (!group || !group.hooks[req.hookIndex]) {
      throwMapped(HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code, 'hook not found');
    }
    const ops: PatchOpInput[] = [
      { path: [req.event, req.groupIndex, 'hooks', req.hookIndex], value: undefined },
    ];
    // If this removal empties the group, drop the group too.
    if (group.hooks.length === 1) {
      ops.push({ path: [req.event, req.groupIndex], value: undefined });
    }
    const patched = buildHooksPatch(
      { ref, expectedMtime: file.mtime, source: file.rawText },
      ops,
    );
    await writePatched(
      { ref, expectedMtime: file.mtime, source: file.rawText },
      patched,
    );
    return { success: true };
  }

  // ---- enumeration -------------------------------------------------------

  private async enumerateProjectHooks(
    projectSlug: string,
    cards: Record<HarnessHookEvent, HarnessHookCard[]>,
    malformed: HarnessHookMalformedEntry[],
  ): Promise<void> {
    const settingsRef: HarnessPathRef = { scope: 'project', projectSlug, relativePath: 'settings.json' };
    const projectRoot = await projectService.resolveOriginalPath(projectSlug);
    const settingsAbs = path.join(projectRoot, '.claude', 'settings.json');
    await this.collectFromHarnessRef('project', settingsRef, settingsAbs, cards, malformed, false, projectSlug);

    const backupRef: HarnessPathRef = { scope: 'project', projectSlug, relativePath: 'hooks.disabled.json' };
    const backupAbs = path.join(projectRoot, '.claude', 'hooks.disabled.json');
    await this.collectFromHarnessRef('project', backupRef, backupAbs, cards, malformed, true, projectSlug);
  }

  private async enumerateUserHooks(
    cards: Record<HarnessHookEvent, HarnessHookCard[]>,
    malformed: HarnessHookMalformedEntry[],
  ): Promise<void> {
    const settingsRef: HarnessPathRef = { scope: 'user', relativePath: 'settings.json' };
    const settingsAbs = path.join(getUserHarnessRoot(), 'settings.json');
    await this.collectFromHarnessRef('user', settingsRef, settingsAbs, cards, malformed, false);

    const backupRef: HarnessPathRef = { scope: 'user', relativePath: 'hooks.disabled.json' };
    const backupAbs = path.join(getUserHarnessRoot(), 'hooks.disabled.json');
    await this.collectFromHarnessRef('user', backupRef, backupAbs, cards, malformed, true);
  }

  private async enumeratePluginHooks(
    cards: Record<HarnessHookEvent, HarnessHookCard[]>,
    malformed: HarnessHookMalformedEntry[],
  ): Promise<void> {
    let installed: InstalledPluginsFile = {};
    try {
      const res = await harnessService.read({
        scope: 'user',
        relativePath: 'plugins/installed_plugins.json',
      });
      const trimmed = (res.content ?? '').trim();
      if (trimmed) {
        try {
          installed = JSON.parse(trimmed) as InstalledPluginsFile;
        } catch {
          return;
        }
      }
    } catch (err) {
      if (isFileNotFound(err)) return;
      throw err;
    }

    const plugins = installed.plugins ?? {};
    for (const [pluginKey, value] of Object.entries(plugins)) {
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (!entry?.installPath || typeof entry.installPath !== 'string') continue;
        const installRoot = path.resolve(entry.installPath);
        const hooksFile = path.join(entry.installPath, 'hooks', 'hooks.json');
        const resolved = path.resolve(hooksFile);
        if (resolved !== installRoot && !resolved.startsWith(installRoot + path.sep)) continue;
        const file = await readPluginHooksFile(hooksFile);
        if (!file.present && file.mtime === '') {
          continue;
        }
        if (!file.present && file.rawText.length > 0) {
          malformed.push({
            scope: 'plugin',
            absoluteFile: hooksFile,
            pluginKey,
            reason: 'failed to parse JSON',
          });
          continue;
        }
        for (const event of HARNESS_HOOK_EVENTS) {
          const groups = file.groups[event];
          for (let gi = 0; gi < groups.length; gi += 1) {
            const group = groups[gi];
            for (let hi = 0; hi < group.hooks.length; hi += 1) {
              cards[event].push({
                scope: 'plugin',
                absoluteFile: hooksFile,
                pluginKey,
                event,
                groupIndex: gi,
                hookIndex: hi,
                disabledByBackup: false,
                matcher: group.matcher,
                config: group.hooks[hi],
                mtime: file.mtime,
                enabled: true,
              });
            }
          }
        }
      }
    }
  }

  private async collectFromHarnessRef(
    scope: 'project' | 'user',
    ref: HarnessPathRef,
    absoluteFile: string,
    cards: Record<HarnessHookEvent, HarnessHookCard[]>,
    malformed: HarnessHookMalformedEntry[],
    disabledByBackup: boolean,
    projectSlug?: string,
  ): Promise<void> {
    let file: ParsedFile;
    try {
      file = await readHarnessRefFile(ref);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_PARSE_ERROR.code) {
        malformed.push({
          scope,
          absoluteFile,
          projectSlug,
          reason: 'failed to parse JSON',
        });
        return;
      }
      throw err;
    }
    if (!file.present) return;
    for (const event of HARNESS_HOOK_EVENTS) {
      const groups = file.groups[event];
      for (let gi = 0; gi < groups.length; gi += 1) {
        const group = groups[gi];
        for (let hi = 0; hi < group.hooks.length; hi += 1) {
          cards[event].push({
            scope,
            absoluteFile,
            projectSlug,
            event,
            groupIndex: gi,
            hookIndex: hi,
            disabledByBackup,
            matcher: group.matcher,
            config: group.hooks[hi],
            mtime: file.mtime,
            enabled: !disabledByBackup,
          });
        }
      }
    }
  }

  private async collectBackupMtimes(
    currentProjectSlug?: string,
  ): Promise<{ project?: string; user?: string }> {
    const out: { project?: string; user?: string } = {};
    try {
      const userBackup = path.join(getUserHarnessRoot(), 'hooks.disabled.json');
      const stat = await fs.stat(userBackup);
      if (stat.isFile()) out.user = stat.mtime.toISOString();
    } catch {
      // file absent — leave out.user undefined
    }
    if (currentProjectSlug) {
      try {
        const projectRoot = await projectService.resolveOriginalPath(currentProjectSlug);
        const projBackup = path.join(projectRoot, '.claude', 'hooks.disabled.json');
        const stat = await fs.stat(projBackup);
        if (stat.isFile()) out.project = stat.mtime.toISOString();
      } catch {
        // file absent — leave out.project undefined
      }
    }
    return out;
  }

  private async resolveCopySource(req: HarnessHookCopyRequest): Promise<HarnessHookSourceLocation> {
    if (req.sourceScope === 'plugin') {
      if (!req.sourcePluginKey) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
          'sourcePluginKey required for scope=plugin',
        );
      }
      const installPath = await readPluginInstallPath(req.sourcePluginKey);
      if (!installPath) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code,
          `plugin not installed: ${req.sourcePluginKey}`,
        );
      }
      const hooksFile = path.join(installPath, 'hooks', 'hooks.json');
      const installRoot = path.resolve(installPath);
      const abs = path.resolve(hooksFile);
      if (abs !== installRoot && !abs.startsWith(installRoot + path.sep)) {
        throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'plugin file escapes installPath');
      }
      return {
        scope: 'plugin',
        absoluteFile: hooksFile,
        pluginKey: req.sourcePluginKey,
        event: req.sourceEvent,
        groupIndex: req.sourceGroupIndex,
        hookIndex: req.sourceHookIndex,
        disabledByBackup: false,
      };
    }
    if (req.sourceScope === 'project') {
      if (!req.sourceProjectSlug) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
          'sourceProjectSlug required for scope=project',
        );
      }
      const projectRoot = await projectService.resolveOriginalPath(req.sourceProjectSlug);
      return {
        scope: 'project',
        absoluteFile: path.join(projectRoot, '.claude', 'settings.json'),
        projectSlug: req.sourceProjectSlug,
        event: req.sourceEvent,
        groupIndex: req.sourceGroupIndex,
        hookIndex: req.sourceHookIndex,
        disabledByBackup: false,
      };
    }
    return {
      scope: 'user',
      absoluteFile: path.join(getUserHarnessRoot(), 'settings.json'),
      event: req.sourceEvent,
      groupIndex: req.sourceGroupIndex,
      hookIndex: req.sourceHookIndex,
      disabledByBackup: false,
    };
  }

  // ---- enabled toggle (AC5) ---------------------------------------------

  private async toggleEnabled(
    loc: HarnessHookSourceLocation,
    enabled: boolean,
    expectedMainMtime?: string,
    expectedBackupMtime?: string,
  ): Promise<HarnessHookUpdateResponse> {
    const editableScope = loc.scope as 'project' | 'user';
    const mainRef = buildSettingsRef(editableScope, loc.projectSlug);
    const backupRef = buildBackupRef(editableScope, loc.projectSlug);

    if (enabled) {
      // backup → main: source lives in the backup file currently.
      if (!loc.disabledByBackup) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
          'enable can only run against a backup-resident hook',
        );
      }
      const backupFile = await readHarnessRefFile(backupRef);
      if (expectedBackupMtime !== undefined && expectedBackupMtime !== backupFile.mtime) {
        throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'backup changed on disk', {
          currentMtime: backupFile.mtime,
          staleFile: 'backup',
        });
      }
      const backupGroup = backupFile.groups[loc.event]?.[loc.groupIndex];
      const cfg = backupGroup?.hooks[loc.hookIndex];
      if (!cfg) {
        throwMapped(HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code, 'hook not in backup');
      }
      const matcher = backupGroup.matcher;

      const mainFile = await readHarnessRefFile(mainRef);
      if (expectedMainMtime !== undefined && expectedMainMtime !== mainFile.mtime) {
        throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'main changed on disk', {
          currentMtime: mainFile.mtime,
          staleFile: 'main',
        });
      }
      const mainGroups = mainFile.groups[loc.event] ?? [];
      const newGroup: MatcherGroup = matcher
        ? { matcher, hooks: [cfg] }
        : { hooks: [cfg] };
      const newMainIndex = mainGroups.length;
      const mainPatched = buildHooksPatch(
        { ref: mainRef, expectedMtime: mainFile.mtime, source: mainFile.rawText },
        [{ path: [loc.event, newMainIndex], value: newGroup }],
      );
      const mainWrite = await writePatched(
        { ref: mainRef, expectedMtime: mainFile.mtime, source: mainFile.rawText },
        mainPatched,
      );

      // Now drop the group from the backup. If a sibling lives there, only
      // remove the single hook entry; otherwise drop the group entirely.
      const backupOps: PatchOpInput[] = [
        { path: [loc.event, loc.groupIndex, 'hooks', loc.hookIndex], value: undefined },
      ];
      if (backupGroup.hooks.length === 1) {
        backupOps.push({ path: [loc.event, loc.groupIndex], value: undefined });
      }
      try {
        const backupPatched = buildHooksPatch(
          { ref: backupRef, expectedMtime: backupFile.mtime, source: backupFile.rawText },
          backupOps,
        );
        const backupWrite = await writePatched(
          { ref: backupRef, expectedMtime: backupFile.mtime, source: backupFile.rawText },
          backupPatched,
        );
        return {
          success: true,
          mtime: mainWrite.mtime,
          backupMtime: backupWrite.mtime,
        };
      } catch (err) {
        // Rollback: drop the group we just appended to main.
        await writePatched(
          { ref: mainRef, expectedMtime: mainWrite.mtime, source: '' },
          buildHooksPatch(
            { ref: mainRef, expectedMtime: mainWrite.mtime, source: mainPatched },
            [{ path: [loc.event, newMainIndex], value: undefined }],
          ),
        ).catch((rollbackErr) => {
          log.warn(
            `enable rollback failed for ${loc.event}[${loc.groupIndex}]: ${(rollbackErr as Error).message}`,
          );
        });
        if (isStaleWrite(err)) {
          throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'backup changed on disk', {
            currentMtime: (err as { currentMtime?: string }).currentMtime ?? '',
            staleFile: 'backup',
          });
        }
        throw err;
      }
    }

    // enabled === false → main → backup move
    if (loc.disabledByBackup) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        'disable can only run against a main-resident hook',
      );
    }
    const mainFile = await readHarnessRefFile(mainRef);
    if (expectedMainMtime !== undefined && expectedMainMtime !== mainFile.mtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'main changed on disk', {
        currentMtime: mainFile.mtime,
        staleFile: 'main',
      });
    }
    const mainGroup = mainFile.groups[loc.event]?.[loc.groupIndex];
    const cfg = mainGroup?.hooks[loc.hookIndex];
    if (!cfg) {
      throwMapped(HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code, 'hook not in main');
    }
    const matcher = mainGroup.matcher;

    const backupFile = await readHarnessRefFile(backupRef);
    if (
      backupFile.present &&
      expectedBackupMtime !== undefined &&
      expectedBackupMtime !== backupFile.mtime
    ) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'backup changed on disk', {
        currentMtime: backupFile.mtime,
        staleFile: 'backup',
      });
    }

    const backupGroups = backupFile.groups[loc.event] ?? [];
    const newBackupIndex = backupGroups.length;
    const newBackupGroup: MatcherGroup = matcher
      ? { matcher, hooks: [cfg] }
      : { hooks: [cfg] };
    const backupPatched = buildHooksPatch(
      { ref: backupRef, expectedMtime: backupFile.mtime, source: backupFile.rawText },
      [{ path: [loc.event, newBackupIndex], value: newBackupGroup }],
    );
    const backupWrite = await writePatched(
      { ref: backupRef, expectedMtime: backupFile.mtime, source: backupFile.rawText },
      backupPatched,
    );

    const mainOps: PatchOpInput[] = [
      { path: [loc.event, loc.groupIndex, 'hooks', loc.hookIndex], value: undefined },
    ];
    if (mainGroup.hooks.length === 1) {
      mainOps.push({ path: [loc.event, loc.groupIndex], value: undefined });
    }
    try {
      const mainPatched = buildHooksPatch(
        { ref: mainRef, expectedMtime: mainFile.mtime, source: mainFile.rawText },
        mainOps,
      );
      const mainWrite = await writePatched(
        { ref: mainRef, expectedMtime: mainFile.mtime, source: mainFile.rawText },
        mainPatched,
      );
      return {
        success: true,
        mtime: mainWrite.mtime,
        backupMtime: backupWrite.mtime,
      };
    } catch (err) {
      // Rollback: drop the group we just appended to backup.
      const rollbackPatched = buildHooksPatch(
        { ref: backupRef, expectedMtime: backupWrite.mtime, source: backupPatched },
        [{ path: [loc.event, newBackupIndex], value: undefined }],
      );
      await writePatched(
        { ref: backupRef, expectedMtime: backupWrite.mtime, source: backupPatched },
        rollbackPatched,
      ).catch((rollbackErr) => {
        log.warn(
          `disable rollback failed for ${loc.event}[${loc.groupIndex}]: ${(rollbackErr as Error).message}`,
        );
      });
      if (isStaleWrite(err)) {
        throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'main changed on disk', {
          currentMtime: (err as { currentMtime?: string }).currentMtime ?? '',
          staleFile: 'main',
        });
      }
      throw err;
    }
  }
}

// ---- shared helpers --------------------------------------------------------

async function readFileForLocation(loc: HarnessHookSourceLocation): Promise<ParsedFile> {
  if (loc.scope === 'plugin') {
    return readPluginHooksFile(loc.absoluteFile);
  }
  const ref = loc.disabledByBackup
    ? buildBackupRef(loc.scope as 'project' | 'user', loc.projectSlug)
    : buildSettingsRef(loc.scope as 'project' | 'user', loc.projectSlug);
  return readHarnessRefFile(ref);
}

async function readPluginInstallPath(pluginKey: string): Promise<string | undefined> {
  try {
    const res = await harnessService.read({
      scope: 'user',
      relativePath: 'plugins/installed_plugins.json',
    });
    const trimmed = (res.content ?? '').trim();
    if (!trimmed) return undefined;
    const parsed = JSON.parse(trimmed) as InstalledPluginsFile;
    const raw = parsed.plugins?.[pluginKey];
    if (!raw) return undefined;
    const entries = Array.isArray(raw) ? raw : [raw];
    const first = entries.find((e) => typeof e?.installPath === 'string');
    return first?.installPath;
  } catch (err) {
    if (isFileNotFound(err)) return undefined;
    throw err;
  }
}

function configsEqual(a: HarnessHookConfig, b: HarnessHookConfig): boolean {
  return (
    a.type === b.type &&
    (a.command ?? '') === (b.command ?? '') &&
    (a.prompt ?? '') === (b.prompt ?? '') &&
    (a.timeout ?? null) === (b.timeout ?? null)
  );
}

function collectCopyWarnings(
  req: HarnessHookCopyRequest,
  config: HarnessHookConfig,
): Array<'plugin-root-reference'> {
  const warnings: Array<'plugin-root-reference'> = [];
  if (req.sourceScope === 'plugin' && containsPluginRootToken(config)) {
    warnings.push('plugin-root-reference');
  }
  return warnings;
}

function validateConfigShape(config: HarnessHookConfig): void {
  if (config.type !== 'command' && config.type !== 'prompt') {
    throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, `unknown hook type: ${String(config.type)}`);
  }
  if (config.type === 'command') {
    if (!config.command || typeof config.command !== 'string') {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'command is required for type=command');
    }
    if (config.prompt) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'prompt forbidden for type=command');
    }
  } else {
    if (!config.prompt || typeof config.prompt !== 'string') {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'prompt is required for type=prompt');
    }
    if (config.command) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'command forbidden for type=prompt');
    }
  }
}

export async function resolveSourceLocation(input: {
  scope: HarnessHookSourceScope;
  event: HarnessHookEvent;
  groupIndex: number;
  hookIndex: number;
  projectSlug?: string;
  pluginKey?: string;
  disabledByBackup?: boolean;
}): Promise<HarnessHookSourceLocation> {
  const { scope, event, groupIndex, hookIndex } = input;
  if (!HARNESS_HOOK_EVENTS.includes(event)) {
    throwMapped(HARNESS_ERRORS.HARNESS_HOOK_INVALID_EVENT.code, `unknown event: ${event}`);
  }
  if (scope === 'project') {
    if (!input.projectSlug) {
      throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for scope=project');
    }
    const projectRoot = await projectService.resolveOriginalPath(input.projectSlug);
    const filePath = input.disabledByBackup
      ? path.join(projectRoot, '.claude', 'hooks.disabled.json')
      : path.join(projectRoot, '.claude', 'settings.json');
    return {
      scope: 'project',
      absoluteFile: filePath,
      projectSlug: input.projectSlug,
      event,
      groupIndex,
      hookIndex,
      disabledByBackup: input.disabledByBackup === true,
    };
  }
  if (scope === 'user') {
    const filePath = input.disabledByBackup
      ? path.join(getUserHarnessRoot(), 'hooks.disabled.json')
      : path.join(getUserHarnessRoot(), 'settings.json');
    return {
      scope: 'user',
      absoluteFile: filePath,
      event,
      groupIndex,
      hookIndex,
      disabledByBackup: input.disabledByBackup === true,
    };
  }
  if (!input.pluginKey) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'pluginKey required for scope=plugin');
  }
  const installPath = await readPluginInstallPath(input.pluginKey);
  if (!installPath) {
    throwMapped(
      HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code,
      `plugin not installed: ${input.pluginKey}`,
    );
  }
  const hooksFile = path.join(installPath, 'hooks', 'hooks.json');
  const installRoot = path.resolve(installPath);
  const abs = path.resolve(hooksFile);
  if (abs !== installRoot && !abs.startsWith(installRoot + path.sep)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'plugin file escapes installPath');
  }
  return {
    scope: 'plugin',
    absoluteFile: hooksFile,
    pluginKey: input.pluginKey,
    event,
    groupIndex,
    hookIndex,
    disabledByBackup: false,
  };
}

export const harnessHookService = new HarnessHookService();
export const SPIKE_RESULTS = {
  promptTypeSupport: PROMPT_TYPE_SUPPORT,
};
