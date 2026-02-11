/**
 * usePromptHistory - Terminal-like prompt history navigation with ArrowUp/Down
 *
 * Stores user-sent messages in localStorage per project.
 * Supports navigating through history with ArrowUp/Down keys,
 * preserving the current draft when entering history mode.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const MAX_HISTORY = 50;
const STORAGE_KEY_PREFIX = 'bmad-studio:prompt-history';

function getStorageKey(projectSlug: string): string {
  return `${STORAGE_KEY_PREFIX}:${projectSlug}`;
}

function loadHistory(projectSlug: string | null): string[] {
  if (!projectSlug) return [];
  try {
    const raw = localStorage.getItem(getStorageKey(projectSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(projectSlug: string | null, history: string[]): void {
  if (!projectSlug) return;
  try {
    localStorage.setItem(
      getStorageKey(projectSlug),
      JSON.stringify(history.slice(-MAX_HISTORY)),
    );
  } catch {
    // localStorage full or unavailable - silently ignore
  }
}

export function usePromptHistory() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');
  const historyCache = useRef<string[]>([]);

  // Sync cache when project changes
  useEffect(() => {
    historyCache.current = loadHistory(projectSlug ?? null);
    setHistoryIndex(-1);
    draftRef.current = '';
  }, [projectSlug]);

  const addToHistory = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !projectSlug) return;

      const history = loadHistory(projectSlug);
      // Avoid consecutive duplicates
      if (history.length > 0 && history[history.length - 1] === trimmed) {
        historyCache.current = history;
        setHistoryIndex(-1);
        draftRef.current = '';
        return;
      }
      history.push(trimmed);
      saveHistory(projectSlug, history);
      historyCache.current = history;
      setHistoryIndex(-1);
      draftRef.current = '';
    },
    [projectSlug],
  );

  const navigateUp = useCallback(
    (currentContent: string): string | null => {
      const history = historyCache.current;
      if (history.length === 0) return null;

      if (historyIndex === -1) {
        // Entering history mode - save current input as draft
        draftRef.current = currentContent;
        const newIndex = history.length - 1;
        setHistoryIndex(newIndex);
        return history[newIndex];
      } else if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        return history[newIndex];
      }
      return null; // Already at oldest entry
    },
    [historyIndex],
  );

  const navigateDown = useCallback((): string | null => {
    const history = historyCache.current;
    if (historyIndex === -1) return null; // Not in history mode

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      return history[newIndex];
    } else {
      // Past the newest entry - restore draft
      setHistoryIndex(-1);
      return draftRef.current;
    }
  }, [historyIndex]);

  const resetNavigation = useCallback(() => {
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      draftRef.current = '';
    }
  }, [historyIndex]);

  return {
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    isNavigating: historyIndex !== -1,
  };
}
