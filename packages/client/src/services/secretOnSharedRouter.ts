/**
 * Story 30.7 (Task B.1): single source of truth for the
 * `SecretOnSharedDialog → Move to local / Replace with env-ref` action.
 *
 * The cross-panel dialog opened by `useSecretOnSharedDialogStore.open()`
 * delegates its first action click to this router. Two responsibilities:
 *
 *   1. `getActionLabelKey(domain)` — domain → i18n key matrix so the dialog
 *      can render the correct label without knowing the domain semantics
 *      (mcp/hook = `routeToLocal*`, command/agent = `replaceWithEnvRef*`).
 *
 *   2. `routeToLocal(...)` — domain → API call matrix. Pre-checks the
 *      project's share-scope for the would-be local file; if the file would
 *      still land as `shared` (because the project's `.gitignore` lacks the
 *      `*.local.*` pattern), surfaces a structured `gitignorePatternMissing`
 *      reason so the caller can open the gitignore-append guidance flow. On
 *      `fetch` failure (network, 5xx), returns `apiError`. Otherwise resolves
 *      `{ ok: true }`.
 *
 * The four-domain policy matrix is the Story 30.5 spike #3 result:
 *   - mcp     → `.mcp.local.json` sibling save (controller `{scope:'local'}`)
 *   - hook    → `.claude/settings.local.json` sibling save (`{scope:'local'}`)
 *   - command → `${ENV_REF}` substitution in body (`replace-secret-with-env-ref` route)
 *   - agent   → `${ENV_REF}` substitution in body (`replace-secret-with-env-ref` route)
 */

import { api, ApiError } from './api/client';
import { fetchShareScope } from './api/harnessShareScopeApi';
import { updateMcp } from './api/harnessMcpsApi';

export type SecretOnSharedDomain = 'agent' | 'command' | 'hook' | 'mcp';

/**
 * Mapping is intentionally explicit (not derived) so the type-checker rejects
 * a partial update if a new domain ever lands.
 */
const ACTION_LABEL_KEYS: Record<SecretOnSharedDomain, string> = {
  mcp: 'harness.tools.secretOnShared.action.routeToLocalMcp',
  hook: 'harness.tools.secretOnShared.action.routeToLocalHook',
  command: 'harness.tools.secretOnShared.action.replaceWithEnvRefCommand',
  agent: 'harness.tools.secretOnShared.action.replaceWithEnvRefAgent',
};

export function getActionLabelKey(domain: SecretOnSharedDomain): string {
  return ACTION_LABEL_KEYS[domain];
}

/** The pattern the project's `.gitignore` must contain so the sibling save is `local`. */
export const REQUIRED_LOCAL_PATTERN = '**/.claude/**/*.local.*';

/**
 * Project-relative path of the would-be local sibling. For command/agent the
 * env-ref substitution writes back to the same file, so there's nothing to
 * pre-check.
 */
export function deriveSiblingRelativePath(
  domain: SecretOnSharedDomain,
  ctx: { hookEvent?: string; commandRelativePath?: string; agentName?: string },
): string | null {
  void ctx;
  if (domain === 'mcp') return '.mcp.local.json';
  if (domain === 'hook') return '.claude/settings.local.json';
  return null;
}

export interface RouteToLocalInput {
  domain: SecretOnSharedDomain;
  projectSlug: string;
  /** mcp: server name; hook: existing event name; command: relative .md path; agent: name. */
  card: {
    name?: string;
    relativePath?: string;
    hookEvent?: string;
    matcher?: string;
    expectedMtime?: string;
  };
  /** Original payload the panel was trying to save. */
  payload: {
    mcpConfig?: unknown;
    hookConfig?: unknown;
  };
}

export type RouteToLocalResult =
  | { ok: true }
  | { ok: false; reason: 'gitignorePatternMissing'; siblingRelativePath: string }
  | { ok: false; reason: 'apiError'; message: string };

/**
 * Pre-checks share-scope when applicable, then dispatches to the correct
 * domain endpoint. Throws nothing — surface a structured reason so the
 * caller's UI can branch.
 */
