/**
 * Story 30.3 (Task 2.1): single source of truth for placeholder ENV names
 * used when `secretsPolicy === 'placeholder'`.
 *
 * The export pipeline walks each domain's payload, calls `detectSecretsInValue`
 * / `detectSecretsInText` from secretHeuristic.ts to locate every secret, and
 * for each match asks this module to produce a stable ENV reference name.
 * The name is what gets written to disk as `${ENV_REF_NAME}` so the importer
 * can wire it up via environment variables.
 *
 * Naming policy (AC2.c):
 *   - mcp     `env.<KEY>`              → `<UPPER_NAME>_<UPPER_KEY>`
 *   - mcp     `headers.Authorization`  → `BEARER_TOKEN_<UPPER_NAME>`
 *   - mcp     other paths              → `<UPPER_NAME>_<UPPER_LAST_PATH_SEG>`
 *   - hook    `command` / `prompt`     → `HOOK_<EVENT>_TOKEN`
 *   - command body match               → `COMMAND_<UPPER_SLASH_PATH>_TOKEN`
 *   - agent   body match               → `AGENT_<UPPER_NAME>_TOKEN`
 *   - claude-md body match             → `CLAUDE_MD_TOKEN_<INDEX>`
 *
 * The names are intentionally not collision-free across multiple secrets in
 * the same card — the export pipeline appends a numeric suffix when the same
 * name is already emitted in that bundle (handled by the caller, not here),
 * so this module stays a pure-function lookup table.
 */

import type { BundleItemDomain } from '@hammoc/shared';

export interface NamePlaceholderInput {
  /** Card domain — disambiguates the naming rule. */
  domain: BundleItemDomain;
  /**
   * For mcp/hook: the dot-path returned by `detectSecretsInValue` (e.g.
   * `mcpServers.context7.env.API_KEY`, `mcpServers.gh.headers.Authorization`).
   * For command/agent/claude-md: an empty string or `body:<line>`.
   */
  fieldPath: string;
  /** Active card name (skill: skillName, mcp: serverName, agent: name, etc.). */
  cardName: string;
  /** For hook entries — the matched HarnessHookEvent. */
  hookEvent?: string;
}

const NON_ALNUM_RE = /[^A-Za-z0-9]+/g;

function toUpperSnake(input: string): string {
  return input
    .trim()
    .replace(NON_ALNUM_RE, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function lastPathSegment(fieldPath: string): string {
  const segments = fieldPath.split('.').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? '';
}

export function namePlaceholder(input: NamePlaceholderInput): string {
  const card = toUpperSnake(input.cardName) || 'UNNAMED';

  switch (input.domain) {
    case 'mcp': {
      const fp = input.fieldPath;
      // Authorization header → BEARER_TOKEN_<CARD>
      if (/(^|\.)headers\.Authorization$/i.test(fp)) {
        return `BEARER_TOKEN_${card}`;
      }
      // env.<KEY> → <CARD>_<KEY>
      const envMatch = fp.match(/(^|\.)env\.([^.]+)$/);
      if (envMatch) {
        return `${card}_${toUpperSnake(envMatch[2])}`;
      }
      // Fallback: last segment
      const seg = toUpperSnake(lastPathSegment(fp)) || 'SECRET';
      return `${card}_${seg}`;
    }
    case 'hook': {
      const evt = toUpperSnake(input.hookEvent ?? 'GENERIC');
      return `HOOK_${evt}_${card}_TOKEN`;
    }
    case 'command': {
      return `COMMAND_${card}_TOKEN`;
    }
    case 'agent': {
      return `AGENT_${card}_TOKEN`;
    }
    case 'claude-md': {
      return `CLAUDE_MD_${card || 'TOKEN'}_${toUpperSnake(input.fieldPath) || 'TOKEN'}`
        .replace(/_+$/, '');
    }
    case 'skill': {
      return `SKILL_${card}_TOKEN`;
    }
    case 'bmad': {
      return `BMAD_${card}_TOKEN`;
    }
    default: {
      const _exhaustive: never = input.domain;
      return _exhaustive;
    }
  }
}
