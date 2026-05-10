/**
 * Story 30.2: static harness lint — implements the 7 quality rules consumed by
 * HarnessWorkbenchSection. Single-source-of-truth for the rule evaluators so
 * the section nav count badges, the per-card inline markers, and the detail
 * list panel all key off the same `LintIssue[]`.
 *
 * Rule-by-rule scope (and their default ON/OFF state) live in
 * `LINT_RULE_DEFAULTS` (shared types). Spike #1 (2026-05-11) settled the
 * `agent/tools-non-standard` policy as the (b) "uncertain" branch — MCP-tool
 * direct references (`mcp__server__tool`) trigger `warn`, never `error`.
 * Spike #2 (2026-05-11) settled `mcp/command-not-on-path` as opt-in (default
 * OFF) given the ~67% server-vs-CLI PATH match rate.
 */

import * as serverPathResolver from '../utils/serverPathResolver.js';
import { harnessSkillService } from './harnessSkillService.js';
import { harnessMcpService } from './harnessMcpService.js';
import { harnessHookService } from './harnessHookService.js';
import { harnessCommandService } from './harnessCommandService.js';
import { harnessAgentService } from './harnessAgentService.js';
import {
  LINT_RULE_DEFAULTS,
  type HarnessAgentCard,
  type HarnessAgentListResponse,
  type HarnessCommandCard,
  type HarnessCommandListResponse,
  type HarnessHookCard,
  type HarnessHookEvent,
  type HarnessHookListResponse,
  type HarnessLintResponse,
  type HarnessMcpCard,
  type HarnessMcpListResponse,
  type HarnessSkillCard,
  type HarnessSkillListResponse,
  type LintCardDomain,
  type LintIssue,
  type LintRuleId,
} from '@hammoc/shared';

export interface EvaluateLintRequest {
  scope: 'user' | 'project';
  /** Required when `scope === 'project'`. Ignored otherwise. */
  projectSlug?: string;
  /** Effective rule preferences after defaults are applied. */
  rulePreferences: Record<LintRuleId, boolean>;
}

/**
 * Standard tool names known to Claude Code as of spike #1 (2026-05-11). Any
 * agent `tools` entry that is not in this list — and not undefined (which
 * means "all tools allowed" per the 3-state model) — generates a warn.
 *
 * MCP tool references (`mcp__<server>__<tool>`) are intentionally **not** in
 * the list — spike #1 settled the (b) "uncertain" branch (no official
 * subagent-frontmatter example shows them). We surface them as warn so users
 * still notice, but never block as error.
 */
const STANDARD_AGENT_TOOLS = new Set<string>([
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'BashOutput',
  'KillShell',
  'Task',
  'Agent',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'NotebookEdit',
  'SlashCommand',
]);

/**
 * Environment variables that always pass `hook/env-var-undefined` even if the
 * Hammoc server's `process.env` doesn't define them — these are universally
 * available on the user's interactive shell and a missing entry on the server
 * is a near-100% false positive.
 */
const STANDARD_ENV_VARS = new Set<string>([
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'PATH',
  'PWD',
  'CD',
  'TMP',
  'TEMP',
  'SHELL',
  'COMSPEC',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_PLUGIN_ROOT',
]);

/** Allowed URL protocols for `mcp/url-invalid`. */
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** Apply user preferences on top of defaults. Missing keys fall back to defaults. */
export function resolveRulePreferences(
  user: Partial<Record<LintRuleId, boolean>> | undefined,
): Record<LintRuleId, boolean> {
  const out = { ...LINT_RULE_DEFAULTS } as Record<LintRuleId, boolean>;
  if (!user) return out;
  for (const [key, value] of Object.entries(user)) {
    if (typeof value === 'boolean' && key in out) {
      out[key as LintRuleId] = value;
    }
  }
  return out;
}

