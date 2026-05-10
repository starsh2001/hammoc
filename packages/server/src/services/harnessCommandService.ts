/**
 * Story 28.5: Harness slash-command service.
 *
 * Combines three sources of `.claude/commands/**\/*.md` files into a single tree:
 *   - <projectRoot>/.claude/commands/   (project scope)
 *   - ~/.claude/commands/               (user scope)
 *   - <pluginInstallPath>/commands/     (plugin scope, read-only)
 *
 * Each leaf .md file becomes one card. Frontmatter is YAML (round-trip via
 * `yaml`(eemeli) — see `applyYamlFrontmatterPatch`); body is plain markdown.
 * Path enumeration runs in parallel both across scopes and across files within
 * each scope (Risk #4 mitigation — Promise.all, no serial for-await).
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'yaml';
import {
  HARNESS_ERRORS,
  type HarnessCommandCard,
  type HarnessCommandCopyRequest,
  type HarnessCommandCopyResponse,
  type HarnessCommandCreateRequest,
  type HarnessCommandCreateResponse,
  type HarnessCommandDeleteRequest,
  type HarnessCommandDirectoryCopyRequest,
  type HarnessCommandDirectoryCopyResponse,
  type HarnessCommandFrontmatter,
  type HarnessCommandListResponse,
  type HarnessCommandMalformedEntry,
  type HarnessCommandModel,
  type HarnessCommandReadResponse,
  type HarnessCommandSourceLocation,
  type HarnessCommandSourceScope,
  type HarnessCommandTokens,
  type HarnessCommandUpdateRequest,
  type HarnessCommandUpdateResponse,
  type HarnessInstalledPluginEntry,
  type HarnessPathRef,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';
import { detectSecretsInText as detectSecretsInTextCanonical } from '../utils/secretHeuristic.js';
import { assertNoSecretOnShared } from '../utils/assertNoSecretOnShared.js';
import {
  applyYamlFrontmatterPatch,
  splitFrontmatterAndBody,
} from './utils/applyYamlFrontmatterPatch.js';

const SCOPE_PRIORITY: Record<HarnessCommandSourceScope, number> = {
  project: 0,
  user: 1,
  plugin: 2,
};

const ALLOWED_MODELS: ReadonlySet<string> = new Set<HarnessCommandModel>([
  'inherit',
  'sonnet',
  'opus',
  'haiku',
]);

const COMMANDS_DIR = 'commands';
const MAX_WALK_DEPTH = 32;

// Story 30.1 (Task 1.2): SECRET_PATTERNS / ENV_REF_RE moved to
// `utils/secretHeuristic.ts`. The wrappers below adapt the canonical entry
// point to this service's existing `{ matched, lines }` shape.

const POSITIONAL_ARG_RE = /\$([1-9]\d*)\b/;
const ARGUMENTS_ALL_RE = /\$ARGUMENTS\b/;
const FILE_REF_RE = /(?:^|\s)@([\w./-]+)/;
const BASH_EXEC_RE = /!`[^`]+`/;
const PLUGIN_ROOT_RE = /\$\{CLAUDE_PLUGIN_ROOT\}/;
const BMAD_MARKER_RE = /<!--\s*Powered\s+by\s+BMAD™?\s+Core\s*-->/i;

// eslint-disable-next-line no-control-regex -- OS-reserved control chars are intentional here
const RESERVED_CHARS_RE = /[\\<>:"|?*\x00-\x1F]/;
const TRAILING_DOT_OR_SPACE_RE = /[. ]$/;

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

interface InstalledPluginsFile {
  plugins?: Record<string, HarnessInstalledPluginEntry[] | HarnessInstalledPluginEntry>;
}

// ---------------------------------------------------------------------------
// Path / slash-name conversion
// ---------------------------------------------------------------------------

/** `.md` relative path under commands root → `/A:B:foo` slash name. */
function deriveSlashName(relPathPosix: string): string {
  const noExt = relPathPosix.replace(/\.md$/i, '');
  return `/${noExt.replace(/\//g, ':')}`;
}

function toPosixRelative(rel: string): string {
  return rel.replace(/\\/g, '/');
}

/**
 * Validate a relative path under the commands root: forward slashes allowed,
 * OS reserved chars / trailing space-or-dot / `..` traversal rejected,
 * `.md` extension required.
 */
