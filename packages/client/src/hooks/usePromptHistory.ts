/**
 * usePromptHistory - Terminal-like prompt history navigation with ArrowUp/Down
 *
 * Stores user-sent messages per session on the server.
 * Supports navigating through history with ArrowUp/Down keys,
 * preserving the current draft when entering history mode.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { sessionsApi } from '../services/api/sessions';
import { debugLogger } from '../utils/debugLogger';

const MAX_HISTORY = 50;
const SAVE_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function usePromptHistory() {
  const { projectSlug, sessionId } = useParams<{ projectSlug: string; sessionId: string }>();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');
  const historyCache = useRef<string[]>([]);
  const currentKeyRef = useRef<string>('');

  // Debounced save to server
  const saveToServer = useCallback((slug: string, sid: string, history: string[]) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      sessionsApi.savePromptHistory(slug, sid, { history: history.slice(-MAX_HISTORY) }).catch((err) => {
        debugLogger.error('Failed to save prompt history', { error: err instanceof Error ? err.message : String(err) });
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Load from server when session changes
  useEffect(() => {
    const key = `${projectSlug}:${sessionId}`;
    if (key === currentKeyRef.current) return;
    currentKeyRef.current = key;

    setHistoryIndex(-1);
    draftRef.current = '';
    historyCache.current = [];

    if (!projectSlug || !sessionId) return;

    sessionsApi.getPromptHistory(projectSlug, sessionId)
      .then((data) => {
        // Only apply if still on the same session
        if (currentKeyRef.current === key) {
          historyCache.current = data.history ?? [];
        }
      })
      .catch(() => {
        // Server unreachable — start with empty history
      });
  }, [projectSlug, sessionId]);

  const addToHistory = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !projectSlug || !sessionId) return;

      const history = historyCache.current;
      // Avoid consecutive duplicates
      if (history.length > 0 && history[history.length - 1] === trimmed) {
        setHistoryIndex(-1);
        draftRef.current = '';
        return;
      }
      history.push(trimmed);
      // Trim to max
      if (history.length > MAX_HISTORY) {
        historyCache.current = history.slice(-MAX_HISTORY);
      }
      setHistoryIndex(-1);
      draftRef.current = '';
      saveToServer(projectSlug, sessionId, historyCache.current);
    },
    [projectSlug, sessionId, saveToServer],
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
