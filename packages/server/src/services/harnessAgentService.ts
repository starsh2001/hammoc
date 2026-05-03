/**
 * Story 28.6: Harness sub-agent service.
 *
 * Combines three sources of `.claude/agents/*.md` files into a single flat
 * card list (flat-only — no recursive subdirectory walk):
 *   - <projectRoot>/.claude/agents/   (project scope)
 *   - ~/.claude/agents/               (user scope)
 *   - <pluginInstallPath>/agents/     (plugin scope, read-only)
 *
 * Each .md file has YAML frontmatter with 4 required fields
 * (name/description/model/color) + 1 optional 3-state `tools` field. Body is
 * the markdown system prompt. Round-trip via `applyYamlFrontmatterPatch`
 * (eemeli yaml — preserves comments / key order / blank lines).
 *
 * Differences from 28.5 (commands):
 *   - flat-only scan (no subdirectory walk)
 *   - 4 required frontmatter fields (name regex + model/color enum)
 *   - tools 3-state model (omitted vs empty vs populated) round-trip
 *   - file stem === frontmatter.name (no slash-name conversion)
 *   - no chat slash palette dedup
 *   - no BMad mirror heuristic (`.claude/agents/` has no BMad presence)
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'yaml';
import { parseDocument } from 'yaml';
import {
  HARNESS_ERRORS,
  type HarnessAgentCard,
  type HarnessAgentColor,
  type HarnessAgentCopyRequest,
  type HarnessAgentCopyResponse,
  type HarnessAgentCreateRequest,
  type HarnessAgentCreateResponse,
  type HarnessAgentDeleteRequest,
  type HarnessAgentDeleteResponse,
  type HarnessAgentFrontmatter,
  type HarnessAgentListResponse,
  type HarnessAgentMalformedEntry,
  type HarnessAgentModel,
  type HarnessAgentReadResponse,
  type HarnessAgentSourceLocation,
  type HarnessAgentSourceScope,
  type HarnessAgentToolsState,
  type HarnessAgentUpdateRequest,
  type HarnessAgentUpdateResponse,
  type HarnessInstalledPluginEntry,
  type HarnessPathRef,
} from '@hammoc/shared';
import { harnessService } from './harnessService.js';
import { projectService } from './projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';
import { splitFrontmatterAndBody } from './utils/applyYamlFrontmatterPatch.js';

const SCOPE_PRIORITY: Record<HarnessAgentSourceScope, number> = {
  project: 0,
  user: 1,
  plugin: 2,
};

const ALLOWED_MODELS: ReadonlySet<string> = new Set<HarnessAgentModel>([
  'inherit',
  'sonnet',
  'opus',
  'haiku',
]);

const ALLOWED_COLORS: ReadonlySet<string> = new Set<HarnessAgentColor>([
  'blue',
  'cyan',
  'green',
  'yellow',
  'magenta',
  'red',
]);

const AGENTS_DIR = 'agents';

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{16,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /[A-Za-z0-9+/=]{32,}/,
];
const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const PLUGIN_ROOT_RE = /\$\{CLAUDE_PLUGIN_ROOT\}/;
const EXAMPLE_BLOCK_RE = /<example[\s>][\s\S]*?<\/example>/i;

/**
 * Agent name regex: 3-50 chars, lowercase letters / digits / hyphens, must
 * start with a lowercase letter and end with letter-or-digit (cannot start or
 * end with a hyphen).
 */
const AGENT_NAME_RE = /^[a-z][a-z0-9-]{1,48}[a-z0-9]$/;

// eslint-disable-next-line no-control-regex
const RESERVED_CHARS_RE = /[\\/<>:"|?*\x00-\x1F]/;
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
// Validation helpers
// ---------------------------------------------------------------------------

/** Throws HARNESS_PARSE_ERROR with detail when name fails the regex / OS check. */
function validateAgentName(name: string): void {
  if (!name || typeof name !== 'string') {
    throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'name is required', {
      detail: 'invalid-name-pattern',
    });
  }
  if (!AGENT_NAME_RE.test(name)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'name pattern invalid', {
      detail: 'invalid-name-pattern',
    });
  }
  if (RESERVED_CHARS_RE.test(name)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'OS-reserved characters not allowed', {
      detail: 'invalid-name-pattern',
    });
  }
  if (TRAILING_DOT_OR_SPACE_RE.test(name)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'name cannot end with space or dot', {
      detail: 'invalid-name-pattern',
    });
  }
  if (name.includes('..')) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'path traversal denied');
  }
}

