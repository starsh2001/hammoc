/**
 * Snippet Resolver — Parse and resolve %snippet references
 * Story BS-2: Prompt Snippet System
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SNIPPETS_DIR = '.hammoc/snippets';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_SNIPPETS_DIR = path.resolve(__dirname, '..', 'snippets');
const MAX_FILE_SIZE = 102_400; // 100KB
const NAME_RE = /^[a-zA-Z0-9._-]+$/;
const SEPARATOR_RE = /^\s*---\s*$/m;
const CONTEXT_RE = /\n---context(?:\n|$)/;

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
 * Tokenize a string with support for double-quoted args and backslash escaping.
 * - Outside quotes: whitespace splits tokens
 * - Inside quotes: \" → literal ", \\ → literal \, other \X → literal \X (lenient)
 * - Unclosed quote: rest of string becomes part of the token (lenient)
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasQuoted = false; // tracks whether current token contains a quoted segment
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '\\' && i + 1 < input.length) {
        // Backslash escaping inside quotes
        current += input[i + 1];
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        hasQuoted = true;
        i++;
      } else if (/\s/.test(ch)) {
        if (current.length > 0 || hasQuoted) {
          tokens.push(current);
          current = '';
          hasQuoted = false;
        }
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  if (current.length > 0 || hasQuoted) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse a %snippet reference: "%commit_and_done story-3 PASSED"
 * → { name: "commit_and_done", args: ["story-3", "PASSED"] }
 * Supports quoted args: '%fix "multi word" arg2'
 * → { name: "fix", args: ["multi word", "arg2"] }
 */
export function parseSnippetRef(text: string): { name: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('%')) return null;

  const tokens = tokenize(trimmed.slice(1));
  if (tokens.length === 0) return null;

  const name = tokens[0];
  if (!NAME_RE.test(name)) return null;

  return { name, args: tokens.slice(1) };
}

/**
 * Try to resolve a snippet file from a directory. Returns { content } or null (not found).
 * Throws SnippetError for non-NOT_FOUND errors (e.g., SIZE_EXCEEDED).
 */
async function tryResolveFromDir(
  snippetsDir: string,
  name: string,
): Promise<{ content: string } | null> {
  const resolvedPath = path.resolve(snippetsDir, name);

  // Ensure resolved path is within snippets directory
  if (!resolvedPath.startsWith(snippetsDir + path.sep) && resolvedPath !== snippetsDir) {
    throw new SnippetError('PARSE_ERROR', `Invalid snippet name: ${name}`, name);
  }

  for (const candidate of [resolvedPath, resolvedPath + '.md']) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        if (stat.size > MAX_FILE_SIZE) {
          throw new SnippetError('SIZE_EXCEEDED', `Snippet file exceeds 100KB limit: ${name}`, name);
        }
        const content = await fs.readFile(candidate, 'utf-8');
        return { content };
      }
    } catch (err) {
      if (err instanceof SnippetError) throw err;
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }

  return null;
}

/**
 * Resolve a snippet reference to an array of prompt strings.
 * Resolution order: {projectPath}/.hammoc/snippets/ → ~/.hammoc/snippets/ → bundled standard snippets.
 * Substitutes {arg1}, {arg2}, {context}, splits by --- separator.
 */
export async function resolveSnippet(
  text: string,
  projectPath: string,
  bundledDir: string = BUNDLED_SNIPPETS_DIR,
): Promise<string[]> {
  // Extract context block from invocation text (before parsing snippet ref)
  let snippetLine = text;
  let contextContent: string | null = null;
  const contextMatch = text.match(CONTEXT_RE);
  if (contextMatch && contextMatch.index !== undefined) {
    snippetLine = text.slice(0, contextMatch.index);
    contextContent = text.slice(contextMatch.index + contextMatch[0].length);
  }

  const parsed = parseSnippetRef(snippetLine);
  if (!parsed) {
    throw new SnippetError('PARSE_ERROR', 'Invalid snippet reference');
  }

  const { name, args } = parsed;

  // Path traversal prevention
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new SnippetError('PARSE_ERROR', `Invalid snippet name: ${name}`, name);
  }

  // Resolution order: project custom → global custom → bundled standard
  const projectResult = await tryResolveFromDir(path.resolve(projectPath, SNIPPETS_DIR), name);
  const globalResult = projectResult ?? await tryResolveFromDir(path.resolve(os.homedir(), SNIPPETS_DIR), name);
  const result = globalResult ?? await tryResolveFromDir(bundledDir, name);

  if (!result) {
    throw new SnippetError('NOT_FOUND', `Snippet file not found: ${name}`, name);
  }

  const content = result.content;

  // Substitute {arg1}, {arg2}, etc. (1-indexed)
  let substituted = content;
  for (let i = 0; i < args.length; i++) {
    substituted = substituted.replaceAll(`{arg${i + 1}}`, args[i]);
  }

  // Split by --- separator on its own line (before context substitution)
  let prompts = substituted
    .split(SEPARATOR_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  // Substitute {context} in each prompt (after split, so --- in context won't cause extra splits)
  if (contextContent !== null) {
    prompts = prompts.map((p) => p.replaceAll('{context}', contextContent!));
  }

  if (prompts.length === 0) {
    throw new SnippetError('PARSE_ERROR', `Snippet resolved to empty content: ${name}`, name);
  }

  return prompts;
}
