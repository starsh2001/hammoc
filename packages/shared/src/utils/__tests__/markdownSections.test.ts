/**
 * Story 29.1: H2 split/append helpers — pure-function tests covering the
 * edge cases listed in AC3.e (code-fence isolation, CRLF normalization,
 * empty H2 set, trailing newline preservation).
 */

import { describe, it, expect } from 'vitest';
import {
  splitMarkdownByH2,
  appendMarkdownSections,
  type MarkdownH2Section,
} from '../markdownSections.js';

describe('splitMarkdownByH2', () => {
  it('returns an empty array when no H2 is present', () => {
    expect(splitMarkdownByH2('# title\n\nbody')).toEqual([]);
    expect(splitMarkdownByH2('')).toEqual([]);
    expect(splitMarkdownByH2('plain text\nno headings here')).toEqual([]);
  });

  it('splits a single H2 with body', () => {
    const raw = '# H1\n\n## Alpha\nbody1\nbody2\n';
    expect(splitMarkdownByH2(raw)).toEqual([
      { heading: '## Alpha', body: 'body1\nbody2' },
    ]);
  });

  it('splits multiple H2 sections, dropping pre-H1/H1 preamble', () => {
    const raw = [
      '# Document title',
      '',
      'Intro paragraph (dropped — not in any H2).',
      '',
      '## Alpha',
      'a-body',
      '',
      '## Bravo',
      '',
      'b-body',
    ].join('\n');
    expect(splitMarkdownByH2(raw)).toEqual([
      { heading: '## Alpha', body: 'a-body' },
      { heading: '## Bravo', body: '\nb-body' },
    ]);
  });

  it('does not treat fenced code blocks as headings', () => {
    const raw = [
      '## Real',
      'before',
      '```',
      '## not a heading',
      '```',
      'after',
      '## AlsoReal',
      'tail',
    ].join('\n');
    const sections = splitMarkdownByH2(raw);
    expect(sections.map((s) => s.heading)).toEqual(['## Real', '## AlsoReal']);
    expect(sections[0].body).toContain('## not a heading');
  });

  it('handles tilde fences the same as backtick fences', () => {
    const raw = [
      '## Real',
      '~~~',
      '## not a heading',
      '~~~',
      'tail',
    ].join('\n');
    const sections = splitMarkdownByH2(raw);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('## Real');
  });

  it('normalizes CRLF input the same as LF', () => {
    const raw = '## A\r\na\r\n## B\r\nb\r\n';
    expect(splitMarkdownByH2(raw)).toEqual([
      { heading: '## A', body: 'a' },
      { heading: '## B', body: 'b' },
    ]);
  });

  it('strips trailing blank lines from each section body', () => {
    const raw = '## A\nbody\n\n\n## B\nb';
    const sections = splitMarkdownByH2(raw);
    expect(sections[0].body).toBe('body');
  });

  it('does not match H3 / H1 as H2', () => {
    expect(splitMarkdownByH2('# H1\n## A\nb\n### sub\nbody')).toEqual([
      { heading: '## A', body: 'b\n### sub\nbody' },
    ]);
  });
});

describe('appendMarkdownSections', () => {
  const fixtures: MarkdownH2Section[] = [
    { heading: '## Alpha', body: 'a-body' },
    { heading: '## Bravo', body: 'b-body\nmore' },
  ];

  it('appends to a non-empty target with a single blank line separator', () => {
    const result = appendMarkdownSections('# existing\n', fixtures);
    expect(result).toBe('# existing\n\n## Alpha\na-body\n\n## Bravo\nb-body\nmore\n');
  });

  it('appends to an empty target without a leading blank line', () => {
    const result = appendMarkdownSections('', fixtures);
    expect(result).toBe('## Alpha\na-body\n\n## Bravo\nb-body\nmore\n');
  });

  it('inserts only one blank line when the target already ends with a single newline', () => {
    const result = appendMarkdownSections('a\n', [fixtures[0]]);
    expect(result).toBe('a\n\n## Alpha\na-body\n');
  });

  it('does not insert an extra blank line when the target already ends in two newlines', () => {
    const result = appendMarkdownSections('a\n\n', [fixtures[0]]);
    expect(result).toBe('a\n\n## Alpha\na-body\n');
  });

  it('handles a heading-only section (empty body) without trailing newline glitches', () => {
    const result = appendMarkdownSections('a\n', [{ heading: '## Empty', body: '' }]);
    expect(result).toBe('a\n\n## Empty\n');
  });

  it('returns the target normalized when sections array is empty', () => {
    expect(appendMarkdownSections('hello', [])).toBe('hello\n');
    expect(appendMarkdownSections('hello\n', [])).toBe('hello\n');
    expect(appendMarkdownSections('', [])).toBe('');
  });

  it('round-trips: split → append same sections → re-split returns identity', () => {
    const original = '## Alpha\na\n\n## Bravo\nb\n';
    const sections = splitMarkdownByH2(original);
    const reassembled = appendMarkdownSections('', sections);
    expect(splitMarkdownByH2(reassembled)).toEqual(sections);
  });
});