// ---------------------------------------------------------------------------
// Token / secret helpers
// ---------------------------------------------------------------------------

function detectExampleBlock(body: string): boolean {
  return EXAMPLE_BLOCK_RE.test(body);
}

function detectSecretsInText(text: string): { matched: boolean; lines: number[] } {
  if (!text) return { matched: false, lines: [] };
  const stripped = text.replace(ENV_REF_RE, '');
  let matched = false;
  for (const re of SECRET_PATTERNS) {
    if (re.test(stripped)) {
      matched = true;
      break;
    }
  }
  if (!matched) return { matched: false, lines: [] };
  const lines: number[] = [];
  const split = text.split(/\r?\n/);
  for (let i = 0; i < split.length; i += 1) {
    const lineStripped = split[i].replace(ENV_REF_RE, '');
    for (const re of SECRET_PATTERNS) {
      if (re.test(lineStripped)) {
        lines.push(i + 1);
        break;
      }
    }
  }
  return { matched, lines };
}

// ---------------------------------------------------------------------------
// Frontmatter parse + 3-state tools detection
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  frontmatter: HarnessAgentFrontmatter;
  toolsState: HarnessAgentToolsState;
}

interface FrontmatterValidationFailure {
  malformed: true;
  reason: HarnessAgentMalformedEntry['reason'];
  detail?: string;
}

type FrontmatterParseResult = ParsedFrontmatter | FrontmatterValidationFailure;

function parseAgentFrontmatter(raw: string | null, fileStem: string): FrontmatterParseResult {
  if (raw === null) {
    return { malformed: true, reason: 'invalid-frontmatter', detail: 'missing frontmatter' };
  }
  let parsed: unknown;
  try {
    parsed = yaml.parse(raw);
  } catch (cause) {
    return {
      malformed: true,
      reason: 'invalid-frontmatter',
      detail: (cause as Error).message,
    };
  }
  if (parsed === null || parsed === undefined) {
    return { malformed: true, reason: 'invalid-frontmatter', detail: 'empty frontmatter' };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      malformed: true,
      reason: 'invalid-frontmatter',
      detail: 'frontmatter must be a mapping',
    };
  }
  const obj = parsed as Record<string, unknown>;
  // name
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return { malformed: true, reason: 'invalid-frontmatter', detail: 'name required' };
  }
  if (!AGENT_NAME_RE.test(obj.name)) {
    return { malformed: true, reason: 'invalid-name-pattern', detail: obj.name };
  }
  if (obj.name !== fileStem) {
    return {
      malformed: true,
      reason: 'name-mismatch',
      detail: `frontmatter.name=${obj.name} fileStem=${fileStem}`,
    };
  }
  // description
  if (typeof obj.description !== 'string' || obj.description.length === 0) {
    return { malformed: true, reason: 'invalid-frontmatter', detail: 'description required' };
  }
  // model
  if (typeof obj.model !== 'string' || !ALLOWED_MODELS.has(obj.model)) {
    return { malformed: true, reason: 'invalid-model', detail: String(obj.model) };
  }
  // color
  if (typeof obj.color !== 'string' || !ALLOWED_COLORS.has(obj.color)) {
    return { malformed: true, reason: 'invalid-color', detail: String(obj.color) };
  }
  // tools (3-state)
  let tools: string[] | undefined;
  let toolsState: HarnessAgentToolsState;
  if (!('tools' in obj)) {
    tools = undefined;
    toolsState = 'omitted';
  } else if (Array.isArray(obj.tools)) {
    if (obj.tools.length === 0) {
      tools = [];
      toolsState = 'empty';
    } else {
      const allStrings = obj.tools.every((t) => typeof t === 'string' && t.length > 0);
      if (!allStrings) {
        return {
          malformed: true,
          reason: 'invalid-frontmatter',
          detail: 'tools entries must be strings',
        };
      }
      tools = obj.tools as string[];
      toolsState = 'populated';
    }
  } else {
    return {
      malformed: true,
      reason: 'invalid-frontmatter',
      detail: 'tools must be an array if present',
    };
  }
  const frontmatter: HarnessAgentFrontmatter = {
    name: obj.name,
    description: obj.description,
    model: obj.model as HarnessAgentModel,
    color: obj.color as HarnessAgentColor,
    ...(tools !== undefined ? { tools } : {}),
  };
  return { frontmatter, toolsState };
}

