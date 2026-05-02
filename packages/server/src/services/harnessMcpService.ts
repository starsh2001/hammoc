/**
 * Story 28.3: Harness MCP service.
 *
 * Combines three sources of MCP server definitions — the active project's
 * `<projectRoot>/.mcp.json`, the global `~/.claude/.mcp.json` (or
 * `~/.claude/settings.json.mcpServers` if Spike B confirms the alternative),
 * and every installed plugin bundle (`<installPath>/.mcp.json` + the
 * `mcpServers` field of `<installPath>/.claude-plugin/plugin.json`) — into a
 * single card list used by the "Harness Workbench → MCP" panel.
 *
 * Spike A / B routing:
 *   - `DISABLE_STRATEGY` is wired into every read/list/update path; the
 *     post-impl default is `'backup'` (entry moves into mcp.disabled.json).
 *     If Spike A later confirms that Claude Code honors a per-server `enabled`
 *     flag on disk, switching the constant to `'flag'` and updating the
 *     `disable()` branch of `toggleEnabled()` is the only required change.
 *   - `getUserMcpFilePath()` returns `~/.claude/.mcp.json` by default. If
 *     Spike B confirms candidate 2 (settings.json.mcpServers), update this
 *     helper to return the settings.json path and bump the response
 *     `userFileKind` to `'settings.json'` — every other call site already
 *     consumes that field.
 *
 * Containment guards differ by scope:
 *   - `<projectRoot>/.mcp.json` is the SIBLING of `.claude/`, so the standard
 *     `harnessService` helpers (which clamp to `.claude/`) cannot reach it.
 *     Project-scope reads / writes go through dedicated `MainFileAccessor`
 *     helpers that fs-stat the file directly with a strict containment guard.
 *   - plugin reads use `path.resolve()` containment under each plugin's
 *     `installPath`, mirroring `harnessSkillService.enumeratePluginSkills`.
 *   - global `~/.claude/.mcp.json` (or `~/.claude/settings.json`) and the two
 *     `mcp.disabled.json` backup files all live inside one of the two
 *     `harnessService` scopes, so the round-trip there reuses the existing
 *     clamp.
 */

import path from 'path';
import fs from 'fs/promises';
import {
  HARNESS_ERRORS,
  type HarnessInstalledPluginEntry,
  type HarnessMcpCard,
  type HarnessMcpCopyRequest,
  type HarnessMcpCopyResponse,
  type HarnessMcpDeleteRequest,
  type HarnessMcpListResponse,
  type HarnessMcpMalformedEntry,
  type HarnessMcpReadResponse,
  type HarnessMcpServerConfig,
  type HarnessMcpServerType,
  type HarnessMcpSource,
  type HarnessMcpSourceFileKind,
  type HarnessMcpSourceLocation,
  type HarnessMcpSourceScope,
  type HarnessMcpUpdateRequest,
  type HarnessMcpUpdateResponse,
  type HarnessPathRef,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { fileWatcherService } from './fileWatcherService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';
import { applyJsoncPatch } from '../utils/structuredEditor.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('harnessMcpService');

/** Spike A outcome — adjust to `'flag'` once Claude Code CLI honors disk `enabled` keys. */
const DISABLE_STRATEGY: 'flag' | 'backup' = 'backup';

/** Spike B outcome — adjust to `'settings.json'` when the global file lives there instead. */
const USER_FILE_KIND: 'mcp.json' | 'settings.json' | null = 'mcp.json';

/** Priority used to pick a card's `activeScope` when multiple sources exist. */
const SCOPE_PRIORITY: Record<HarnessMcpSourceScope, number> = {
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

/**
 * Heuristic-based secret detector. Walks every string leaf of an arbitrary
 * value and returns matched dot-paths so the modal can list them. Environment
 * variable references (`${...}`) are excluded — they are not literal secrets.
 */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'bearer', re: /^Bearer\s+[A-Za-z0-9._-]{16,}$/ },
  { name: 'sk', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'aws', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'slack', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'base64', re: /^[A-Za-z0-9+/=]{40,}$/ },
];

const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

export interface DetectSecretsResult {
  matched: boolean;
  paths: string[];
}

