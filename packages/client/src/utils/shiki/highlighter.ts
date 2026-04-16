/**
 * Shiki Highlighter Singleton
 * Story 4.4: Markdown Rendering - Task 2.3
 *
 * Provides a singleton Shiki highlighter instance for efficient
 * code syntax highlighting across the application
 */

import { createHighlighter, type Highlighter } from 'shiki';
import { SHIKI_CONFIG } from './config';


let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Get or create the singleton Shiki highlighter instance
 * Uses lazy initialization to avoid blocking initial page load
 */
export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...SHIKI_CONFIG.themes],
      langs: [...SHIKI_CONFIG.langs],
    });
  }
  return highlighterPromise;
}
