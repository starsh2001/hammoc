/**
 * Story 31.3 (Task A.3 / A.5): token attribution + exact count_tokens proxy.
 *
 * Two responsibilities, sharing one text-resolution path so the "exact count"
 * input and the "approximation" input are always the same bytes (N-1):
 *
 *   1. listTokenAttribution(projectSlug) — enumerate the measured harness
 *      elements (project/global CLAUDE.md · each skill's SKILL.md · the
 *      Hammoc-managed context-builder injection) and report UTF-8 byte size +
 *      `approxTokens = ceil(bytes/4)` + a sha256 content hash (AC-B1 / AC-B2).
 *
 *   2. exactCount(projectSlug, req) — proxy the official `count_tokens` via the
 *      already-installed `@anthropic-ai/sdk` `messages.countTokens` (spike #2,
 *      §15 — no new dependency), keyed by a server-recomputed content hash
 *      (N-B: the request hash is only an optimistic hint). Failures are
 *      non-blocking (`failed: true`) so the client keeps the approximation
 *      (AC-B3.c).
 *
 * Enumeration REUSES existing controllers/services (claudeMdService,
 * harnessSkillService, contextBuilderService) — no new file scanner (S-2). The
 * context-builder injection is estimated from the Story 31.2 manifest WITHOUT
 * executing the hook (dynamic variable / command values are placeholders).
 *
 * Per spike #1 (§14) the SERVER approximation tier is byte `size/4` only — the
 * `@anthropic-ai/tokenizer` tier was NOT adopted (Task A.4 skipped).
 */

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import {
  type TokenAttributionItem,
  type TokenAttributionKind,
  type ExactTokenCountRequest,
  type ExactTokenCountResponse,
} from '@hammoc/shared';
import { createLogger } from '../utils/logger.js';
import { claudeMdService } from './claudeMdService.js';
import { harnessSkillService } from './harnessSkillService.js';
import { contextBuilderService } from './contextBuilderService.js';
import { projectService } from './projectService.js';

const log = createLogger('tokenCountService');

/**
 * Model passed to count_tokens. The count is tokenizer-family stable across
 * Claude 4.x, so any current model works; overridable via env in case the
 * default is later deprecated. spike #2 verified the call live.
 */
const COUNT_TOKENS_MODEL = process.env.OBSERVABILITY_COUNT_TOKENS_MODEL || 'claude-sonnet-4-6';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** ceil(bytes / 4) — the size-based heuristic (§14). */
export function approxTokensFromBytes(bytes: number): number {
  return Math.ceil(Math.max(0, bytes) / 4);
}