class HarnessLintService {
  /**
   * Evaluate the 7 rules across the 5 domains in one pass. Each domain's
   * `listCards()` is invoked once and the results are fanned out to the
   * relevant evaluators. Disabled rules are skipped entirely (they do not
   * contribute to the count badges, per AC1.c).
   */
  async evaluate(req: EvaluateLintRequest): Promise<HarnessLintResponse> {
    const projectSlug = req.scope === 'project' ? req.projectSlug : undefined;

    // Fan out the 5 domain reads in parallel. Failures collapse to empty
    // responses so a single broken sub-section can't blank out the rest of
    // the lint surface.
    const [skills, mcps, hooks, commands, agents] = await Promise.all([
      safeListCards(() => harnessSkillService.listCards(projectSlug), emptySkillResponse()),
      safeListCards(() => harnessMcpService.listCards(projectSlug), emptyMcpResponse()),
      safeListCards(() => harnessHookService.listCards(projectSlug), emptyHookResponse()),
      safeListCards(() => harnessCommandService.listCards(projectSlug), emptyCommandResponse()),
      safeListCards(() => harnessAgentService.listCards(projectSlug), emptyAgentResponse()),
    ]);

    const issues: LintIssue[] = [];

    if (req.rulePreferences['naming/duplicate-across-sources']) {
      issues.push(...evaluateNamingDuplicates({ skills, mcps, hooks, commands, agents }));
    }
    if (req.rulePreferences['hook/matcher-regex-invalid']) {
      issues.push(...evaluateHookMatcherRegex(hooks));
    }
    if (req.rulePreferences['parse/yaml-json-error']) {
      issues.push(...evaluateParseErrors({ skills, mcps, hooks, commands, agents }));
    }
    if (req.rulePreferences['mcp/command-not-on-path']) {
      issues.push(...evaluateMcpCommandOnPath(mcps));
    }
    if (req.rulePreferences['mcp/url-invalid']) {
      issues.push(...evaluateMcpUrl(mcps));
    }
    if (req.rulePreferences['agent/tools-non-standard']) {
      issues.push(...evaluateAgentToolsStandard(agents));
    }
    if (req.rulePreferences['hook/env-var-undefined']) {
      issues.push(...evaluateHookEnvVars(hooks));
    }

    return {
      issues,
      rulePreferences: req.rulePreferences,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Rule 1 — naming/duplicate-across-sources (warn)
// ---------------------------------------------------------------------------

interface DomainBundle {
  skills: HarnessSkillListResponse;
  mcps: HarnessMcpListResponse;
  hooks: HarnessHookListResponse;
  commands: HarnessCommandListResponse;
  agents: HarnessAgentListResponse;
}

interface NamingEntry {
  name: string;
  scope: 'project' | 'user' | 'plugin';
  isActiveSource: boolean;
  domain: LintCardDomain;
}

export function evaluateNamingDuplicates(bundle: DomainBundle): LintIssue[] {
  const issues: LintIssue[] = [];

  const skillEntries = bundle.skills.cards.flatMap<NamingEntry>((card) =>
    card.sources.map((src) => ({
      name: card.name,
      scope: src.scope,
      isActiveSource: src.scope === card.activeScope,
      domain: 'skill' as const,
    })),
  );
  issues.push(...findDuplicates(skillEntries, 'skill'));

  const mcpEntries = bundle.mcps.cards.flatMap<NamingEntry>((card) =>
    card.sources.map((src) => ({
      name: card.name,
      scope: src.scope,
      isActiveSource: src.scope === card.activeScope,
      domain: 'mcp' as const,
    })),
  );
  issues.push(...findDuplicates(mcpEntries, 'mcp'));

  // Commands — every card is itself one source (no per-card sources[]). A
  // duplicate is two cards with the same `slashName` but different scope OR
  // two cards in the same scope with the same `slashName`.
  const commandEntries = bundle.commands.cards.map<NamingEntry>((card) => ({
    name: card.slashName,
    scope: card.scope,
    isActiveSource: false, // We pick the active one inline below.
    domain: 'command' as const,
  }));
  issues.push(...findDuplicatesCommandLike(commandEntries, 'command'));

  // Agents — similar to commands, but keyed by frontmatter name.
  const agentEntries = bundle.agents.cards.map<NamingEntry>((card) => ({
    name: card.name,
    scope: card.scope,
    isActiveSource: false,
    domain: 'agent' as const,
  }));
  issues.push(...findDuplicatesCommandLike(agentEntries, 'agent'));

  // Hooks — name = `command || prompt body excerpt`. Hooks rarely share names
  // because the matcher + event grouping carries identity. We skip hook
  // duplicates from this rule (matcher invalidity has its own dedicated rule).

  return issues;
}

const SCOPE_PRIORITY = { project: 0, user: 1, plugin: 2 } as const;

function findDuplicates(entries: NamingEntry[], domain: LintCardDomain): LintIssue[] {
  const issues: LintIssue[] = [];
  const groups = new Map<string, NamingEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.name);
    if (list) list.push(e);
    else groups.set(e.name, [e]);
  }
  for (const [name, group] of groups) {
    if (group.length < 2) continue;
    // Same-scope duplicates always warn (every entry except the first by
    // alphabetical scope-of-arrival). For cross-scope duplicates, only the
    // shadowed entries (lower priority than the active one) warn.
    const sameScope = new Map<string, NamingEntry[]>();
    for (const e of group) {
      const list = sameScope.get(e.scope);
      if (list) list.push(e);
      else sameScope.set(e.scope, [e]);
    }
    for (const [, sg] of sameScope) {
      if (sg.length >= 2) {
        for (const dup of sg) {
          issues.push({
            ruleId: 'naming/duplicate-across-sources',
            severity: 'warn',
            cardScope: dup.scope,
            cardName: name,
            cardDomain: domain,
            location: { kind: 'path', path: ['name'] },
            messageI18nKey: 'harness.tools.lint.rule.namingDuplicate.message',
            messageI18nVars: { name, scope: dup.scope },
          });
        }
      }
    }
    // Cross-scope shadowing (only emit per non-active scope, once each).
    const seenScopes = new Set<string>();
    let activeScope: 'project' | 'user' | 'plugin' | undefined;
    let activePriority = Infinity;
    for (const e of group) {
      const p = SCOPE_PRIORITY[e.scope];
      if (p < activePriority) {
        activePriority = p;
        activeScope = e.scope;
      }
    }
    for (const e of group) {
      if (e.scope === activeScope) continue;
      if (seenScopes.has(e.scope)) continue;
      seenScopes.add(e.scope);
      issues.push({
        ruleId: 'naming/duplicate-across-sources',
        severity: 'warn',
        cardScope: e.scope,
        cardName: name,
        cardDomain: domain,
        location: { kind: 'path', path: ['name'] },
        messageI18nKey: 'harness.tools.lint.rule.namingDuplicate.message',
        messageI18nVars: { name, scope: e.scope, activeScope: activeScope ?? '' },
      });
    }
  }
  return issues;
}

/** For commands/agents — each card is a single source, so duplicates are detected at card level. */
function findDuplicatesCommandLike(entries: NamingEntry[], domain: LintCardDomain): LintIssue[] {
  const issues: LintIssue[] = [];
  const groups = new Map<string, NamingEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.name);
    if (list) list.push(e);
    else groups.set(e.name, [e]);
  }
  for (const [name, group] of groups) {
    if (group.length < 2) continue;
    let activeScope: 'project' | 'user' | 'plugin' | undefined;
    let activePriority = Infinity;
    for (const e of group) {
      const p = SCOPE_PRIORITY[e.scope];
      if (p < activePriority) {
        activePriority = p;
        activeScope = e.scope;
      }
    }
    // Same-scope duplicates: every entry warns.
    const sameScope = new Map<string, NamingEntry[]>();
    for (const e of group) {
      const list = sameScope.get(e.scope);
      if (list) list.push(e);
      else sameScope.set(e.scope, [e]);
    }
    for (const [, sg] of sameScope) {
      if (sg.length >= 2) {
        for (const dup of sg) {
          issues.push({
            ruleId: 'naming/duplicate-across-sources',
            severity: 'warn',
            cardScope: dup.scope,
            cardName: name,
            cardDomain: domain,
            location: { kind: 'path', path: ['name'] },
            messageI18nKey: 'harness.tools.lint.rule.namingDuplicate.message',
            messageI18nVars: { name, scope: dup.scope },
          });
        }
      }
    }
    // Cross-scope: only the shadowed (non-active) entries warn.
    for (const e of group) {
      if (e.scope === activeScope) continue;
      issues.push({
        ruleId: 'naming/duplicate-across-sources',
        severity: 'warn',
        cardScope: e.scope,
        cardName: name,
        cardDomain: domain,
        location: { kind: 'path', path: ['name'] },
        messageI18nKey: 'harness.tools.lint.rule.namingDuplicate.message',
        messageI18nVars: { name, scope: e.scope, activeScope: activeScope ?? '' },
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Rule 2 — hook/matcher-regex-invalid (error)
// ---------------------------------------------------------------------------

export function evaluateHookMatcherRegex(hooks: HarnessHookListResponse): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const event of Object.keys(hooks.cardsByEvent) as HarnessHookEvent[]) {
    const list = hooks.cardsByEvent[event];
    for (const card of list) {
      const m = card.matcher;
      if (m === undefined || m === '' || m === '*') continue;
      try {
        new RegExp(m);
      } catch (err) {
        issues.push({
          ruleId: 'hook/matcher-regex-invalid',
          severity: 'error',
          cardScope: card.scope,
          cardName: hookCardName(card),
          cardDomain: 'hook',
          hookEvent: event,
          location: { kind: 'path', path: ['matcher'] },
          messageI18nKey: 'harness.tools.lint.rule.hookMatcherRegexInvalid.message',
          messageI18nVars: { matcher: m, reason: (err as Error).message },
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Rule 3 — parse/yaml-json-error (error) — surfaces malformed[] from each domain
// ---------------------------------------------------------------------------

export function evaluateParseErrors(bundle: DomainBundle): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const m of bundle.skills.malformed) {
    issues.push({
      ruleId: 'parse/yaml-json-error',
      severity: 'error',
      cardScope: m.scope,
      cardName: malformedSkillName(m.absoluteRoot),
      cardDomain: 'skill',
      location: { kind: 'line', line: 1 },
      messageI18nKey: 'harness.tools.lint.rule.parseYamlJsonError.message',
      messageI18nVars: { reason: m.reason },
    });
  }
  for (const m of bundle.mcps.malformed) {
    issues.push({
      ruleId: 'parse/yaml-json-error',
      severity: 'error',
      cardScope: m.scope,
      cardName: m.serverName,
      cardDomain: 'mcp',
      location: { kind: 'line', line: 1 },
      messageI18nKey: 'harness.tools.lint.rule.parseYamlJsonError.message',
      messageI18nVars: { reason: m.reason },
    });
  }
  for (const m of bundle.hooks.malformed) {
    issues.push({
      ruleId: 'parse/yaml-json-error',
      severity: 'error',
      cardScope: m.scope,
      cardName: m.event ?? '',
      cardDomain: 'hook',
      hookEvent: m.event,
      location: { kind: 'line', line: 1 },
      messageI18nKey: 'harness.tools.lint.rule.parseYamlJsonError.message',
      messageI18nVars: { reason: m.reason },
    });
  }
  for (const m of bundle.commands.malformed) {
    issues.push({
      ruleId: 'parse/yaml-json-error',
      severity: 'error',
      cardScope: m.scope,
      cardName: malformedSkillName(m.absoluteFile),
      cardDomain: 'command',
      location: { kind: 'line', line: 1 },
      messageI18nKey: 'harness.tools.lint.rule.parseYamlJsonError.message',
      messageI18nVars: { reason: m.reason },
    });
  }
  for (const m of bundle.agents.malformed) {
    issues.push({
      ruleId: 'parse/yaml-json-error',
      severity: 'error',
      cardScope: m.scope,
      cardName: malformedSkillName(m.absoluteFile),
      cardDomain: 'agent',
      location: { kind: 'line', line: 1 },
      messageI18nKey: 'harness.tools.lint.rule.parseYamlJsonError.message',
      messageI18nVars: { reason: m.reason, detail: m.detail ?? '' },
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule 4 — mcp/command-not-on-path (warn, opt-in)
// ---------------------------------------------------------------------------

export function evaluateMcpCommandOnPath(mcps: HarnessMcpListResponse): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const card of mcps.cards) {
    const active = card.sources.find((s) => s.scope === card.activeScope);
    if (!active) continue;
    const cfg = active.config;
    const type = cfg.type ?? 'stdio';
    if (type !== 'stdio') continue;
    const cmd = cfg.command;
    if (!cmd) continue;
    const result = serverPathResolver.resolveCommandOnServerPath(cmd);
    if (result.resolved) continue;
    issues.push({
      ruleId: 'mcp/command-not-on-path',
      severity: 'warn',
      cardScope: active.scope,
      cardName: card.name,
      cardDomain: 'mcp',
      location: { kind: 'path', path: ['mcpServers', card.name, 'command'] },
      messageI18nKey: 'harness.tools.lint.rule.mcpCommandNotOnPath.message',
      messageI18nVars: { name: card.name, command: cmd },
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Rule 5 — mcp/url-invalid (error)
// ---------------------------------------------------------------------------

export function evaluateMcpUrl(mcps: HarnessMcpListResponse): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const card of mcps.cards) {
    const active = card.sources.find((s) => s.scope === card.activeScope);
    if (!active) continue;
    const type = active.config.type;
    if (type !== 'sse' && type !== 'http' && type !== 'ws') continue;
    const url = active.config.url;
    if (!url) {
      issues.push({
        ruleId: 'mcp/url-invalid',
        severity: 'error',
        cardScope: active.scope,
        cardName: card.name,
        cardDomain: 'mcp',
        location: { kind: 'path', path: ['mcpServers', card.name, 'url'] },
        messageI18nKey: 'harness.tools.lint.rule.mcpUrlInvalid.message',
        messageI18nVars: { name: card.name, reason: 'missing' },
      });
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      issues.push({
        ruleId: 'mcp/url-invalid',
        severity: 'error',
        cardScope: active.scope,
        cardName: card.name,
        cardDomain: 'mcp',
        location: { kind: 'path', path: ['mcpServers', card.name, 'url'] },
        messageI18nKey: 'harness.tools.lint.rule.mcpUrlInvalid.message',
        messageI18nVars: { name: card.name, reason: 'unparseable', url },
      });
      continue;
    }
    if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
      issues.push({
        ruleId: 'mcp/url-invalid',
        severity: 'error',
        cardScope: active.scope,
        cardName: card.name,
        cardDomain: 'mcp',
        location: { kind: 'path', path: ['mcpServers', card.name, 'url'] },
        messageI18nKey: 'harness.tools.lint.rule.mcpUrlInvalid.message',
        messageI18nVars: { name: card.name, reason: 'protocol', protocol: parsed.protocol },
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Rule 6 — agent/tools-non-standard (warn)
// ---------------------------------------------------------------------------

export function evaluateAgentToolsStandard(agents: HarnessAgentListResponse): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const card of agents.cards) {
    if (card.toolsState !== 'populated') continue;
    for (let i = 0; i < card.tools.length; i++) {
      const tool = card.tools[i];
      if (STANDARD_AGENT_TOOLS.has(tool)) continue;
      issues.push({
        ruleId: 'agent/tools-non-standard',
        severity: 'warn',
        cardScope: card.scope,
        cardName: card.name,
        cardDomain: 'agent',
        location: { kind: 'path', path: ['tools', String(i)] },
        messageI18nKey: 'harness.tools.lint.rule.agentToolsNonStandard.message',
        messageI18nVars: { tool, agent: card.name },
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Rule 7 — hook/env-var-undefined (warn)
// ---------------------------------------------------------------------------

const ENV_VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function evaluateHookEnvVars(hooks: HarnessHookListResponse): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const event of Object.keys(hooks.cardsByEvent) as HarnessHookEvent[]) {
    const list = hooks.cardsByEvent[event];
    for (const card of list) {
      const body = card.config.command ?? card.config.prompt ?? '';
      if (!body.includes('${')) continue;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      ENV_VAR_RE.lastIndex = 0;
      while ((m = ENV_VAR_RE.exec(body)) !== null) {
        const varName = m[1];
        if (seen.has(varName)) continue;
        seen.add(varName);
        if (STANDARD_ENV_VARS.has(varName)) continue;
        if (process.env[varName] !== undefined) continue;
        issues.push({
          ruleId: 'hook/env-var-undefined',
          severity: 'warn',
          cardScope: card.scope,
          cardName: hookCardName(card),
          cardDomain: 'hook',
          hookEvent: event,
          location: {
            kind: 'path',
            path: [card.config.type === 'prompt' ? 'prompt' : 'command'],
          },
          messageI18nKey: 'harness.tools.lint.rule.hookEnvVarUndefined.message',
          messageI18nVars: { variable: varName, hook: hookCardName(card) },
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hookCardName(card: HarnessHookCard): string {
  if (card.config.type === 'command') {
    const cmd = card.config.command ?? '';
    return cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd;
  }
  const prompt = card.config.prompt ?? '';
  return prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
}

function malformedSkillName(absolutePath: string): string {
  // Skills/commands/agents — surface the leaf segment so the issue list isn't
  // dominated by absolute paths. The Path is preserved in the line location
  // so panels with file-tree access can still navigate.
  const segs = absolutePath.split(/[\\/]/);
  return segs[segs.length - 1] || absolutePath;
}

async function safeListCards<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

function emptySkillResponse(): HarnessSkillListResponse {
  return { cards: [], malformed: [] };
}
function emptyMcpResponse(): HarnessMcpListResponse {
  return {
    cards: [],
    malformed: [],
    userFileKind: null,
    disableStrategy: 'flag',
  };
}
function emptyHookResponse(): HarnessHookListResponse {
  return {
    cardsByEvent: {
      PreToolUse: [],
      PostToolUse: [],
      Stop: [],
      SubagentStop: [],
      SessionStart: [],
      SessionEnd: [],
      UserPromptSubmit: [],
      PreCompact: [],
      Notification: [],
    },
    malformed: [],
    promptTypeSupport: 'unknown',
    backupMtimeByScope: {},
  };
}
function emptyCommandResponse(): HarnessCommandListResponse {
  return { cards: [], malformed: [], paletteVisibleCount: 0 };
}
function emptyAgentResponse(): HarnessAgentListResponse {
  return { cards: [], malformed: [] };
}

// Re-export types needed by tests.
export type { HarnessAgentCard, HarnessCommandCard, HarnessHookCard, HarnessMcpCard, HarnessSkillCard };

export const harnessLintService = new HarnessLintService();