export function detectSecretsInConfig(value: unknown, basePath: string[] = []): DetectSecretsResult {
  const paths: string[] = [];
  const walk = (v: unknown, p: string[]): void => {
    if (typeof v === 'string') {
      if (ENV_REF_RE.test(v)) return;
      for (const { re } of SECRET_PATTERNS) {
        if (re.test(v)) {
          paths.push(p.join('.'));
          return;
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, [...p, String(i)]));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        walk(child, [...p, k]);
      }
    }
  };
  walk(value, basePath);
  return { matched: paths.length > 0, paths };
}

const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';

function containsPluginRootToken(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(PLUGIN_ROOT_TOKEN);
  if (Array.isArray(value)) return value.some((v) => containsPluginRootToken(v));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) => containsPluginRootToken(v));
  }
  return false;
}

/** Default-resolve `type` for a config that omitted the key (per official MCP schema). */
function resolveType(config: HarnessMcpServerConfig): HarnessMcpServerType {
  return config.type ?? 'stdio';
}

// ---------------------------------------------------------------------------
// MainFileAccessor — abstracts read / patch over the four "main" file paths:
//   - <projectRoot>/.mcp.json
//   - <projectRoot>/.claude/mcp.disabled.json (backup, project)
//   - ~/.claude/.mcp.json (or ~/.claude/settings.json depending on Spike B)
//   - ~/.claude/mcp.disabled.json (backup, global)
// Each accessor exposes the same surface — readMap / patch — so the toggle /
// update / copy / delete code paths do not have to branch on scope.
// ---------------------------------------------------------------------------

interface MainFile {
  /** Returns parsed `mcpServers` map + mtime. Empty file → empty map. */
  read(): Promise<{ servers: Record<string, HarnessMcpServerConfig>; mtime: string; rawText: string }>;
  /** Replace `mcpServers.<name>` with `value` (or delete when undefined). */
  patch(name: string, value: HarnessMcpServerConfig | undefined, expectedMtime?: string): Promise<{ mtime: string }>;
  /** Absolute path on disk — used to surface the file to the UI. */
  absolutePath: string;
}

async function getProjectMcpFilePath(projectSlug: string): Promise<string> {
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  return path.join(projectRoot, '.mcp.json');
}

function getUserMcpFilePath(): string | null {
  if (USER_FILE_KIND === null) return null;
  return path.join(getUserHarnessRoot(), USER_FILE_KIND === 'mcp.json' ? '.mcp.json' : 'settings.json');
}

function buildHarnessRefAccessor(ref: HarnessPathRef, absolutePath: string): MainFile {
  const read = async (): Promise<{ servers: Record<string, HarnessMcpServerConfig>; mtime: string; rawText: string }> => {
    try {
      const res = await harnessService.read(ref);
      const text = res.content ?? '';
      const trimmed = text.trim();
      if (!trimmed) return { servers: {}, mtime: res.mtime, rawText: text };
      const parsed = safeParseJsonc(trimmed);
      if (parsed === null) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, `failed to parse ${ref.relativePath}`);
      }
      const servers = extractServers(parsed, /*wrapped*/ true);
      return { servers: servers ?? {}, mtime: res.mtime, rawText: text };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code) {
        return { servers: {}, mtime: '', rawText: '' };
      }
      throw err;
    }
  };
  return {
    absolutePath,
    read,
    async patch(name, value, expectedMtime) {
      const current = await read();
      // Refuse stale writes upfront so we get the conventional 409 envelope
      // even when the file is being created (current.mtime === '').
      if (expectedMtime !== undefined && expectedMtime !== current.mtime) {
        throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
          currentMtime: current.mtime,
        });
      }
      const sourceText = current.rawText.length === 0 ? '{}' : current.rawText;
      const patched = applyJsoncPatch(sourceText, [{ path: ['mcpServers', name], value }]);
      const written = await harnessService.write(ref, {
        content: patched,
        // Skip the mtime guard inside `harnessService.write` — we already
        // performed it above against the parsed read, and re-passing
        // expectedMtime would force the missing-file path to throw.
      });
      return { mtime: written.mtime };
    },
  };
}