function samePath(a: string, b: string): boolean {
  const na = path.normalize(a);
  const nb = path.normalize(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/**
 * Construct an Anthropic client for count_tokens (spike #2). Priority:
 * `ANTHROPIC_API_KEY` → the Claude Code OAuth access token from
 * `~/.claude/.credentials.json` (verified live). Returns null when neither is
 * available — the caller degrades gracefully.
 */
function getAnthropicClient(): Anthropic | null {
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic();
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const cred = JSON.parse(readFileSync(credPath, 'utf8')) as {
      claudeAiOauth?: { accessToken?: string };
    };
    const token = cred?.claudeAiOauth?.accessToken;
    if (token) return new Anthropic({ authToken: token });
  } catch {
    // no credentials — fall through.
  }
  return null;
}

class TokenCountService {
  /** sha256(text) → token count. In-memory; persisted best-effort to disk. */
  private cache = new Map<string, number>();
  private cacheLoaded = false;

  private cacheFilePath(): string {
    return path.join(os.homedir(), '.hammoc', 'observability', 'token-count-cache.json');
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const text = await fs.readFile(this.cacheFilePath(), 'utf8');
      const obj = JSON.parse(text) as Record<string, number>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') this.cache.set(k, v);
      }
    } catch {
      // missing/corrupt — start empty.
    }
  }

  private async persistCache(): Promise<void> {
    try {
      const file = this.cacheFilePath();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(Object.fromEntries(this.cache)), 'utf8');
    } catch (err) {
      log.warn(`token cache persist failed: ${(err as Error).message}`);
    }
  }

  /**
   * Enumerate measured harness elements (AC-B1.a). Missing CLAUDE.md files and a
   * disabled/empty context builder are omitted (they contribute no tokens).
   */
  async listTokenAttribution(projectSlug: string): Promise<TokenAttributionItem[]> {
    const items: TokenAttributionItem[] = [];

    // project / global CLAUDE.md
    const projectMd = await this.readClaudeMd({ scope: 'project', projectSlug });
    if (projectMd) items.push(this.makeItem('claudeMd-project', 'CLAUDE.md (project)', projectMd.text, projectMd.path));
    const globalMd = await this.readClaudeMd({ scope: 'user' });
    if (globalMd) items.push(this.makeItem('claudeMd-global', 'CLAUDE.md (global)', globalMd.text, globalMd.path));

    // each skill's SKILL.md (active source only)
    try {
      const { cards } = await harnessSkillService.listCards(projectSlug);
      for (const card of cards) {
        const root = card.sources[0]?.absoluteRoot;
        if (!root) continue;
        const skillMd = path.join(root, 'SKILL.md');
        try {
          const text = await fs.readFile(skillMd, 'utf8');
          items.push(this.makeItem('skill', `skill: ${card.name}`, text, skillMd));
        } catch {
          // SKILL.md unreadable — skip this card.
        }
      }
    } catch (err) {
      log.warn(`skill enumeration failed: ${(err as Error).message}`);
    }

    // Hammoc-managed context builder injection (manifest-assembled, no execution)
    const cbText = await this.assembleContextBuilderText(projectSlug);
    if (cbText) items.push(this.makeItem('contextBuilder', 'Context builder injection', cbText));

    return items;
  }

  /**
   * Exact count for one element (AC-B3). The text is re-resolved server-side and
   * its sha256 is the AUTHORITATIVE cache key (N-B) — the request `contentHash`
   * is only an optimistic hint. count_tokens failures return `failed: true`.
   */
  async exactCount(projectSlug: string, req: ExactTokenCountRequest): Promise<ExactTokenCountResponse> {
    const text = await this.resolveElementText(projectSlug, req.kind, req.path);
    if (text == null) return { tokens: 0, cached: false, failed: true };

    const key = sha256(text);
    await this.loadCache();
    const hit = this.cache.get(key);
    if (hit !== undefined) return { tokens: hit, cached: true };

    const tokens = await this.callCountTokens(text);
    if (tokens == null) return { tokens: 0, cached: false, failed: true };

    this.cache.set(key, tokens);
    void this.persistCache();
    return { tokens, cached: false };
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private makeItem(
    kind: TokenAttributionKind,
    label: string,
    text: string,
    filePath?: string,
  ): TokenAttributionItem {
    const bytes = utf8Bytes(text);
    return {
      kind,
      label,
      ...(filePath ? { path: filePath } : {}),
      bytes,
      approxTokens: approxTokensFromBytes(bytes),
      contentHash: sha256(text),
    };
  }

  /** Resolve the text used for BOTH attribution and exact-count (N-1). */
  private async resolveElementText(
    projectSlug: string,
    kind: TokenAttributionKind,
    elementPath?: string,
  ): Promise<string | null> {
    switch (kind) {
      case 'claudeMd-project':
        return (await this.readClaudeMd({ scope: 'project', projectSlug }))?.text ?? null;
      case 'claudeMd-global':
        return (await this.readClaudeMd({ scope: 'user' }))?.text ?? null;
      case 'contextBuilder': {
        const t = await this.assembleContextBuilderText(projectSlug);
        return t || null;
      }
      case 'skill':
        return this.readSkillTextByPath(projectSlug, elementPath);
      default:
        return null;
    }
  }

  private async readClaudeMd(
    ref: { scope: 'project'; projectSlug: string } | { scope: 'user' },
  ): Promise<{ text: string; path: string } | null> {
    try {
      const res = await claudeMdService.read(ref);
      return { text: res.content ?? '', path: res.absolutePath ?? 'CLAUDE.md' };
    } catch {
      return null; // missing / not-a-file → omit.
    }
  }

  /**
   * Read a skill's SKILL.md, validating `elementPath` against the enumerated
   * skills so an arbitrary client path can never be read (the path must be one
   * the server itself vouched for in listTokenAttribution).
   */
  private async readSkillTextByPath(projectSlug: string, elementPath?: string): Promise<string | null> {
    if (!elementPath) return null;
    try {
      const { cards } = await harnessSkillService.listCards(projectSlug);
      for (const card of cards) {
        const root = card.sources[0]?.absoluteRoot;
        if (!root) continue;
        const skillMd = path.join(root, 'SKILL.md');
        if (samePath(skillMd, elementPath)) {
          return await fs.readFile(skillMd, 'utf8');
        }
      }
    } catch {
      // fall through.
    }
    return null;
  }

  /**
   * Assemble the context-builder `additionalContext` text WITHOUT executing the
   * hook (N-1). Reference files are read (their content dominates the size);
   * dynamic variables / acknowledged commands contribute only their block
   * headers with a `(dynamic)` placeholder. Mirrors the block format of
   * `contextBuilderScriptTemplate` for the statically-knowable parts. Returns ''
   * when the builder is disabled or empty.
   */
  private async assembleContextBuilderText(projectSlug: string): Promise<string> {
    let manifest;
    try {
      ({ manifest } = await contextBuilderService.readManifest(projectSlug));
    } catch {
      return '';
    }
    if (!manifest.enabled) return '';

    let projectRoot: string;
    try {
      projectRoot = await projectService.resolveOriginalPath(projectSlug);
    } catch {
      return '';
    }

    const blocks: string[] = [];
    for (const rel of manifest.files) {
      const abs = path.resolve(projectRoot, rel);
      try {
        const content = await fs.readFile(abs, 'utf8');
        blocks.push(`## Reference file: ${rel}\n\n${content}`);
      } catch {
        blocks.push(`## Reference file: ${rel}\n\n(파일을 찾을 수 없음: ${rel})`);
      }
    }
    // Dynamic variable headers (values are computed at hook runtime — placeholder here).
    if (manifest.variables.gitBranch) blocks.push('## Current git branch\n\n(dynamic)');
    if (manifest.variables.recentCommits) {
      blocks.push(`## Recent ${manifest.recentCommitsCount ?? 5} commit(s)\n\n(dynamic)`);
    }
    if (manifest.variables.uncommittedCount) blocks.push('## Uncommitted file count\n\n(dynamic)');
    if (manifest.variables.today) blocks.push('## Today\n\n(dynamic)');
    if (manifest.variables.activeBmadStory) blocks.push('## Active BMad story\n\n(dynamic)');
    for (const cc of manifest.customCommands) {
      if (cc.acknowledged) blocks.push(`## Command: ${cc.command}\n\n(dynamic)`);
    }
    return blocks.join('\n\n');
  }

  private async callCountTokens(text: string): Promise<number | null> {
    const client = getAnthropicClient();
    if (!client) {
      log.warn('count_tokens unavailable — no ANTHROPIC_API_KEY and no OAuth credentials');
      return null;
    }
    try {
      const res = await client.messages.countTokens({
        model: COUNT_TOKENS_MODEL,
        messages: [{ role: 'user', content: text }],
      });
      return res.input_tokens;
    } catch (err) {
      log.warn(`count_tokens failed: ${(err as Error).message}`);
      return null;
    }
  }
}

export const tokenCountService = new TokenCountService();
