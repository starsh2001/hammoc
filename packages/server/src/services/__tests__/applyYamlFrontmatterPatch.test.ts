/**
 * Story 28.5: applyYamlFrontmatterPatch unit tests.
 *
 * The helper rewrites just the leading `--- ... ---` block while preserving
 * markdown body byte-for-byte. We assert: comment preservation, key order,
 * blank-line preservation, body equality slice, and the "no frontmatter" /
 * "all keys absent" branches.
 */

import { describe, it, expect } from 'vitest';
import { applyYamlFrontmatterPatch } from '../utils/applyYamlFrontmatterPatch.js';

describe('applyYamlFrontmatterPatch', () => {
  it('updates one key while preserving the order of the others', () => {
    const source = `---
description: old description
argument-hint: "[topic]"
allowed-tools: Read, Bash(git:*)
model: sonnet
---

# body
`;
    const patched = applyYamlFrontmatterPatch(source, {
      description: 'new description',
    });
    // The order argument-hint → allowed-tools → model must stay intact.
    const fmIdx = patched.indexOf('argument-hint');
    const toolsIdx = patched.indexOf('allowed-tools');
    const modelIdx = patched.indexOf('model:');
    expect(fmIdx).toBeGreaterThan(0);
    expect(toolsIdx).toBeGreaterThan(fmIdx);
    expect(modelIdx).toBeGreaterThan(toolsIdx);
    expect(patched).toContain('description: new description');
  });

  it('preserves frontmatter comments through the round-trip', () => {
    const source = `---
# user note
description: hello
---

body
`;
    const patched = applyYamlFrontmatterPatch(source, {
      description: 'updated',
    });
    expect(patched).toContain('# user note');
    expect(patched).toContain('description: updated');
  });

  it('keeps the markdown body byte-for-byte', () => {
    const source = `---
description: a
---


# heading

paragraph with $1 and !\`echo hi\`.
`;
    const headerLen = source.indexOf('# heading');
    const patched = applyYamlFrontmatterPatch(source, { description: 'b' });
    // Body region (everything from `# heading` onwards) must match exactly.
    const patchedHeaderIdx = patched.indexOf('# heading');
    expect(patched.slice(patchedHeaderIdx)).toBe(source.slice(headerLen));
  });

  it('creates a new --- block when source has no frontmatter and patch has keys', () => {
    const source = '# Hello\nbody only\n';
    const patched = applyYamlFrontmatterPatch(source, {
      description: 'inserted',
    });
    expect(patched.startsWith('---')).toBe(true);
    expect(patched).toContain('description: inserted');
    expect(patched).toContain('# Hello\nbody only\n');
  });

  it('strips the entire --- block when all keys are absent', () => {
    const source = `---
description: gone
argument-hint: "[a]"
---

body
`;
    const patched = applyYamlFrontmatterPatch(source, {
      description: undefined,
      'argument-hint': undefined,
      'allowed-tools': undefined,
      model: undefined,
    });
    expect(patched.startsWith('---')).toBe(false);
    expect(patched).toContain('body');
  });

  it('returns source unchanged when both source and patch are empty', () => {
    const source = '# body only\n';
    const patched = applyYamlFrontmatterPatch(source, {});
    expect(patched).toBe(source);
  });
});