async function buildProjectMcpAccessor(projectSlug: string): Promise<MainFile> {
  const filePath = await getProjectMcpFilePath(projectSlug);
  // Containment guard — strict equality on the resolved sibling so future
  // refactors cannot accidentally widen the surface.
  const projectRoot = path.dirname(filePath);
  if (path.basename(filePath) !== '.mcp.json' || path.dirname(filePath) !== projectRoot) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'project mcp path escapes containment');
  }
  const read = async (): Promise<{ servers: Record<string, HarnessMcpServerConfig>; mtime: string; rawText: string }> => {
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { servers: {}, mtime: '', rawText: '' };
      }
      throw err;
    }
    if (!stat.isFile()) {
      throwMapped(HARNESS_ERRORS.HARNESS_NOT_A_FILE.code, '.mcp.json is not a regular file');
    }
    const text = await fs.readFile(filePath, 'utf-8');
    const trimmed = text.trim();
    if (!trimmed) return { servers: {}, mtime: stat.mtime.toISOString(), rawText: text };
    const parsed = safeParseJsonc(trimmed);
    if (parsed === null) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'failed to parse .mcp.json');
    }
    const servers = extractServers(parsed, /*wrapped*/ true);
    return { servers: servers ?? {}, mtime: stat.mtime.toISOString(), rawText: text };
  };
  return {
    absolutePath: filePath,
    read,
    async patch(name, value, expectedMtime) {
      const current = await read();
      if (expectedMtime !== undefined && expectedMtime !== current.mtime) {
        throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
          currentMtime: current.mtime,
        });
      }
      const sourceText = current.rawText.length === 0 ? '{}' : current.rawText;
      const patched = applyJsoncPatch(sourceText, [{ path: ['mcpServers', name], value }]);
      try {
        await fs.writeFile(filePath, patched, 'utf-8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EACCES') {
          throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
        }
        throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to write .mcp.json');
      }
      fileWatcherService.noteLocalWrite(filePath);
      const stat = await fs.stat(filePath);
      return { mtime: stat.mtime.toISOString() };
    },
  };
}

async function getMainAccessor(
  scope: 'project' | 'user',
  projectSlug?: string,
): Promise<MainFile> {
  if (scope === 'user') {
    const filePath = getUserMcpFilePath();
    if (!filePath) {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'global MCP file is not configured');
    }
    const ref: HarnessPathRef = {
      scope: 'user',
      relativePath: USER_FILE_KIND === 'mcp.json' ? '.mcp.json' : 'settings.json',
    };
    return buildHarnessRefAccessor(ref, filePath);
  }
  if (!projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for project scope');
  }
  return buildProjectMcpAccessor(projectSlug);
}

async function getBackupAccessor(
  scope: 'project' | 'user',
  projectSlug?: string,
): Promise<MainFile> {
  if (scope === 'user') {
    const filePath = path.join(getUserHarnessRoot(), 'mcp.disabled.json');
    return buildHarnessRefAccessor(
      { scope: 'user', relativePath: 'mcp.disabled.json' },
      filePath,
    );
  }
  if (!projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for project scope');
  }
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  const filePath = path.join(projectRoot, '.claude', 'mcp.disabled.json');
  return buildHarnessRefAccessor(
    { scope: 'project', projectSlug, relativePath: 'mcp.disabled.json' },
    filePath,
  );
}

class HarnessMcpService {
  // ---- public surface ----------------------------------------------------

  async listCards(currentProjectSlug?: string): Promise<HarnessMcpListResponse> {
    const sources = new Map<string, HarnessMcpSource[]>();
    const malformed: HarnessMcpMalformedEntry[] = [];

    if (currentProjectSlug) {
      try {
        await this.enumerateProjectMcps(currentProjectSlug, sources, malformed);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== HARNESS_ERRORS.HARNESS_ROOT_MISSING.code) {
          throw err;
        }
      }
    }

    await this.enumerateUserMcps(sources, malformed);
    await this.enumeratePluginMcps(sources, malformed);