// ---------------------------------------------------------------------------
// Roots / containment
// ---------------------------------------------------------------------------

function userAgentsRoot(): string {
  return path.join(getUserHarnessRoot(), AGENTS_DIR);
}

async function projectAgentsRoot(projectSlug: string): Promise<string> {
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  return path.join(projectRoot, '.claude', AGENTS_DIR);
}

function pluginAgentsRoots(installPath: string): string[] {
  return [path.join(installPath, AGENTS_DIR)];
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

/** Read a plugin's manifest `agents` field (when present). Returns relative posix paths. */
async function readPluginManifestAgents(installPath: string): Promise<string[] | null> {
  const manifestPath = path.join(installPath, '.claude-plugin', 'plugin.json');
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const agents = (parsed as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) return null;
  const out: string[] = [];
  for (const entry of agents) {
    if (typeof entry === 'string' && entry.length > 0) out.push(entry);
  }
  return out;
}

/** Flat-only scan — list .md files directly under `root` (no recursion). */
async function listFlatMdFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.join(root, entry.name));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Card construction (file → card)
// ---------------------------------------------------------------------------

interface ReadFileResult {
  raw: string;
  mtime: string;
  frontmatter: HarnessAgentFrontmatter;
  body: string;
  toolsState: HarnessAgentToolsState;
}

interface MalformedFile {
  malformed: true;
  reason: HarnessAgentMalformedEntry['reason'];
  detail?: string;
}

async function readAndParseAgent(
  absolute: string,
): Promise<ReadFileResult | MalformedFile> {
  let stat: import('fs').Stats;
  try {
    stat = await fs.stat(absolute);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { malformed: true, reason: 'invalid-frontmatter', detail: 'file not found' };
    }
    throw err;
  }
  if (!stat.isFile()) {
    return { malformed: true, reason: 'invalid-frontmatter', detail: 'not a regular file' };
  }
  let raw: string;
  try {
    raw = await fs.readFile(absolute, 'utf-8');
  } catch {
    return { malformed: true, reason: 'invalid-frontmatter', detail: 'failed to read' };
  }
  const fileStem = path.basename(absolute, '.md');
  const { frontmatterRaw, body } = splitFrontmatterAndBody(raw);
  const parsed = parseAgentFrontmatter(frontmatterRaw, fileStem);
  if ('malformed' in parsed) {
    return parsed;
  }
  return {
    raw,
    mtime: stat.mtime.toISOString(),
    frontmatter: parsed.frontmatter,
    body,
    toolsState: parsed.toolsState,
  };
}

function makeCard(
  scope: HarnessAgentSourceScope,
  fileAbs: string,
  frontmatter: HarnessAgentFrontmatter,
  body: string,
  mtime: string,
  toolsState: HarnessAgentToolsState,
  extra: { projectSlug?: string; pluginKey?: string },
): HarnessAgentCard {
  const fileStem = path.basename(fileAbs, '.md');
  return {
    scope,
    absoluteFile: fileAbs,
    pluginKey: extra.pluginKey,
    projectSlug: extra.projectSlug,
    name: fileStem,
    description: frontmatter.description,
    model: frontmatter.model,
    color: frontmatter.color,
    toolsState,
    tools: toolsState === 'populated' ? (frontmatter.tools ?? []) : [],
    hasExampleBlock: detectExampleBlock(body),
    mtime,
  };
}

interface EnumerateResult {
  cards: HarnessAgentCard[];
  malformed: HarnessAgentMalformedEntry[];
}

