/**
 * Story 28.2: Harness skill service.
 *
 * Combines three sources of `<root>/skills/<name>/` directories — the active
 * project, the user-scope home, and every installed plugin bundle — into a
 * single card list used by the "Harness Workbench → Skills" panel. File I/O,
 * traversal guards, STALE_WRITE detection, and binary detection are delegated
 * to `harnessService`. The plugin source enumerates from
 * `installed_plugins.json` and supports both in-tree (~/.claude/plugins/...)
 * and dev-installed (out-of-tree) install paths — the latter goes through a
 * direct `fs` read after a manual containment check so it never escapes its
 * own `installPath`.
 *
 * frontmatter parsing uses the `yaml` (eemeli) parser so the round-trip story
 * stays consistent with `structuredEditor.ts` (no `js-yaml` for harness code).
 */

import path from 'path';
import fs from 'fs/promises';
import { parseDocument } from 'yaml';
import {
  HARNESS_ERRORS,
  type HarnessInstalledPluginEntry,
  type HarnessSkillBundleCounts,
  type HarnessSkillBundleEntry,
  type HarnessSkillCard,
  type HarnessSkillCopyRequest,
  type HarnessSkillCopyResponse,
  type HarnessSkillFrontmatter,
  type HarnessSkillListResponse,
  type HarnessSkillMalformedEntry,
  type HarnessSkillReadResponse,
  type HarnessSkillSource,
  type HarnessSkillSourceLocation,
  type HarnessSkillSourceScope,
  type HarnessSkillUpdateRequest,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';
import { applyYamlPatch } from '../utils/structuredEditor.js';
import { isBinaryFile, MAX_FILE_SIZE } from '../utils/pathUtils.js';

const BUNDLE_DIRS = ['references', 'examples', 'scripts', 'assets'] as const;

/** Maximum bundle tree depth before truncating. Prevents pathological trees. */
const BUNDLE_TREE_MAX_DEPTH = 4;

/** Priority used to pick a card's `activeScope` when multiple sources exist. */
const SCOPE_PRIORITY: Record<HarnessSkillSourceScope, number> = {
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
  return (err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code;
}

class HarnessSkillService {
  // ---- public surface ----------------------------------------------------

  /**
   * Enumerate skills across project / user / plugin sources and merge entries
   * sharing the same directory name into a single card.
   */
  async listCards(currentProjectSlug?: string): Promise<HarnessSkillListResponse> {
    const sources = new Map<string, HarnessSkillSource[]>();
    const malformed: HarnessSkillMalformedEntry[] = [];

    // Project source — only when a slug is provided.
    if (currentProjectSlug) {
      try {
        await this.enumerateProjectSkills(currentProjectSlug, sources, malformed);
      } catch (err) {
        // A missing or unresolved project is not fatal — the panel still
        // renders user/plugin cards. Re-throw any unexpected failure so the
        // controller can surface it as a 500.
        if (
          (err as NodeJS.ErrnoException)?.code !== HARNESS_ERRORS.HARNESS_ROOT_MISSING.code
        ) {
          throw err;
        }
      }
    }

    // User source.
    await this.enumerateUserSkills(sources, malformed);

    // Plugin sources — every installed plugin bundle, regardless of enabled state.
    await this.enumeratePluginSkills(sources, malformed);

    const cards: HarnessSkillCard[] = [];
    for (const [name, entries] of sources) {
      // Sort sources by priority so `sources[0]` is the active one.
      entries.sort((a, b) => SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope]);
      const active = entries[0];
      cards.push({
        name,
        description: active.frontmatter.description,
        version: active.frontmatter.version,
        sources: entries,
        activeScope: active.scope,
      });
    }

    // Stable-sort by name so the UI never shifts cards around between loads.
    cards.sort((a, b) => a.name.localeCompare(b.name));

    return { cards, malformed };
  }

  /**
   * Read a single skill's SKILL.md plus the bundle file tree. Returns the
   * frontmatter, the body separately, the raw text (for the Raw editor) and a
   * flat list of bundle entries with binary / truncation flags pre-resolved.
   */
  async readSkill(source: HarnessSkillSourceLocation): Promise<HarnessSkillReadResponse> {
    const skillRoot = source.absoluteRoot;
    const skillMd = path.join(skillRoot, 'SKILL.md');

    let raw: string;
    let mtime: string;
    try {
      const stat = await fs.stat(skillMd);
      if (!stat.isFile()) {
        throwMapped(HARNESS_ERRORS.HARNESS_SKILL_NOT_FOUND.code, 'SKILL.md is not a regular file');
      }
      raw = await fs.readFile(skillMd, 'utf-8');
      mtime = stat.mtime.toISOString();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throwMapped(HARNESS_ERRORS.HARNESS_SKILL_NOT_FOUND.code, `skill not found: ${source.absoluteRoot}`);
      }
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throw err;
    }

    const split = splitFrontmatter(raw);
    if (!split) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'SKILL.md has no YAML frontmatter');
    }

    const frontmatter = parseFrontmatterFromBlock(split.frontmatter);
    if (!frontmatter) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'SKILL.md frontmatter failed validation');
    }

    const bundleCounts = await this.countBundle(skillRoot);
    const { entries: bundleEntries, truncatedAtDepth } = await this.collectBundleEntries(skillRoot);

    return {
      source,
      frontmatter,
      body: split.body,
      raw,
      bundleCounts,
      skillMdMtime: mtime,
      bundleEntries,
      truncatedAtDepth,
    };
  }

  /**
   * Apply a frontmatter / body / raw update against an existing SKILL.md.
   * Plugin scope is read-only — any update against a plugin source is denied
   * with HARNESS_FORBIDDEN.
   */
  async updateSkill(
    source: HarnessSkillSourceLocation,
    body: HarnessSkillUpdateRequest,
  ): Promise<{ success: true; mtime: string }> {
    if (source.scope === 'plugin') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin-scope skills are read-only');
    }

    const ref = this.refForEditableSource(source);

    // Raw replace bypasses every per-block helper. The frontmatter is parsed
    // once locally so we surface a 422 before touching disk if it is broken.
    if (body.raw !== undefined) {
      const split = splitFrontmatter(body.raw);
      if (!split || !parseFrontmatterFromBlock(split.frontmatter)) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'raw payload has no valid frontmatter');
      }
      const written = await harnessService.write(ref, {
        content: body.raw,
        expectedMtime: body.expectedMtime,
      });
      return { success: true, mtime: written.mtime };
    }

    // For frontmatter / body updates we read the current file once, mutate the
    // requested block, and write the merged result. Reading inside the same
    // call also lets us reuse the freshly-observed mtime when the caller
    // supplies both `frontmatter` and `body` — otherwise the second write
    // would falsely flag STALE_WRITE on the mtime that was authoritative
    // before the first write.
    const current = await harnessService.read(ref);
    const text = current.content ?? '';
    const baseSplit = splitFrontmatter(text);
    if (!baseSplit) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'existing SKILL.md has no frontmatter');
    }

    let nextFrontmatter = baseSplit.frontmatter;
    if (body.frontmatter) {
      nextFrontmatter = this.applyFrontmatterPatch(baseSplit.frontmatter, body.frontmatter);
    }

    const nextBody = body.body !== undefined ? body.body : baseSplit.body;
    const merged = composeSkillMd(nextFrontmatter, nextBody);

    const expectedMtime = body.expectedMtime ?? current.mtime;
    const written = await harnessService.write(ref, { content: merged, expectedMtime });
    return { success: true, mtime: written.mtime };
  }

  /**
   * Recursively copy a skill folder. The destination is always a project or
   * user scope — copies *into* a plugin bundle are blocked by Zod at the
   * controller layer, but we re-assert here as a defensive belt.
   */
  async copySkill(req: HarnessSkillCopyRequest): Promise<HarnessSkillCopyResponse> {
    if (req.sourceScope === req.targetScope && req.sourceName === req.targetName) {
      // project→project / user→user with the same name — nothing to do that
      // would produce a meaningful new card. Push the user toward rename mode.
      throwMapped(
        HARNESS_ERRORS.HARNESS_SKILL_NAME_CONFLICT.code,
        'same-scope copy must use a different targetName',
      );
    }

    const srcRoot = await this.resolveSkillRoot({
      scope: req.sourceScope,
      projectSlug: req.sourceProjectSlug,
      pluginKey: req.sourcePluginKey,
      name: req.sourceName,
    });
    try {
      const stat = await fs.stat(srcRoot);
      if (!stat.isDirectory()) {
        throwMapped(HARNESS_ERRORS.HARNESS_SKILL_NOT_FOUND.code, 'skill source is not a directory');
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throwMapped(HARNESS_ERRORS.HARNESS_SKILL_NOT_FOUND.code, 'skill source not found');
      }
      throw err;
    }

    const dstRoot = await this.resolveSkillRoot({
      scope: req.targetScope,
      projectSlug: req.targetProjectSlug,
      name: req.targetName,
    });

    let skipped = false;
    const finalName = req.targetName;
    const dstExists = await pathExists(dstRoot);

    if (dstExists) {
      switch (req.onConflict) {
        case 'skip':
          skipped = true;
          return { success: true, copied: 0, skipped, finalName };
        case 'overwrite':
          await fs.rm(dstRoot, { recursive: true, force: true });
          break;
        case 'rename': {
          // The caller is expected to have prompted for a new name and to
          // submit it as `targetName`. If that name collides too, we surface
          // 409 so the UI re-prompts rather than silently overwriting.
          throwMapped(
            HARNESS_ERRORS.HARNESS_SKILL_NAME_CONFLICT.code,
            `target name already in use: ${req.targetName}`,
          );
        }
      }
    }

    await fs.mkdir(path.dirname(dstRoot), { recursive: true });

    try {
      await fs.cp(srcRoot, dstRoot, { recursive: true, dereference: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EXDEV' || code === 'EACCES') {
        // Surface as HARNESS_WRITE_ERROR with a typed cause so the client can
        // route to the dedicated cross-device toast (Risk Mitigation #2).
        throwMapped(
          HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
          'cross-device copy failed',
          { cause: 'cross-device' },
        );
      }
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, `copy failed: ${(err as Error).message}`);
    }

    const copied = await countFilesRecursive(dstRoot);
    return { success: true, copied, skipped: false, finalName };
  }

  // ---- enumeration -------------------------------------------------------

  private async enumerateProjectSkills(
    projectSlug: string,
    sources: Map<string, HarnessSkillSource[]>,
    malformed: HarnessSkillMalformedEntry[],
  ): Promise<void> {
    const list = await harnessService.list({
      scope: 'project',
      projectSlug,
      relativePath: 'skills',
    });
    for (const entry of list.entries) {
      if (entry.type !== 'directory') continue;
      const absoluteRoot = path.join(list.resolvedRoot, 'skills', entry.name);
      await this.collectSourceFromRoot(
        { scope: 'project', absoluteRoot, projectSlug },
        entry.name,
        sources,
        malformed,
      );
    }
  }

  private async enumerateUserSkills(
    sources: Map<string, HarnessSkillSource[]>,
    malformed: HarnessSkillMalformedEntry[],
  ): Promise<void> {
    const list = await harnessService.list({ scope: 'user', relativePath: 'skills' });
    for (const entry of list.entries) {
      if (entry.type !== 'directory') continue;
      const absoluteRoot = path.join(list.resolvedRoot, 'skills', entry.name);
      await this.collectSourceFromRoot(
        { scope: 'user', absoluteRoot },
        entry.name,
        sources,
        malformed,
      );
    }
  }

  private async enumeratePluginSkills(
    sources: Map<string, HarnessSkillSource[]>,
    malformed: HarnessSkillMalformedEntry[],
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
          // Malformed catalog — skip plugin enumeration but do not abort the
          // whole listCards call (project / user lists already populated).
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
        const skillsDir = path.join(entry.installPath, 'skills');
        let dirEntries: { name: string; isDirectory: boolean }[] = [];
        try {
          const raw = await fs.readdir(skillsDir, { withFileTypes: true });
          dirEntries = raw.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
        } catch {
          // No skills/ subdirectory in this bundle.
          continue;
        }
        for (const dirent of dirEntries) {
          if (!dirent.isDirectory) continue;
          const absoluteRoot = path.join(skillsDir, dirent.name);
          // Defensive containment guard for dev-installed (out-of-tree)
          // plugins — the absolute path must remain under installPath.
          const abs = path.resolve(absoluteRoot);
          const root = path.resolve(entry.installPath);
          if (abs !== root && !abs.startsWith(root + path.sep)) continue;
          await this.collectSourceFromRoot(
            { scope: 'plugin', absoluteRoot, pluginKey },
            dirent.name,
            sources,
            malformed,
          );
        }
      }
    }
  }

  private async collectSourceFromRoot(
    location: HarnessSkillSourceLocation,
    skillName: string,
    sources: Map<string, HarnessSkillSource[]>,
    malformed: HarnessSkillMalformedEntry[],
  ): Promise<void> {
    const skillMd = path.join(location.absoluteRoot, 'SKILL.md');
    let stat;
    try {
      stat = await fs.stat(skillMd);
      if (!stat.isFile()) return;
    } catch {
      return; // No SKILL.md → not a real skill folder; ignore silently.
    }

    let text: string;
    try {
      text = await fs.readFile(skillMd, 'utf-8');
    } catch {
      malformed.push(this.malformedEntry(location, 'failed to read SKILL.md'));
      return;
    }

    const split = splitFrontmatter(text);
    if (!split) {
      malformed.push(this.malformedEntry(location, 'missing YAML frontmatter'));
      return;
    }
    const frontmatter = parseFrontmatterFromBlock(split.frontmatter);
    if (!frontmatter) {
      malformed.push(
        this.malformedEntry(location, 'frontmatter missing required name/description'),
      );
      return;
    }

    // List path intentionally skips bundle file counting — counting four
    // bundle directories per skill via recursive readdir is the dominant
    // server cost for the panel. The detail view (`readSkill()`) still
    // reports bundle counts for the editor modal.
    const source: HarnessSkillSource = {
      ...location,
      frontmatter,
      skillMdMtime: stat.mtime.toISOString(),
    };
    const list = sources.get(skillName);
    if (list) {
      list.push(source);
    } else {
      sources.set(skillName, [source]);
    }
  }

  private malformedEntry(
    location: HarnessSkillSourceLocation,
    reason: string,
  ): HarnessSkillMalformedEntry {
    return {
      scope: location.scope,
      absoluteRoot: location.absoluteRoot,
      pluginKey: location.pluginKey,
      projectSlug: location.projectSlug,
      reason,
    };
  }

  // ---- bundle helpers ----------------------------------------------------

  private async countBundle(skillRoot: string): Promise<HarnessSkillBundleCounts> {
    const counts: HarnessSkillBundleCounts = {
      references: 0,
      examples: 0,
      scripts: 0,
      assets: 0,
    };
    for (const dir of BUNDLE_DIRS) {
      counts[dir] = await countFilesRecursive(path.join(skillRoot, dir));
    }
    return counts;
  }

  private async collectBundleEntries(
    skillRoot: string,
  ): Promise<{ entries: HarnessSkillBundleEntry[]; truncatedAtDepth: boolean }> {
    const entries: HarnessSkillBundleEntry[] = [];
    let truncatedAtDepth = false;

    const walk = async (relativeBase: string, absDir: string, depth: number): Promise<void> => {
      if (depth > BUNDLE_TREE_MAX_DEPTH) {
        truncatedAtDepth = true;
        return;
      }
      let dirents: import('fs').Dirent[];
      try {
        dirents = await fs.readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of dirents) {
        const childAbs = path.join(absDir, ent.name);
        const childRel = relativeBase ? `${relativeBase}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          await walk(childRel, childAbs, depth + 1);
          continue;
        }
        if (!ent.isFile()) continue;
        try {
          const stat = await fs.stat(childAbs);
          let isBinary = false;
          if (stat.size > 0) {
            try {
              isBinary = await isBinaryFile(childAbs);
            } catch {
              isBinary = false;
            }
          }
          entries.push({
            relativePath: childRel,
            isBinary,
            isTruncated: stat.size > MAX_FILE_SIZE,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          });
        } catch {
          // Skip unstat-able entries (broken symlinks, permission edge cases).
        }
      }
    };

    for (const dir of BUNDLE_DIRS) {
      await walk(dir, path.join(skillRoot, dir), 1);
    }
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return { entries, truncatedAtDepth };
  }

  // ---- update helpers ----------------------------------------------------

  /**
   * Build the harnessService path reference for an editable (project or user)
   * source. Plugin scope is rejected by the caller before this runs.
   */
  private refForEditableSource(source: HarnessSkillSourceLocation): {
    scope: 'user' | 'project';
    projectSlug?: string;
    relativePath: string;
  } {
    // Reuse the directory name on disk — sourceLocation absoluteRoot ends with
    // the skill directory, so we derive the relative path back from the root.
    const skillDirName = path.basename(source.absoluteRoot);
    if (source.scope === 'project') {
      if (!source.projectSlug) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
          'project skill source missing projectSlug',
        );
      }
      return {
        scope: 'project',
        projectSlug: source.projectSlug,
        relativePath: `skills/${skillDirName}/SKILL.md`,
      };
    }
    return {
      scope: 'user',
      relativePath: `skills/${skillDirName}/SKILL.md`,
    };
  }

  /**
   * Apply a frontmatter form patch by routing through the YAML round-trip
   * editor on the frontmatter block alone. Comments / quoting / key order are
   * preserved exactly the same way `harnessService.patchStructured` would for
   * a pure-YAML file — but since SKILL.md is a hybrid file, we run the patch
   * on the extracted block and recompose the full text afterwards.
   */
  private applyFrontmatterPatch(
    block: string,
    patch: Partial<HarnessSkillFrontmatter>,
  ): string {
    const ops: { path: (string | number)[]; value: unknown | undefined }[] = [];
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      ops.push({ path: ['name'], value: patch.name });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      ops.push({ path: ['description'], value: patch.description });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'version')) {
      // version is optional — undefined / empty string deletes the key.
      const next = patch.version;
      ops.push({
        path: ['version'],
        value: next === undefined || next === '' ? undefined : next,
      });
    }
    if (ops.length === 0) return block;
    return applyYamlPatch(block, ops);
  }

  // ---- root resolution ---------------------------------------------------

  private async resolveSkillRoot(input: {
    scope: HarnessSkillSourceScope;
    projectSlug?: string;
    pluginKey?: string;
    name: string;
  }): Promise<string> {
    if (!input.name || input.name.includes('/') || input.name.includes('\\')) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
        'skill name must not contain path separators',
      );
    }
    if (input.scope === 'project') {
      if (!input.projectSlug) {
        throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'project scope requires projectSlug');
      }
      const projectRoot = await projectService.resolveOriginalPath(input.projectSlug);
      return path.join(projectRoot, '.claude', 'skills', input.name);
    }
    if (input.scope === 'user') {
      return path.join(getUserHarnessRoot(), 'skills', input.name);
    }
    // plugin
    if (!input.pluginKey) {
      throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'plugin scope requires pluginKey');
    }
    const installPath = await this.resolvePluginInstallPath(input.pluginKey);
    if (!installPath) {
      throwMapped(HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code, `plugin not installed: ${input.pluginKey}`);
    }
    return path.join(installPath, 'skills', input.name);
  }

  private async resolvePluginInstallPath(pluginKey: string): Promise<string | undefined> {
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
}

// ---- pure helpers --------------------------------------------------------

/** Result of `splitFrontmatter`. */
interface SplitResult {
  /** YAML block between the opening and closing `---`, exclusive (trimmed of one trailing newline). */
  frontmatter: string;
  /** Body after the closing `---\n`. */
  body: string;
}

/**
 * Split a SKILL.md text into its frontmatter block and body. Returns null
 * when the file does not start with a `---` fence followed by another fence
 * later — i.e. there is no recognizable frontmatter to operate on.
 */
function splitFrontmatter(text: string): SplitResult | null {
  // Tolerate a leading BOM / CRLF mix without surprising the regex.
  // eslint-disable-next-line no-irregular-whitespace
  const normalized = text.replace(/^﻿/, '');
  const opener = /^---\r?\n/;
  const m = opener.exec(normalized);
  if (!m) return null;
  const afterOpen = normalized.slice(m[0].length);
  const closer = /\r?\n---\r?\n/.exec(afterOpen);
  if (!closer) return null;
  const frontmatter = afterOpen.slice(0, closer.index);
  const body = afterOpen.slice(closer.index + closer[0].length);
  return { frontmatter, body };
}

/**
 * Parse the YAML frontmatter block and validate the required fields. Returns
 * undefined when the block is unparseable or missing `name`/`description`.
 */
function parseFrontmatterFromBlock(block: string): HarnessSkillFrontmatter | undefined {
  let parsed: unknown;
  try {
    parsed = parseDocument(block).toJS();
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const rec = parsed as Record<string, unknown>;
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  const description = typeof rec.description === 'string' ? rec.description.trim() : '';
  if (!name || !description) return undefined;
  const result: HarnessSkillFrontmatter = { name, description };
  if (typeof rec.version === 'string' && rec.version.trim() !== '') {
    result.version = rec.version;
  }
  return result;
}

/** Stitch a YAML frontmatter block back together with a body, preserving the canonical fence layout. */
function composeSkillMd(frontmatter: string, body: string): string {
  // Always ensure the frontmatter block ends with exactly one newline so the
  // closing fence sits on its own line.
  const fm = frontmatter.endsWith('\n') ? frontmatter : `${frontmatter}\n`;
  return `---\n${fm}---\n${body}`;
}

/** Recursively count regular files under `dir`. Missing/unreachable dirs → 0. */
async function countFilesRecursive(dir: string): Promise<number> {
  let count = 0;
  let dirents: import('fs').Dirent[];
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of dirents) {
    if (ent.isDirectory()) {
      count += await countFilesRecursive(path.join(dir, ent.name));
    } else if (ent.isFile()) {
      count += 1;
    }
  }
  return count;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export const harnessSkillService = new HarnessSkillService();
