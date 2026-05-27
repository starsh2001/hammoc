/**
 * Story 30.5 (AC9): single-source guard against ZIP-slip / path-traversal
 * during harness bundle import.
 *
 * `jszip` does not normalise entry paths — a malicious bundle can ship an
 * entry called `../../etc/passwd` or `C:\Windows\System32\evil.dll` and naive
 * code that joins it to the project root would write outside the target.
 * Every entry path read from an import ZIP must therefore pass through this
 * function before the bundle service touches disk.
 *
 * Rejected shapes:
 *   - absolute POSIX (`/etc/...`)
 *   - absolute Windows (`C:\...`, `C:/...`)
 *   - UNC (`\\server\share`, `//server/share`)
 *   - any traversal component (`..` segment anywhere in the path)
 *   - embedded null byte (would terminate the path early in fs APIs)
 *
 * Accepted shapes:
 *   - POSIX-style relative paths (`skills/foo/SKILL.md`)
 *   - Windows-style backslashes are normalised, then validated
 *   - the empty string (the zip "/" root) is rejected as it carries no entry
 */

const ABSOLUTE_WIN_RE = /^[A-Za-z]:[\\/]/;
const TRAVERSAL_SEGMENT_RE = /(^|[\\/])\.\.([\\/]|$)/;

export class UnsafeBundlePathError extends Error {
  readonly code = 'HARNESS_BUNDLE_UNSAFE_PATH';
  readonly relativePath: string;
  constructor(relativePath: string, reason: string) {
    super(`unsafe bundle entry "${relativePath}": ${reason}`);
    this.relativePath = relativePath;
  }
}

export function assertSafeBundlePath(relativePath: string): void {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new UnsafeBundlePathError(String(relativePath), 'empty entry path');
  }
  if (relativePath.includes('\0')) {
    throw new UnsafeBundlePathError(relativePath, 'null byte in entry path');
  }
  if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    throw new UnsafeBundlePathError(relativePath, 'absolute path not allowed');
  }
  if (ABSOLUTE_WIN_RE.test(relativePath)) {
    throw new UnsafeBundlePathError(relativePath, 'Windows-absolute path not allowed');
  }
  if (relativePath.startsWith('\\\\') || relativePath.startsWith('//')) {
    throw new UnsafeBundlePathError(relativePath, 'UNC path not allowed');
  }
  if (TRAVERSAL_SEGMENT_RE.test(relativePath)) {
    throw new UnsafeBundlePathError(relativePath, 'parent-directory traversal not allowed');
  }
}