function validateRelativePath(relPosix: string): void {
  if (!relPosix.endsWith('.md')) {
    throwMapped(
      HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
      'relativePath must end in .md',
    );
  }
  if (relPosix.includes('..')) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'path traversal denied');
  }
  for (const segment of relPosix.split('/')) {
    if (segment.length === 0) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'empty path segment not allowed',
      );
    }
    if (RESERVED_CHARS_RE.test(segment)) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'OS-reserved characters not allowed in path segments',
      );
    }
    if (TRAILING_DOT_OR_SPACE_RE.test(segment)) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'path segments cannot end with space or dot',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Token / secret / parse helpers
// ---------------------------------------------------------------------------

function analyzeTokens(body: string): HarnessCommandTokens {
  return {
    usesPositionalArgs: POSITIONAL_ARG_RE.test(body),
    usesArgumentsAll: ARGUMENTS_ALL_RE.test(body),
    usesFileRefs: FILE_REF_RE.test(body),
    usesBashExec: BASH_EXEC_RE.test(body),
    usesPluginRoot: PLUGIN_ROOT_RE.test(body),
  };
}

/** Detect the BMad mirror marker within the first 10 lines of the body. */
function detectBmadMirror(body: string): boolean {
  const head = body.split(/\r?\n/).slice(0, 10).join('\n');
  return BMAD_MARKER_RE.test(head);
}

function detectSecretsInText(text: string): { matched: boolean; lines: number[] } {
  const { matched, lines } = detectSecretsInTextCanonical(text);
  return { matched, lines };
}

function detectSecretsInRaw(raw: string): { matched: boolean; lines: number[] } {
  return detectSecretsInText(raw);
}

function parseFrontmatterYaml(raw: string | null): HarnessCommandFrontmatter {
  if (raw === null || raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = yaml.parse(raw);
  } catch (cause) {
    throwMapped(
      HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
      `failed to parse frontmatter: ${(cause as Error).message}`,
    );
  }
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throwMapped(
      HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
      'frontmatter must be a YAML mapping',
    );
  }
  const obj = parsed as Record<string, unknown>;
  const out: HarnessCommandFrontmatter = {};
  if (typeof obj.description === 'string') out.description = obj.description;
  if (typeof obj['argument-hint'] === 'string') out['argument-hint'] = obj['argument-hint'] as string;
  if (typeof obj['allowed-tools'] === 'string') out['allowed-tools'] = obj['allowed-tools'] as string;
  if (typeof obj.model === 'string' && ALLOWED_MODELS.has(obj.model)) {
    out.model = obj.model as HarnessCommandModel;
  }
  return out;
}

function frontmatterToPatchObject(
  fm: HarnessCommandFrontmatter,
): Record<string, unknown> {
  return {
    description: fm.description,
    'argument-hint': fm['argument-hint'],
    'allowed-tools': fm['allowed-tools'],
    model: fm.model,
  };
}

// ---------------------------------------------------------------------------
// Roots / containment
// ---------------------------------------------------------------------------

function userCommandsRoot(): string {
  return path.join(getUserHarnessRoot(), COMMANDS_DIR);
}

async function projectCommandsRoot(projectSlug: string): Promise<string> {
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  return path.join(projectRoot, '.claude', COMMANDS_DIR);
}

function pluginCommandsRoots(installPath: string): string[] {
  return [path.join(installPath, COMMANDS_DIR)];
}

function withinRoot(absolute: string, root: string): boolean {
  const resolved = path.resolve(absolute);
  const resolvedRoot = path.resolve(root);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

async function readInstalledPlugins(): Promise<InstalledPluginsFile> {
  try {
    const res = await harnessService.read({
      scope: 'user',
      relativePath: 'plugins/installed_plugins.json',
    });
    const trimmed = (res.content ?? '').trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed) as InstalledPluginsFile;
    } catch {
      return {};
    }
  } catch (err) {
    if (isFileNotFound(err)) return {};
    throw err;
  }
}

async function walkMdFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > MAX_WALK_DEPTH) return [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const promises = entries.map(async (entry) => {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walkMdFiles(abs, depth + 1);
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      return [abs];
    }
    return [];
  });
  const nested = await Promise.all(promises);
  return nested.flat();
}

// ---------------------------------------------------------------------------
// Card construction (file → card)
// ---------------------------------------------------------------------------

