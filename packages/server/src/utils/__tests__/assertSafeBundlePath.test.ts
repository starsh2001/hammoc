/**
 * Story 30.5 (Task C.3 + AC9.b): unit tests for the ZIP-slip / path-traversal
 * guard that every import-bundle entry must pass. Four cases:
 *   1. Parent-escape (`../`) → throws
 *   2. POSIX-absolute (`/`) → throws
 *   3. Windows-style traversal (`..\\windows\\system32`) → throws
 *   4. Well-formed relative entry (`skills/foo/SKILL.md`) → passes
 *
 * Supplementary cases probe the other branches of the guard (null byte,
 * Windows-absolute drive letter, UNC) — they share the same throw path so a
 * regression touching one usually surfaces here too.
 */

import { describe, expect, it } from 'vitest';
import {
  assertSafeBundlePath,
  UnsafeBundlePathError,
} from '../assertSafeBundlePath.js';

describe('assertSafeBundlePath', () => {
  it('throws on `../` parent-escape (AC9.b case 1)', () => {
    expect(() => assertSafeBundlePath('../../etc/passwd')).toThrow(UnsafeBundlePathError);
  });

  it('throws on POSIX-absolute path (AC9.b case 2)', () => {
    expect(() => assertSafeBundlePath('/abs/path/evil.txt')).toThrow(UnsafeBundlePathError);
  });

  it('throws on Windows-style backslash traversal (AC9.b case 3)', () => {
    expect(() => assertSafeBundlePath('..\\windows\\system32\\evil.dll')).toThrow(
      UnsafeBundlePathError,
    );
  });

  it('passes a well-formed POSIX relative entry (AC9.b case 4)', () => {
    expect(() => assertSafeBundlePath('skills/foo/SKILL.md')).not.toThrow();
    expect(() => assertSafeBundlePath('agents/qa.md')).not.toThrow();
    expect(() => assertSafeBundlePath('manifest.json')).not.toThrow();
  });

  it('throws on Windows-absolute paths (C:\\, D:/)', () => {
    expect(() => assertSafeBundlePath('C:\\Windows\\System32\\bad.dll')).toThrow(
      UnsafeBundlePathError,
    );
    expect(() => assertSafeBundlePath('D:/secret.txt')).toThrow(UnsafeBundlePathError);
  });

  it('throws on UNC prefixes (\\\\server, //server)', () => {
    expect(() => assertSafeBundlePath('\\\\server\\share\\evil')).toThrow(UnsafeBundlePathError);
    expect(() => assertSafeBundlePath('//server/share/evil')).toThrow(UnsafeBundlePathError);
  });

  it('throws when the path contains a null byte', () => {
    expect(() => assertSafeBundlePath('skills/foo\0/SKILL.md')).toThrow(UnsafeBundlePathError);
  });

  it('throws on empty path', () => {
    expect(() => assertSafeBundlePath('')).toThrow(UnsafeBundlePathError);
  });

  it('attaches the offending relative path to the error', () => {
    try {
      assertSafeBundlePath('../etc/shadow');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafeBundlePathError);
      expect((err as UnsafeBundlePathError).relativePath).toBe('../etc/shadow');
      expect((err as UnsafeBundlePathError).code).toBe('HARNESS_BUNDLE_UNSAFE_PATH');
    }
  });
});
