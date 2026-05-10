/**
 * Story 30.1 (Task 1.3): unit tests for the canonical secret heuristic.
 *
 * Covers the five canonical patterns (bearer / sk / aws / slack / base64),
 * the `${ENV}` strip rule, the short-token negative case (regression guard
 * against false-positives), and both entry-point return shapes.
 */

import { describe, it, expect } from 'vitest';
import {
  SECRET_PATTERNS,
  detectSecretsInText,
  detectSecretsInValue,
} from '../secretHeuristic.js';

describe('secretHeuristic — SECRET_PATTERNS canonical', () => {
  it('exports five named patterns: bearer / sk / aws / slack / base64', () => {
    expect(SECRET_PATTERNS.map((p) => p.name)).toEqual([
      'bearer',
      'sk',
      'aws',
      'slack',
      'base64',
    ]);
  });
});

describe('detectSecretsInText — line-based scanning', () => {
  it('returns matched=false / empty arrays for empty input', () => {
    const res = detectSecretsInText('');
    expect(res).toEqual({ matched: false, patternNames: [], lines: [] });
  });

  it('matches Bearer tokens inline (unanchored, ≥16 chars)', () => {
    const res = detectSecretsInText('curl -H "Authorization: Bearer ghp_AbcdefghIJKLMNOP1234"');
    expect(res.matched).toBe(true);
    expect(res.patternNames).toContain('bearer');
    expect(res.lines).toEqual([1]);
  });

  it('matches sk- tokens (≥20 chars after sk-)', () => {
    const res = detectSecretsInText('OPENAI_KEY=sk-AaBbCcDdEeFfGgHhIiJjKk');
    expect(res.matched).toBe(true);
    expect(res.patternNames).toContain('sk');
  });

  it('matches AWS access keys (AKIA + 16 uppercase/digit chars)', () => {
    const res = detectSecretsInText('# AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP');
    expect(res.matched).toBe(true);
    expect(res.patternNames).toContain('aws');
  });

  it('matches Slack tokens (xoxb / xoxp / xoxa / xoxr / xoxs)', () => {
    const res = detectSecretsInText('SLACK=xoxb-1234567890-abcdefghij');
    expect(res.matched).toBe(true);
    expect(res.patternNames).toContain('slack');
  });

  it('matches long base64-ish runs (≥32 chars from [A-Za-z0-9+/=])', () => {
    const res = detectSecretsInText(`token = ${'A'.repeat(40)}`);
    expect(res.matched).toBe(true);
    expect(res.patternNames).toContain('base64');
  });

  it('strips ${ENV_VAR} references before pattern evaluation', () => {
    const res = detectSecretsInText('Authorization: Bearer ${GITHUB_TOKEN}');
    expect(res.matched).toBe(false);
  });

  it('does not flag short plaintext as a secret', () => {
    const res = detectSecretsInText('greeting = "hello world"');
    expect(res.matched).toBe(false);
  });

  it('reports 1-based matched line numbers when secret spans multiple lines', () => {
    const text = ['# header', 'AKIAABCDEFGHIJKLMNOP', 'safe = 1', 'sk-AaBbCcDdEeFfGgHhIiJjKk'].join(
      '\n',
    );
    const res = detectSecretsInText(text);
    expect(res.matched).toBe(true);
    expect(res.lines).toEqual([2, 4]);
  });
});

describe('detectSecretsInValue — JSON walk', () => {
  it('returns matched=false / empty arrays for null / undefined', () => {
    expect(detectSecretsInValue(null)).toEqual({ matched: false, patternNames: [], paths: [] });
    expect(detectSecretsInValue(undefined)).toEqual({
      matched: false,
      patternNames: [],
      paths: [],
    });
  });

  it('matches all five canonical pattern shapes in a single nested object', () => {
    const res = detectSecretsInValue({
      env: {
        BEARER: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaa',
        STRIPE: 'sk-aaaaaaaaaaaaaaaaaaaaaaaa',
        AWS: 'AKIAABCDEFGHIJKLMNOP',
        SLACK: 'xoxb-1234567890-abcdefghij',
        BIG: 'A'.repeat(45),
      },
    });
    expect(res.matched).toBe(true);
    expect(res.paths).toHaveLength(5);
    expect(res.paths.sort()).toEqual(
      ['env.AWS', 'env.BEARER', 'env.BIG', 'env.SLACK', 'env.STRIPE'].sort(),
    );
    expect(new Set(res.patternNames)).toEqual(new Set(['bearer', 'sk', 'aws', 'slack', 'base64']));
  });

  it('treats `${ENV}`-only strings as non-secret (env-var indirection)', () => {
    const res = detectSecretsInValue({
      headers: { Authorization: 'Bearer ${GH_TOKEN}' },
      env: { REF: '${TOKEN}', SHORT: 'abcd1234' },
    });
    expect(res.matched).toBe(false);
    expect(res.paths).toEqual([]);
  });

  it('walks arrays and reports indexed dot-paths', () => {
    const res = detectSecretsInValue({
      args: ['--token', 'sk-AaBbCcDdEeFfGgHhIiJjKk'],
    });
    expect(res.matched).toBe(true);
    expect(res.paths).toEqual(['args.1']);
  });

  it('honors a basePath prefix when caller already has context', () => {
    const res = detectSecretsInValue('AKIAABCDEFGHIJKLMNOP', ['mcpServers', 'gh', 'env', 'KEY']);
    expect(res.matched).toBe(true);
    expect(res.paths).toEqual(['mcpServers.gh.env.KEY']);
  });
});
