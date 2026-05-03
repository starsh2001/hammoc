/**
 * Story 28.5: YAML frontmatter round-trip helper.
 *
 * Slash command files (`.claude/commands/**\/*.md`) are markdown documents with
 * an optional `--- ... ---` YAML frontmatter block at the top. To preserve
 * comments / key order / blank lines inside the frontmatter while leaving the
 * markdown body byte-for-byte intact, we round-trip just the frontmatter slice
 * via `yaml`(eemeli) `parseDocument`.
 *
 * Behaviour:
 *   - File has no frontmatter + patch is empty (all keys absent) → return source
 *     unchanged.
 *   - File has no frontmatter + patch contains keys                → prepend a
 *     fresh `--- ... ---` block.
 *   - File has frontmatter + patch is empty                        → strip the
 *     block entirely (matches AC3.a "all four fields absent ⇒ no frontmatter").
 *   - File has frontmatter + patch sets keys                       → mutate keys
 *     in place, preserving comments / order / blank lines for untouched keys.
 *
 * The body region (everything after the closing `---`) is taken from the source
 * via raw substring slicing so byte-level equality holds — this is asserted by
 * the unit tests with `result.slice(boundary) === source.slice(boundary)`.
 */

import { parseDocument, type Document } from 'yaml';
import { HARNESS_ERRORS } from '@hammoc/shared';

/** Match a leading `---\n...---\n?` frontmatter block. */
const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)?/;

interface FrontmatterSlice {
  /** Inner YAML text (without the `---` markers). */
  inner: string;
  /** Index in `source` after the closing `---\n?` (start of the body). */
  bodyStart: number;
  /** EOL flavor reused when emitting a new block. */
  eol: '\n' | '\r\n';
}

function findFrontmatter(source: string): FrontmatterSlice | null {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return null;
  const eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
  return { inner: match[1], bodyStart: match[0].length, eol };
}

function frontmatterIsEmpty(values: Record<string, unknown>): boolean {
  for (const v of Object.values(values)) {
    if (v !== undefined) return false;
  }
  return true;
}

function throwParseError(cause: unknown): never {
  const err = new Error(
    `failed to parse frontmatter: ${(cause as Error)?.message ?? String(cause)}`,
  ) as NodeJS.ErrnoException;
  err.code = HARNESS_ERRORS.HARNESS_PARSE_ERROR.code;
  throw err;
}

/**
 * Apply key-level patches to the YAML frontmatter block of a markdown file.
 * Body markdown is preserved byte-for-byte. Pass `undefined` to delete a key.
 *
 * - When the resulting frontmatter has no keys left, the entire `--- ... ---`
 *   block (including the closing newline) is stripped.
 * - When the source has no frontmatter and `newFrontmatter` carries at least
 *   one defined value, a `--- ... ---` block is prepended with a single
 *   trailing newline before the body.
 *
 * @throws HARNESS_PARSE_ERROR when the existing frontmatter is malformed YAML.
 */
export function applyYamlFrontmatterPatch(
  source: string,
  newFrontmatter: Record<string, unknown>,
): string {
  const slice = findFrontmatter(source);
  const allEmpty = frontmatterIsEmpty(newFrontmatter);

  if (!slice) {
    if (allEmpty) return source;
    const eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
    let doc: Document.Parsed;
    try {
      doc = parseDocument('', { keepSourceTokens: true });
    } catch (cause) {
      throwParseError(cause);
    }
    if (doc!.contents == null) {
      doc!.contents = doc!.createNode({}) as unknown as typeof doc.contents;
    }
    for (const [key, value] of Object.entries(newFrontmatter)) {
      if (value === undefined) continue;
      doc!.setIn([key], value);
    }
    const yamlText = doc!.toString().replace(/\r?\n$/, '');
    return `---${eol}${yamlText}${eol}---${eol}${source}`;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(slice.inner, { keepSourceTokens: true });
    if (doc.errors.length > 0) {
      throw doc.errors[0];
    }
  } catch (cause) {
    throwParseError(cause);
  }

  if (doc!.contents == null) {
    doc!.contents = doc!.createNode({}) as unknown as typeof doc.contents;
  }

  for (const [key, value] of Object.entries(newFrontmatter)) {
    if (value === undefined) {
      if (doc!.hasIn([key])) doc!.deleteIn([key]);
      continue;
    }
    doc!.setIn([key], value);
  }

  // If the patched document is empty (no top-level keys left), strip the block.
  const docContents = doc!.contents as unknown as { items?: unknown[] } | null;
  const remainingKeys = docContents?.items?.length ?? 0;
  if (remainingKeys === 0) {
    return source.slice(slice.bodyStart);
  }

  const yamlText = doc!.toString().replace(/\r?\n$/, '');
  return `---${slice.eol}${yamlText}${slice.eol}---${slice.eol}${source.slice(slice.bodyStart)}`;
}

/**
 * Strip the `--- ... ---` block (if any) and return the remaining body.
 * Convenience helper — used by the service to surface the body separately
 * from frontmatter on the read path.
 */
export function splitFrontmatterAndBody(source: string): {
  frontmatterRaw: string | null;
  body: string;
} {
  const slice = findFrontmatter(source);
  if (!slice) return { frontmatterRaw: null, body: source };
  return { frontmatterRaw: slice.inner, body: source.slice(slice.bodyStart) };
}
