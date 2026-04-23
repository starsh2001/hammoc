/**
 * Story 28.0.5: YAML / JSONC round-trip editor.
 *
 * The goal is to mutate a single key inside a structured config file while
 * preserving the author's comments, blank lines, key order, and quoting style.
 *
 * - YAML  → `yaml` (eemeli) `parseDocument` + `doc.setIn/deleteIn` + `doc.toString()`.
 *           The Document AST keeps comment & blank-line metadata attached to
 *           each node, and `toString()` re-emits them.
 *   NOTE: `js-yaml@4` remains a coexisting dependency for session-meta parsing
 *   elsewhere in the codebase, but has no comment-preservation path and must
 *   not be used for harness edits.
 *
 * - JSONC → `jsonc-parser` `modify` + `applyEdits`. This is the same path VS
 *           Code uses when it edits user `settings.json` — comments and
 *           formatting are preserved.
 *
 * Both entry points throw `HARNESS_PARSE_ERROR` on unparseable input so the
 * harness controller can surface the envelope and the client can fall back to
 * raw editing.
 */

import { parseDocument, type Document } from 'yaml';
import { modify, applyEdits, parse, printParseErrorCode, type FormattingOptions, type ParseError } from 'jsonc-parser';
import { HARNESS_ERRORS, type HarnessStructuredPatchOp } from '@hammoc/shared';

function parseError(format: 'yaml' | 'jsonc', cause: unknown): NodeJS.ErrnoException {
  const err = new Error(`failed to parse ${format}: ${(cause as Error)?.message ?? String(cause)}`) as NodeJS.ErrnoException;
  err.code = HARNESS_ERRORS.HARNESS_PARSE_ERROR.code;
  return err;
}

/**
 * Apply structured patches to a YAML source string while preserving comments,
 * blank lines, and key order.
 */
export function applyYamlPatch(source: string, ops: HarnessStructuredPatchOp[]): string {
  let doc: Document.Parsed;
  try {
    doc = parseDocument(source, { keepSourceTokens: true });
    if (doc.errors.length > 0) {
      throw doc.errors[0];
    }
  } catch (cause) {
    throw parseError('yaml', cause);
  }

  // A freshly-created empty document has `contents: null`; we need a map so
  // setIn can plant new keys at the top level.
  if (doc.contents == null) {
    doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  }

  for (const op of ops) {
    if (!op.path || op.path.length === 0) {
      throw parseError('yaml', new Error('patch op requires a non-empty path'));
    }
    if (op.value === undefined) {
      // deleteIn silently no-ops on missing keys — matches JSONC's modify(…, undefined).
      doc.deleteIn(op.path);
    } else {
      doc.setIn(op.path, op.value);
    }
  }

  // toString() preserves original comments/blank lines/quote style for any
  // node that was not explicitly replaced.
  return doc.toString();
}

/**
 * Apply structured patches to a JSONC source string while preserving comments
 * and formatting. Inserts missing intermediate objects as needed (matches
 * `jsonc-parser` `modify` default behavior).
 */
export function applyJsoncPatch(source: string, ops: HarnessStructuredPatchOp[]): string {
  // Validate the source up front — `modify` silently starts from `{}` on
  // garbage input, which would quietly erase the user's file. Feed the
  // official errors array to catch unterminated strings, missing values, etc.
  if (source.trim().length > 0) {
    const errors: ParseError[] = [];
    parse(source, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length > 0) {
      const first = errors[0];
      throw parseError('jsonc', new Error(`${printParseErrorCode(first.error)} at offset ${first.offset}`));
    }
  }

  const formattingOptions: FormattingOptions = {
    insertSpaces: true,
    tabSize: 2,
    eol: source.includes('\r\n') ? '\r\n' : '\n',
  };

  let current = source;
  for (const op of ops) {
    if (!op.path || op.path.length === 0) {
      throw parseError('jsonc', new Error('patch op requires a non-empty path'));
    }
    // `modify` takes `undefined` to mean "remove", matching HarnessStructuredPatchOp.value semantics.
    const edits = modify(current, op.path, op.value, { formattingOptions });
    current = applyEdits(current, edits);
  }

  return current;
}
