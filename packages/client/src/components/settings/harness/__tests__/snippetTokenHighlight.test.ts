/**
 * Story 29.2: snippetTokenHighlight tokenizer tests.
 *
 * The CodeMirror decoration plugin is exercised inside an integration scenario
 * (B-13-05a) since jsdom does not paint CodeMirror; here we validate the pure
 * `tokenizeSnippetBody` helper that drives the decoration set.
 *
 * Covers:
 *  - %ref% snippet references are recognized
 *  - {arg1}/{arg2}/… positional arguments are recognized
 *  - {context} is recognized
 *  - overlapping matches are filtered (no double-decoration)
 *  - non-token text yields zero matches
 *  - multiple tokens within one body are returned in document order
 */

import { describe, it, expect } from 'vitest';
import { tokenizeSnippetBody } from '../snippetTokenHighlight';

describe('tokenizeSnippetBody', () => {
  it('recognizes a single %ref% token', () => {
    const matches = tokenizeSnippetBody('Hello %commit-and-done% world');
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe('snippetRef');
    expect(matches[0].from).toBe(6);
    expect(matches[0].to).toBe(23);
  });

  it('recognizes {argN} positional arguments', () => {
    const matches = tokenizeSnippetBody('Run with {arg1} and {arg2}.');
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.kind === 'arg')).toBe(true);
  });

  it('recognizes the {context} token', () => {
    const matches = tokenizeSnippetBody('Continue: {context}');
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe('context');
  });

  it('returns matches in document order across mixed kinds', () => {
    const matches = tokenizeSnippetBody('%a% then {arg1} then {context}.');
    expect(matches.map((m) => m.kind)).toEqual(['snippetRef', 'arg', 'context']);
    // Sorted by `from` ascending.
    expect(matches[0].from).toBeLessThan(matches[1].from);
    expect(matches[1].from).toBeLessThan(matches[2].from);
  });

  it('returns an empty array when no token is present', () => {
    expect(tokenizeSnippetBody('plain text without any markers')).toEqual([]);
  });

  it('filters overlapping matches so each character is decorated at most once', () => {
    // %{arg1}% — the inner `{arg1}` would otherwise be claimed by both kinds.
    // The outer %…% should win since it starts earlier; the inner is dropped.
    const matches = tokenizeSnippetBody('%{arg1}%');
    expect(matches).toHaveLength(1);
  });

  it('recognizes ref names containing dot/underscore/hyphen', () => {
    const matches = tokenizeSnippetBody('%my.snippet_v1-final%');
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe('snippetRef');
  });
});