async function enumerateAgentsInDirectory(
  scope: HarnessAgentSourceScope,
  rootAbs: string,
  extra: { projectSlug?: string; pluginKey?: string },
): Promise<EnumerateResult> {
  const files = await listFlatMdFiles(rootAbs);
  const reads = files.map(async (abs) => {
    const result = await readAndParseAgent(abs);
    if ('malformed' in result) {
      return {
        kind: 'malformed' as const,
        entry: { abs, reason: result.reason, detail: result.detail },
      };
    }
    return {
      kind: 'card' as const,
      card: makeCard(
        scope,
        abs,
        result.frontmatter,
        '',
        result.mtime,
        result.toolsState,
        extra,
      ),
      body: result.body,
    };
  });
  const settled = await Promise.all(reads);
  const cards: HarnessAgentCard[] = [];
  const malformed: HarnessAgentMalformedEntry[] = [];
  for (const r of settled) {
    if (r.kind === 'card') {
      // Re-derive hasExampleBlock from body (we passed empty body to makeCard above
      // to avoid double-walking the body). Simpler: just reconstruct here.
      const reconstructed: HarnessAgentCard = {
        ...r.card,
        hasExampleBlock: detectExampleBlock(r.body),
      };
      cards.push(reconstructed);
    } else {
      malformed.push({
        scope,
        absoluteFile: r.entry.abs,
        pluginKey: extra.pluginKey,
        projectSlug: extra.projectSlug,
        reason: r.entry.reason,
        detail: r.entry.detail,
      });
    }
  }
  return { cards, malformed };
}

async function enumeratePluginAgents(): Promise<EnumerateResult> {
  const installed = await readInstalledPlugins();
  const plugins = installed.plugins ?? {};
  const tasks: Array<Promise<EnumerateResult>> = [];
  for (const [pluginKey, value] of Object.entries(plugins)) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (!entry?.installPath || typeof entry.installPath !== 'string') continue;
      const installRoot = path.resolve(entry.installPath);
      tasks.push(
        (async () => {
          // Manifest-driven enumeration takes priority — when plugin.json
          // declares `agents` paths, treat those as the source of truth.
          const manifestPaths = await readPluginManifestAgents(entry.installPath);
          if (manifestPaths && manifestPaths.length > 0) {
            const cards: HarnessAgentCard[] = [];
            const malformed: HarnessAgentMalformedEntry[] = [];
            for (const relPosix of manifestPaths) {
              const abs = path.resolve(
                entry.installPath,
                relPosix.split('/').join(path.sep),
              );
              if (!withinRoot(abs, installRoot)) continue;
              const parsed = await readAndParseAgent(abs);
              if ('malformed' in parsed) {
                malformed.push({
                  scope: 'plugin',
                  absoluteFile: abs,
                  pluginKey,
                  reason: parsed.reason,
                  detail: parsed.detail,
                });
                continue;
              }
              cards.push(
                makeCard(
                  'plugin',
                  abs,
                  parsed.frontmatter,
                  parsed.body,
                  parsed.mtime,
                  parsed.toolsState,
                  { pluginKey },
                ),
              );
            }
            return { cards, malformed };
          }
          // Fall back to flat scan of <installPath>/agents/.
          const collected: EnumerateResult = { cards: [], malformed: [] };
          for (const root of pluginAgentsRoots(entry.installPath)) {
            try {
              const stat = await fs.stat(root);
              if (!stat.isDirectory()) continue;
            } catch {
              continue;
            }
            if (!withinRoot(root, installRoot)) continue;
            const part = await enumerateAgentsInDirectory('plugin', root, { pluginKey });
            // Defensive containment filter.
            for (const card of part.cards) {
              if (withinRoot(card.absoluteFile, installRoot)) collected.cards.push(card);
            }
            for (const m of part.malformed) {
              if (withinRoot(m.absoluteFile, installRoot)) collected.malformed.push(m);
            }
          }
          return collected;
        })(),
      );
    }
  }
  const settled = await Promise.all(tasks);
  const cards: HarnessAgentCard[] = [];
  const malformed: HarnessAgentMalformedEntry[] = [];
  for (const part of settled) {
    cards.push(...part.cards);
    malformed.push(...part.malformed);
  }
  return { cards, malformed };
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

