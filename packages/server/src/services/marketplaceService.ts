/**
 * Story 31.4: Plugin marketplace catalog service (read-only).
 *
 * Surfaces the *full* `plugins[]` catalog from each registered marketplace —
 * the entries Story 28.1 `harnessPluginService.listCards` deliberately discards
 * (it keeps only installed cards). Builds a unified catalog by reading:
 *   - `plugins/known_marketplaces.json`           → registered market names
 *   - `plugins/marketplaces/<name>/.claude-plugin/marketplace.json` → plugins[]
 *   - `plugins/installed_plugins.json`            → installed flag join (AC1.d)
 *
 * Design constraints (Story 31.4):
 *   - 28.1 `harnessPluginService` is NOT modified — this is a separate
 *     read-only service so the stable toggle/list path cannot regress.
 *   - Per-market parse failures are isolated into `errors[]` instead of
 *     aborting the whole catalog (AC5) — unlike 28.1 which re-throws.
 *   - Plugin type is decided by the `source` path prefix (AC1.c), not by
 *     component counts, because unbuilt catalog entries have no installPath.
 *   - Component counts are reimplemented here (not extracted from 28.1) so the
 *     stable service is untouched and because the input is a *market repo
 *     source dir*, not an installPath. De-dup is an optional later cleanup.
 *   - All catalog file reads go through `harnessService.read` (traversal
 *     guard). Only the market repo source-dir enumeration uses direct `fs`,
 *     and refuses any path outside `~/.claude`.
 */

import path from 'path';
import fs from 'fs/promises';
import {
  HARNESS_ERRORS,
  type HarnessMarketplaceCatalogEntry,
  type HarnessMarketplaceCatalogError,
  type HarnessMarketplaceCatalogResponse,
  type HarnessMarketplaceFormatWarning,
  type HarnessPluginType,
  type HarnessPluginComponentCounts,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';

/** installed_plugins.json `version` values this service understands (AC6). */
const KNOWN_INSTALLED_VERSIONS = new Set<number>([1, 2]);

// --- raw on-disk shapes -----------------------------------------------------

interface KnownMarketplacesFile {
  [marketName: string]: unknown;
}

interface MarketplacePluginMetaRaw {
  name?: string;
  description?: string;
  version?: string;
  author?: { name?: string; email?: string } | string;
  category?: string;
  source?: string;
}

interface MarketplaceMetaFile {
  plugins?: MarketplacePluginMetaRaw[];
}

interface InstalledEntryRaw {
  scope?: string;
  projectPath?: string;
}

interface InstalledPluginsFile {
  version?: number;
  plugins?: Record<string, InstalledEntryRaw[] | InstalledEntryRaw>;
}

// --- helpers ---------------------------------------------------------------

function isFileNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code;
}

/**
 * AC1.c: type from `source` path prefix. `./external_plugins/...` → external
 * MCP wrapper; everything else (`./plugins/...`) → standard.
 */
