/**
 * Story 28.5 AC4(a): Pure-function tests for the slash-command token tokenizer.
 *
 * The full CodeMirror Decoration ViewPlugin is exercised in the integration
 * test scenarios (B-10-05). These unit tests only validate the regex matrix
 * that drives it — they catch token-classification regressions cheaply without
 * having to spin up a full editor instance.
 */

import { describe, it, expect } from 'vitest';
import { tokenizeCommandBody } from '../commandTokenHighlight';

describe('tokenizeCommandBody', () => {
  it('classifies positional args ($1, $2, $10)', () => {
    const tokens = tokenizeCommandBody('Use $1 and $2 and $10.');
    expect(tokens.map((t) => t.kind)).toEqual(['args', 'args', 'args']);
  });

  it('does NOT classify $ARGUMENTS as a positional arg', () => {
    const tokens = tokenizeCommandBody('All args: $ARGUMENTS');
    expect(tokens.map((t) => t.kind)).toEqual(['argumentsAll']);
  });

  it('classifies @path file references with the leading-whitespace anchor', () => {
    const tokens = tokenizeCommandBody('See @docs/intro.md and @src/app.ts');
    const fileTokens = tokens.filter((t) => t.kind === 'fileRefs');
    expect(fileTokens).toHaveLength(2);
  });

  it('classifies !`shell` execution', () => {
    const tokens = tokenizeCommandBody('Run !`git status` first.');
    expect(tokens.map((t) => t.kind)).toContain('bashExec');
  });

  it('classifies ${CLAUDE_PLUGIN_ROOT}', () => {
    const tokens = tokenizeCommandBody('Open ${CLAUDE_PLUGIN_ROOT}/agents.md');
    expect(tokens.map((t) => t.kind)).toContain('pluginRoot');
  });

  it('returns matches sorted by position with no overlap', () => {
    const tokens = tokenizeCommandBody(
      '$ARGUMENTS then $1 then @path then !`x` then ${CLAUDE_PLUGIN_ROOT}',
    );
    let lastTo = -1;
    for (const t of tokens) {
      expect(t.from).toBeGreaterThanOrEqual(lastTo);
      lastTo = t.to;
    }
  });

  it('returns an empty array for plain text with no tokens', () => {
    expect(tokenizeCommandBody('Just regular markdown, no tokens.')).toEqual([]);
  });

  it('classifies all five token kinds together (smoke)', () => {
    const tokens = tokenizeCommandBody(
      '$1 / $ARGUMENTS / @path / !`cmd` / ${CLAUDE_PLUGIN_ROOT}',
    );
    expect(new Set(tokens.map((t) => t.kind))).toEqual(
      new Set(['args', 'argumentsAll', 'fileRefs', 'bashExec', 'pluginRoot']),
    );
  });
});
