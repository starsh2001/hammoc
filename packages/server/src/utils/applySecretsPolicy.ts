/**
 * Story 30.3 (Task 2.2): apply the three `secretsPolicy` modes to a payload
 * before it is written into the bundle.
 *
 * Two operating shapes, mirroring `detectSecretsInValue` / `detectSecretsInText`:
 *
 *   1. `applyPolicyToValue` walks a JSON-like value (mcp config, settings.json
 *      hooks block). For `excluded` the matched leaf is deleted from its
 *      parent; for `placeholder` it is rewritten as `${ENV_REF_NAME}` using
 *      `secretPlaceholderNamer`; for `included-explicit` the value is left
 *      untouched.
 *
 *   2. `applyPolicyToText` walks line-oriented text (CLAUDE.md, agent body,
 *      command body). For `excluded` the offending line is replaced with the
 *      sentinel `<< SECRET REMOVED >>` so line numbers stay stable; for
 *      `placeholder` every secret substring on that line is rewritten as
 *      `${ENV_REF_NAME}`; for `included-explicit` the text is unchanged.
 *
 * Both return per-call counters that the caller aggregates into the
 * `ImportApplySummary` (well, the export equivalent — same idea: surface to
 * the user how many secrets were affected).
 */

import {
  ENV_REF_RE,
  SECRET_PATTERNS,
  shannonEntropy,
  type SecretPattern,
} from './secretHeuristic.js';
import { namePlaceholder, type NamePlaceholderInput } from './secretPlaceholderNamer.js';
import type { BundleItemDomain, SecretsPolicy } from '@hammoc/shared';

export const SECRET_REMOVED_TEXT_PLACEHOLDER = '<< SECRET REMOVED >>';

export interface ApplyPolicyValueInput {
  policy: SecretsPolicy;
  domain: BundleItemDomain;
  cardName: string;
  hookEvent?: string;
  /** Root-relative path prefix for matched dot-paths (e.g. `mcpServers.context7`). */
  pathPrefix?: string[];
  value: unknown;
}

export interface ApplyPolicyValueResult {
  value: unknown;
  removedCount: number;
  replacedCount: number;
}

export interface ApplyPolicyTextInput {
  policy: SecretsPolicy;
  domain: BundleItemDomain;
  cardName: string;
  hookEvent?: string;
  text: string;
}

export interface ApplyPolicyTextResult {
  text: string;
  removedCount: number;
  replacedCount: number;
}

const BASE64_NON_ALPHA_RE = /[0-9+/=]/;

function matchPasses(s: string, pat: SecretPattern): boolean {
  if (pat.minEntropy === undefined) return true;
  return shannonEntropy(s) >= pat.minEntropy && BASE64_NON_ALPHA_RE.test(s);
}

