/**
 * Story 28.1: Harness plugin service.
 *
 * Combines three user-scope files — `plugins/installed_plugins.json`,
 * `plugins/known_marketplaces.json`, and `settings.json` — into a card list
 * consumable by the "Harness Workbench → Plugins" panel. All file I/O is
 * delegated to `harnessService` so traversal guards, STALE_WRITE, and binary
 * detection are reused from Story 28.0.5.
 *
 * The service is intentionally read-heavy on `listCards` and narrow on
 * `toggleEnabled` — it touches only the `enabledPlugins` field of
 * `settings.json` via JSONC round-trip so comments and key order are
 * preserved.
 */

import path from 'path';
import fs from 'fs/promises';
import {
  HARNESS_ERRORS,
  type HarnessEnabledPluginsFormat,
  type HarnessInstalledPluginEntry,
  type HarnessPluginCard,
  type HarnessPluginComponentCounts,
  type HarnessPluginListResponse,
  type HarnessPluginManifest,
  type HarnessPluginToggleRequest,
  type HarnessPluginToggleResponse,
  type HarnessPluginType,
  type HarnessMarketplacePluginMeta,
  type HarnessScope,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';

function throwMapped(code: string, message: string, extras?: Record<string, unknown>): never {
  const err = new Error(message) as NodeJS.ErrnoException & Record<string, unknown>;
  err.code = code;
  if (extras) Object.assign(err, extras);
  throw err;
}

function isFileNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code;
}

interface InstalledPluginsFile {
  version?: number;
  plugins?: Record<string, HarnessInstalledPluginEntry[] | HarnessInstalledPluginEntry>;
}

interface KnownMarketplacesFile {
  [marketName: string]: {
    source?: unknown;
    installLocation?: string;
    lastUpdated?: string;
  };
}

interface MarketplaceMetaFile {
  plugins?: HarnessMarketplacePluginMeta[];
}

interface SettingsEnabledRead {
  enabled: Set<string>;
  format: HarnessEnabledPluginsFormat;
  mtime: string;
  raw: unknown; // parsed settings.json root object (or `{}` when missing)
  /**
   * The original `enabledPlugins` value as stored in the file. Used to
   * preserve array element order when writing back without reordering.
   */
  originalField: unknown;
}

class HarnessPluginService {
  async listCards(currentProjectSlug?: string): Promise<HarnessPluginListResponse> {
    const currentProjectPath = await this.resolveCurrentProjectPath(currentProjectSlug);

    // Step 1: installed_plugins.json (file absent → empty catalog, not an error)
    let installed: InstalledPluginsFile = {};
    try {
      const res = await harnessService.read({
        scope: 'user',
        relativePath: 'plugins/installed_plugins.json',
      });
      installed = this.parseJson<InstalledPluginsFile>(res.content ?? '', {});
    } catch (err) {
      if (!isFileNotFound(err)) throw err;
      const fallbackEnabled = await this.readEnabledPluginsFromSettings('user');
      return {
        cards: [],
        enabledPluginsFormat: 'object',
        currentProjectPath,
        settingsMtime: fallbackEnabled.mtime,
      };
    }

    // Step 2: known_marketplaces.json (file absent → empty map, keep going)
    let marketplaces: KnownMarketplacesFile = {};
    try {
      const res = await harnessService.read({
        scope: 'user',
        relativePath: 'plugins/known_marketplaces.json',
      });
      marketplaces = this.parseJson<KnownMarketplacesFile>(res.content ?? '', {});
    } catch (err) {
      if (!isFileNotFound(err)) throw err;
    }

    // Step 3: per-market marketplace.json files (build a name→meta map)
    const marketMetaByKey = new Map<string, HarnessMarketplacePluginMeta>();
    for (const marketName of Object.keys(marketplaces)) {
      try {
        const res = await harnessService.read({
          scope: 'user',
          relativePath: `plugins/marketplaces/${marketName}/.claude-plugin/marketplace.json`,
        });
        const parsed = this.parseJson<MarketplaceMetaFile>(res.content ?? '', {});
        for (const meta of parsed.plugins ?? []) {
          if (meta?.name) {
            marketMetaByKey.set(`${meta.name}@${marketName}`, meta);
          }
        }
      } catch (err) {
        if (!isFileNotFound(err)) throw err;
      }
    }

    // Step 4: enabledPlugins from both settings.json files. The user-scope
    // file (~/.claude/settings.json) is the single source of truth for
    // user-scope cards' enabled flag and toggle target. The project-scope
    // file (<currentProjectPath>/.claude/settings.json) does the same for
    // project-scope cards whose projectPath matches the current session.
    // CLI semantics: `/plugin install --scope project` writes enabledPlugins
    // to the project's settings.json — we mirror that on the toggle path.
    const userEnabled = await this.readEnabledPluginsFromSettings('user');
    const projectEnabled = currentProjectSlug
      ? await this.readEnabledPluginsFromSettings('project', currentProjectSlug)
      : null;

    // Step 5: build cards
    const cards: HarnessPluginCard[] = [];
    const plugins = installed.plugins ?? {};
    for (const [key, value] of Object.entries(plugins)) {
      const entries = Array.isArray(value) ? value : [value];
      const [pluginName, marketplace] = this.splitKey(key);
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const routing = this.resolveSettingsRouting(entry, currentProjectPath);
        // Pick which settings.json governs this specific card.
        const enabledRead = routing === 'project' && projectEnabled
          ? projectEnabled
          : userEnabled;
        const card = await this.buildCard({
          key,
          pluginName,
          marketplace,
          entry,
          marketMeta: marketMetaByKey.get(key),
          enabled: enabledRead.enabled.has(key),
          settingsScope: routing,
          settingsMtime: enabledRead.mtime,
        });
        cards.push(card);
      }
    }

