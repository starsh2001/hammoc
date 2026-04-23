/**
 * Story 28.0.5: YAML / JSONC round-trip editor tests.
 * AC4 — comments, blank lines, and key order must be preserved across edits.
 */

import { describe, it, expect } from 'vitest';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { applyYamlPatch, applyJsoncPatch } from '../structuredEditor.js';

describe('applyYamlPatch (AC4)', () => {
  it('preserves surrounding comments when modifying an existing key', () => {
    const src = `# top comment
name: old        # inline on name
# between comment

# comment on age
age: 30
`;
    const out = applyYamlPatch(src, [{ path: ['name'], value: 'new' }]);
    expect(out).toContain('# top comment');
    expect(out).toContain('# between comment');
    expect(out).toContain('# comment on age');
    expect(out).toMatch(/name:\s*new/);
  });

  it('preserves blank lines and key order when adding a new key', () => {
    const src = `a: 1

b: 2

c: 3
`;
    const out = applyYamlPatch(src, [{ path: ['d'], value: 4 }]);
    // Original keys appear in original order before the new one
    const idxA = out.indexOf('a:');
    const idxB = out.indexOf('b:');
    const idxC = out.indexOf('c:');
    const idxD = out.indexOf('d:');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
    expect(idxC).toBeLessThan(idxD);
    // Blank lines between a/b/c are retained
    expect(out).toMatch(/a:\s*1\s*\n\s*\n\s*b:/);
  });

  it('deletes a key while keeping sibling keys and their comments intact', () => {
    const src = `a: 1    # keep a
b: 2    # delete me
c: 3    # keep c
`;
    const out = applyYamlPatch(src, [{ path: ['b'], value: undefined }]);
    expect(out).not.toMatch(/^b:/m);
    expect(out).toContain('# keep a');
    expect(out).toContain('# keep c');
  });

  it('throws HARNESS_PARSE_ERROR on unparseable YAML', () => {
    const bad = '::\ninvalid:: : : :';
    expect(() => applyYamlPatch(bad, [{ path: ['x'], value: 1 }])).toThrow(
      expect.objectContaining({ code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code }),
    );
  });
});

describe('applyJsoncPatch (AC4)', () => {
  it('preserves surrounding comments when modifying an existing key', () => {
    const src = `{
  // top comment
  "name": "old",
  /* block comment */
  "age": 30
}
`;
    const out = applyJsoncPatch(src, [{ path: ['name'], value: 'new' }]);
    expect(out).toContain('// top comment');
    expect(out).toContain('/* block comment */');
    expect(out).toContain('"name": "new"');
  });

  it('appends new keys at the end preserving original order and formatting', () => {
    const src = `{
  "a": 1,
  "b": 2
}
`;
    const out = applyJsoncPatch(src, [{ path: ['c'], value: 3 }]);
    const idxA = out.indexOf('"a"');
    const idxB = out.indexOf('"b"');
    const idxC = out.indexOf('"c"');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it('throws HARNESS_PARSE_ERROR on unparseable JSONC', () => {
    expect(() => applyJsoncPatch('{ "a": }', [{ path: ['a'], value: 1 }])).toThrow();
  });
});
