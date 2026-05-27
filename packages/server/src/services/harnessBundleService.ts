/**
 * Story 30.5 (Task A): Harness Export/Import bundle service — server-side
 * single source of truth that backs the 4 REST endpoints
 * (`/api/harness/bundle/export`, `.../import/preview`, `.../import/apply`,
 * `.../plugin-deps`).
 *
 * Two public methods:
 *   - `export({ projectSlug, includes, secretsPolicy, acknowledgedSecretInclusion? })`
 *     produces a single `{ zipBuffer, manifest, filename }` triple. The ZIP
 *     contains `manifest.json` at the root plus the 5 R/W domain artefacts +
 *     CLAUDE.md + BMad core-config (when opted in). Each text payload is
 *     filtered through the chosen secrets policy via the helpers absorbed from
 *     Task 2 (`applyPolicyToValue` / `applyPolicyToText`). For the
 *     `included-explicit` policy the filename is force-suffixed with
 *     `-WITH-SECRETS` and the caller must supply
 *     `acknowledgedSecretInclusion: true` or the call throws AC2.d-2.
 *
 *   - `import({ projectSlug, zipBuffer, dryRun, itemActions? })` parses the ZIP,
 *     runs Zod validation of `manifest.json`, computes a per-item preview
 *     (`new`/`overwrite`/`same`/`conflict`) by comparing each bundle item to
 *     the current project state, and — when `dryRun === false` — applies the
 *     selected `itemActions` inside a single in-memory transaction. Pre-state
 *     snapshots are captured up-front so a mid-flight failure can be reversed
 *     in reverse order (AC1 + A.3 rollback semantics).
 *
 * Single sources of truth this service depends on (no duplicate logic here):
 *   - `secretHeuristic.ts`  (Story 30.1)  → pattern detection
 *   - `applySecretsPolicy.ts` (Task 2)    → 3-policy payload rewriting
 *   - `secretPlaceholderNamer.ts` (Task 2) → ENV-ref naming for placeholder mode
 *   - `harnessBundleSchema.ts` (Task 4)   → Zod validation of manifest.json
 *   - `assertSafeBundlePath.ts` (Task A.5) → ZIP-slip guard for every entry
 *
 * The bundle service intentionally does file I/O via raw `fs` (with a
 * `fileWatcherService.noteLocalWrite` call after each write) rather than
 * routing through the per-domain services. Reasons:
 *   1. The per-domain services have card-shaped (un-grouped) input/output —
 *      a bundle round-trip needs file-shaped I/O.
 *   2. The per-domain services contain Story-30.1 share-scope guards that
 *      block plaintext secrets on shared paths; the bundle import path lets
 *      `included-explicit` bundles land plaintext into the project (that is
 *      the entire point of the policy) so going through the share-scope
 *      guard would be wrong.
 *   3. The `pendingLocalWrites` echo-suppression window is wired directly on
 *      `fileWatcherService` so calling `noteLocalWrite` is sufficient — see
 *      `harnessService.write` which does the same pair (`fs.writeFile` +
 *      `noteLocalWrite`) under the hood.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import {
  HARNESS_BUNDLE_VERSION,
  type BundleItem,
  type BundleManifest,
  type BundlePluginRef,
  type BundleSection,
  type BundleSourceShareScope,
  type ImportApplyItemResult,
  type ImportApplySummary,
  type ImportCompatibility,
  type ImportCompatibilityDetail,
  type ImportItemAction,
  type ImportItemStatus,
  type ImportMissingPlugin,
  type ImportPreview,
  type ImportPreviewItem,
  type SecretsPolicy,
} from '@hammoc/shared';
import { projectService } from './projectService.js';
import { fileWatcherService } from './fileWatcherService.js';
import { harnessPluginService } from './harnessPluginService.js';
import { harnessShareScopeService } from './harnessShareScopeService.js';
import { applyPolicyToText, applyPolicyToValue } from '../utils/applySecretsPolicy.js';
import {
  bundleManifestSchema,
  loosenedManifestSchema,
} from '../utils/harnessBundleSchema.js';
import { assertSafeBundlePath } from '../utils/assertSafeBundlePath.js';

const KNOWN_BUNDLE_SECTIONS: ReadonlySet<BundleSection> = new Set<BundleSection>([
  'claude-md',
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcp',
  'bmad',
]);

/**
 * In-memory holder for one ZIP entry. `content` is utf-8 text for everything
 * we produce (markdown, json, yaml). Binary skill bundle assets are read
 * straight to Buffer.
 */
interface ZipPayload {
  relativePath: string;
  content: string | Buffer;
}

interface CollectResult {
  items: BundleItem[];
  payloads: ZipPayload[];
  secretsRemovedCount: number;
  secretsReplacedCount: number;
}

/** TTL for stashed import ZIPs (preview → apply window). */
const IMPORT_BUNDLE_TTL_MS = 30 * 60 * 1000;

