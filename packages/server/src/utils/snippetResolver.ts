/**
 * Snippet Resolver — Parse and resolve %snippet references
 * Story BS-2: Prompt Snippet System
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SNIPPETS_DIR = '.hammoc/snippets';
const MAX_FILE_SIZE = 102_400; // 100KB
const NAME_RE = /^[a-zA-Z0-9._-]+$/;
const SEPARATOR_RE = /^\s*---\s*$/m;

export class SnippetError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'PARSE_ERROR' | 'SIZE_EXCEEDED',
    message: string,
    public snippetName: string = '',
  ) {
    super(message);
    this.name = 'SnippetError';
  }
}

/** Check if a string is a snippet reference (starts with % after trimming) */
export function isSnippetRef(text: string): boolean {
  return parseSnippetRef(text) !== null;
}

/**
 * Parse a %snippet reference: "%commit_and_done story-3 PASSED"
 * → { name: "commit_and_done", args: ["story-3", "PASSED"] }
 */
export function parseSnippetRef(text: string): { name: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('%')) return null;

  const tokens = trimmed.slice(1).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const name = tokens[0];
  if (!NAME_RE.test(name)) return null;

  return { name, args: tokens.slice(1) };
}

/**
 * Resolve a snippet reference to an array of prompt strings.
 * Reads file from {projectPath}/.hammoc/snippets/{name} (or {name}.md),
 * substitutes {arg1}, {arg2}, etc., splits by --- separator.
 */
export async function resolveSnippet(text: string, projectPath: string): Promise<string[]> {
  const parsed = parseSnippetRef(text);
  if (!parsed) {
    throw new SnippetError('PARSE_ERROR', 'Invalid snippet reference');
  }

  const { name, args } = parsed;

  // Path traversal prevention
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new SnippetError('PARSE_ERROR', `Invalid snippet name: ${name}`, name);
  }

  const snippetsDir = path.resolve(projectPath, SNIPPETS_DIR);
  const resolvedPath = path.resolve(snippetsDir, name);

  // Ensure resolved path is within snippets directory
  if (!resolvedPath.startsWith(snippetsDir + path.sep) && resolvedPath !== snippetsDir) {
    throw new SnippetError('PARSE_ERROR', `Invalid snippet name: ${name}`, name);
  }

  // File lookup: try exact name first, then with .md extension
  let filePath: string | null = null;
  for (const candidate of [resolvedPath, resolvedPath + '.md']) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        // Size check
        if (stat.size > MAX_FILE_SIZE) {
          throw new SnippetError('SIZE_EXCEEDED', `Snippet file exceeds 100KB limit: ${name}`, name);
        }
        filePath = candidate;
        break;
      }
    } catch (err) {
      if (err instanceof SnippetError) throw err;
      // File not found, try next candidate
    }
  }

  if (!filePath) {
    throw new SnippetError('NOT_FOUND', `Snippet file not found: ${name}`, name);
  }

  const content = await fs.readFile(filePath, 'utf-8');

  // Substitute {arg1}, {arg2}, etc. (1-indexed)
  let substituted = content;
  for (let i = 0; i < args.length; i++) {
    substituted = substituted.replaceAll(`{arg${i + 1}}`, args[i]);
  }

  // Split by --- separator on its own line
  const prompts = substituted
    .split(SEPARATOR_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  if (prompts.length === 0) {
    throw new SnippetError('PARSE_ERROR', `Snippet resolved to empty content: ${name}`, name);
  }

  return prompts;
}
