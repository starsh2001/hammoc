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
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'bearer', re: /Bearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: 'sk', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'aws', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'slack', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'base64', re: /[A-Za-z0-9+/=]{32,}/ },
];

export const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;

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
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(stripped)) {
      matchedNames.add(name);
    }
  }
  if (matchedNames.size === 0) {
    return { matched: false, patternNames: [], lines: [] };
  }
  const lines: number[] = [];
  const split = text.split(/\r?\n/);
  for (let i = 0; i < split.length; i += 1) {
    const lineStripped = stripEnvRefs(split[i]);
    for (const { re } of SECRET_PATTERNS) {
      if (re.test(lineStripped)) {
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
      for (const { name, re } of SECRET_PATTERNS) {
        if (re.test(stripped)) {
          paths.push(p.join('.'));
          matchedNames.add(name);
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
