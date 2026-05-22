/**
 * Story 30.3 (Task 2.4): unit tests for applySecretsPolicy.
 *
 * Three policies × two payload shapes (value + text) = six core cases.
 * Verifies that:
 *   - `excluded` strips secrets (object leaves dropped, text lines replaced
 *     with the stable sentinel) and surfaces a `removedCount`
 *   - `placeholder` substitutes `${ENV_REF}` and surfaces a `replacedCount`
 *   - `included-explicit` is a pass-through with zero counters
 */

import { describe, it, expect } from 'vitest';
import {
  applyPolicyToText,
  applyPolicyToValue,
  SECRET_REMOVED_TEXT_PLACEHOLDER,
} from '../applySecretsPolicy.js';

const REAL_BASE64 = 'aGVsbG93b3JsZHRoaXNpc2FzZWNyZXR0b2tlbg==';

describe('applyPolicyToValue — mcp config shape', () => {
  const payload = {
    mcpServers: {
      context7: {
        command: 'node',
        env: { API_KEY: 'sk-AbcDEF1234567890ghijklMNOPqrst' },
        headers: { Authorization: 'Bearer ghp_AbcdefghIJKLMNOP1234' },
      },
    },
  };

  it('included-explicit: returns the original value unchanged', () => {
    const r = applyPolicyToValue({
      policy: 'included-explicit',
      domain: 'mcp',
      cardName: 'context7',
      value: payload,
    });
    expect(r.value).toEqual(payload);
    expect(r.removedCount).toBe(0);
    expect(r.replacedCount).toBe(0);
  });

  it('excluded: drops every secret leaf and counts removals', () => {
    const r = applyPolicyToValue({
      policy: 'excluded',
      domain: 'mcp',
      cardName: 'context7',
      value: payload,
    });
    const value = r.value as typeof payload;
    expect(value.mcpServers.context7.env).toEqual({});
    expect(value.mcpServers.context7.headers).toEqual({});
    expect(r.removedCount).toBe(2);
    expect(r.replacedCount).toBe(0);
  });

  it('placeholder: substitutes ENV refs using the domain naming rule', () => {
    const r = applyPolicyToValue({
      policy: 'placeholder',
      domain: 'mcp',
      cardName: 'context7',
      value: payload,
    });
    const value = r.value as typeof payload;
    expect(value.mcpServers.context7.env.API_KEY).toBe('${CONTEXT7_API_KEY}');
    expect(value.mcpServers.context7.headers.Authorization).toBe(
      '${BEARER_TOKEN_CONTEXT7}',
    );
    expect(r.replacedCount).toBe(2);
    expect(r.removedCount).toBe(0);
  });
});

describe('applyPolicyToText — line-oriented body', () => {
  const text = [
    '# Agent system prompt',
    `Use this token to authenticate: sk-AbcDEF1234567890ghijklMNOPqrst`,
    'No secrets on this line.',
    `Authorization: Bearer ghp_AbcdefghIJKLMNOP1234`,
  ].join('\n');

  it('included-explicit: returns the text unchanged', () => {
    const r = applyPolicyToText({
      policy: 'included-explicit',
      domain: 'agent',
      cardName: 'reviewer',
      text,
    });
    expect(r.text).toBe(text);
    expect(r.removedCount).toBe(0);
    expect(r.replacedCount).toBe(0);
  });

  it('excluded: replaces offending lines with the sentinel placeholder', () => {
    const r = applyPolicyToText({
      policy: 'excluded',
      domain: 'agent',
      cardName: 'reviewer',
      text,
    });
    const lines = r.text.split('\n');
    expect(lines[0]).toBe('# Agent system prompt');
    expect(lines[1]).toBe(SECRET_REMOVED_TEXT_PLACEHOLDER);
    expect(lines[2]).toBe('No secrets on this line.');
    expect(lines[3]).toBe(SECRET_REMOVED_TEXT_PLACEHOLDER);
    expect(r.removedCount).toBe(2);
  });

  it('placeholder: substitutes ENV refs in-place per match', () => {
    const r = applyPolicyToText({
      policy: 'placeholder',
      domain: 'agent',
      cardName: 'reviewer',
      text,
    });
    expect(r.text).toContain('${AGENT_REVIEWER_TOKEN}');
    expect(r.text).not.toContain('sk-AbcDEF');
    expect(r.text).not.toContain('Bearer ghp_');
    expect(r.replacedCount).toBeGreaterThanOrEqual(2);
  });
});

describe('applyPolicyToValue — base64 in arbitrary fields', () => {
  it('respects the entropy gate (real base64 caught, English compounds not)', () => {
    const removed = applyPolicyToValue({
      policy: 'excluded',
      domain: 'command',
      cardName: 'analyzer',
      value: { token: REAL_BASE64 },
    });
    expect((removed.value as { token?: string }).token).toBeUndefined();
    expect(removed.removedCount).toBe(1);

    const safe = applyPolicyToValue({
      policy: 'excluded',
      domain: 'command',
      cardName: 'analyzer',
      value: { caption: 'Hammocproductivityengineeringworkbench' },
    });
    expect((safe.value as { caption: string }).caption).toBe(
      'Hammocproductivityengineeringworkbench',
    );
    expect(safe.removedCount).toBe(0);
  });
});