async function resolveAgentRoot(
  scope: HarnessAgentSourceScope,
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
    return { root: await projectAgentsRoot(projectSlug) };
  }
  if (scope === 'user') {
    return { root: userAgentsRoot() };
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
  return {
    root: path.join(first.installPath, AGENTS_DIR),
    pluginInstallRoot: path.resolve(first.installPath),
  };
}

async function resolveAbsoluteFile(
  scope: HarnessAgentSourceScope,
  name: string,
  projectSlug?: string,
  pluginKey?: string,
): Promise<{ abs: string; root: string; pluginInstallRoot?: string }> {
  validateAgentName(name);
  // For plugins where the manifest may specify a non-flat path, we need to
  // prefer the manifest mapping over the default flat layout.
  if (scope === 'plugin' && pluginKey) {
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
    const installRoot = path.resolve(first.installPath);
    const manifest = await readPluginManifestAgents(first.installPath);
    if (manifest) {
      const match = manifest.find((rel) => path.basename(rel, '.md') === name);
      if (match) {
        const abs = path.resolve(first.installPath, match.split('/').join(path.sep));
        if (!withinRoot(abs, installRoot)) {
          throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'plugin file escapes installPath');
        }
        return { abs, root: path.dirname(abs), pluginInstallRoot: installRoot };
      }
    }
    const fallbackRoot = path.join(first.installPath, AGENTS_DIR);
    const abs = path.resolve(fallbackRoot, `${name}.md`);
    if (!withinRoot(abs, installRoot)) {
      throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'plugin file escapes installPath');
    }
    return { abs, root: fallbackRoot, pluginInstallRoot: installRoot };
  }
  const { root } = await resolveAgentRoot(scope, projectSlug);
  const abs = path.resolve(root, `${name}.md`);
  if (!withinRoot(abs, root)) {
    throwMapped(HARNESS_ERRORS.HARNESS_PATH_DENIED.code, 'path escapes agents root');
  }
  return { abs, root };
}

function makeSourceLocation(
  scope: HarnessAgentSourceScope,
  abs: string,
  name: string,
  projectSlug?: string,
  pluginKey?: string,
): HarnessAgentSourceLocation {
  return {
    scope,
    absoluteFile: abs,
    pluginKey,
    projectSlug,
    name,
  };
}

// ---------------------------------------------------------------------------
// Frontmatter serialization with 3-state tools handling
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)?/;

interface SerializeOptions {
  frontmatter: HarnessAgentFrontmatter;
  toolsState?: HarnessAgentToolsState;
}

/**
 * Custom YAML round-trip that preserves comments / key order / blank lines for
 * untouched keys, and explicitly handles the tools 3-state model:
 *   - state A (omitted) → delete tools key
 *   - state B (empty)   → write tools: []
 *   - state C (populated) → write tools: [...]
 */