interface ReadFileResult {
  raw: string;
  mtime: string;
  frontmatter: HarnessCommandFrontmatter;
  body: string;
}

async function readMdFile(absolute: string): Promise<ReadFileResult | { malformed: string }> {
  let stat: import('fs').Stats;
  try {
    stat = await fs.stat(absolute);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { malformed: 'file not found' };
    }
    throw err;
  }
  if (!stat.isFile()) {
    return { malformed: 'not a regular file' };
  }
  let raw: string;
  try {
    raw = await fs.readFile(absolute, 'utf-8');
  } catch {
    return { malformed: 'failed to read' };
  }
  const { frontmatterRaw, body } = splitFrontmatterAndBody(raw);
  let frontmatter: HarnessCommandFrontmatter;
  try {
    frontmatter = parseFrontmatterYaml(frontmatterRaw);
  } catch (err) {
    return { malformed: (err as Error).message };
  }
  return { raw, mtime: stat.mtime.toISOString(), frontmatter, body };
}

function makeCard(
  scope: HarnessCommandSourceScope,
  rootAbs: string,
  fileAbs: string,
  frontmatter: HarnessCommandFrontmatter,
  body: string,
  mtime: string,
  extra: { projectSlug?: string; pluginKey?: string },
): HarnessCommandCard {
  const relativePath = toPosixRelative(path.relative(rootAbs, fileAbs));
  return {
    scope,
    absoluteFile: fileAbs,
    pluginKey: extra.pluginKey,
    projectSlug: extra.projectSlug,
    relativePath,
    slashName: deriveSlashName(relativePath),
    frontmatter,
    tokens: analyzeTokens(body),
    mtime,
    isBmadMirror: detectBmadMirror(body),
  };
}

async function enumerateScopeCommands(
  scope: HarnessCommandSourceScope,
  rootAbs: string,
  extra: { projectSlug?: string; pluginKey?: string },
): Promise<{ cards: HarnessCommandCard[]; malformed: HarnessCommandMalformedEntry[] }> {
  const files = await walkMdFiles(rootAbs);
  const reads = files.map(async (abs) => {
    const result = await readMdFile(abs);
    if ('malformed' in result) {
      return { kind: 'malformed' as const, entry: { abs, reason: result.malformed } };
    }
    return {
      kind: 'card' as const,
      card: makeCard(scope, rootAbs, abs, result.frontmatter, result.body, result.mtime, extra),
    };
  });
  const settled = await Promise.all(reads);
  const cards: HarnessCommandCard[] = [];
  const malformed: HarnessCommandMalformedEntry[] = [];
  for (const r of settled) {
    if (r.kind === 'card') cards.push(r.card);
    else malformed.push({
      scope,
      absoluteFile: r.entry.abs,
      pluginKey: extra.pluginKey,
      projectSlug: extra.projectSlug,
      reason: r.entry.reason,
    });
  }
  return { cards, malformed };
}

async function enumeratePluginCommands(): Promise<{
  cards: HarnessCommandCard[];
  malformed: HarnessCommandMalformedEntry[];
}> {
  const installed = await readInstalledPlugins();
  const plugins = installed.plugins ?? {};
  const tasks: Array<Promise<{ cards: HarnessCommandCard[]; malformed: HarnessCommandMalformedEntry[] }>> = [];
  for (const [pluginKey, value] of Object.entries(plugins)) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (!entry?.installPath || typeof entry.installPath !== 'string') continue;
      for (const root of pluginCommandsRoots(entry.installPath)) {
        tasks.push(
          (async () => {
            // Path containment: every walked file must remain under installPath.
            try {
              const stat = await fs.stat(root);
              if (!stat.isDirectory()) return { cards: [], malformed: [] };
            } catch {
              return { cards: [], malformed: [] };
            }
            const installRoot = path.resolve(entry.installPath);
            if (!withinRoot(root, installRoot)) {
              return { cards: [], malformed: [] };
            }
            const out = await enumerateScopeCommands('plugin', root, { pluginKey });
            // Filter any walked file that escaped containment (defensive).
            out.cards = out.cards.filter((c) => withinRoot(c.absoluteFile, installRoot));
            return out;
          })(),
        );
      }
    }
  }
  const settled = await Promise.all(tasks);
  const cards: HarnessCommandCard[] = [];
  const malformed: HarnessCommandMalformedEntry[] = [];
  for (const part of settled) {
    cards.push(...part.cards);
    malformed.push(...part.malformed);
  }
  return { cards, malformed };
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