function decideTypeFromSource(source: string | undefined): HarnessPluginType {
  const s = (source ?? '').replace(/^\.\//, '');
  return s.startsWith('external_plugins/') ? 'external-mcp' : 'standard';
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
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

// Component counters — reimplemented from 28.1 `countComponents` + 4 helpers.
// Kept private to this module (not shared util) per Story 31.4 A.1 rationale.

async function countSkillsDir(dir: string): Promise<number> {
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

async function countMarkdownFiles(dir: string): Promise<number> {
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

async function countHooksJson(file: string): Promise<number> {
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

async function countMcpServers(file: string): Promise<number> {
  try {
    const content = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return 0;
    const wrapper = (parsed as { mcpServers?: unknown }).mcpServers;
    if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
      return Object.keys(wrapper as Record<string, unknown>).length;
    }
    let n = 0;
    for (const value of Object.values(parsed)) {
      if (isLikelyMcpServerEntry(value)) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

class MarketplaceService {
  /**
   * Build the unified catalog. Never throws on per-market or installed-file
   * problems — they degrade into `errors[]` / `formatWarning` (AC5/AC6).
   */
  async listCatalog(currentProjectSlug?: string): Promise<HarnessMarketplaceCatalogResponse> {
    const currentProjectPath = await this.resolveCurrentProjectPath(currentProjectSlug);
    const userRoot = path.resolve(getUserHarnessRoot());

    // Step 1: known_marketplaces.json (absent or malformed → empty catalog).
    let known: KnownMarketplacesFile = {};
    try {
      const res = await harnessService.read({
        scope: 'user',
        relativePath: 'plugins/known_marketplaces.json',
      });
      known = this.safeParse<KnownMarketplacesFile>(res.content ?? '', {});
    } catch (err) {
      if (!isFileNotFound(err)) throw err;
      return { marketplaces: [], entries: [], errors: [] };
    }
    const marketplaces = Object.keys(known).filter((k) => k && typeof k === 'string');

    // Step 2+3: per-market marketplace.json → catalog entries; isolate failures.
    const entries: HarnessMarketplaceCatalogEntry[] = [];
    const errors: HarnessMarketplaceCatalogError[] = [];

    for (const marketName of marketplaces) {
      let raw: string;
      try {
        const res = await harnessService.read({
          scope: 'user',
          relativePath: `plugins/marketplaces/${marketName}/.claude-plugin/marketplace.json`,
        });
        raw = res.content ?? '';
      } catch (err) {
        errors.push({
          marketplace: marketName,
          code: isFileNotFound(err)
            ? HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code
            : HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        });
        continue;
      }

      let meta: MarketplaceMetaFile;
      try {
        meta = JSON.parse(raw) as MarketplaceMetaFile;
      } catch {
        errors.push({ marketplace: marketName, code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code });
        continue;
      }

      for (const plugin of meta.plugins ?? []) {
        if (!plugin?.name) continue;
        const entry: HarnessMarketplaceCatalogEntry = {
          key: `${plugin.name}@${marketName}`,
          name: plugin.name,
          marketplace: marketName,
          description: plugin.description,
          version: plugin.version,
          author: plugin.author,
          category: plugin.category,
          pluginType: decideTypeFromSource(plugin.source),
          source: plugin.source,
          installed: false, // filled in step 4
        };
        const counts = await this.countComponentsForSource(userRoot, marketName, plugin.source);
        if (counts) entry.componentCounts = counts;
        entries.push(entry);
      }
    }

    // Step 4: installed_plugins.json join + format warning (AC1.d / AC6).
    const { installedKeys, formatWarning } = await this.readInstalledState(currentProjectPath);
    for (const entry of entries) {
      entry.installed = installedKeys.has(entry.key);
    }

    return {
      marketplaces,
      entries,
      errors,
      ...(formatWarning ? { formatWarning } : {}),
    };
  }

  /**
   * Read installed_plugins.json into a set of installed keys + an optional
   * format warning. Absent file → no installs, no warning (normal). Unknown
   * version / wrong shape / parse error → degrade with a warning (AC6).
   */
  private async readInstalledState(
    currentProjectPath: string | undefined,
  ): Promise<{ installedKeys: Set<string>; formatWarning?: HarnessMarketplaceFormatWarning }> {
    const installedKeys = new Set<string>();
    let content: string;
    try {
      const res = await harnessService.read({
        scope: 'user',
        relativePath: 'plugins/installed_plugins.json',
      });
      content = res.content ?? '';
    } catch (err) {
      if (isFileNotFound(err)) return { installedKeys };
      throw err;
    }

    let parsed: InstalledPluginsFile;
    try {
      parsed = JSON.parse(content) as InstalledPluginsFile;
    } catch {
      return { installedKeys, formatWarning: { reason: 'parseError' } };
    }

    let formatWarning: HarnessMarketplaceFormatWarning | undefined;
    if (typeof parsed.version === 'number' && !KNOWN_INSTALLED_VERSIONS.has(parsed.version)) {
      formatWarning = { detectedVersion: parsed.version, reason: 'unrecognizedVersion' };
    }

    const plugins = parsed.plugins;
    if (plugins && typeof plugins === 'object' && !Array.isArray(plugins)) {
      for (const [key, value] of Object.entries(plugins)) {
        const arr = Array.isArray(value) ? value : [value];
        const installed = arr.some((e) => {
          if (!e || typeof e !== 'object') return false;
          if (e.scope === 'project') {
            return (
              !!currentProjectPath
              && typeof e.projectPath === 'string'
              && samePath(e.projectPath, currentProjectPath)
            );
          }
          // user scope (or unspecified) → globally installed
          return true;
        });
        if (installed) installedKeys.add(key);
      }
    } else if (plugins !== undefined) {
      formatWarning = formatWarning ?? {
        detectedVersion: typeof parsed.version === 'number' ? parsed.version : undefined,
        reason: 'unexpectedShape',
      };
    }

    return { installedKeys, formatWarning };
  }

  /**
   * Best-effort component tally from the cloned market repo source dir
   * (`<userRoot>/plugins/marketplaces/<market>/<source>/`). Returns undefined
   * when the dir is missing or resolves outside `~/.claude` (type badge still
   * renders without counts).
   */
  private async countComponentsForSource(
    userRoot: string,
    marketName: string,
    source: string | undefined,
  ): Promise<HarnessPluginComponentCounts | undefined> {
    if (!source || typeof source !== 'string') return undefined;
    const rel = source.replace(/^\.\//, '');
    const abs = path.resolve(userRoot, 'plugins', 'marketplaces', marketName, rel);
    // Refuse anything outside ~/.claude (defends against `..` in source).
    if (abs !== userRoot && !abs.startsWith(userRoot + path.sep)) return undefined;
    try {
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) return undefined;
    } catch {
      return undefined;
    }
    const [skills, commands, agents, hooks, mcpServers] = await Promise.all([
      countSkillsDir(path.join(abs, 'skills')),
      countMarkdownFiles(path.join(abs, 'commands')),
      countMarkdownFiles(path.join(abs, 'agents')),
      countHooksJson(path.join(abs, 'hooks', 'hooks.json')),
      countMcpServers(path.join(abs, '.mcp.json')),
    ]);
    return { skills, commands, agents, hooks, mcpServers };
  }

  private async resolveCurrentProjectPath(slug?: string): Promise<string | undefined> {
    if (!slug) return undefined;
    try {
      return await projectService.resolveOriginalPath(slug);
    } catch {
      return undefined;
    }
  }

  private safeParse<T>(content: string, fallback: T): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      return fallback;
    }
  }
}

export const marketplaceService = new MarketplaceService();