    const cards: HarnessMcpCard[] = [];
    for (const [name, entries] of sources) {
      entries.sort((a, b) => SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope]);
      // Active source = first non-backup; if every source is backup-only, fall
      // back to the first entry so the card still renders (disabled).
      const active = entries.find((e) => !e.disabledByBackup) ?? entries[0];
      const enabled = computeEnabled(active);
      cards.push({
        name,
        activeType: resolveType(active.config),
        enabled,
        sources: entries,
        activeScope: active.scope,
      });
    }
    cards.sort((a, b) => a.name.localeCompare(b.name));

    return {
      cards,
      malformed,
      userFileKind: USER_FILE_KIND,
      disableStrategy: DISABLE_STRATEGY,
    };
  }

  async readServer(
    source: HarnessMcpSourceLocation,
    name: string,
  ): Promise<HarnessMcpReadResponse> {
    const { config, raw, mtime } = await readServerEntry(source, name);
    return {
      source,
      config,
      raw,
      mtime,
      disabledByBackup: source.absoluteFile.endsWith('mcp.disabled.json'),
    };
  }

  async updateServer(
    source: HarnessMcpSourceLocation,
    name: string,
    body: HarnessMcpUpdateRequest,
  ): Promise<HarnessMcpUpdateResponse> {
    if (source.scope === 'plugin') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin-scope MCP servers are read-only');
    }
    if (source.scope !== 'project' && source.scope !== 'user') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'unsupported source scope for update');
    }

    if (body.enabled !== undefined) {
      return this.toggleEnabled(source, name, body.enabled, body.expectedMtime);
    }

    let nextValue: HarnessMcpServerConfig;
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
      nextValue = parsed as HarnessMcpServerConfig;
    } else if (body.config !== undefined) {
      validateConfigShape(body.config);
      nextValue = body.config;
    } else {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'one of config / raw / enabled is required',
      );
    }

    const accessor = await getMainAccessor(source.scope, source.projectSlug);
    const result = await accessor.patch(name, nextValue, body.expectedMtime);
    return { success: true, mtime: result.mtime };
  }

  async copyServer(req: HarnessMcpCopyRequest): Promise<HarnessMcpCopyResponse> {
    if (
      req.sourceScope === req.targetScope
      && req.sourceName === req.targetName
      && req.sourceProjectSlug === req.targetProjectSlug
    ) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_MCP_NAME_CONFLICT.code,
        'same-scope copy must use a different targetName',
      );
    }

    const sourceLocation = await resolveSourceLocation({
      scope: req.sourceScope,
      name: req.sourceName,
      projectSlug: req.sourceProjectSlug,
      pluginKey: req.sourcePluginKey,
      fileKind: req.sourceFileKind,
    });

    let sourceConfig: HarnessMcpServerConfig;
    {
      const entry = await readServerEntry(sourceLocation, req.sourceName);
      sourceConfig = entry.config;
    }

    const secrets = detectSecretsInConfig(sourceConfig);
    if (secrets.matched && req.acknowledgedSecret !== true) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        'secrets detected — client must show the secret-confirmation modal',
        { cause: 'secret-not-acknowledged', details: { paths: secrets.paths } },
      );
    }

    const accessor = await getMainAccessor(req.targetScope, req.targetProjectSlug);
    const existing = await accessor.read();
    const conflicts = Object.prototype.hasOwnProperty.call(existing.servers, req.targetName);

    if (conflicts) {
      switch (req.onConflict) {
        case 'skip':
          return { success: true, finalName: req.targetName, skipped: true };
        case 'overwrite':
          break;
        case 'rename':
          throwMapped(
            HARNESS_ERRORS.HARNESS_MCP_NAME_CONFLICT.code,
            `target name already in use: ${req.targetName}`,
          );
      }
    }

    await accessor.patch(req.targetName, sourceConfig, existing.mtime || undefined);

    const warnings: string[] = [];
    if (req.sourceScope === 'plugin' && containsPluginRootToken(sourceConfig)) {
      warnings.push('plugin-root-reference');
    }

    return {
      success: true,
      finalName: req.targetName,
      skipped: false,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async deleteServer(
    source: HarnessMcpSourceLocation,
    name: string,
    body: HarnessMcpDeleteRequest,
  ): Promise<{ success: true }> {
    if (source.scope === 'plugin') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin-scope MCP servers are read-only');
    }
    const accessor = await getMainAccessor(source.scope as 'project' | 'user', source.projectSlug);
    await accessor.patch(name, undefined, body.expectedMtime);
    return { success: true };
  }

  // ---- enumeration -------------------------------------------------------

  private async enumerateProjectMcps(
    projectSlug: string,
    sources: Map<string, HarnessMcpSource[]>,
    malformed: HarnessMcpMalformedEntry[],
  ): Promise<void> {
    const filePath = await getProjectMcpFilePath(projectSlug);
    await readMcpFile({
      absoluteFile: filePath,
      scope: 'project',
      projectSlug,
      sourceFileKind: 'mcp.json',
      wrapped: true,
      sources,
      malformed,
    });

    if (DISABLE_STRATEGY === 'backup') {
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await readMcpFile({
        absoluteFile: path.join(projectRoot, '.claude', 'mcp.disabled.json'),
        scope: 'project',
        projectSlug,
        sourceFileKind: 'mcp.json',
        wrapped: true,
        disabledByBackup: true,
        sources,
        malformed,
      });
    }
  }

  private async enumerateUserMcps(
    sources: Map<string, HarnessMcpSource[]>,
    malformed: HarnessMcpMalformedEntry[],
  ): Promise<void> {
    const filePath = getUserMcpFilePath();
    if (!filePath) return;
    await readMcpFile({
      absoluteFile: filePath,
      scope: 'user',
      sourceFileKind: USER_FILE_KIND ?? 'mcp.json',
      wrapped: true,
      sources,
      malformed,
    });

    if (DISABLE_STRATEGY === 'backup') {
      await readMcpFile({
        absoluteFile: path.join(getUserHarnessRoot(), 'mcp.disabled.json'),
        scope: 'user',
        sourceFileKind: 'mcp.json',
        wrapped: true,
        disabledByBackup: true,
        sources,
        malformed,
      });
    }
  }

  private async enumeratePluginMcps(
    sources: Map<string, HarnessMcpSource[]>,
    malformed: HarnessMcpMalformedEntry[],
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
        const guardedAbs = (abs: string): boolean => {
          const resolved = path.resolve(abs);
          return resolved === installRoot || resolved.startsWith(installRoot + path.sep);
        };

        // Plugin .mcp.json — uses the UNWRAPPED form on disk per Anthropic's
        // marketplace catalog convention (top-level keys are server names).
        const pluginMcp = path.join(entry.installPath, '.mcp.json');
        if (guardedAbs(pluginMcp)) {
          await readMcpFile({
            absoluteFile: pluginMcp,
            scope: 'plugin',
            pluginKey,
            sourceFileKind: 'mcp.json',
            wrapped: false,
            sources,
            malformed,
          });
        }
        // Plugin manifest's mcpServers field — wrapped form.
        const pluginManifest = path.join(entry.installPath, '.claude-plugin', 'plugin.json');
        if (guardedAbs(pluginManifest)) {
          await readMcpFile({
            absoluteFile: pluginManifest,
            scope: 'plugin',
            pluginKey,
            sourceFileKind: 'plugin.json',
            wrapped: true,
            sources,
            malformed,
          });
        }
      }
    }
  }

  // ---- toggle helpers ---------------------------------------------------

  private async toggleEnabled(
    source: HarnessMcpSourceLocation,
    name: string,
    enabled: boolean,
    expectedMtime?: string,
  ): Promise<HarnessMcpUpdateResponse> {
    const editableScope = source.scope as 'project' | 'user';
    const main = await getMainAccessor(editableScope, source.projectSlug);

    if (DISABLE_STRATEGY === 'flag') {
      // Spike A 경로 1 — write `enabled: true|false` directly. enabled=true
      // deletes the key (default) so the file stays clean when re-enabling.
      const current = await main.read();
      const cfg = current.servers[name];
      if (!cfg) {
        throwMapped(HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code, `entry not in main: ${name}`);
      }
      const next: HarnessMcpServerConfig = { ...cfg };
      if (enabled) delete next.enabled;
      else next.enabled = false;
      const result = await main.patch(name, next, expectedMtime ?? current.mtime);
      return { success: true, mtime: result.mtime };
    }

    // Spike A 경로 2 — backup file move (default).
    const backup = await getBackupAccessor(editableScope, source.projectSlug);

    if (enabled) {
      // backup → main: read entry from backup, set on main, delete from backup.
      const backupCurrent = await backup.read();
      const cfg = backupCurrent.servers[name];
      if (!cfg) {
        throwMapped(HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code, `entry not in backup: ${name}`);
      }
      const mainCurrent = await main.read();
      if (Object.prototype.hasOwnProperty.call(mainCurrent.servers, name)) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_MCP_NAME_CONFLICT.code,
          `cannot enable: ${name} already exists in main file`,
        );
      }
      const mainWrite = await main.patch(name, cfg, expectedMtime ?? mainCurrent.mtime);
      try {
        await backup.patch(name, undefined, backupCurrent.mtime);
      } catch (err) {
        // Inverse: remove the entry we just added to main so the user is not
        // left with a stale duplicate.
        await main
          .patch(name, undefined, mainWrite.mtime)
          .catch((rollbackErr) => {
            log.warn(
              `enable rollback failed for ${name}: ${(rollbackErr as Error).message}`,
            );
          });
        throw err;
      }
      return { success: true, mtime: mainWrite.mtime };
    }

    // main → backup
    const mainCurrent = await main.read();
    const cfg = mainCurrent.servers[name];
    if (!cfg) {
      throwMapped(HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code, `entry not in main: ${name}`);
    }
    const backupCurrent = await backup.read();
    const backupWrite = await backup.patch(name, cfg, backupCurrent.mtime || undefined);
    try {
      const mainWrite = await main.patch(name, undefined, expectedMtime ?? mainCurrent.mtime);
      return { success: true, mtime: mainWrite.mtime };
    } catch (err) {
      await backup
        .patch(name, undefined, backupWrite.mtime)
        .catch((rollbackErr) => {
          log.warn(
            `disable rollback failed for ${name}: ${(rollbackErr as Error).message}`,
          );
        });
      throw err;
    }
  }
}

