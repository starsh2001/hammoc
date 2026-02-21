// File extension to CodeMirror language mapping
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { yaml } from '@codemirror/lang-yaml';
import { go } from '@codemirror/lang-go';
import type { LanguageSupport } from '@codemirror/language';

const EXTENSION_TO_LANGUAGE: Record<string, () => LanguageSupport> = {
  '.ts': () => javascript({ typescript: true }),
  '.tsx': () => javascript({ typescript: true, jsx: true }),
  '.js': () => javascript(),
  '.jsx': () => javascript({ jsx: true }),
  '.json': () => json(),
  '.md': () => markdown(),
  '.html': () => html(),
  '.css': () => css(),
  '.py': () => python(),
  '.go': () => go(),
  '.rs': () => rust(),
  '.java': () => java(),
  '.c': () => cpp(),
  '.cpp': () => cpp(),
  '.h': () => cpp(),
  '.yaml': () => yaml(),
  '.yml': () => yaml(),
};

/**
 * Get CodeMirror LanguageSupport extension for a file path.
 * Returns null for unknown extensions (plaintext).
 */
export function getLanguageExtension(filePath: string): LanguageSupport | null {
  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1) return null;
  const ext = filePath.slice(lastDotIndex).toLowerCase();
  const factory = EXTENSION_TO_LANGUAGE[ext];
  return factory ? factory() : null;
}

/**
 * Check if a file path corresponds to a markdown file.
 */
export function isMarkdownPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

// Legacy string-based language mapping (kept for tests and re-exports)
export const EXTENSION_TO_LANGUAGE_STRING: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

// Keep original export name for backwards compatibility
export { EXTENSION_TO_LANGUAGE_STRING as EXTENSION_TO_LANGUAGE };

export function getLanguageFromPath(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1) return 'plaintext';
  const ext = filePath.slice(lastDotIndex);
  return EXTENSION_TO_LANGUAGE_STRING[ext] ?? 'plaintext';
}
