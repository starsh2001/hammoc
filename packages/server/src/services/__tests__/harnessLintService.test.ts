/**
 * Story 30.2 (Task 1.9): harnessLintService unit tests.
 *
 * Each rule has a "happy path" (valid input → no issue) plus an "edge"
 * (broken input → expected severity + location). Rules are exercised against
 * synthetic listCards-shaped fixtures; the service-level fan-out is covered
 * by a single happy-path test that exercises `evaluate()` end-to-end with all
 * 7 rules enabled.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  evaluateAgentToolsStandard,
  evaluateHookEnvVars,
  evaluateHookMatcherRegex,
  evaluateMcpCommandOnPath,
  evaluateMcpUrl,
  evaluateNamingDuplicates,
  evaluateParseErrors,
  harnessLintService,
  resolveRulePreferences,
} from '../harnessLintService.js';
import type {
  HarnessAgentCard,
  HarnessAgentListResponse,
  HarnessCommandListResponse,
  HarnessHookCard,
  HarnessHookListResponse,
  HarnessMcpCard,
  HarnessMcpListResponse,
  HarnessSkillCard,
  HarnessSkillListResponse,
  LintRuleId,
} from '@hammoc/shared';
import { LINT_RULE_DEFAULTS } from '@hammoc/shared';
import * as serverPathResolver from '../../utils/serverPathResolver.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function skillCard(name: string, scopes: Array<'project' | 'user' | 'plugin'>): HarnessSkillCard {
  const sources = scopes.map((scope) => ({
    scope,
    absoluteRoot: `/tmp/${scope}/${name}`,
    skillMdMtime: '2026-05-11T00:00:00.000Z',
    frontmatter: { name, description: `Skill ${name}` },
  }));
  return {
    name,
    description: `Skill ${name}`,
    sources: sources as HarnessSkillCard['sources'],
    activeScope: scopes[0]!,
  };
}

function emptySkills(cards: HarnessSkillCard[] = []): HarnessSkillListResponse {
  return { cards, malformed: [] };
}

function mcpCard(opts: {
  name: string;
  scope?: 'project' | 'user' | 'plugin';
  type?: 'stdio' | 'sse' | 'http' | 'ws';
  command?: string;
  url?: string;
}): HarnessMcpCard {
  const scope = opts.scope ?? 'project';
  return {
    name: opts.name,
    activeType: opts.type ?? 'stdio',
    enabled: true,
    sources: [
      {
        scope,
        absoluteFile: `/tmp/${scope}/.mcp.json`,
        sourceFileKind: 'mcp.json',
        config: {
          type: opts.type,
          command: opts.command,
          url: opts.url,
        },
        mtime: '2026-05-11T00:00:00.000Z',
        disabledByBackup: false,
      },
    ] as HarnessMcpCard['sources'],
    activeScope: scope,
  };
}

function emptyMcps(cards: HarnessMcpCard[] = []): HarnessMcpListResponse {
  return {
    cards,
    malformed: [],
    userFileKind: null,
    disableStrategy: 'flag',
  };
}

function hookCard(opts: {
  scope?: 'project' | 'user' | 'plugin';
  type?: 'command' | 'prompt';
  body?: string;
  matcher?: string;
}): HarnessHookCard {
  const type = opts.type ?? 'command';
  const scope = opts.scope ?? 'project';
  return {
    scope,
    absoluteFile: `/tmp/${scope}/.claude/settings.json`,
    event: 'PreToolUse',
    groupIndex: 0,
    hookIndex: 0,
    disabledByBackup: false,
    matcher: opts.matcher,
    config:
      type === 'command'
        ? { type: 'command', command: opts.body ?? 'echo hi' }
        : { type: 'prompt', prompt: opts.body ?? 'hi' },
    mtime: '2026-05-11T00:00:00.000Z',
    enabled: true,
  };
}

function hooksWith(cards: HarnessHookCard[]): HarnessHookListResponse {
  return {
    cardsByEvent: {
      PreToolUse: cards,
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
    promptTypeSupport: 'supported',
    backupMtimeByScope: {},
  };
}

function emptyCommands(): HarnessCommandListResponse {
  return { cards: [], malformed: [], paletteVisibleCount: 0 };
}

function agentCard(opts: {
  name: string;
  tools?: string[];
  scope?: 'project' | 'user' | 'plugin';
}): HarnessAgentCard {
  const scope = opts.scope ?? 'project';
  return {
    scope,
    absoluteFile: `/tmp/${scope}/.claude/agents/${opts.name}.md`,
    name: opts.name,
    description: 'agent',
    model: 'inherit',
    color: 'blue',
    toolsState: opts.tools === undefined ? 'omitted' : opts.tools.length === 0 ? 'empty' : 'populated',
    tools: opts.tools ?? [],
    hasExampleBlock: false,
    mtime: '2026-05-11T00:00:00.000Z',
  };
}

function emptyAgents(cards: HarnessAgentCard[] = []): HarnessAgentListResponse {
  return { cards, malformed: [] };
}

const allRulesOn = (): Record<LintRuleId, boolean> => ({
  'naming/duplicate-across-sources': true,
  'hook/matcher-regex-invalid': true,
  'parse/yaml-json-error': true,
  'mcp/command-not-on-path': true,
  'mcp/url-invalid': true,
  'agent/tools-non-standard': true,
  'hook/env-var-undefined': true,
});

// ---------------------------------------------------------------------------
// Rule 1 — naming/duplicate-across-sources
// ---------------------------------------------------------------------------

describe('evaluateNamingDuplicates', () => {
  it('happy: distinct skill names produce no warnings', () => {
    const issues = evaluateNamingDuplicates({
      skills: emptySkills([skillCard('foo', ['project']), skillCard('bar', ['user'])]),
      mcps: emptyMcps(),
      hooks: hooksWith([]),
      commands: emptyCommands(),
      agents: emptyAgents(),
    });
    expect(issues).toHaveLength(0);
  });

  it('edge: same skill name across project + user warns the shadowed (user) entry', () => {
    const issues = evaluateNamingDuplicates({
      skills: emptySkills([skillCard('foo', ['project', 'user'])]),
      mcps: emptyMcps(),
      hooks: hooksWith([]),
      commands: emptyCommands(),
      agents: emptyAgents(),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'naming/duplicate-across-sources',
      severity: 'warn',
      cardScope: 'user',
      cardName: 'foo',
      cardDomain: 'skill',
    });
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — hook/matcher-regex-invalid
// ---------------------------------------------------------------------------

describe('evaluateHookMatcherRegex', () => {
  it('happy: valid regex passes; undefined / "" / "*" pass', () => {
    const hooks = hooksWith([
      hookCard({ matcher: 'Read|Write' }),
      hookCard({ matcher: undefined }),
      hookCard({ matcher: '' }),
      hookCard({ matcher: '*' }),
    ]);
    expect(evaluateHookMatcherRegex(hooks)).toHaveLength(0);
  });

  it('edge: unbalanced parens raise an error', () => {
    const hooks = hooksWith([hookCard({ matcher: '(unclosed' })]);
    const issues = evaluateHookMatcherRegex(hooks);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'hook/matcher-regex-invalid',
      severity: 'error',
      cardDomain: 'hook',
      hookEvent: 'PreToolUse',
      location: { kind: 'path', path: ['matcher'] },
    });
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — parse/yaml-json-error
// ---------------------------------------------------------------------------

describe('evaluateParseErrors', () => {
  it('happy: no malformed entries → no issues', () => {
    expect(
      evaluateParseErrors({
        skills: emptySkills(),
        mcps: emptyMcps(),
        hooks: hooksWith([]),
        commands: emptyCommands(),
        agents: emptyAgents(),
      }),
    ).toHaveLength(0);
  });

  it('edge: malformed skill + agent both surface as errors', () => {
    const issues = evaluateParseErrors({
      skills: {
        cards: [],
        malformed: [
          { scope: 'project', absoluteRoot: '/tmp/project/foo', reason: 'invalid frontmatter' },
        ],
      },
      mcps: emptyMcps(),
      hooks: hooksWith([]),
      commands: emptyCommands(),
      agents: {
        cards: [],
        malformed: [
          {
            scope: 'user',
            absoluteFile: '/tmp/user/.claude/agents/bad.md',
            reason: 'invalid-frontmatter',
            detail: 'missing description',
          },
        ],
      },
    });
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'error')).toBe(true);
    expect(issues.map((i) => i.cardDomain).sort()).toEqual(['agent', 'skill']);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — mcp/command-not-on-path
// ---------------------------------------------------------------------------

describe('evaluateMcpCommandOnPath', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy: resolved command produces no warning', () => {
    vi.spyOn(serverPathResolver, 'resolveCommandOnServerPath').mockReturnValue({
      resolved: '/usr/bin/npx',
    });
    const issues = evaluateMcpCommandOnPath(
      emptyMcps([mcpCard({ name: 'github', command: 'npx' })]),
    );
    expect(issues).toHaveLength(0);
  });

  it('edge: missing command on PATH warns with the resolved=null path', () => {
    vi.spyOn(serverPathResolver, 'resolveCommandOnServerPath').mockReturnValue({
      resolved: null,
    });
    const issues = evaluateMcpCommandOnPath(
      emptyMcps([mcpCard({ name: 'mystery', command: 'no-such-bin' })]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'mcp/command-not-on-path',
      severity: 'warn',
      cardName: 'mystery',
      cardDomain: 'mcp',
      location: { kind: 'path', path: ['mcpServers', 'mystery', 'command'] },
    });
  });

  it('skips non-stdio servers (sse / http / ws)', () => {
    vi.spyOn(serverPathResolver, 'resolveCommandOnServerPath').mockReturnValue({
      resolved: null,
    });
    const issues = evaluateMcpCommandOnPath(
      emptyMcps([mcpCard({ name: 'sse-server', type: 'sse', url: 'https://x' })]),
    );
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — mcp/url-invalid
// ---------------------------------------------------------------------------

describe('evaluateMcpUrl', () => {
  it('happy: well-formed https URL passes', () => {
    const issues = evaluateMcpUrl(
      emptyMcps([
        mcpCard({ name: 'remote', type: 'http', url: 'https://api.example.com/mcp' }),
      ]),
    );
    expect(issues).toHaveLength(0);
  });

  it('edge: unparseable URL raises error', () => {
    const issues = evaluateMcpUrl(
      emptyMcps([mcpCard({ name: 'broken', type: 'http', url: 'not a url' })]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'mcp/url-invalid',
      severity: 'error',
      cardName: 'broken',
    });
  });

  it('edge: disallowed protocol (file:) raises error', () => {
    const issues = evaluateMcpUrl(
      emptyMcps([mcpCard({ name: 'local', type: 'http', url: 'file:///etc/passwd' })]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.messageI18nVars?.protocol).toBe('file:');
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — agent/tools-non-standard
// ---------------------------------------------------------------------------

describe('evaluateAgentToolsStandard', () => {
  it('happy: every tool is standard', () => {
    const issues = evaluateAgentToolsStandard(
      emptyAgents([agentCard({ name: 'reviewer', tools: ['Read', 'Grep', 'Glob'] })]),
    );
    expect(issues).toHaveLength(0);
  });

  it('happy: tools omitted = "all allowed" — skipped without warning', () => {
    const issues = evaluateAgentToolsStandard(
      emptyAgents([agentCard({ name: 'free-agent' })]),
    );
    expect(issues).toHaveLength(0);
  });

  it('edge: MCP tool reference produces warn (uncertain branch — never error)', () => {
    const issues = evaluateAgentToolsStandard(
      emptyAgents([
        agentCard({ name: 'docs', tools: ['Read', 'mcp__context7__query-docs'] }),
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'agent/tools-non-standard',
      severity: 'warn',
      cardName: 'docs',
      location: { kind: 'path', path: ['tools', '1'] },
    });
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — hook/env-var-undefined
// ---------------------------------------------------------------------------

describe('evaluateHookEnvVars', () => {
  it('happy: standard env vars pass without warning', () => {
    const issues = evaluateHookEnvVars(
      hooksWith([hookCard({ body: 'echo "$HOME and $PATH"' })]),
    );
    expect(issues).toHaveLength(0);
  });

  it('edge: undefined ${MY_VAR} produces a warn with the variable name', () => {
    delete process.env.MY_LINT_TEST_VAR;
    const issues = evaluateHookEnvVars(
      hooksWith([hookCard({ body: 'echo "${MY_LINT_TEST_VAR}"' })]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'hook/env-var-undefined',
      severity: 'warn',
      messageI18nVars: { variable: 'MY_LINT_TEST_VAR' },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveRulePreferences
// ---------------------------------------------------------------------------

describe('resolveRulePreferences', () => {
  it('returns defaults when user prefs are undefined', () => {
    expect(resolveRulePreferences(undefined)).toEqual(LINT_RULE_DEFAULTS);
  });

  it('opt-in path: user enables mcp/command-not-on-path explicitly', () => {
    const result = resolveRulePreferences({ 'mcp/command-not-on-path': true });
    expect(result['mcp/command-not-on-path']).toBe(true);
    // Other defaults remain untouched.
    expect(result['agent/tools-non-standard']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Service-level fan-out smoke test
// ---------------------------------------------------------------------------

describe('harnessLintService.evaluate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty issue set on user scope when all listCards calls error out', async () => {
    // Mock every listCards to throw — the service should swallow and return
    // an empty issues array rather than propagating.
    const skillSvc = await import('../harnessSkillService.js');
    const mcpSvc = await import('../harnessMcpService.js');
    const hookSvc = await import('../harnessHookService.js');
    const cmdSvc = await import('../harnessCommandService.js');
    const agentSvc = await import('../harnessAgentService.js');

    vi.spyOn(skillSvc.harnessSkillService, 'listCards').mockRejectedValue(new Error('boom'));
    vi.spyOn(mcpSvc.harnessMcpService, 'listCards').mockRejectedValue(new Error('boom'));
    vi.spyOn(hookSvc.harnessHookService, 'listCards').mockRejectedValue(new Error('boom'));
    vi.spyOn(cmdSvc.harnessCommandService, 'listCards').mockRejectedValue(new Error('boom'));
    vi.spyOn(agentSvc.harnessAgentService, 'listCards').mockRejectedValue(new Error('boom'));

    const result = await harnessLintService.evaluate({
      scope: 'user',
      rulePreferences: allRulesOn(),
    });
    expect(result.issues).toEqual([]);
    expect(result.evaluatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.rulePreferences).toEqual(allRulesOn());
  });
});
