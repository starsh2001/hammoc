/**
 * Story 30.3 (Task 2.4): unit tests for secretPlaceholderNamer.
 *
 * Covers the 4 representative paths per domain. The exact strings are part
 * of the API surface — bundles travel between Hammoc projects, and changing
 * the names later would break round-trips with previously-exported bundles.
 */

import { describe, it, expect } from 'vitest';
import { namePlaceholder } from '../secretPlaceholderNamer.js';

describe('secretPlaceholderNamer — mcp domain', () => {
  it('translates env.<KEY> paths into <CARD>_<KEY>', () => {
    expect(
      namePlaceholder({
        domain: 'mcp',
        cardName: 'context7',
        fieldPath: 'mcpServers.context7.env.API_KEY',
      }),
    ).toBe('CONTEXT7_API_KEY');
  });

  it('translates headers.Authorization into BEARER_TOKEN_<CARD>', () => {
    expect(
      namePlaceholder({
        domain: 'mcp',
        cardName: 'github',
        fieldPath: 'mcpServers.github.headers.Authorization',
      }),
    ).toBe('BEARER_TOKEN_GITHUB');
  });

  it('falls back to <CARD>_<LAST_SEG> for unknown paths', () => {
    expect(
      namePlaceholder({
        domain: 'mcp',
        cardName: 'svc',
        fieldPath: 'mcpServers.svc.config.apiSecret',
      }),
    ).toBe('SVC_APISECRET');
  });
});

describe('secretPlaceholderNamer — hook domain', () => {
  it('embeds the event in the ENV name', () => {
    expect(
      namePlaceholder({
        domain: 'hook',
        cardName: 'ci-runner',
        hookEvent: 'PreToolUse',
        fieldPath: 'command',
      }),
    ).toBe('HOOK_PRETOOLUSE_CI_RUNNER_TOKEN');
  });

  it('falls back to GENERIC when no event is provided', () => {
    expect(
      namePlaceholder({
        domain: 'hook',
        cardName: 'oncall',
        fieldPath: 'command',
      }),
    ).toBe('HOOK_GENERIC_ONCALL_TOKEN');
  });
});

describe('secretPlaceholderNamer — command/agent domain', () => {
  it('command produces COMMAND_<CARD>_TOKEN', () => {
    expect(
      namePlaceholder({
        domain: 'command',
        cardName: 'BMad:agents:sm',
        fieldPath: 'body:0',
      }),
    ).toBe('COMMAND_BMAD_AGENTS_SM_TOKEN');
  });

  it('agent produces AGENT_<CARD>_TOKEN', () => {
    expect(
      namePlaceholder({
        domain: 'agent',
        cardName: 'security-reviewer',
        fieldPath: 'body:0',
      }),
    ).toBe('AGENT_SECURITY_REVIEWER_TOKEN');
  });
});

describe('secretPlaceholderNamer — edge cases', () => {
  it('coerces non-alphanumerics into underscores and uppercases', () => {
    expect(
      namePlaceholder({
        domain: 'mcp',
        cardName: 'my-cool-service.v2',
        fieldPath: 'mcpServers.svc.env.X',
      }),
    ).toBe('MY_COOL_SERVICE_V2_X');
  });

  it('handles empty card names by emitting UNNAMED', () => {
    expect(
      namePlaceholder({
        domain: 'command',
        cardName: '',
        fieldPath: 'body:0',
      }),
    ).toBe('COMMAND_UNNAMED_TOKEN');
  });
});