async function resolveCommandsRoot(
  scope: HarnessCommandSourceScope,
  projectSlug?: string,
  pluginKey?: string,
): Promise<{ root: string; pluginInstallRoot?: string }> {
  if (scope === 'project') {
    if (!projectSlug) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
        'projectSlug required for scope=project',
      );
    }
    return { root: await projectCommandsRoot(projectSlug) };
  }
  if (scope === 'user') {
    return { root: userCommandsRoot() };
  }
  if (!pluginKey) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'pluginKey required for scope=plugin');
  }
  const installed = await readInstalledPlugins();
  const raw = installed.plugins?.[pluginKey];
  const entries = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const first = entries.find((e) => typeof e?.installPath === 'string');
  if (!first?.installPath) {
    throwMapped(
      HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code,
      `plugin not installed: ${pluginKey}`,
    );
  }
  return { root: path.join(first.installPath, COMMANDS_DIR), pluginInstallRoot: path.resolve(first.installPath) };
}

async function resolveAbsoluteFile(
  scope: HarnessCommandSourceScope,
  relPosix: string,
  projectSlug?: string,
  pluginKey?: string,
): Promise<{ abs: string; root: string; pluginInstallRoot?: string }> {
  validateRelativePath(relPosix);
  const { root, pluginInstallRoot } = await resolveCommandsRoot(scope, projectSlug, pluginKey);
  const native = relPosix.split('/').join(path.sep);
  const abs = path.resolve(root, native);
  if (!withinRoot(abs, root)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'path escapes commands root');
  }
  if (pluginInstallRoot && !withinRoot(abs, pluginInstallRoot)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'plugin file escapes installPath');
  }
  return { abs, root, pluginInstallRoot };
}

function makeSourceLocation(
  scope: HarnessCommandSourceScope,
  abs: string,
  relPosix: string,
  projectSlug?: string,
  pluginKey?: string,
): HarnessCommandSourceLocation {
  return {
    scope,
    absoluteFile: abs,
    pluginKey,
    projectSlug,
    relativePath: relPosix,
    slashName: deriveSlashName(relPosix),
  };
}

// ---------------------------------------------------------------------------
// Build the chat slash-palette dedup set (same logic as commandService.scanAgents/scanTasks)
// ---------------------------------------------------------------------------

interface BmadCoreScan {
  slashPrefix: string;
  agentIds: Set<string>;
  taskNames: Set<string>;
}

async function scanBmadCoreSlashNames(projectSlug: string): Promise<BmadCoreScan | null> {
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  const bmadRoot = path.join(projectRoot, '.bmad-core');
  try {
    const stat = await fs.stat(bmadRoot);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  let slashPrefix = 'BMad';
  try {
    const cfg = await fs.readFile(path.join(bmadRoot, 'core-config.yaml'), 'utf-8');
    const parsed = yaml.parse(cfg) as { slashPrefix?: string } | null;
    if (parsed && typeof parsed.slashPrefix === 'string' && parsed.slashPrefix.length > 0) {
      slashPrefix = parsed.slashPrefix;
    }
  } catch {
    // default 'BMad'
  }
  const agentIds = new Set<string>();
  try {
    const files = await fs.readdir(path.join(bmadRoot, 'agents'));
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      // Use file basename as agent id fallback — commandService uses YAML
      // parse, but for de-dup we only need the slash-name string match. The
      // BMad mirror file name is `<id>.md` so the basename equals the id.
      agentIds.add(f.replace(/\.md$/, ''));
    }
  } catch {
    // no agents dir
  }
  const taskNames = new Set<string>();
  try {
    const files = await fs.readdir(path.join(bmadRoot, 'tasks'));
    for (const f of files) {
      if (f.endsWith('.md')) taskNames.add(f.replace(/\.md$/, ''));
    }
  } catch {
    // no tasks dir
  }
  return { slashPrefix, agentIds, taskNames };
}