// ---- shared file-IO helpers (module scope) ---------------------------------

interface ReadFileArgs {
  absoluteFile: string;
  scope: HarnessMcpSourceScope;
  pluginKey?: string;
  projectSlug?: string;
  sourceFileKind: HarnessMcpSourceFileKind;
  wrapped: boolean;
  disabledByBackup?: boolean;
  sources: Map<string, HarnessMcpSource[]>;
  malformed: HarnessMcpMalformedEntry[];
}

async function readMcpFile(args: ReadFileArgs): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(args.absoluteFile);
  } catch {
    return; // missing file is normal
  }
  if (!stat.isFile()) return;

  let text: string;
  try {
    text = await fs.readFile(args.absoluteFile, 'utf-8');
  } catch {
    return;
  }
  const trimmed = text.trim();
  if (trimmed === '') return;

  const parsed = safeParseJsonc(trimmed);
  if (parsed === null) {
    args.malformed.push({
      scope: args.scope,
      absoluteFile: args.absoluteFile,
      pluginKey: args.pluginKey,
      projectSlug: args.projectSlug,
      serverName: '*',
      reason: 'failed to parse JSON',
    });
    return;
  }

  const servers = extractServers(parsed, args.wrapped);
  if (!servers) {
    args.malformed.push({
      scope: args.scope,
      absoluteFile: args.absoluteFile,
      pluginKey: args.pluginKey,
      projectSlug: args.projectSlug,
      serverName: '*',
      reason: args.wrapped
        ? 'mcpServers field missing or invalid'
        : 'expected an object of server entries',
    });
    return;
  }
  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== 'object') {
      args.malformed.push({
        scope: args.scope,
        absoluteFile: args.absoluteFile,
        pluginKey: args.pluginKey,
        projectSlug: args.projectSlug,
        serverName: name,
        reason: 'server entry is not an object',
      });
      continue;
    }
    const source: HarnessMcpSource = {
      scope: args.scope,
      absoluteFile: args.absoluteFile,
      pluginKey: args.pluginKey,
      projectSlug: args.projectSlug,
      sourceFileKind: args.sourceFileKind,
      config,
      mtime: stat.mtime.toISOString(),
      disabledByBackup: args.disabledByBackup === true,
    };
    const list = args.sources.get(name);
    if (list) list.push(source);
    else args.sources.set(name, [source]);
  }
}

