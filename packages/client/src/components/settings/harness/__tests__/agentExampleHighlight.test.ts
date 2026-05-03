/**
 * Story 28.6 AC2.b / AC4.b: Pure-function tests for the agent `<example>`
 * tokenizer.
 *
 * The full CodeMirror Decoration ViewPlugin is exercised by the integration
 * scenarios (B-11-05). These unit tests only validate the regex matrix that
 * drives it — they catch tokenization regressions cheaply without having to
 * spin up a full editor instance.
 */

import { describe, it, expect } from 'vitest';
import { tokenizeAgentExamples } from '../agentExampleHighlight';

describe('tokenizeAgentExamples', () => {
  it('detects a single <example> block', () => {
    const matches = tokenizeAgentExamples('<example>case</example>');
    expect(matches).toHaveLength(1);
    expect(matches[0].from).toBe(0);
    expect(matches[0].to).toBe('<example>case</example>'.length);
  });

  it('detects multiple <example> blocks', () => {
    const text = 'a <example>one</example> b <example>two</example> c';
    const matches = tokenizeAgentExamples(text);
    expect(matches).toHaveLength(2);
    expect(matches[0].from).toBeLessThan(matches[1].from);
  });

  it('returns no matches when body has no <example>', () => {
    expect(tokenizeAgentExamples('plain markdown body')).toEqual([]);
  });

  it('does not match an unclosed <example tag (safe guard)', () => {
    expect(tokenizeAgentExamples('<example malformed without closing tag')).toEqual([]);
  });

  it('matches <example> with attributes / multiline content', () => {
    const text = `<example context="x">
multi
line
content
</example>`;
    const matches = tokenizeAgentExamples(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].from).toBe(0);
  });
});