function bmadPaletteSlashNames(scan: BmadCoreScan): Set<string> {
  const out = new Set<string>();
  for (const id of scan.agentIds) out.add(`/${scan.slashPrefix}:agents:${id}`);
  for (const name of scan.taskNames) out.add(`/${scan.slashPrefix}:tasks:${name}`);
  return out;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class HarnessCommandService {
  async listCards(currentProjectSlug?: string): Promise<HarnessCommandListResponse> {
    const projectTask: Promise<{
      cards: HarnessCommandCard[];
      malformed: HarnessCommandMalformedEntry[];
    }> = currentProjectSlug
      ? (async () => {
          try {
            const root = await projectCommandsRoot(currentProjectSlug);
            return enumerateScopeCommands('project', root, { projectSlug: currentProjectSlug });
          } catch (err) {
            if ((err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_ROOT_MISSING.code) {
              return { cards: [], malformed: [] };
            }
            throw err;
          }
        })()
      : Promise.resolve({ cards: [], malformed: [] });

    const userTask = enumerateScopeCommands('user', userCommandsRoot(), {});
    const pluginTask = enumeratePluginCommands();
    const bmadTask = currentProjectSlug ? scanBmadCoreSlashNames(currentProjectSlug) : Promise.resolve(null);

    const [projectPart, userPart, pluginPart, bmadScan] = await Promise.all([
      projectTask,
      userTask,
      pluginTask,
      bmadTask,
    ]);

    const cards = [...projectPart.cards, ...userPart.cards, ...pluginPart.cards];
    const malformed = [...projectPart.malformed, ...userPart.malformed, ...pluginPart.malformed];

    cards.sort((a, b) => {
      const sd = SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope];
      if (sd !== 0) return sd;
      return a.relativePath.localeCompare(b.relativePath);
    });

    // De-dup count vs BMad palette
    const bmadSlashes = bmadScan ? bmadPaletteSlashNames(bmadScan) : new Set<string>();
    const seen = new Set<string>();
    let paletteVisibleCount = 0;
    for (const c of cards) {
      if (bmadSlashes.has(c.slashName)) continue;
      if (seen.has(c.slashName)) continue;
      seen.add(c.slashName);
      paletteVisibleCount += 1;
    }

    return { cards, malformed, paletteVisibleCount };
  }

  async readCommand(loc: HarnessCommandSourceLocation): Promise<HarnessCommandReadResponse> {
    const result = await readMdFile(loc.absoluteFile);
    if ('malformed' in result) {
      throwMapped(HARNESS_ERRORS.HARNESS_COMMAND_NOT_FOUND.code, result.malformed);
    }
    return {
      source: loc,
      frontmatter: result.frontmatter,
      body: result.body,
      raw: result.raw,
      mtime: result.mtime,
      isBmadMirror: detectBmadMirror(result.body),
    };
  }

  async createCommand(req: HarnessCommandCreateRequest): Promise<HarnessCommandCreateResponse> {
    const relPosix = toPosixRelative(req.relativePath);
    const { abs } = await resolveAbsoluteFile(req.scope, relPosix, req.projectSlug);

    // Refuse if the target exists.
    try {
      await fs.stat(abs);
      throwMapped(
        HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code,
        `command already exists at ${relPosix}`,
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code) {
        throw err;
      }
      // ENOENT — proceed.
    }

    // Build initial body. Frontmatter only emitted when at least one field is set.
    const fm = req.frontmatter ?? {};
    const body = req.body ?? '';
    const initial = applyYamlFrontmatterPatch(body, frontmatterToPatchObject(fm));

    // Ensure parent directory exists (recursive) — ~/.claude/commands/ may not
    // exist yet on a fresh disk per AC1(a) "global directory empty / create on
    // first card".
    await fs.mkdir(path.dirname(abs), { recursive: true });

    // Use harnessService.write so the existing watcher self-write suppression
    // applies. It requires a valid HarnessPathRef → translate from scope.
    const ref = await this.buildEditableRef(req.scope, relPosix, req.projectSlug);
    const written = await harnessService.write(ref, { content: initial });

    return {
      success: true,
      source: makeSourceLocation(req.scope, abs, relPosix, req.projectSlug),
      mtime: written.mtime,
    };
  }

  async updateCommand(
    loc: HarnessCommandSourceLocation,
    body: HarnessCommandUpdateRequest,
  ): Promise<HarnessCommandUpdateResponse> {
    if (loc.scope === 'plugin') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin-scope commands are read-only');
    }
    const editableScope = loc.scope as 'project' | 'user';
    const provided = [body.frontmatter, body.body, body.raw].filter((x) => x !== undefined);
    if (provided.length !== 1) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'exactly one of frontmatter / body / raw is required',
      );
    }

    const ref = await this.buildEditableRef(editableScope, loc.relativePath, loc.projectSlug);
    const current = await harnessService.read(ref);
    const sourceText = current.content ?? '';
    if (body.expectedMtime !== undefined && body.expectedMtime !== current.mtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: current.mtime,
      });
    }

    let nextText: string;
    if (body.frontmatter !== undefined) {
      nextText = applyYamlFrontmatterPatch(sourceText, frontmatterToPatchObject(body.frontmatter));
    } else if (body.body !== undefined) {
      // Replace just the markdown portion. Keep frontmatter byte-for-byte.
      const { frontmatterRaw } = splitFrontmatterAndBody(sourceText);
      if (frontmatterRaw === null) {
        nextText = body.body;
      } else {
        // Find the closing `---\n?` delimiter end position in the source.
        const re = /^---\s*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)?/;
        const match = re.exec(sourceText);
        const head = match ? sourceText.slice(0, match[0].length) : '';
        nextText = `${head}${body.body}`;
      }
    } else {
      // raw — replace the entire file (frontmatter + body in one pass).
      nextText = body.raw!;
    }

    // Story 30.1 (AC4.b): block writes to git-tracked command files when
    // a plaintext secret is detected (matches the existing copy-flow
    // detection scope — full-text scan).
    if (editableScope === 'project') {
      const secrets = detectSecretsInText(nextText);
      await assertNoSecretOnShared({
        scope: 'project',
        projectSlug: loc.projectSlug,
        relativePath: `.claude/commands/${loc.relativePath}`,
        secretDetected: secrets.matched,
        detectedAt: { lines: secrets.lines },
      });
    }

    const written = await harnessService.write(ref, {
      content: nextText,
      expectedMtime: current.mtime,
    });

    const { body: nextBody } = splitFrontmatterAndBody(nextText);
    return {
      success: true,
      mtime: written.mtime,
      slashName: deriveSlashName(loc.relativePath),
      tokens: analyzeTokens(nextBody),
    };
  }

  async copyCommand(req: HarnessCommandCopyRequest): Promise<HarnessCommandCopyResponse> {
    const sourceRel = toPosixRelative(req.sourceRelativePath);
    const sourceResolved = await resolveAbsoluteFile(
      req.sourceScope,
      sourceRel,
      req.sourceProjectSlug,
      req.sourcePluginKey,
    );
    const sourceFile = await readMdFile(sourceResolved.abs);
    if ('malformed' in sourceFile) {
      throwMapped(HARNESS_ERRORS.HARNESS_COMMAND_NOT_FOUND.code, 'source command not found');
    }

    const secrets = detectSecretsInRaw(sourceFile.raw);
    if (secrets.matched && req.acknowledgedSecret !== true) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        'client must show the secret modal and echo acknowledgedSecret',
        {
          cause: 'secret-not-acknowledged',
          details: { secretLines: secrets.lines },
        },
      );
    }

    const targetRel = toPosixRelative(req.targetRelativePath ?? sourceRel);
    const { abs: targetAbs } = await resolveAbsoluteFile(
      req.targetScope,
      targetRel,
      req.targetProjectSlug,
    );

    let exists = false;
    try {
      const stat = await fs.stat(targetAbs);
      if (stat.isFile()) exists = true;
    } catch {
      // missing
    }

    if (exists) {
      if (req.onConflict === 'skip') {
        return {
          success: true,
          target: makeSourceLocation(req.targetScope, targetAbs, targetRel, req.targetProjectSlug),
          skipped: true,
          ...(this.collectCopyWarnings(req, sourceFile.raw)),
        };
      }
      if (req.onConflict === 'rename') {
        if (req.targetRelativePath === undefined) {
          throwMapped(
            HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code,
            'rename requires targetRelativePath',
          );
        }
        // Rename → write to the new path. If the rename target also exists,
        // surface the conflict so the client can re-prompt.
        if (toPosixRelative(req.targetRelativePath) === sourceRel) {
          throwMapped(
            HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code,
            'target path equals existing conflicting path',
          );
        }
      }
      // overwrite → fall through
    }

    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    const targetRef = await this.buildEditableRef(req.targetScope, targetRel, req.targetProjectSlug);
    await harnessService.write(targetRef, { content: sourceFile.raw });

    return {
      success: true,
      target: makeSourceLocation(req.targetScope, targetAbs, targetRel, req.targetProjectSlug),
      skipped: false,
      ...(this.collectCopyWarnings(req, sourceFile.raw)),
    };
  }

  async copyDirectory(
    req: HarnessCommandDirectoryCopyRequest,
  ): Promise<HarnessCommandDirectoryCopyResponse> {
    const sourceDirPosix = toPosixRelative(req.sourceDirectoryPath).replace(/\/+$/, '');
    if (sourceDirPosix.length === 0) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'sourceDirectoryPath cannot be empty',
      );
    }
    const { root: sourceRoot } = await resolveCommandsRoot(
      req.sourceScope,
      req.sourceProjectSlug,
      req.sourcePluginKey,
    );
    const sourceDirAbs = path.resolve(
      sourceRoot,
      sourceDirPosix.split('/').join(path.sep),
    );
    if (!withinRoot(sourceDirAbs, sourceRoot)) {
      throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'source path escapes commands root');
    }
    const stat = await fs.stat(sourceDirAbs).catch(() => null);
    if (!stat?.isDirectory()) {
      throwMapped(HARNESS_ERRORS.HARNESS_COMMAND_NOT_FOUND.code, 'source directory not found');
    }
    const files = await walkMdFiles(sourceDirAbs);
    if (files.length === 0) {
      return { success: true, copied: [], skipped: [] };
    }

    const targetDirPosix = toPosixRelative(req.targetDirectoryPath ?? sourceDirPosix).replace(/\/+$/, '');
    const { root: targetRoot } = await resolveCommandsRoot(
      req.targetScope,
      req.targetProjectSlug,
    );

    // Read all source files first (for secret aggregation + body access).
    const fileResults = await Promise.all(
      files.map(async (abs) => {
        const result = await readMdFile(abs);
        return { abs, result };
      }),
    );
    let aggregateSecret = false;
    for (const f of fileResults) {
      if ('malformed' in f.result) continue;
      const sec = detectSecretsInRaw(f.result.raw);
      if (sec.matched) {
        aggregateSecret = true;
        break;
      }
    }
    if (aggregateSecret && req.acknowledgedSecret !== true) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        'client must show the secret modal and echo acknowledgedSecret',
        { cause: 'secret-not-acknowledged' },
      );
    }

    // Build (sourceFileAbs → targetRel) mapping.
    const mappings = files.map((srcAbs) => {
      const relWithinSourceDir = toPosixRelative(path.relative(sourceDirAbs, srcAbs));
      const targetRel = `${targetDirPosix}/${relWithinSourceDir}`;
      const native = targetRel.split('/').join(path.sep);
      const targetAbs = path.resolve(targetRoot, native);
      return { srcAbs, sourceRelInDir: relWithinSourceDir, targetRel, targetAbs };
    });

    const conflicts: string[] = [];
    for (const m of mappings) {
      if (!withinRoot(m.targetAbs, targetRoot)) {
        throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'target path escapes commands root');
      }
      try {
        await fs.stat(m.targetAbs);
        conflicts.push(m.targetRel);
      } catch {
        // missing — no conflict
      }
    }

    if (conflicts.length > 0 && req.onConflict === 'per-file') {
      const choices = req.perFileChoices ?? {};
      const missing = conflicts.filter((c) => !choices[c]);
      if (missing.length > 0) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code,
          'per-file decisions required',
          { details: { conflicts: missing } },
        );
      }
    }

    const copied: HarnessCommandSourceLocation[] = [];
    const skipped: string[] = [];
    let warnPluginRoot = false;

    for (const m of mappings) {
      const fileEntry = fileResults.find((f) => f.abs === m.srcAbs)?.result;
      if (!fileEntry || 'malformed' in fileEntry) {
        skipped.push(m.targetRel);
        continue;
      }

      const conflict = conflicts.includes(m.targetRel);
      let writeAbs = m.targetAbs;
      let writeRel = m.targetRel;
      if (conflict) {
        const decision =
          req.onConflict === 'overwrite-all'
            ? 'overwrite'
            : req.onConflict === 'skip-all'
              ? 'skip'
              : (req.perFileChoices?.[m.targetRel] ?? 'skip');
        if (decision === 'skip') {
          skipped.push(m.targetRel);
          continue;
        }
        if (decision === 'rename') {
          const renamed = req.perFileRenames?.[m.targetRel];
          if (!renamed) {
            throwMapped(
              HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code,
              `rename target missing for ${m.targetRel}`,
            );
          }
          const renamedPosix = toPosixRelative(renamed);
          validateRelativePath(renamedPosix);
          writeRel = renamedPosix;
          writeAbs = path.resolve(targetRoot, renamedPosix.split('/').join(path.sep));
          if (!withinRoot(writeAbs, targetRoot)) {
            throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'rename escapes commands root');
          }
        }
      }

      if (req.sourceScope === 'plugin' && PLUGIN_ROOT_RE.test(fileEntry.raw)) {
        warnPluginRoot = true;
      }

      await fs.mkdir(path.dirname(writeAbs), { recursive: true });
      const targetRef = await this.buildEditableRef(req.targetScope, writeRel, req.targetProjectSlug);
      await harnessService.write(targetRef, { content: fileEntry.raw });
      copied.push(makeSourceLocation(req.targetScope, writeAbs, writeRel, req.targetProjectSlug));
    }

    const warnings: Array<'plugin-root-reference'> = warnPluginRoot ? ['plugin-root-reference'] : [];
    return {
      success: true,
      copied,
      skipped,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async deleteCommand(req: HarnessCommandDeleteRequest): Promise<{ success: true }> {
    // The plugin scope is rejected upstream by the Zod editableScopeSchema, so
    // by the time we get here `req.scope` can only be 'project' | 'user'. No
    // runtime guard is needed.
    const relPosix = toPosixRelative(req.relativePath);
    const { abs, root } = await resolveAbsoluteFile(req.scope, relPosix, req.projectSlug);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throwMapped(HARNESS_ERRORS.HARNESS_COMMAND_NOT_FOUND.code, 'command not found');
      }
      throw err;
    }
    if (req.expectedMtime !== undefined && req.expectedMtime !== stat.mtime.toISOString()) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: stat.mtime.toISOString(),
      });
    }
    await fs.unlink(abs);
    // Best-effort prune of empty parent directories up to the commands root.
    let dir = path.dirname(abs);
    while (withinRoot(dir, root) && path.resolve(dir) !== path.resolve(root)) {
      try {
        await fs.rmdir(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async buildEditableRef(
    scope: 'project' | 'user',
    relPosix: string,
    projectSlug?: string,
  ): Promise<HarnessPathRef> {
    if (scope === 'project') {
      if (!projectSlug) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
          'projectSlug required for scope=project',
        );
      }
      return {
        scope: 'project',
        projectSlug,
        relativePath: `${COMMANDS_DIR}/${relPosix}`,
      };
    }
    return {
      scope: 'user',
      relativePath: `${COMMANDS_DIR}/${relPosix}`,
    };
  }

  private collectCopyWarnings(
    req: HarnessCommandCopyRequest,
    raw: string,
  ): { warnings?: Array<'plugin-root-reference'> } {
    if (req.sourceScope === 'plugin' && PLUGIN_ROOT_RE.test(raw)) {
      return { warnings: ['plugin-root-reference'] };
    }
    return {};
  }
}

// ---------------------------------------------------------------------------
// resolveSourceLocation — used by the controller to validate path/scope tuple
// ---------------------------------------------------------------------------

export async function resolveCommandSourceLocation(input: {
  scope: HarnessCommandSourceScope;
  relativePath: string;
  projectSlug?: string;
  pluginKey?: string;
}): Promise<HarnessCommandSourceLocation> {
  const relPosix = toPosixRelative(input.relativePath);
  const { abs } = await resolveAbsoluteFile(input.scope, relPosix, input.projectSlug, input.pluginKey);
  return makeSourceLocation(input.scope, abs, relPosix, input.projectSlug, input.pluginKey);
}

// Exposed for unit tests + the chat slash-palette integration (Task 12).
export const harnessCommandInternals = {
  analyzeTokens,
  detectBmadMirror,
  detectSecretsInRaw,
  deriveSlashName,
  validateRelativePath,
  walkMdFiles,
};

export const harnessCommandService = new HarnessCommandService();
