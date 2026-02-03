/**
 * Shiki Configuration
 * Story 4.4: Markdown Rendering - Task 2.2
 *
 * Centralized configuration for Shiki syntax highlighter
 * to enable easy extension of supported languages and themes
 */

export const SHIKI_CONFIG = {
  themes: ['github-dark', 'github-light'] as const,
  langs: [
    'javascript',
    'typescript',
    'python',
    'java',
    'go',
    'rust',
    'c',
    'cpp',
    'html',
    'css',
    'json',
    'yaml',
    'markdown',
    'bash',
    'shell',
    'sql',
    'graphql',
    'dockerfile',
  ] as const,
} as const;

export type SupportedLanguage = (typeof SHIKI_CONFIG.langs)[number];
export type SupportedTheme = (typeof SHIKI_CONFIG.themes)[number];

/**
 * Check if a language is supported by Shiki
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SHIKI_CONFIG.langs.includes(lang as SupportedLanguage);
}