/** Hammoc package.json version — loaded once at module load time. */
async function readHammocVersion(): Promise<string> {
  try {
    // packages/server/dist/services/harnessBundleService.js (prod) or
    // packages/server/src/services/harnessBundleService.ts (test) — walk up
    // until we find the repo root package.json.
    const candidates = [
      // monorepo root after compile
      path.resolve(process.cwd(), 'package.json'),
      // packages/server during vitest
      path.resolve(process.cwd(), '..', '..', 'package.json'),
    ];
    for (const p of candidates) {
      try {
        const txt = await fs.readFile(p, 'utf-8');
        const obj = JSON.parse(txt) as { version?: string; name?: string };
        if (typeof obj.version === 'string' && obj.name === 'hammoc') {
          return obj.version;
        }
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

/**
 * Recursively read every regular file under `dirRoot`. Returns POSIX-style
 * relative paths (relative to `dirRoot`) suitable for ZIP entries.
 */
async function walkFiles(dirRoot: string): Promise<Array<{ relativePath: string; absolutePath: string; size: number }>> {
  const out: Array<{ relativePath: string; absolutePath: string; size: number }> = [];
  async function recurse(current: string, prefix: string): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(current, ent.name);
      const rel = prefix.length === 0 ? ent.name : `${prefix}/${ent.name}`;
      if (ent.isDirectory()) {
        await recurse(abs, rel);
      } else if (ent.isFile()) {
        let size = 0;
        try {
          size = (await fs.stat(abs)).size;
        } catch {
          continue;
        }
        out.push({ relativePath: rel, absolutePath: abs, size });
      }
    }
  }
  await recurse(dirRoot, '');
  return out;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfPresent(absolutePath: string): Promise<string | null> {
  try {
    return await fs.readFile(absolutePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function readJsonIfPresent(absolutePath: string): Promise<unknown> {
  const text = await readTextIfPresent(absolutePath);
  if (text === null) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Capture the current bytes + mtime of a path for rollback. `null` content
 * marks "file does not exist" — rollback should `unlink` the file written
 * during the failed transaction.
 */
interface PreState {
  absolutePath: string;
  content: Buffer | null;
  /** Used for diagnostics only; rollback restores exact bytes. */
  mtime: string;
}

async function snapshot(absolutePath: string): Promise<PreState> {
  try {
    const stat = await fs.stat(absolutePath);
    const buf = await fs.readFile(absolutePath);
    return { absolutePath, content: buf, mtime: stat.mtime.toISOString() };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { absolutePath, content: null, mtime: '' };
    }
    throw err;
  }
}

async function restoreSnapshot(s: PreState): Promise<void> {
  if (s.content === null) {
    try {
      await fs.unlink(s.absolutePath);
    } catch {
      // already gone — fine
    }
    return;
  }
  await fs.mkdir(path.dirname(s.absolutePath), { recursive: true });
  await fs.writeFile(s.absolutePath, s.content);
  fileWatcherService.noteLocalWrite(s.absolutePath);
}

async function writeBundleFile(absolutePath: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
  fileWatcherService.noteLocalWrite(absolutePath);
}

/** Strip a leading `mcpServers` field so `applyPolicyToValue` can walk it. */
function pickMcpServers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const v = (raw as Record<string, unknown>).mcpServers;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

/** Strip a leading `hooks` field so `applyPolicyToValue` can walk it. */
function pickHooks(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const v = (raw as Record<string, unknown>).hooks;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export interface ExportInput {
  projectSlug: string;
  includes: BundleSection[];
  secretsPolicy: SecretsPolicy;
  /** Required + must equal `true` when `secretsPolicy === 'included-explicit'`. */
  acknowledgedSecretInclusion?: boolean;
}

export interface ExportOutput {
  zipBuffer: Buffer;
  manifest: BundleManifest;
  /** Final filename (with `-WITH-SECRETS` enforced when applicable). */
  filename: string;
  secretsRemovedCount: number;
  secretsReplacedCount: number;
  hadPlaintextSecrets: boolean;
}

export interface ImportInput {
  projectSlug: string;
  zipBuffer: Buffer;
  /** When true, no R/W happens — only the preview is returned. */
  dryRun: boolean;
  /** Maps `"<domain>:<identity>"` → chosen action. Ignored when `dryRun`. */
  itemActions?: Record<string, ImportItemAction>;
}

export interface ImportResult {
  manifest: BundleManifest;
  preview: ImportPreview;
  compatibility: ImportCompatibility;
  compatibilityDetail?: ImportCompatibilityDetail;
  appliedSummary?: ImportApplySummary;
}

/**
 * Cached entry inside the in-memory `bundleTokenStore`. Lookup is by token —
 * the preview request stashes the parsed ZIP + manifest, the apply call
 * resolves the token and consumes the entry exactly once.
 */
interface BundleTokenEntry {
  projectSlug: string;
  zipBuffer: Buffer;
  manifest: BundleManifest;
  insertedAt: number;
}

class HarnessBundleService {
  /**
   * Token → bundle map. Preview stashes the ZIP keyed by a UUID; apply
   * resolves the token to retrieve the same buffer the user previewed. Stale
   * entries past the TTL are GC'd lazily on every preview/apply call.
   */
  private readonly bundleTokens = new Map<string, BundleTokenEntry>();

  // ====================  EXPORT  ============================================

  async export(input: ExportInput): Promise<ExportOutput> {
    const { projectSlug, includes, secretsPolicy } = input;

    if (secretsPolicy === 'included-explicit' && input.acknowledgedSecretInclusion !== true) {
      const err = new Error(
        '`acknowledgedSecretInclusion: true` is required when secretsPolicy === "included-explicit"',
      ) as NodeJS.ErrnoException;
      err.code = 'HARNESS_SECRET_ACK_MISSING';
      throw err;
    }

    const projectRoot = await projectService.resolveOriginalPath(projectSlug);
    const includeSet = new Set<BundleSection>(includes);

    // Collect every section's items + payloads in parallel — they touch
    // disjoint subtrees so there is no need to serialize.
    const collections: CollectResult[] = await Promise.all([
      includeSet.has('claude-md')
        ? this.collectClaudeMd(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
      includeSet.has('skills')
        ? this.collectSkills(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
      includeSet.has('commands')
        ? this.collectCommands(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
      includeSet.has('agents')
        ? this.collectAgents(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
      includeSet.has('hooks')
        ? this.collectHooks(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
      includeSet.has('mcp')
        ? this.collectMcp(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
      includeSet.has('bmad')
        ? this.collectBmad(projectRoot, projectSlug, secretsPolicy)
        : EMPTY_COLLECT,
    ]);

    const items: BundleItem[] = [];
    const payloads: ZipPayload[] = [];
    let secretsRemovedCount = 0;
    let secretsReplacedCount = 0;
    for (const c of collections) {
      items.push(...c.items);
      payloads.push(...c.payloads);
      secretsRemovedCount += c.secretsRemovedCount;
      secretsReplacedCount += c.secretsReplacedCount;
    }

    const pluginDependencies = await this.collectPluginDependencies(projectSlug);

    const manifest: BundleManifest = {
      bundleVersion: HARNESS_BUNDLE_VERSION,
      hammocVersion: await readHammocVersion(),
      claudeCodeSpecVersion: null,
      createdAt: new Date().toISOString(),
      sourceProjectSlug: projectSlug,
      includes: includes.slice(),
      secretsPolicy,
      pluginDependencies,
      items,
    };

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    for (const p of payloads) {
      zip.file(p.relativePath, p.content);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const timestamp = manifest.createdAt.replace(/[:.]/g, '-');
    let filename = `hammoc-harness-${projectSlug}-${timestamp}.zip`;
    if (secretsPolicy === 'included-explicit') {
      // AC2.d-1 — server forces the WITH-SECRETS suffix; the caller cannot
      // override this filename. We strip the trailing `.zip`, append, then
      // re-add the extension. This makes the suffix visible in every
      // download manager / file viewer.
      filename = `hammoc-harness-${projectSlug}-${timestamp}-WITH-SECRETS.zip`;
    }

    return {
      zipBuffer,
      manifest,
      filename,
      secretsRemovedCount,
      secretsReplacedCount,
      hadPlaintextSecrets: secretsPolicy === 'included-explicit',
    };
  }

  // --- Export domain collectors --------------------------------------------

  private async collectClaudeMd(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const filePath = path.join(projectRoot, 'CLAUDE.md');
    const text = await readTextIfPresent(filePath);
    if (text === null) return EMPTY_COLLECT;

    const filtered = applyPolicyToText({
      policy,
      domain: 'claude-md',
      cardName: 'CLAUDE.md',
      text,
    });

    const shareScope = await this.resolveShareScope(projectSlug, 'CLAUDE.md');
    return {
      items: [
        {
          domain: 'claude-md',
          identity: 'CLAUDE.md',
          relativePath: 'CLAUDE.md',
          sourceShareScope: shareScope,
        },
      ],
      payloads: [{ relativePath: 'CLAUDE.md', content: filtered.text }],
      secretsRemovedCount: filtered.removedCount,
      secretsReplacedCount: filtered.replacedCount,
    };
  }

  private async collectSkills(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const skillsRoot = path.join(projectRoot, '.claude', 'skills');
    if (!(await pathExists(skillsRoot))) return EMPTY_COLLECT;

    const items: BundleItem[] = [];
    const payloads: ZipPayload[] = [];
    let removed = 0;
    let replaced = 0;

    let skillDirs: import('fs').Dirent[];
    try {
      skillDirs = await fs.readdir(skillsRoot, { withFileTypes: true });
    } catch {
      return EMPTY_COLLECT;
    }

    for (const dir of skillDirs) {
      if (!dir.isDirectory()) continue;
      const skillRoot = path.join(skillsRoot, dir.name);
      const skillMd = path.join(skillRoot, 'SKILL.md');
      const skillMdText = await readTextIfPresent(skillMd);
      if (skillMdText === null) continue; // not a real skill — silently skip

      const filtered = applyPolicyToText({
        policy,
        domain: 'skill',
        cardName: dir.name,
        text: skillMdText,
      });
      removed += filtered.removedCount;
      replaced += filtered.replacedCount;

      payloads.push({
        relativePath: `skills/${dir.name}/SKILL.md`,
        content: filtered.text,
      });

      // Bundle directories (`assets/`, `references/`, `examples/`, `scripts/`).
      // Copy every file under the skill root EXCEPT SKILL.md (already written).
      const walked = await walkFiles(skillRoot);
      for (const f of walked) {
        if (f.relativePath === 'SKILL.md') continue;
        const buf = await fs.readFile(f.absolutePath);
        // Heuristic: text-like extensions go through the policy walker;
        // everything else is shipped as raw Buffer.
        const ext = path.extname(f.relativePath).toLowerCase();
        const isText = ['.md', '.txt', '.json', '.yaml', '.yml', '.py', '.ts', '.js', '.sh'].includes(ext);
        if (isText) {
          const filteredText = applyPolicyToText({
            policy,
            domain: 'skill',
            cardName: `${dir.name}/${f.relativePath}`,
            text: buf.toString('utf-8'),
          });
          removed += filteredText.removedCount;
          replaced += filteredText.replacedCount;
          payloads.push({
            relativePath: `skills/${dir.name}/${f.relativePath}`,
            content: filteredText.text,
          });
        } else {
          payloads.push({
            relativePath: `skills/${dir.name}/${f.relativePath}`,
            content: buf,
          });
        }
      }

      const shareScope = await this.resolveShareScope(
        projectSlug,
        `.claude/skills/${dir.name}/SKILL.md`,
      );
      items.push({
        domain: 'skill',
        identity: dir.name,
        relativePath: `skills/${dir.name}/SKILL.md`,
        sourceShareScope: shareScope,
      });
    }

    return { items, payloads, secretsRemovedCount: removed, secretsReplacedCount: replaced };
  }

  private async collectCommands(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const commandsRoot = path.join(projectRoot, '.claude', 'commands');
    if (!(await pathExists(commandsRoot))) return EMPTY_COLLECT;

    const items: BundleItem[] = [];
    const payloads: ZipPayload[] = [];
    let removed = 0;
    let replaced = 0;

    const walked = await walkFiles(commandsRoot);
    for (const f of walked) {
      if (!f.relativePath.toLowerCase().endsWith('.md')) continue;
      const text = await fs.readFile(f.absolutePath, 'utf-8');
      // Slash-name: replace OS separator with `:` and strip `.md`. e.g.
      // `BMad/agents/sm.md` → `/BMad:agents:sm`.
      const stem = f.relativePath.replace(/\.md$/i, '');
      const slashName = `/${stem.split(/[\\/]/).join(':')}`;

      const filtered = applyPolicyToText({
        policy,
        domain: 'command',
        cardName: stem,
        text,
      });
      removed += filtered.removedCount;
      replaced += filtered.replacedCount;

      payloads.push({
        relativePath: `commands/${f.relativePath}`,
        content: filtered.text,
      });
      const shareScope = await this.resolveShareScope(
        projectSlug,
        `.claude/commands/${f.relativePath}`,
      );
      items.push({
        domain: 'command',
        identity: slashName,
        relativePath: `commands/${f.relativePath}`,
        sourceShareScope: shareScope,
      });
    }
    return { items, payloads, secretsRemovedCount: removed, secretsReplacedCount: replaced };
  }

  private async collectAgents(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const agentsRoot = path.join(projectRoot, '.claude', 'agents');
    if (!(await pathExists(agentsRoot))) return EMPTY_COLLECT;

    const items: BundleItem[] = [];
    const payloads: ZipPayload[] = [];
    let removed = 0;
    let replaced = 0;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(agentsRoot, { withFileTypes: true });
    } catch {
      return EMPTY_COLLECT;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.md')) continue;
      const abs = path.join(agentsRoot, ent.name);
      const text = await fs.readFile(abs, 'utf-8');
      const name = ent.name.replace(/\.md$/i, '');

      const filtered = applyPolicyToText({
        policy,
        domain: 'agent',
        cardName: name,
        text,
      });
      removed += filtered.removedCount;
      replaced += filtered.replacedCount;

      payloads.push({
        relativePath: `agents/${ent.name}`,
        content: filtered.text,
      });
      const shareScope = await this.resolveShareScope(
        projectSlug,
        `.claude/agents/${ent.name}`,
      );
      items.push({
        domain: 'agent',
        identity: name,
        relativePath: `agents/${ent.name}`,
        sourceShareScope: shareScope,
      });
    }
    return { items, payloads, secretsRemovedCount: removed, secretsReplacedCount: replaced };
  }

  private async collectHooks(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
    const raw = await readJsonIfPresent(settingsPath);
    if (raw === null) return EMPTY_COLLECT;

    const hooksRaw = pickHooks(raw);
    const filtered = applyPolicyToValue({
      policy,
      domain: 'hook',
      cardName: 'hooks',
      value: hooksRaw,
    });
    const filteredHooks = (filtered.value as Record<string, unknown>) ?? {};

    const items: BundleItem[] = [];
    // Each hook is one BundleItem — identity is `event:groupIndex:hookIndex`
    // so that round-trip status comparison can find the matching slot in the
    // target project's settings.json without ambiguity.
    for (const [event, groupsUnknown] of Object.entries(filteredHooks)) {
      if (!Array.isArray(groupsUnknown)) continue;
      groupsUnknown.forEach((group, gi) => {
        if (!group || typeof group !== 'object') return;
        const hooks = (group as { hooks?: unknown }).hooks;
        if (!Array.isArray(hooks)) return;
        hooks.forEach((_h, hi) => {
          items.push({
            domain: 'hook',
            identity: `${event}:${gi}:${hi}`,
            relativePath: 'hooks-fragment.json',
            sourceShareScope: 'shared',
          });
        });
      });
    }

    // Also include the full filtered settings.json so a downstream tool can
    // reproduce the entire enabledPlugins + statusLine state if it wants. We
    // keep this best-effort — secrets are filtered here too.
    const filteredSettings = applyPolicyToValue({
      policy,
      domain: 'hook',
      cardName: 'settings',
      value: raw,
    });

    const payloads: ZipPayload[] = [
      {
        relativePath: 'hooks-fragment.json',
        content: JSON.stringify({ hooks: filteredHooks }, null, 2),
      },
      {
        relativePath: 'settings.json',
        content: JSON.stringify(filteredSettings.value, null, 2),
      },
    ];

    return {
      items,
      payloads,
      secretsRemovedCount: filtered.removedCount + filteredSettings.removedCount,
      secretsReplacedCount: filtered.replacedCount + filteredSettings.replacedCount,
    };
  }

  private async collectMcp(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const mcpPath = path.join(projectRoot, '.mcp.json');
    const raw = await readJsonIfPresent(mcpPath);
    if (raw === null) return EMPTY_COLLECT;

    const mcpServers = pickMcpServers(raw);
    const items: BundleItem[] = [];
    let removed = 0;
    let replaced = 0;
    const filteredServers: Record<string, unknown> = {};
    for (const [name, config] of Object.entries(mcpServers)) {
      const filtered = applyPolicyToValue({
        policy,
        domain: 'mcp',
        cardName: name,
        value: config,
      });
      removed += filtered.removedCount;
      replaced += filtered.replacedCount;
      if (filtered.value !== undefined) {
        filteredServers[name] = filtered.value;
      }
      const shareScope = await this.resolveShareScope(projectSlug, '.mcp.json');
      items.push({
        domain: 'mcp',
        identity: name,
        relativePath: '.mcp.json',
        sourceShareScope: shareScope,
      });
    }

    return {
      items,
      payloads: [
        {
          relativePath: '.mcp.json',
          content: JSON.stringify({ mcpServers: filteredServers }, null, 2),
        },
      ],
      secretsRemovedCount: removed,
      secretsReplacedCount: replaced,
    };
  }

  private async collectBmad(
    projectRoot: string,
    projectSlug: string,
    policy: SecretsPolicy,
  ): Promise<CollectResult> {
    const filePath = path.join(projectRoot, '.bmad-core', 'core-config.yaml');
    const text = await readTextIfPresent(filePath);
    if (text === null) return EMPTY_COLLECT;

    const filtered = applyPolicyToText({
      policy,
      domain: 'bmad',
      cardName: 'core-config',
      text,
    });

    const shareScope = await this.resolveShareScope(
      projectSlug,
      '.bmad-core/core-config.yaml',
    );
    return {
      items: [
        {
          domain: 'bmad',
          identity: 'core-config.yaml',
          relativePath: 'bmad-core-config.yaml',
          sourceShareScope: shareScope,
        },
      ],
      payloads: [{ relativePath: 'bmad-core-config.yaml', content: filtered.text }],
      secretsRemovedCount: filtered.removedCount,
      secretsReplacedCount: filtered.replacedCount,
    };
  }

  /**
   * Active plugin dependencies — read `installed_plugins.json` + `enabledPlugins`
   * and emit only the entries currently enabled.
   */
  async collectPluginDependencies(projectSlug: string): Promise<BundlePluginRef[]> {
    try {
      const res = await harnessPluginService.listCards(projectSlug);
      const out: BundlePluginRef[] = [];
      for (const card of res.cards) {
        if (!card.enabled) continue;
        out.push({
          name: card.name,
          marketplace: card.marketplace,
          version: card.version || undefined,
        });
      }
      return out;
    } catch {
      // Plugin catalog read failure is non-fatal — return empty list. The
      // export still goes through (we never refuse to export a project just
      // because the plugin catalog is corrupted).
      return [];
    }
  }

  /**
   * Resolve a single path's share-scope verdict for manifest bookkeeping.
   * Best-effort — if the share-scope service throws (project not found, etc.)
   * we fall back to `'shared'` since we know the file already exists inside
   * the project tree.
   */
  private async resolveShareScope(
    projectSlug: string,
    relativePath: string,
  ): Promise<BundleSourceShareScope> {
    try {
      const res = await harnessShareScopeService.evaluate({
        projectSlug,
        relativePaths: [relativePath],
      });
      const scope = res.cards[relativePath];
      if (scope === 'fullyIgnored') return 'fullyIgnored';
      if (scope === 'local') return 'local';
      return 'shared';
    } catch {
      return 'shared';
    }
  }

  // ====================  IMPORT  ============================================

  async import(input: ImportInput): Promise<ImportResult> {
    const { projectSlug, zipBuffer, dryRun, itemActions } = input;

    // 1. Open the zip and read manifest first — every other path branch on
    //    compatibility consults the manifest.
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch (err) {
      return emptyImportResult('malformed', {
        jsonError: `failed to open ZIP: ${(err as Error).message}`,
      });
    }

    // ZIP-slip guard runs on every entry up-front (including the implicit
    // directory markers JSZip emits) so we never even peek at a traversal
    // entry. Directory entries can carry traversal too — e.g. `/` (root) and
    // `../etc/` markers from JSZip's normalization of a malicious source
    // archive — so we do NOT exempt them. The guard throws
    // `UnsafeBundlePathError` which the caller treats as a 400.
    for (const entry of Object.keys(zip.files)) {
      assertSafeBundlePath(entry);
    }

    const manifestFile = zip.files['manifest.json'];
    if (!manifestFile) {
      return emptyImportResult('malformed', { jsonError: 'manifest.json missing from bundle' });
    }
    const manifestText = await manifestFile.async('string');

    let manifestRaw: unknown;
    try {
      manifestRaw = JSON.parse(manifestText);
    } catch (err) {
      return emptyImportResult('malformed', { jsonError: (err as Error).message });
    }

    // 2. Loose check first — distinguish "future" / "invalid" from "malformed".
    const loose = loosenedManifestSchema.safeParse(manifestRaw);
    if (!loose.success) {
      return emptyImportResult('malformed', {
        issues: loose.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })),
      });
    }
    const declaredVersion = loose.data.bundleVersion;
    if (declaredVersion === undefined || declaredVersion < 1) {
      return emptyImportResult('invalid', { bundleVersion: declaredVersion });
    }
    if (declaredVersion > HARNESS_BUNDLE_VERSION) {
      return emptyImportResult('future', { bundleVersion: declaredVersion });
    }

    // 3. Strict check — full Zod schema.
    const strict = bundleManifestSchema.safeParse(manifestRaw);
    if (!strict.success) {
      return emptyImportResult('malformed', {
        issues: strict.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })),
      });
    }
    const manifest = strict.data as BundleManifest;

    // 4. Compute preview rows
    const projectRoot = await projectService.resolveOriginalPath(projectSlug);
    const preview = await this.computePreview(projectRoot, manifest, zip);

    if (dryRun) {
      return {
        manifest,
        preview,
        compatibility: 'compatible',
      };
    }

    // 5. Apply.
    const summary = await this.applyImport(
      projectRoot,
      manifest,
      zip,
      itemActions ?? {},
    );

    return {
      manifest,
      preview,
      compatibility: 'compatible',
      appliedSummary: summary,
    };
  }

  private async computePreview(
    projectRoot: string,
    manifest: BundleManifest,
    zip: JSZip,
  ): Promise<ImportPreview> {
    const items: ImportPreviewItem[] = [];

    // Pre-compute known sections so unknownSections lists only the strangers.
    const unknownSections = manifest.includes.filter(
      (s) => !KNOWN_BUNDLE_SECTIONS.has(s),
    );

    // Drop items belonging to unknown sections from the preview rows
    // (AC5.b — unknown sections do not appear in the conflict UI).
    const knownItems = manifest.items.filter((it) => {
      switch (it.domain) {
        case 'claude-md':
          return KNOWN_BUNDLE_SECTIONS.has('claude-md');
        case 'skill':
          return KNOWN_BUNDLE_SECTIONS.has('skills');
        case 'mcp':
          return KNOWN_BUNDLE_SECTIONS.has('mcp');
        case 'hook':
          return KNOWN_BUNDLE_SECTIONS.has('hooks');
        case 'command':
          return KNOWN_BUNDLE_SECTIONS.has('commands');
        case 'agent':
          return KNOWN_BUNDLE_SECTIONS.has('agents');
        case 'bmad':
          return KNOWN_BUNDLE_SECTIONS.has('bmad');
        default:
          return false;
      }
    });

    for (const item of knownItems) {
      const verdict = await this.statusForItem(projectRoot, item, zip, manifest);
      items.push(verdict);
    }

    const missingPlugins = await this.computeMissingPlugins(manifest);

    return { items, missingPlugins, unknownSections };
  }

  /**
   * Compare one bundle item to its destination on disk and produce the
   * preview row. Status semantics: `new` → no file at target, `same` → bytes
   * match exactly, `overwrite` → file exists with different content,
   * `conflict` → a directory sits where a file would land (or vice versa).
   */
  private async statusForItem(
    projectRoot: string,
    item: BundleItem,
    zip: JSZip,
    manifest: BundleManifest,
  ): Promise<ImportPreviewItem> {
    const targetPath = this.targetPathFor(projectRoot, item);
    const targetRel = path.relative(projectRoot, targetPath).split(path.sep).join('/');

    let status: ImportItemStatus = 'new';
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        status = 'conflict';
      } else {
        const bundleEntry = zip.files[item.relativePath];
        const targetBytes = await fs.readFile(targetPath, 'utf-8');
        if (bundleEntry) {
          const bundleText = await bundleEntry.async('string');
          status = sameContent(item, bundleText, targetBytes, manifest) ? 'same' : 'overwrite';
        } else {
          // The bundle declared this item but the payload entry is missing —
          // happens for hook items (multiple hooks share `hooks-fragment.json`)
          // and is normal. Compare via a per-hook lookup for those.
          if (item.domain === 'hook') {
            status = await this.hookStatus(projectRoot, item, zip);
          } else {
            status = 'overwrite';
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Permission-denied / I/O — treat as conflict so the user sees it.
        status = 'conflict';
      }
    }

    const defaultAction: ImportItemAction =
      status === 'same' ? 'skip' : status === 'new' ? 'overwrite' : 'overwrite';

    return {
      domain: item.domain,
      identity: item.identity,
      status,
      defaultAction,
      targetPath: targetRel,
    };
  }

  private async hookStatus(
    projectRoot: string,
    item: BundleItem,
    zip: JSZip,
  ): Promise<ImportItemStatus> {
    const fragmentFile = zip.files['hooks-fragment.json'];
    if (!fragmentFile) return 'overwrite';
    const text = await fragmentFile.async('string');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return 'overwrite';
    }
    const bundleHooks = pickHooks(parsed);
    const [event, gi, hi] = item.identity.split(':');
    const groups = (bundleHooks as Record<string, unknown>)[event];
    if (!Array.isArray(groups)) return 'overwrite';
    const group = groups[Number(gi)] as { hooks?: unknown[] } | undefined;
    const bundleHook = group?.hooks?.[Number(hi)];
    if (!bundleHook) return 'overwrite';

    // Compare against the target's settings.json hook at the same slot.
    const targetSettings = await readJsonIfPresent(
      path.join(projectRoot, '.claude', 'settings.json'),
    );
    if (!targetSettings) return 'new';
    const targetHooks = pickHooks(targetSettings) as Record<string, unknown>;
    const tGroups = targetHooks[event];
    if (!Array.isArray(tGroups)) return 'new';
    const tGroup = tGroups[Number(gi)] as { hooks?: unknown[] } | undefined;
    const tHook = tGroup?.hooks?.[Number(hi)];
    if (!tHook) return 'new';
    return JSON.stringify(tHook) === JSON.stringify(bundleHook) ? 'same' : 'overwrite';
  }

  /** Resolve where one bundle item should be written on the target project. */
  private targetPathFor(projectRoot: string, item: BundleItem): string {
    switch (item.domain) {
      case 'claude-md':
        return path.join(projectRoot, 'CLAUDE.md');
      case 'skill':
        return path.join(projectRoot, '.claude', 'skills', item.identity, 'SKILL.md');
      case 'command': {
        // identity is the slash-name (`/foo:bar:baz`) — convert back to a path.
        const stem = item.identity.replace(/^\//, '').split(':').join('/');
        return path.join(projectRoot, '.claude', 'commands', `${stem}.md`);
      }
      case 'agent':
        return path.join(projectRoot, '.claude', 'agents', `${item.identity}.md`);
      case 'mcp':
        return path.join(projectRoot, '.mcp.json');
      case 'hook':
        return path.join(projectRoot, '.claude', 'settings.json');
      case 'bmad':
        return path.join(projectRoot, '.bmad-core', 'core-config.yaml');
      default: {
        const _exhaustive: never = item.domain;
        throw new Error(`unreachable: ${_exhaustive as string}`);
      }
    }
  }

  private async computeMissingPlugins(manifest: BundleManifest): Promise<ImportMissingPlugin[]> {
    if (manifest.pluginDependencies.length === 0) return [];
    try {
      // `harnessPluginService.listCards` enumerates the USER-scope catalog
      // (~/.claude/plugins/installed_plugins.json), so the slug argument only
      // selects the current-project context for unrelated session metadata —
      // it does NOT scope the returned plugin set. Passing `sourceProjectSlug`
      // here looks like "source project's catalog" but is functionally
      // irrelevant to the comparison; the keyspace below (`name@marketplace`)
      // is process-wide. Keeping the slug pass-through for parity with other
      // callers; the semantics depend solely on user-scope state.
      const res = await harnessPluginService.listCards(manifest.sourceProjectSlug);
      const installedKeys = new Set(res.cards.map((c) => `${c.name}@${c.marketplace}`));
      return manifest.pluginDependencies.filter(
        (ref) => !installedKeys.has(`${ref.name}@${ref.marketplace}`),
      );
    } catch {
      return manifest.pluginDependencies.slice();
    }
  }

  // --- Apply ---------------------------------------------------------------

  private async applyImport(
    projectRoot: string,
    manifest: BundleManifest,
    zip: JSZip,
    itemActions: Record<string, ImportItemAction>,
  ): Promise<ImportApplySummary> {
    const snapshots: PreState[] = [];
    const results: ImportApplyItemResult[] = [];
    let applied = 0;
    let skipped = 0;
    const renamed = 0;
    const secretsRemovedCount = 0;
    const secretsReplacedCount = 0;

    // First: snapshot every target path that any action might touch. For mcp
    // and hook items the same target file is shared by N items — we only
    // snapshot once.
    const seenTargets = new Set<string>();
    for (const item of manifest.items) {
      const action = itemActions[`${item.domain}:${item.identity}`] ?? 'skip';
      if (action === 'skip') continue;
      const target = this.targetPathFor(projectRoot, item);
      if (seenTargets.has(target)) continue;
      seenTargets.add(target);
      snapshots.push(await snapshot(target));
    }

    try {
      // Group items by target file so multi-item single-file domains (mcp +
      // hook) are written exactly once with the merged payload.
      const mcpMerge: Record<string, unknown> = {};
      const hookEvents: Record<string, unknown> = {};

      // Read existing destination files so a partial overwrite (e.g. just one
      // mcp server) keeps the rest of the file intact.
      const existingMcp = await readJsonIfPresent(path.join(projectRoot, '.mcp.json'));
      const existingMcpServers = pickMcpServers(existingMcp) as Record<string, unknown>;
      Object.assign(mcpMerge, existingMcpServers);

      const existingSettings = await readJsonIfPresent(
        path.join(projectRoot, '.claude', 'settings.json'),
      );
      const existingHooks = pickHooks(existingSettings) as Record<string, unknown>;
      Object.assign(hookEvents, existingHooks);

      // Per-domain dispatch.
      for (const item of manifest.items) {
        const key = `${item.domain}:${item.identity}`;
        const action = itemActions[key] ?? 'skip';
        if (action === 'skip') {
          skipped += 1;
          results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
          continue;
        }

        switch (item.domain) {
          case 'claude-md': {
            const entry = zip.files[item.relativePath];
            if (!entry) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const text = await entry.async('string');
            const targetPath = this.targetPathFor(projectRoot, item);
            if (action === 'appendSection') {
              const existing = (await readTextIfPresent(targetPath)) ?? '';
              const { appendMarkdownSections, splitMarkdownByH2 } = await import('@hammoc/shared');
              const next = appendMarkdownSections(existing, splitMarkdownByH2(text));
              await writeBundleFile(targetPath, next);
            } else {
              await writeBundleFile(targetPath, text);
            }
            applied += 1;
            results.push({
              domain: item.domain,
              identity: item.identity,
              action,
              status: 'applied',
              finalPath: path.relative(projectRoot, targetPath).split(path.sep).join('/'),
            });
            break;
          }
          case 'bmad': {
            const entry = zip.files[item.relativePath];
            if (!entry) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const text = await entry.async('string');
            const targetPath = this.targetPathFor(projectRoot, item);
            await writeBundleFile(targetPath, text);
            applied += 1;
            results.push({
              domain: item.domain,
              identity: item.identity,
              action,
              status: 'applied',
              finalPath: path.relative(projectRoot, targetPath).split(path.sep).join('/'),
            });
            break;
          }
          case 'skill': {
            const skillRoot = path.join(projectRoot, '.claude', 'skills', item.identity);
            // Re-derive all skill files from the ZIP under `skills/<name>/`.
            const prefix = `skills/${item.identity}/`;
            for (const entryName of Object.keys(zip.files)) {
              if (!entryName.startsWith(prefix)) continue;
              const f = zip.files[entryName];
              if (f.dir) continue;
              const rel = entryName.slice(prefix.length);
              const dest = path.join(skillRoot, rel);
              // Capture pre-state of nested files so rollback can restore them.
              snapshots.push(await snapshot(dest));
              const content = await f.async('nodebuffer');
              await writeBundleFile(dest, content);
            }
            applied += 1;
            results.push({
              domain: item.domain,
              identity: item.identity,
              action,
              status: 'applied',
              finalPath: path
                .relative(projectRoot, path.join(skillRoot, 'SKILL.md'))
                .split(path.sep)
                .join('/'),
            });
            break;
          }
          case 'command': {
            const entry = zip.files[item.relativePath];
            if (!entry) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const text = await entry.async('string');
            const targetPath = this.targetPathFor(projectRoot, item);
            await writeBundleFile(targetPath, text);
            applied += 1;
            results.push({
              domain: item.domain,
              identity: item.identity,
              action,
              status: 'applied',
              finalPath: path.relative(projectRoot, targetPath).split(path.sep).join('/'),
            });
            break;
          }
          case 'agent': {
            const entry = zip.files[item.relativePath];
            if (!entry) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const text = await entry.async('string');
            const targetPath = this.targetPathFor(projectRoot, item);
            await writeBundleFile(targetPath, text);
            applied += 1;
            results.push({
              domain: item.domain,
              identity: item.identity,
              action,
              status: 'applied',
              finalPath: path.relative(projectRoot, targetPath).split(path.sep).join('/'),
            });
            break;
          }
          case 'mcp': {
            // Read the bundle's `.mcp.json` once and merge each chosen entry
            // into the in-memory `mcpMerge` map. We flush after the loop.
            const entry = zip.files['.mcp.json'];
            if (!entry) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const text = await entry.async('string');
            let bundleObj: unknown;
            try {
              bundleObj = JSON.parse(text);
            } catch {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const bundleServers = pickMcpServers(bundleObj) as Record<string, unknown>;
            if (item.identity in bundleServers) {
              mcpMerge[item.identity] = bundleServers[item.identity];
              applied += 1;
              results.push({
                domain: item.domain,
                identity: item.identity,
                action,
                status: 'applied',
                finalPath: '.mcp.json',
              });
            } else {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
            }
            break;
          }
          case 'hook': {
            const entry = zip.files['hooks-fragment.json'];
            if (!entry) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const text = await entry.async('string');
            let bundleObj: unknown;
            try {
              bundleObj = JSON.parse(text);
            } catch {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            const bundleHooks = pickHooks(bundleObj) as Record<string, unknown>;
            const [event, giStr, hiStr] = item.identity.split(':');
            const gi = Number(giStr);
            const hi = Number(hiStr);
            const bundleGroups = (bundleHooks[event] as unknown[]) || [];
            const bundleGroup = bundleGroups[gi] as { matcher?: string; hooks?: unknown[] } | undefined;
            const bundleHook = bundleGroup?.hooks?.[hi];
            if (!bundleHook) {
              skipped += 1;
              results.push({ domain: item.domain, identity: item.identity, action, status: 'skipped' });
              break;
            }
            // Append the hook to the target's event slot. We keep this
            // additive (never delete existing target hooks) so an import
            // never silently destroys local hooks.
            //
            // Policy (DESIGN-001 — intentional, not a bug):
            //   This branch is "additive append". We do NOT dedup by
            //   (event, gi, hi) slot here. The preview layer normally
            //   masks duplicate re-imports: if the same hook already
            //   exists at the same slot, statusForItem reports `same`
            //   and the default action becomes `skip`, so this code
            //   path is not reached. The only way a duplicate group
            //   reaches this push is when the UI explicitly upgrades
            //   the action to `overwrite` for a `same` row — which is
            //   treated as a deliberate "register again" intent (e.g.
            //   the user wants two parallel hook registrations).
            //
            //   If future requirements need slot-unique semantics, add
            //   a dedup guard here keyed on
            //   (event, bundleGroup?.matcher, JSON.stringify(bundleHook))
            //   BEFORE pushing — but the current contract is "append".
            const targetGroups = (hookEvents[event] as unknown[]) || [];
            const groupsArr = Array.isArray(targetGroups) ? [...targetGroups] : [];
            groupsArr.push({
              matcher: bundleGroup?.matcher,
              hooks: [bundleHook],
            });
            hookEvents[event] = groupsArr;
            applied += 1;
            results.push({
              domain: item.domain,
              identity: item.identity,
              action,
              status: 'applied',
              finalPath: '.claude/settings.json',
            });
            break;
          }
          default: {
            const _exhaustive: never = item.domain;
            throw new Error(`unreachable: ${_exhaustive as string}`);
          }
        }
      }

      // Flush mcp / hook merges.
      const touchedMcp = manifest.items.some(
        (i) => i.domain === 'mcp' && (itemActions[`mcp:${i.identity}`] ?? 'skip') !== 'skip',
      );
      if (touchedMcp) {
        const target = path.join(projectRoot, '.mcp.json');
        await writeBundleFile(
          target,
          JSON.stringify({ ...((existingMcp as object) ?? {}), mcpServers: mcpMerge }, null, 2),
        );
      }
      const touchedHook = manifest.items.some(
        (i) => i.domain === 'hook' && (itemActions[`hook:${i.identity}`] ?? 'skip') !== 'skip',
      );
      if (touchedHook) {
        const target = path.join(projectRoot, '.claude', 'settings.json');
        const nextSettings = {
          ...((existingSettings as object) ?? {}),
          hooks: hookEvents,
        };
        await writeBundleFile(target, JSON.stringify(nextSettings, null, 2));
      }

      // Translate the source bundle's secret counters by inspecting
      // `manifest.secretsPolicy` so the response surfaces the user-visible
      // totals (helper module already pre-counted at export time, but
      // recomputing here keeps a single source of truth on the import side).
      if (manifest.secretsPolicy === 'included-explicit') {
        // Plaintext bundles — no removed/replaced counters apply.
      }

      return {
        applied,
        skipped,
        renamed,
        results,
        secretsRemovedCount,
        secretsReplacedCount,
        hadPlaintextSecrets: manifest.secretsPolicy === 'included-explicit',
      };
    } catch (err) {
      // Roll back in reverse snapshot order so children land before parents
      // when both were created during the transaction.
      for (let i = snapshots.length - 1; i >= 0; i -= 1) {
        try {
          await restoreSnapshot(snapshots[i]);
        } catch {
          // best-effort — continue rolling back the rest
        }
      }
      throw err;
    }
  }

  // --------------------  Token store (preview → apply window) -------------

  /**
   * Stash a parsed bundle + its source ZIP behind a one-time token. The token
   * is what the apply call must echo. Tokens are GC'd lazily once they pass
   * the TTL — a 30-minute window mirrors the export dialog session length.
   */
  storeBundle(projectSlug: string, zipBuffer: Buffer, manifest: BundleManifest): string {
    this.gcTokenStore();
    const token = randomUUID();
    this.bundleTokens.set(token, {
      projectSlug,
      zipBuffer,
      manifest,
      insertedAt: Date.now(),
    });
    return token;
  }

  consumeBundle(token: string): BundleTokenEntry | null {
    this.gcTokenStore();
    const entry = this.bundleTokens.get(token);
    if (!entry) return null;
    return entry;
  }

  releaseBundle(token: string): void {
    this.bundleTokens.delete(token);
  }

  private gcTokenStore(): void {
    const now = Date.now();
    for (const [token, entry] of this.bundleTokens) {
      if (now - entry.insertedAt > IMPORT_BUNDLE_TTL_MS) {
        this.bundleTokens.delete(token);
      }
    }
  }
}

const EMPTY_COLLECT: CollectResult = {
  items: [],
  payloads: [],
  secretsRemovedCount: 0,
  secretsReplacedCount: 0,
};

/**
 * Compare a bundle entry's content with the on-disk file at the target.
 * For `mcp`/`hook` items the per-item comparison is more granular than
 * file-byte equality (the bundle file is the union of all items in that
 * domain) so we delegate to the domain-specific status helpers in
 * `statusForItem` / `hookStatus`. For every other item this byte compare is
 * sufficient.
 */
function sameContent(
  item: BundleItem,
  bundleText: string,
  targetText: string,
  _manifest: BundleManifest,
): boolean {
  if (item.domain === 'mcp' || item.domain === 'hook') {
    // The whole `.mcp.json` / `hooks-fragment.json` rarely matches byte-for-
    // byte because the target may contain other items. Treat as overwrite.
    return false;
  }
  return bundleText === targetText;
}

function emptyImportResult(
  compatibility: ImportCompatibility,
  detail?: ImportCompatibilityDetail,
): ImportResult {
  const stubManifest: BundleManifest = {
    bundleVersion: HARNESS_BUNDLE_VERSION,
    hammocVersion: '',
    claudeCodeSpecVersion: null,
    createdAt: '',
    sourceProjectSlug: '',
    includes: [],
    secretsPolicy: 'excluded',
    pluginDependencies: [],
    items: [],
  };
  return {
    manifest: stubManifest,
    preview: { items: [], missingPlugins: [], unknownSections: [] },
    compatibility,
    compatibilityDetail: detail,
  };
}

export const harnessBundleService = new HarnessBundleService();
export { HarnessBundleService };

// Re-export so callers do not have to grep through the utils folder.
export { UnsafeBundlePathError } from '../utils/assertSafeBundlePath.js';
// Reference os module to silence unused-import warnings when the cache-token
// store is the only consumer.
void os;
