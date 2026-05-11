/**
 * Story 30.1 (Task 1): single source of truth for secret-pattern heuristics
 * used by the harness write paths.
 *
 * Replaces four drifted SECRET_PATTERNS definitions (harnessAgentService,
 * harnessCommandService, harnessHookService, harnessMcpService). Drift
 * before this module:
 *
 *   - agent / command / hook : 32-char base64 unanchored, Bearer unanchored
 *   - mcp                    : 40-char base64 anchored,   Bearer anchored
 *
 * Canonical chosen here (Story 30.1 sub-spike 1.0, option (b)):
 *   - 32-char base64 unanchored, Bearer unanchored
 *
 * Rationale: detection-rate first; Story 30.1 AC4.c provides a per-save
 * "mark not a secret" opt-out that absorbs false positives, whereas missed
 * detections silently leak credentials. MCP's stricter anchors were a local
 * accident, not a deliberate spec decision.
 *
 * Two entry points are exposed because the four services walk two distinct
 * shapes:
 *
 *   - detectSecretsInText  → string body (agent / command / hook commands)
 *                            returns matched line numbers (1-based)
 *   - detectSecretsInValue → arbitrary JSON-like value (mcp config)
 *                            returns matched dot-paths
 *
 * Both strip `${ENV_VAR}` references first so legitimate env-var indirection
 * (`Authorization: 'Bearer ${GH_TOKEN}'`) does not raise false positives.
 */

export interface SecretPattern {
  name: string;
  re: RegExp;
  /**
   * Optional minimum Shannon entropy (bits/char) gate for matched substrings.
   * Story 30.3 spike #2: applies to the loose base64 pattern only. Natural
   * English compounds (PascalCase identifiers, prose) sit at ~3.5–3.9; real
   * base64-encoded tokens sit at ≥ 4.0 due to a-z/A-Z/0-9 uniform distribution.
   * Other patterns keep their anchored prefixes (Bearer/sk-/AKIA/xox-) which
   * already gate false positives — no entropy check needed.
   */
  minEntropy?: number;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'bearer', re: /Bearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: 'sk', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'aws', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'slack', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'base64', re: /[A-Za-z0-9+/=]{32,}/g, minEntropy: 4.0 },
];

export const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;

/**
 * Shannon entropy in bits/char of an arbitrary string. Used by patterns that
 * opt in via `minEntropy` (currently the loose base64 pattern only).
 */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const len = s.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return h;
}

// Story 30.3 spike #2 — the loose base64 pattern adds two combined gates so
// natural English compounds (e.g. PascalCase identifiers) cannot trigger a
// false positive:
//   (i)  Shannon entropy ≥ 4.0 bits/char  — filters single-symbol runs
//   (ii) ≥ 1 character outside [A-Za-z]   — filters English compounds that
//        otherwise meet the entropy bar (real base64 of random bytes almost
//        always contains digits or '+'/'/'/'=' over 32+ chars)
// Both gates run only for patterns that opt in via `minEntropy`.
const BASE64_NON_ALPHA_RE = /[0-9+/=]/;

/**
 * Tests whether `text` matches a single SecretPattern, applying the optional
 * `minEntropy` + non-alpha gates to each individual regex match. The pattern's
 * `re` must be either non-global (single test) or global (per-match gating).
 */
function patternMatches(text: string, pat: SecretPattern): boolean {
  if (pat.minEntropy === undefined) {
    return pat.re.test(text);
  }
  const re = pat.re.global ? pat.re : new RegExp(pat.re.source, pat.re.flags + 'g');
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[0];
    if (shannonEntropy(s) >= pat.minEntropy && BASE64_NON_ALPHA_RE.test(s)) {
      return true;
    }
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return false;
}

export interface DetectSecretsTextResult {
  matched: boolean;
  patternNames: string[];
  lines: number[];
}

export interface DetectSecretsValueResult {
  matched: boolean;
  patternNames: string[];
  paths: string[];
}

function stripEnvRefs(text: string): string {
  // Reset is required because the regex is /g — but `replace` with a /g regex
  // re-creates state each call. Still, clone-replace pattern is safest.
  return text.replace(ENV_REF_RE, '');
}

/**
 * Line-based scanner for textual command / prompt bodies (agent system
 * prompts, slash command bodies, hook command/prompt strings).
 */
export function detectSecretsInText(text: string): DetectSecretsTextResult {
  if (!text || typeof text !== 'string') {
    return { matched: false, patternNames: [], lines: [] };
  }
  const stripped = stripEnvRefs(text);
  const matchedNames = new Set<string>();
  for (const pat of SECRET_PATTERNS) {
    if (patternMatches(stripped, pat)) {
      matchedNames.add(pat.name);
    }
  }
  if (matchedNames.size === 0) {
    return { matched: false, patternNames: [], lines: [] };
  }
  const lines: number[] = [];
  const split = text.split(/\r?\n/);
  for (let i = 0; i < split.length; i += 1) {
    const lineStripped = stripEnvRefs(split[i]);
    for (const pat of SECRET_PATTERNS) {
      if (patternMatches(lineStripped, pat)) {
        lines.push(i + 1);
        break;
      }
    }
  }
  return { matched: true, patternNames: Array.from(matchedNames), lines };
}

/**
 * Object-walk scanner for JSON-like values (mcp server config). Each string
 * leaf is evaluated against the canonical patterns; matches are reported as
 * dot-paths (`env.GITHUB_TOKEN`, `headers.Authorization`, ...).
 */
export function detectSecretsInValue(
  value: unknown,
  basePath: string[] = [],
): DetectSecretsValueResult {
  const paths: string[] = [];
  const matchedNames = new Set<string>();
  const walk = (v: unknown, p: string[]): void => {
    if (typeof v === 'string') {
      const stripped = stripEnvRefs(v);
      if (!stripped) return;
      for (const pat of SECRET_PATTERNS) {
        if (patternMatches(stripped, pat)) {
          paths.push(p.join('.'));
          matchedNames.add(pat.name);
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
  return {
    matched: paths.length > 0,
    patternNames: Array.from(matchedNames),
    paths,
  };
}