interface ReadEntryResult {
  config: HarnessMcpServerConfig;
  raw: string;
  mtime: string;
}

async function readServerEntry(
  source: HarnessMcpSourceLocation,
  name: string,
): Promise<ReadEntryResult> {
  let stat;
  try {
    stat = await fs.stat(source.absoluteFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throwMapped(HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code, `MCP file not found: ${source.absoluteFile}`);
    }
    throw err;
  }
  if (!stat.isFile()) {
    throwMapped(HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code, 'MCP source is not a regular file');
  }
  const text = await fs.readFile(source.absoluteFile, 'utf-8');
  const parsed = safeParseJsonc(text);
  if (parsed === null) {
    throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'failed to parse MCP file');
  }
  // Plugin .mcp.json is unwrapped; everything else (incl. plugin.json) is wrapped.
  const wrapped = !(source.scope === 'plugin' && source.sourceFileKind === 'mcp.json');
  const servers = extractServers(parsed, wrapped);
  if (!servers || !servers[name]) {
    throwMapped(HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code, `server not found: ${name}`);
  }
  const config = servers[name];
  const raw = JSON.stringify(config, null, 2);
  return { config, raw, mtime: stat.mtime.toISOString() };
}

function extractServers(
  parsed: unknown,
  wrapped: boolean,
): Record<string, HarnessMcpServerConfig> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  let servers: unknown;
  if (wrapped) {
    servers = obj.mcpServers;
    if (servers === undefined) return {};
  } else {
    servers = obj;
  }
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return null;
  const result: Record<string, HarnessMcpServerConfig> = {};
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    result[name] = value as HarnessMcpServerConfig;
  }
  return result;
}