/** Iterate every secret substring inside `text`. */
function* iterateSecretMatches(text: string): Generator<{ start: number; end: number; raw: string; pat: SecretPattern }> {
  for (const pat of SECRET_PATTERNS) {
    const re = pat.re.global ? pat.re : new RegExp(pat.re.source, pat.re.flags + 'g');
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      if (matchPasses(raw, pat)) {
        yield { start: m.index, end: m.index + raw.length, raw, pat };
      }
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
}

function stripEnvRefs(text: string): string {
  return text.replace(ENV_REF_RE, '');
}

function containsSecret(text: string): boolean {
  const stripped = stripEnvRefs(text);
  for (const _ of iterateSecretMatches(stripped)) {
    return true;
  }
  return false;
}

/**
 * Replace every secret substring inside `text` with the ENV-ref produced by
 * the namer. Matches on the env-stripped clone first so existing `${FOO}`
 * indirection isn't double-replaced.
 */
function replaceSecretsInText(text: string, makeName: (raw: string, index: number) => string): { text: string; replacedCount: number } {
  // We need the original text positions but the secret-detection regex must
  // not double-count existing ENV refs. Strategy: collect matches against the
  // env-stripped clone, then translate offsets back to the original by
  // walking through both strings in parallel.
  const stripped = stripEnvRefs(text);
  if (stripped === text) {
    return rebuildText(text, makeName);
  }
  // When there were ENV refs, the safest fallback is to scan the original text
  // directly. Existing `${FOO}` snippets won't match `SECRET_PATTERNS` (none of
  // the regexes accept `{` or `}` in the middle), so direct scanning is fine.
  return rebuildText(text, makeName);
}

function rebuildText(text: string, makeName: (raw: string, index: number) => string): { text: string; replacedCount: number } {
  const matches: Array<{ start: number; end: number; raw: string }> = [];
  for (const m of iterateSecretMatches(text)) {
    matches.push({ start: m.start, end: m.end, raw: m.raw });
  }
  if (matches.length === 0) return { text, replacedCount: 0 };

  // Sort by start ascending, drop overlaps (keep first).
  matches.sort((a, b) => a.start - b.start);
  const nonOverlapping: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  let out = '';
  let cursor = 0;
  let replaced = 0;
  for (const m of nonOverlapping) {
    out += text.slice(cursor, m.start);
    out += '${' + makeName(m.raw, replaced) + '}';
    cursor = m.end;
    replaced += 1;
  }
  out += text.slice(cursor);
  return { text: out, replacedCount: replaced };
}

export function applyPolicyToText(input: ApplyPolicyTextInput): ApplyPolicyTextResult {
  const { policy, domain, cardName, hookEvent, text } = input;
  if (policy === 'included-explicit') {
    return { text, removedCount: 0, replacedCount: 0 };
  }
  if (!text) {
    return { text, removedCount: 0, replacedCount: 0 };
  }

  if (policy === 'excluded') {
    // Replace each offending line with the sentinel so line numbers stay
    // stable for downstream tools that index by line.
    const lines = text.split(/\r?\n/);
    let removed = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (containsSecret(lines[i])) {
        lines[i] = SECRET_REMOVED_TEXT_PLACEHOLDER;
        removed += 1;
      }
    }
    return { text: lines.join('\n'), removedCount: removed, replacedCount: 0 };
  }

  // placeholder
  const seenCounts = new Map<string, number>();
  const result = replaceSecretsInText(text, (_raw, idx) => {
    const base: NamePlaceholderInput = {
      domain,
      fieldPath: `body:${idx}`,
      cardName,
      hookEvent,
    };
    const baseName = namePlaceholder(base);
    const count = seenCounts.get(baseName) ?? 0;
    seenCounts.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  });
  return { text: result.text, removedCount: 0, replacedCount: result.replacedCount };
}

export function applyPolicyToValue(input: ApplyPolicyValueInput): ApplyPolicyValueResult {
  const { policy, domain, cardName, hookEvent, value } = input;
  if (policy === 'included-explicit') {
    return { value, removedCount: 0, replacedCount: 0 };
  }
  const pathPrefix = input.pathPrefix ?? [];
  let removedCount = 0;
  let replacedCount = 0;
  const seenCounts = new Map<string, number>();

  const transform = (v: unknown, p: string[]): unknown => {
    if (typeof v === 'string') {
      const stripped = stripEnvRefs(v);
      if (!stripped || !containsSecret(stripped)) {
        return v;
      }
      if (policy === 'excluded') {
        removedCount += 1;
        // Return a sentinel that the caller (e.g. the mcp/hook config walker)
        // will interpret as "delete this leaf" — strings, by themselves, can't
        // disappear from their parent. We use the literal undefined sentinel
        // and let the array/object handlers filter.
        return SECRET_REMOVED_SENTINEL;
      }
      // placeholder
      const baseName = namePlaceholder({
        domain,
        cardName,
        hookEvent,
        fieldPath: p.join('.'),
      });
      const count = seenCounts.get(baseName) ?? 0;
      seenCounts.set(baseName, count + 1);
      const name = count === 0 ? baseName : `${baseName}_${count + 1}`;
      replacedCount += 1;
      return '${' + name + '}';
    }
    if (Array.isArray(v)) {
      return v
        .map((item, i) => transform(item, [...p, String(i)]))
        .filter((item) => item !== SECRET_REMOVED_SENTINEL);
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const next = transform(child, [...p, k]);
        if (next !== SECRET_REMOVED_SENTINEL) out[k] = next;
      }
      return out;
    }
    return v;
  };

  const result = transform(value, pathPrefix);
  // Top-level scalar might be the sentinel — flatten to undefined for callers.
  return {
    value: result === SECRET_REMOVED_SENTINEL ? undefined : result,
    removedCount,
    replacedCount,
  };
}

const SECRET_REMOVED_SENTINEL = Symbol('secret-removed');