    return {
      cards,
      enabledPluginsFormat: userEnabled.format,
      currentProjectPath,
      settingsMtime: userEnabled.mtime,
    };
  }

  async toggleEnabled(
    req: HarnessPluginToggleRequest,
    currentProjectSlug?: string,
  ): Promise<HarnessPluginToggleResponse> {
    // Step 1 — Load installed_plugins.json first. Existence check (step 2)
    // must precede scope gating / settings routing so an unknown key surfaces
    // as 404 rather than masquerading as 403 or hitting an unrelated read.
    let installed: InstalledPluginsFile = {};
    try {
      const res = await harnessService.read({
        scope: 'user',
        relativePath: 'plugins/installed_plugins.json',
      });
      installed = this.parseJson<InstalledPluginsFile>(res.content ?? '', {});
    } catch (err) {
      if (!isFileNotFound(err)) throw err;
    }

    const raw = installed.plugins?.[req.key];
    const entries = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    if (entries.length === 0) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code,
        `plugin key not installed: ${req.key}`,
      );
    }

    // Step 3 — Determine which settings.json this toggle should write to.
    // CLI semantics: a plugin installed with `--scope project` keeps its
    // enabledPlugins entry inside the project's settings.json, not the global
    // one. So if any matching `scope:project` entry has `projectPath` equal
    // to the current session's project, we route to that project's settings.
    // Otherwise (only user-scope entries, or project entries that don't
    // match the current project), we fall through to the global settings or
    // surface HARNESS_PLUGIN_SCOPE_DENIED.
    const currentProjectPath = await this.resolveCurrentProjectPath(currentProjectSlug);
    const targetScope = this.pickToggleTargetScope(entries, currentProjectPath);
    if (targetScope === 'denied') {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PLUGIN_SCOPE_DENIED.code,
        'project scope toggle requires the matching project context',
      );
    }

    // Step 4 — Read the chosen settings.json (deferred until after gating so
    // we never speculatively read the project file when the request is for a
    // user-only plugin).
    const targetRef = targetScope === 'project'
      ? { scope: 'project' as const, projectSlug: currentProjectSlug!, relativePath: 'settings.json' }
      : { scope: 'user' as const, relativePath: 'settings.json' };
    const enabledRead = await this.readEnabledPluginsFromSettings(
      targetScope,
      currentProjectSlug,
    );

    // Step 5 — Optimistic concurrency on the chosen file
    if (req.expectedMtime !== undefined && req.expectedMtime !== enabledRead.mtime) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_STALE_WRITE.code,
        'settings.json changed on disk',
        { currentMtime: enabledRead.mtime },
      );
    }

    // Step 6 — Compute updated enabledPlugins value per current format
    const updated = this.computeUpdatedEnabled(
      enabledRead.originalField,
      enabledRead.format,
      req.key,
      req.enabled,
    );

    // Step 7 — JSONC round-trip write to preserve comments / order
    const write = await harnessService.patchStructured(
      targetRef,
      {
        format: 'jsonc',
        ops: [{ path: ['enabledPlugins'], value: updated }],
        expectedMtime: enabledRead.mtime,
      },
    );

    return { success: true, mtime: write.mtime, appliedFormat: enabledRead.format };
  }

  /**
   * Decide which settings.json a toggle should write to (or that the toggle
   * should be denied entirely). Mirrors the CLI's install-time scope choice.
   *
   * - Any `scope:project` entry whose `projectPath` matches the current
   *   project → write to the project's settings.json.
   * - Only `scope:user` entries → write to the global settings.json.
   * - One or more `scope:project` entries with no matching projectPath, and
   *   no user-scope entry → deny (HARNESS_PLUGIN_SCOPE_DENIED). This keeps
   *   us from silently writing project-scoped state into the wrong file.
   */
  private pickToggleTargetScope(
    entries: HarnessInstalledPluginEntry[],
    currentProjectPath: string | undefined,
  ): HarnessScope | 'denied' {
    const projectEntries = entries.filter((e) => e.scope === 'project');
    const hasUserEntry = entries.some((e) => e.scope === 'user');
    if (projectEntries.length > 0 && currentProjectPath) {
      const matched = projectEntries.some((e) =>
        typeof e.projectPath === 'string' && this.samePath(e.projectPath, currentProjectPath),
      );
      if (matched) return 'project';
    }
    if (hasUserEntry) return 'user';
    // Only project entries remain, none matching → safe deny.
    return 'denied';
  }

  // ---- internals ---------------------------------------------------------

  /**
   * Decide whether a card's toggle should target the user-scope or
   * project-scope settings.json. Mirrors `pickToggleTargetScope` but for the
   * single-entry list-card path, where we know exactly which entry is being
   * routed. A `scope:project` entry with a matching `projectPath` → project.
   * Anything else → user (the toggle may still be gated on the toggle path
   * if the entry's projectPath disagrees with the current project — see
   * pickToggleTargetScope's deny branch).
   */
  private resolveSettingsRouting(
    entry: HarnessInstalledPluginEntry,
    currentProjectPath: string | undefined,
  ): HarnessScope {
    if (
      entry.scope === 'project'
      && currentProjectPath
      && typeof entry.projectPath === 'string'
      && this.samePath(entry.projectPath, currentProjectPath)
    ) {
      return 'project';
    }
    return 'user';
  }

  private async readEnabledPluginsFromSettings(
    scope: HarnessScope = 'user',
    projectSlug?: string,
  ): Promise<SettingsEnabledRead> {
    try {
      const ref = scope === 'project' && projectSlug
        ? { scope: 'project' as const, projectSlug, relativePath: 'settings.json' }
        : { scope: 'user' as const, relativePath: 'settings.json' };
      const res = await harnessService.read(ref);
      const content = res.content ?? '';
      let parsed: Record<string, unknown> = {};
      try {
        // settings.json is JSONC in practice. For read-only parsing we strip
        // line/block comments before JSON.parse — the structured editor path
        // handles the round-trip on write.
        parsed = JSON.parse(stripJsonComments(content)) as Record<string, unknown>;
      } catch {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'settings.json is not valid JSON');
      }
      const field = parsed['enabledPlugins'];
      if (field === undefined || field === null) {
        return {
          enabled: new Set(),
          format: 'object',
          mtime: res.mtime,
          raw: parsed,
          originalField: undefined,
        };
      }
      if (Array.isArray(field)) {
        const enabled = new Set<string>(field.filter((v): v is string => typeof v === 'string'));
        return { enabled, format: 'array', mtime: res.mtime, raw: parsed, originalField: field };
      }
      if (typeof field === 'object') {
        const enabled = new Set<string>();
        for (const [k, v] of Object.entries(field as Record<string, unknown>)) {
          if (v === true) enabled.add(k);
        }
        return { enabled, format: 'object', mtime: res.mtime, raw: parsed, originalField: field };
      }
      // Unknown shape — treat as missing but keep `object` as the write default.
      return { enabled: new Set(), format: 'object', mtime: res.mtime, raw: parsed, originalField: undefined };
    } catch (err) {
      if (isFileNotFound(err)) {
        return {
          enabled: new Set(),
          format: 'object',
          mtime: '',
          raw: {},
          originalField: undefined,
        };
      }
      throw err;
    }
  }

  private computeUpdatedEnabled(
    original: unknown,
    format: HarnessEnabledPluginsFormat,
    key: string,
    enabled: boolean,
  ): unknown {
    if (format === 'array') {
      const arr = Array.isArray(original)
        ? (original.filter((v): v is string => typeof v === 'string'))
        : [];
      if (enabled) {
        return arr.includes(key) ? [...arr] : [...arr, key];
      }
      return arr.filter((k) => k !== key);
    }
    // object format
    const obj = (original && typeof original === 'object' && !Array.isArray(original))
      ? { ...(original as Record<string, unknown>) }
      : {};
    if (enabled) {
      obj[key] = true;
    } else {
      delete obj[key];
    }
    return obj;
  }

  private async resolveCurrentProjectPath(slug?: string): Promise<string | undefined> {
    if (!slug) return undefined;
    try {
      return await projectService.resolveOriginalPath(slug);
    } catch {
      return undefined;
    }
  }

  private splitKey(key: string): [name: string, marketplace: string] {
    const at = key.lastIndexOf('@');
    if (at <= 0) return [key, ''];
    return [key.slice(0, at), key.slice(at + 1)];
  }

  private samePath(a: string, b: string): boolean {
    const na = path.resolve(a);
    const nb = path.resolve(b);
    // Windows path comparisons are case-insensitive in practice.
    return process.platform === 'win32'
      ? na.toLowerCase() === nb.toLowerCase()
      : na === nb;
  }

  private parseJson<T>(content: string, fallback: T): T {
    const trimmed = content.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'malformed JSON catalog');
    }
  }

  private async buildCard(params: {
    key: string;
    pluginName: string;
    marketplace: string;
    entry: HarnessInstalledPluginEntry;
    marketMeta?: HarnessMarketplacePluginMeta;
    enabled: boolean;
    settingsScope: HarnessScope;
    settingsMtime: string;
  }): Promise<HarnessPluginCard> {
    const { key, pluginName, marketplace, entry, marketMeta, enabled, settingsScope, settingsMtime } = params;
    const counts = await this.countComponents(entry.installPath);
    const manifest = await this.readManifest(entry.installPath);
    const pluginType: HarnessPluginType = this.decideType(counts);
    const versionShort = (entry.gitCommitSha ?? entry.version ?? '').slice(0, 7);

    return {
      key,
      name: pluginName,
      marketplace,
      version: versionShort,
      scope: entry.scope,
      category: marketMeta?.category,
      projectPath: entry.projectPath,
      enabled,
      pluginType,
      componentCounts: counts,
      manifest,
      settingsScope,
      settingsMtime,
    };
  }

  private decideType(counts: HarnessPluginComponentCounts): HarnessPluginType {
    const onlyMcp = counts.skills === 0
      && counts.commands === 0
      && counts.agents === 0
      && counts.hooks === 0
      && counts.mcpServers > 0;
    return onlyMcp ? 'external-mcp' : 'standard';
  }

  /**
   * Enumerate plugin bundle components. Uses direct `fs` access rather than
   * `harnessService.list` because the install path may live under
   * `~/.claude/plugins/cache/...` but the exact nesting is vendor-controlled
   * and we don't want each subdir to round-trip through the traversal guard
   * individually. We still refuse to enumerate any path that isn't contained
   * in `~/.claude` (per AC — fallback all-zero).
   */
  private async countComponents(installPath: string): Promise<HarnessPluginComponentCounts> {
    const zero: HarnessPluginComponentCounts = {
      skills: 0, commands: 0, agents: 0, hooks: 0, mcpServers: 0,
    };
    if (!installPath || typeof installPath !== 'string') return zero;
    const userRoot = path.resolve(getUserHarnessRoot());
    const abs = path.resolve(installPath);
    if (abs !== userRoot && !abs.startsWith(userRoot + path.sep)) {
      return zero;
    }

    const [skills, commands, agents, hooks, mcpServers] = await Promise.all([
      this.countSkillsDir(path.join(abs, 'skills')),
      this.countMarkdownFiles(path.join(abs, 'commands')),
      this.countMarkdownFiles(path.join(abs, 'agents')),
      this.countHooksJson(path.join(abs, 'hooks', 'hooks.json')),
      this.countMcpServers(path.join(abs, '.mcp.json')),
    ]);
    return { skills, commands, agents, hooks, mcpServers };
  }

  private async countSkillsDir(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let n = 0;
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        try {
          await fs.access(path.join(dir, ent.name, 'SKILL.md'));
          n += 1;
        } catch {
          // no SKILL.md → skip
        }
      }
      return n;
    } catch {
      return 0;
    }
  }

  private async countMarkdownFiles(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let n = 0;
      for (const ent of entries) {
        if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) n += 1;
      }
      return n;
    } catch {
      return 0;
    }
  }

  private async countHooksJson(file: string): Promise<number> {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(content) as { hooks?: Record<string, unknown[]> };
      const hooks = parsed?.hooks;
      if (!hooks || typeof hooks !== 'object') return 0;
      return Object.values(hooks)
        .filter(Array.isArray)
        .reduce((sum, arr) => sum + (arr as unknown[]).length, 0);
    } catch {
      return 0;
    }
  }

  private async countMcpServers(file: string): Promise<number> {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return 0;
      // Preferred shape: `{ mcpServers: { ... } }`.
      const wrapper = (parsed as { mcpServers?: unknown }).mcpServers;
      if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
        return Object.keys(wrapper as Record<string, unknown>).length;
      }
      // Fallback for flat-map layouts: only count keys whose value *looks like*
      // a server definition (object with command/url/type/transport). This
      // keeps metadata keys like $schema/version from inflating the count.
      let n = 0;
      for (const value of Object.values(parsed)) {
        if (isLikelyMcpServerEntry(value)) n += 1;
      }
      return n;
    } catch {
      return 0;
    }
  }

  private async readManifest(installPath: string): Promise<HarnessPluginManifest | undefined> {
    try {
      const file = path.join(installPath, '.claude-plugin', 'plugin.json');
      const content = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(content) as Partial<HarnessPluginManifest> & { name?: string };
      if (!parsed?.name) return undefined;
      return {
        name: parsed.name,
        description: parsed.description,
        author: parsed.author,
        version: parsed.version,
      };
    } catch {
      return undefined;
    }
  }
}

/**
 * Strip `//` line comments and `/* block * /` comments from JSONC input so the
 * read path can `JSON.parse` safely. Write path still uses `applyJsoncPatch`
 * via `harnessService.patchStructured`, which preserves comments.
 *
 * This is intentionally conservative: it ignores comment-like sequences
 * inside string literals so we don't mangle paths or regex values.
 */
function stripJsonComments(input: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  let stringQuote = '';
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      // line comment — skip to newline
      i += 2;
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function isLikelyMcpServerEntry(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.command === 'string'
    || typeof rec.url === 'string'
    || typeof rec.type === 'string'
    || typeof rec.transport === 'string'
  );
}

export const harnessPluginService = new HarnessPluginService();