function safeParseJsonc(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface ResolveSourceArgs {
  scope: HarnessMcpSourceScope;
  name: string;
  projectSlug?: string;
  pluginKey?: string;
  fileKind?: HarnessMcpSourceFileKind;
}

export async function resolveSourceLocation(
  input: ResolveSourceArgs,
): Promise<HarnessMcpSourceLocation> {
  if (input.scope === 'project') {
    if (!input.projectSlug) {
      throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug required for scope=project');
    }
    const filePath = await getProjectMcpFilePath(input.projectSlug);
    return {
      scope: 'project',
      absoluteFile: filePath,
      projectSlug: input.projectSlug,
      sourceFileKind: 'mcp.json',
    };
  }
  if (input.scope === 'user') {
    const filePath = getUserMcpFilePath();
    if (!filePath) {
      throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'global MCP file is not configured');
    }
    return {
      scope: 'user',
      absoluteFile: filePath,
      sourceFileKind: USER_FILE_KIND ?? 'mcp.json',
    };
  }
  // plugin
  if (!input.pluginKey) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'pluginKey required for scope=plugin');
  }
  const installPath = await readPluginInstallPath(input.pluginKey);
  if (!installPath) {
    throwMapped(HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code, `plugin not installed: ${input.pluginKey}`);
  }
  const fileKind = input.fileKind ?? 'mcp.json';
  const fileName = fileKind === 'plugin.json' ? path.join('.claude-plugin', 'plugin.json') : '.mcp.json';
  const absoluteFile = path.join(installPath, fileName);
  // Containment guard for dev-installed (out-of-tree) plugins.
  const root = path.resolve(installPath);
  const abs = path.resolve(absoluteFile);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'plugin file escapes installPath');
  }
  return {
    scope: 'plugin',
    absoluteFile,
    pluginKey: input.pluginKey,
    sourceFileKind: fileKind,
  };
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

function computeEnabled(source: HarnessMcpSource): boolean {
  if (DISABLE_STRATEGY === 'flag') {
    return source.config.enabled !== false;
  }
  return !source.disabledByBackup;
}

function validateConfigShape(config: HarnessMcpServerConfig): void {
  const type = resolveType(config);
  if (type === 'stdio') {
    if (!config.command || typeof config.command !== 'string') {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'command is required for stdio');
    }
  } else {
    if (!config.url || typeof config.url !== 'string') {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, `url is required for ${type}`);
    }
    if (type !== 'http' && config.headers && Object.keys(config.headers).length > 0) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'headers only allowed for http');
    }
  }
}

export const harnessMcpService = new HarnessMcpService();
export const SPIKE_RESULTS = {
  disableStrategy: DISABLE_STRATEGY,
  userFileKind: USER_FILE_KIND,
};