function serializeAgentFrontmatter(prevRaw: string, opts: SerializeOptions): string {
  const { frontmatter, toolsState } = opts;
  const match = FRONTMATTER_RE.exec(prevRaw);
  const eol: '\n' | '\r\n' = prevRaw.includes('\r\n') ? '\r\n' : '\n';

  // Resolve effective tools state.
  let effectiveToolsState: HarnessAgentToolsState;
  if (Array.isArray(frontmatter.tools) && frontmatter.tools.length > 0) {
    effectiveToolsState = 'populated';
  } else if (toolsState !== undefined) {
    effectiveToolsState = toolsState;
  } else if (Array.isArray(frontmatter.tools) && frontmatter.tools.length === 0) {
    effectiveToolsState = 'empty';
  } else {
    effectiveToolsState = 'omitted';
  }

  const writeKeys = (doc: ReturnType<typeof parseDocument>): void => {
    doc.setIn(['name'], frontmatter.name);
    doc.setIn(['description'], frontmatter.description);
    doc.setIn(['model'], frontmatter.model);
    doc.setIn(['color'], frontmatter.color);
    if (effectiveToolsState === 'omitted') {
      if (doc.hasIn(['tools'])) doc.deleteIn(['tools']);
    } else if (effectiveToolsState === 'empty') {
      doc.setIn(['tools'], []);
    } else {
      doc.setIn(['tools'], frontmatter.tools ?? []);
    }
  };

  if (!match) {
    // No prior frontmatter — emit a fresh block.
    let doc;
    try {
      doc = parseDocument('', { keepSourceTokens: true });
    } catch (cause) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        `failed to parse frontmatter: ${(cause as Error).message}`,
      );
    }
    if (doc.contents == null) {
      doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
    }
    writeKeys(doc);
    const yamlText = doc.toString().replace(/\r?\n$/, '');
    return `---${eol}${yamlText}${eol}---${eol}${prevRaw}`;
  }

  let doc;
  try {
    doc = parseDocument(match[1], { keepSourceTokens: true });
    if (doc.errors.length > 0) throw doc.errors[0];
  } catch (cause) {
    throwMapped(
      HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
      `failed to parse frontmatter: ${(cause as Error).message}`,
    );
  }
  if (doc.contents == null) {
    doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  }
  writeKeys(doc);
  const yamlText = doc.toString().replace(/\r?\n$/, '');
  const sliceEol: '\n' | '\r\n' = match[0].includes('\r\n') ? '\r\n' : '\n';
  return `---${sliceEol}${yamlText}${sliceEol}---${sliceEol}${prevRaw.slice(match[0].length)}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class HarnessAgentService {
  async listCards(currentProjectSlug?: string): Promise<HarnessAgentListResponse> {
    const projectTask: Promise<EnumerateResult> = currentProjectSlug
      ? (async () => {
          try {
            const root = await projectAgentsRoot(currentProjectSlug);
            return enumerateAgentsInDirectory('project', root, {
              projectSlug: currentProjectSlug,
            });
          } catch (err) {
            if (
              (err as NodeJS.ErrnoException)?.code === HARNESS_ERRORS.HARNESS_ROOT_MISSING.code
            ) {
              return { cards: [], malformed: [] };
            }
            throw err;
          }
        })()
      : Promise.resolve({ cards: [], malformed: [] });

    const userTask = enumerateAgentsInDirectory('user', userAgentsRoot(), {});
    const pluginTask = enumeratePluginAgents();

    const [projectPart, userPart, pluginPart] = await Promise.all([
      projectTask,
      userTask,
      pluginTask,
    ]);

    const cards = [...projectPart.cards, ...userPart.cards, ...pluginPart.cards];
    const malformed = [
      ...projectPart.malformed,
      ...userPart.malformed,
      ...pluginPart.malformed,
    ];

    cards.sort((a, b) => {
      const sd = SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope];
      if (sd !== 0) return sd;
      return a.name.localeCompare(b.name);
    });

    return { cards, malformed };
  }

  async readAgent(loc: HarnessAgentSourceLocation): Promise<HarnessAgentReadResponse> {
    const result = await readAndParseAgent(loc.absoluteFile);
    if ('malformed' in result) {
      throwMapped(HARNESS_ERRORS.HARNESS_AGENT_NOT_FOUND.code, 'agent not found or malformed');
    }
    return {
      source: loc,
      frontmatter: result.frontmatter,
      body: result.body,
      raw: result.raw,
      mtime: result.mtime,
      toolsState: result.toolsState,
      hasExampleBlock: detectExampleBlock(result.body),
    };
  }

  async createAgent(req: HarnessAgentCreateRequest): Promise<HarnessAgentCreateResponse> {
    validateAgentName(req.name);
    if (req.frontmatter.name !== req.name) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'frontmatter.name must equal name',
        { detail: 'name-mismatch' },
      );
    }
    if (!req.frontmatter.description || req.frontmatter.description.length === 0) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'description is required', {
        detail: 'description required',
      });
    }
    if (!ALLOWED_MODELS.has(req.frontmatter.model)) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'invalid model', {
        detail: 'invalid-model',
      });
    }
    if (!ALLOWED_COLORS.has(req.frontmatter.color)) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'invalid color', {
        detail: 'invalid-color',
      });
    }

    const { abs } = await resolveAbsoluteFile(req.scope, req.name, req.projectSlug);

    try {
      await fs.stat(abs);
      throwMapped(
        HARNESS_ERRORS.HARNESS_AGENT_NAME_CONFLICT.code,
        `agent already exists: ${req.name}`,
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === HARNESS_ERRORS.HARNESS_AGENT_NAME_CONFLICT.code) {
        throw err;
      }
      // ENOENT — proceed.
    }

    const body = req.body ?? '';
    const initial = serializeAgentFrontmatter(body, {
      frontmatter: req.frontmatter,
      toolsState: req.toolsState,
    });

    await fs.mkdir(path.dirname(abs), { recursive: true });

    const ref = await this.buildEditableRef(req.scope, req.name, req.projectSlug);
    const written = await harnessService.write(ref, { content: initial });

    return {
      success: true,
      source: makeSourceLocation(req.scope, abs, req.name, req.projectSlug),
      mtime: written.mtime,
    };
  }

  async updateAgent(
    loc: HarnessAgentSourceLocation,
    body: HarnessAgentUpdateRequest,
  ): Promise<HarnessAgentUpdateResponse> {
    if (loc.scope === 'plugin') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'plugin-scope agents are read-only');
    }
    const editableScope = loc.scope as 'project' | 'user';
    const provided = [body.frontmatter, body.body, body.raw].filter((x) => x !== undefined);
    if (provided.length !== 1) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        'exactly one of frontmatter / body / raw is required',
      );
    }

    const ref = await this.buildEditableRef(editableScope, loc.name, loc.projectSlug);
    const current = await harnessService.read(ref);
    const sourceText = current.content ?? '';
    if (body.expectedMtime !== undefined && body.expectedMtime !== current.mtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: current.mtime,
      });
    }

    let nextText: string;
    if (body.frontmatter !== undefined) {
      // Validate frontmatter required fields.
      const fm = body.frontmatter;
      if (fm.name !== loc.name) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
          'frontmatter.name cannot be changed via update — use copy + delete',
          { cause: 'name-rename-not-allowed' },
        );
      }
      if (!fm.description || fm.description.length === 0) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'description required', {
          detail: 'description required',
        });
      }
      if (!ALLOWED_MODELS.has(fm.model)) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'invalid model', {
          detail: 'invalid-model',
        });
      }
      if (!ALLOWED_COLORS.has(fm.color)) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'invalid color', {
          detail: 'invalid-color',
        });
      }
      nextText = serializeAgentFrontmatter(sourceText, {
        frontmatter: fm,
        toolsState: body.toolsState,
      });
    } else if (body.body !== undefined) {
      const re = /^---\s*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)?/;
      const match = re.exec(sourceText);
      const head = match ? sourceText.slice(0, match[0].length) : '';
      nextText = `${head}${body.body}`;
    } else {
      // raw — re-validate the frontmatter's 4 required fields.
      const { frontmatterRaw } = splitFrontmatterAndBody(body.raw!);
      const parsed = parseAgentFrontmatter(frontmatterRaw, loc.name);
      if ('malformed' in parsed) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, parsed.detail ?? parsed.reason, {
          detail: parsed.reason,
        });
      }
      if (parsed.frontmatter.name !== loc.name) {
        throwMapped(
          HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
          'frontmatter.name cannot be changed via raw edit',
          { cause: 'name-rename-not-allowed' },
        );
      }
      nextText = body.raw!;
    }

    const written = await harnessService.write(ref, {
      content: nextText,
      expectedMtime: current.mtime,
    });

    const { body: nextBody } = splitFrontmatterAndBody(nextText);
    const finalParsed = parseAgentFrontmatter(
      splitFrontmatterAndBody(nextText).frontmatterRaw,
      loc.name,
    );
    let toolsState: HarnessAgentToolsState = 'omitted';
    if (!('malformed' in finalParsed)) {
      toolsState = finalParsed.toolsState;
    }
    return {
      success: true,
      mtime: written.mtime,
      toolsState,
      hasExampleBlock: detectExampleBlock(nextBody),
    };
  }

  async copyAgent(req: HarnessAgentCopyRequest): Promise<HarnessAgentCopyResponse> {
    validateAgentName(req.sourceName);
    const targetName = req.targetName ?? req.sourceName;
    validateAgentName(targetName);

    const sourceResolved = await resolveAbsoluteFile(
      req.sourceScope,
      req.sourceName,
      req.sourceProjectSlug,
      req.sourcePluginKey,
    );
    const sourceFile = await readAndParseAgent(sourceResolved.abs);
    if ('malformed' in sourceFile) {
      throwMapped(HARNESS_ERRORS.HARNESS_AGENT_NOT_FOUND.code, 'source agent not found');
    }

    const secrets = detectSecretsInText(sourceFile.raw);
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

    const { abs: targetAbs } = await resolveAbsoluteFile(
      req.targetScope,
      targetName,
      req.targetProjectSlug,
    );

    let exists = false;
    try {
      const stat = await fs.stat(targetAbs);
      if (stat.isFile()) exists = true;
    } catch {
      // missing
    }

    const warnings: Array<'plugin-root-reference'> = [];
    if (req.sourceScope === 'plugin' && PLUGIN_ROOT_RE.test(sourceFile.raw)) {
      warnings.push('plugin-root-reference');
    }

    if (exists) {
      if (req.onConflict === 'skip') {
        return {
          success: true,
          target: makeSourceLocation(req.targetScope, targetAbs, targetName, req.targetProjectSlug),
          skipped: true,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }
      if (req.onConflict === 'rename') {
        if (!req.targetName || req.targetName === req.sourceName) {
          throwMapped(
            HARNESS_ERRORS.HARNESS_AGENT_NAME_CONFLICT.code,
            'rename requires distinct targetName',
          );
        }
      }
      // overwrite → fall through
    }

    // Rewrite frontmatter.name to match the target file stem (key invariant).
    const rewritten = serializeAgentFrontmatter(sourceFile.body, {
      frontmatter: { ...sourceFile.frontmatter, name: targetName },
      toolsState: sourceFile.toolsState,
    });

    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    const targetRef = await this.buildEditableRef(req.targetScope, targetName, req.targetProjectSlug);
    await harnessService.write(targetRef, { content: rewritten });

    return {
      success: true,
      target: makeSourceLocation(req.targetScope, targetAbs, targetName, req.targetProjectSlug),
      skipped: false,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async deleteAgent(req: HarnessAgentDeleteRequest): Promise<HarnessAgentDeleteResponse> {
    validateAgentName(req.name);
    const { abs } = await resolveAbsoluteFile(req.scope, req.name, req.projectSlug);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throwMapped(HARNESS_ERRORS.HARNESS_AGENT_NOT_FOUND.code, 'agent not found');
      }
      throw err;
    }
    if (req.expectedMtime !== undefined && req.expectedMtime !== stat.mtime.toISOString()) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', {
        currentMtime: stat.mtime.toISOString(),
      });
    }
    await fs.unlink(abs);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async buildEditableRef(
    scope: 'project' | 'user',
    name: string,
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
        relativePath: `${AGENTS_DIR}/${name}.md`,
      };
    }
    return {
      scope: 'user',
      relativePath: `${AGENTS_DIR}/${name}.md`,
    };
  }
}

// ---------------------------------------------------------------------------
// resolveSourceLocation — used by the controller to validate name/scope tuple
// ---------------------------------------------------------------------------

export async function resolveAgentSourceLocation(input: {
  scope: HarnessAgentSourceScope;
  name: string;
  projectSlug?: string;
  pluginKey?: string;
}): Promise<HarnessAgentSourceLocation> {
  const { abs } = await resolveAbsoluteFile(input.scope, input.name, input.projectSlug, input.pluginKey);
  return makeSourceLocation(input.scope, abs, input.name, input.projectSlug, input.pluginKey);
}

// Exposed for unit tests.
export const harnessAgentInternals = {
  detectExampleBlock,
  detectSecretsInText,
  parseAgentFrontmatter,
  serializeAgentFrontmatter,
  validateAgentName,
  AGENT_NAME_RE,
};

export const harnessAgentService = new HarnessAgentService();
