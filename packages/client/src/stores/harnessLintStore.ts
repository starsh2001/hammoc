/**
 * Story 30.2 (Task 4.2): client store for the static harness lint.
 *
 * Single source of truth for the per-section count badges (skill / mcp /
 * hook / command / agent), the per-card inline markers, and the detail list
 * panel. Wires into the existing `harness:external-change` socket event with
 * a 300ms debounce so a single re-evaluation covers a burst of file writes
 * (the chokidar `awaitWriteFinish` 200ms + this debounce are the two layers
 * that gate redundant `evaluate()` calls).
 *
 * Self-write loop avoidance: the prefs toggle in `toggleRule()` goes through
 * `preferencesService.updatePreferences` — the same `pendingLocalWrites`
 * window the file watcher already honors (Story 30.1 AC2.c). No new
 * self-write guard is introduced.
 */

import { create } from 'zustand';
import {
  LINT_RULE_DEFAULTS,
  type HarnessExternalChangeEvent,
  type LintCardDomain,
  type LintIssue,
  type LintRuleId,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { fetchLint } from '../services/api/harnessLintApi';
import { preferencesApi } from '../services/api/preferences';

/** ms — single re-evaluation absorbs a burst of file writes. */
const DEBOUNCE_MS = 300;

/**
 * File paths that, when changed, require a lint re-evaluation. Anything
 * outside this list is dropped — chat-session writes, prompt history, and the
 * other watcher-emitting paths must not retrigger lint.
 *
 * Keys are matched as **prefixes** against the watcher payload's `path`
 * (project-relative POSIX). Example: `'.claude/skills/'` covers every
 * `SKILL.md` write under any skill directory.
 */
const LINT_INPUT_PREFIXES: readonly string[] = [
  // Skills — bundle files don't change lint inputs but SKILL.md frontmatter does.
  '.claude/skills/',
  // MCP — both the `.claude/.mcp.json` and the project-root sibling.
  '.claude/.mcp.json',
  '.mcp.json',
  // Hooks live inside settings.json / settings.local.json + the disabled-backup variants.
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks.disabled.json',
  // Commands — every .md file under `commands/` (recursive).
  '.claude/commands/',
  // Agents — flat `.md` files under `agents/`.
  '.claude/agents/',
];

/** Discriminator paths emitted by the watcher's namespace trick (Story 30.1). */
const GITIGNORE_DISCRIMINATOR = '../.gitignore';

interface HarnessLintStoreState {
  issues: LintIssue[];
  rulePreferences: Record<LintRuleId, boolean>;
  isLoading: boolean;
  error: string | null;
  /** Tracked so the prefetch hook can detect slug switches. */
  lastProjectSlug?: string;
  /** Internal — the active debounce timer (or undefined when idle). */
  _debounceTimer?: ReturnType<typeof setTimeout>;

  load(projectSlug: string): Promise<void>;
  handleExternalChange(payload: HarnessExternalChangeEvent, projectSlug: string): void;
  toggleRule(ruleId: LintRuleId, enabled: boolean): Promise<void>;
  /** Aggregate count of error/warn issues per card domain. */
  countsByDomain(): Record<LintCardDomain, { error: number; warn: number }>;
  /** Issues attached to a single card on a given domain. */
  issuesForCard(domain: LintCardDomain, cardName: string): LintIssue[];
  reset(): void;
}

function emptyCounts(): Record<LintCardDomain, { error: number; warn: number }> {
  return {
    skill: { error: 0, warn: 0 },
    mcp: { error: 0, warn: 0 },
    hook: { error: 0, warn: 0 },
    command: { error: 0, warn: 0 },
    agent: { error: 0, warn: 0 },
  };
}

function isLintInputPath(path: string): boolean {
  if (path === GITIGNORE_DISCRIMINATOR) return false;
  for (const prefix of LINT_INPUT_PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) return true;
  }
  return false;
}

export const useHarnessLintStore = create<HarnessLintStoreState>((set, get) => ({
  issues: [],
  rulePreferences: { ...LINT_RULE_DEFAULTS } as Record<LintRuleId, boolean>,
  isLoading: false,
  error: null,

  async load(projectSlug) {
    set({ isLoading: true, error: null, lastProjectSlug: projectSlug });
    try {
      const result = await fetchLint({ scope: 'project', projectSlug });
      set({
        issues: result.issues,
        rulePreferences: result.rulePreferences,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      set({ isLoading: false, error: message });
    }
  },

  handleExternalChange(payload, projectSlug) {
    if (payload.scope !== 'project' || payload.projectSlug !== projectSlug) return;
    if (!isLintInputPath(payload.path)) return;

    const prev = get()._debounceTimer;
    if (prev !== undefined) clearTimeout(prev);

    const timer = setTimeout(() => {
      set({ _debounceTimer: undefined });
      void get().load(projectSlug);
    }, DEBOUNCE_MS);
    set({ _debounceTimer: timer });
  },

  async toggleRule(ruleId, enabled) {
    const previous = get().rulePreferences;
    // Optimistic — the count badges and markers re-render immediately so the
    // toggle feels instant. Roll back on persistence failure.
    set({ rulePreferences: { ...previous, [ruleId]: enabled } });
    try {
      await preferencesApi.update({
        harnessLintRules: { ...previous, [ruleId]: enabled },
      });
      const slug = get().lastProjectSlug;
      if (slug) await get().load(slug);
    } catch (err) {
      set({ rulePreferences: previous });
      throw err;
    }
  },

  countsByDomain() {
    const counts = emptyCounts();
    for (const issue of get().issues) {
      const slot = counts[issue.cardDomain];
      if (issue.severity === 'error') slot.error += 1;
      else slot.warn += 1;
    }
    return counts;
  },

  issuesForCard(domain, cardName) {
    return get().issues.filter(
      (i) => i.cardDomain === domain && i.cardName === cardName,
    );
  },

  reset() {
    const prev = get()._debounceTimer;
    if (prev !== undefined) clearTimeout(prev);
    set({
      issues: [],
      rulePreferences: { ...LINT_RULE_DEFAULTS } as Record<LintRuleId, boolean>,
      isLoading: false,
      error: null,
      lastProjectSlug: undefined,
      _debounceTimer: undefined,
    });
  },
}));

// Exposed for unit tests only — lets a fixture flush the debounce timer
// without sleeping.
export const __testing__ = { DEBOUNCE_MS, isLintInputPath };