export async function routeToLocal(input: RouteToLocalInput): Promise<RouteToLocalResult> {
  const sibling = deriveSiblingRelativePath(input.domain, input.card);

  // Pre-flight gitignore check only applies to mcp/hook sibling saves.
  // Command/agent rewrite the same file (no sibling), so `.gitignore` is
  // irrelevant there — the existing share-scope verdict on the original file
  // already drove the dialog open.
  if (sibling !== null) {
    try {
      const scope = await fetchShareScope(input.projectSlug, [sibling]);
      if (scope.cards[sibling] === 'shared') {
        return { ok: false, reason: 'gitignorePatternMissing', siblingRelativePath: sibling };
      }
    } catch (err) {
      // Share-scope read failed (network etc.) — treat as apiError. The
      // sibling save itself would also fail; surfacing the same reason keeps
      // the toast wording stable.
      return { ok: false, reason: 'apiError', message: extractMessage(err) };
    }
  }

  try {
    switch (input.domain) {
      case 'mcp': {
        if (!input.card.name) throw new Error('mcp routeToLocal requires card.name');
        await updateMcp(
          input.card.name,
          { scope: 'project', projectSlug: input.projectSlug },
          {
            // Sibling-save passes `config` via the `{scope:'local'}` body
            // branch — see `harnessMcpController.update`.
            config: input.payload.mcpConfig as never,
            scope: 'local' as never,
          } as never,
        );
        return { ok: true };
      }
      case 'hook': {
        if (!input.card.hookEvent) throw new Error('hook routeToLocal requires card.hookEvent');
        // Hooks route through a direct PUT to the controller's `{scope:'local'}`
        // body branch — the existing harness API client only exposes the
        // narrow `updateHook` signature, so we hit the endpoint by hand here.
        await api.put(
          `/harness/hooks/${encodeURIComponent(input.card.hookEvent)}/0/0?scope=project&projectSlug=${encodeURIComponent(input.projectSlug)}`,
          {
            config: input.payload.hookConfig,
            matcher: input.card.matcher,
            scope: 'local',
          },
        );
        return { ok: true };
      }
      case 'command': {
        if (!input.card.relativePath) {
          throw new Error('command routeToLocal requires card.relativePath');
        }
        await api.post('/harness/commands/replace-secret-with-env-ref', {
          scope: 'project',
          projectSlug: input.projectSlug,
          relativePath: input.card.relativePath,
          expectedMtime: input.card.expectedMtime,
        });
        return { ok: true };
      }
      case 'agent': {
        if (!input.card.name) throw new Error('agent routeToLocal requires card.name');
        await api.post('/harness/agents/replace-secret-with-env-ref', {
          scope: 'project',
          projectSlug: input.projectSlug,
          name: input.card.name,
          expectedMtime: input.card.expectedMtime,
        });
        return { ok: true };
      }
      default: {
        const _exhaustive: never = input.domain;
        return _exhaustive;
      }
    }
  } catch (err) {
    // The server may surface HARNESS_SECRET_ON_SHARED if the sibling is
    // still shared (because the share-scope pre-check raced with a
    // `.gitignore` edit). Reuse the gitignore guidance flow in that case
    // so the user sees a consistent narrative.
    if (err instanceof ApiError && err.code === 'HARNESS_SECRET_ON_SHARED' && sibling !== null) {
      return { ok: false, reason: 'gitignorePatternMissing', siblingRelativePath: sibling };
    }
    return { ok: false, reason: 'apiError', message: extractMessage(err) };
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Story 30.7 (Task D.3): client-side wrapper for the `.gitignore` append
 * endpoint. Append-only; idempotent on the server side (the server skips
 * when the pattern is already present).
 */
export async function appendGitignorePattern(
  projectSlug: string,
  pattern: string,
): Promise<{ success: true; appended: boolean }> {
  return api.post<{ success: true; appended: boolean }>(
    `/harness/share-scope/${encodeURIComponent(projectSlug)}/append-gitignore`,
    { pattern },
  );
}
