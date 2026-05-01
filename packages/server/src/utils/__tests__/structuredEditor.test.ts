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

// Regression coverage for intermediate-path operations. Story 28.5 (MCP) and
// 28.6 (hooks) drive deep structured edits into config files whose parents may
// not yet exist — pinning the current auto-create behavior here prevents a
// silent regression from a future parser upgrade.
describe('intermediate-path operations (regression)', () => {
  it('YAML setIn creates missing intermediate maps while preserving existing keys', () => {
    const src = `name: keeper
`;
    const out = applyYamlPatch(src, [{ path: ['parent', 'child', 'leaf'], value: 42 }]);
    expect(out).toMatch(/name:\s*keeper/);
    expect(out).toMatch(/parent:/);
    expect(out).toMatch(/child:/);
    expect(out).toMatch(/leaf:\s*42/);
  });

  it('JSONC modify creates missing intermediate objects while preserving existing keys', () => {
    const src = `{
  "name": "keeper"
}
`;
    const out = applyJsoncPatch(src, [{ path: ['parent', 'child', 'leaf'], value: 42 }]);
    expect(out).toContain('"name": "keeper"');
    expect(out).toContain('"parent"');
    expect(out).toContain('"child"');
    expect(out).toContain('"leaf": 42');
  });

  it('YAML delete on a missing intermediate path is a no-op (does not corrupt source)', () => {
    const src = `a: 1
`;
    const out = applyYamlPatch(src, [{ path: ['missing', 'child'], value: undefined }]);
    expect(out).toMatch(/a:\s*1/);
    expect(out).not.toContain('missing');
  });

  it('JSONC delete on a missing intermediate path is a no-op', () => {
    const src = `{
  "a": 1
}
`;
    const out = applyJsoncPatch(src, [{ path: ['missing', 'child'], value: undefined }]);
    expect(out).toContain('"a": 1');
    expect(out).not.toContain('missing');
  });
});
