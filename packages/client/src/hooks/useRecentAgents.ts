import { useState, useCallback, useEffect } from 'react';

const MAX_RECENT_AGENTS = 3;
const STORAGE_KEY_PREFIX = 'bmad-recent-agents';

function getStorageKey(projectSlug: string): string {
  return `${STORAGE_KEY_PREFIX}:${projectSlug}`;
}

function loadFromStorage(projectSlug: string): string[] {
  try {
    const stored = localStorage.getItem(getStorageKey(projectSlug));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useRecentAgents(projectSlug: string | undefined) {
  const [recentAgentCommands, setRecentAgentCommands] = useState<string[]>(() => {
    if (!projectSlug) return [];
    return loadFromStorage(projectSlug);
  });

  // Reload when projectSlug changes (useState initializer only runs on mount)
  useEffect(() => {
    if (!projectSlug) {
      setRecentAgentCommands([]);
      return;
    }
    setRecentAgentCommands(loadFromStorage(projectSlug));
  }, [projectSlug]);

  const addRecentAgent = useCallback((command: string) => {
    if (!projectSlug) return;
    setRecentAgentCommands((prev) => {
      const filtered = prev.filter((c) => c !== command);
      const next = [command, ...filtered].slice(0, MAX_RECENT_AGENTS);
      localStorage.setItem(getStorageKey(projectSlug), JSON.stringify(next));
      return next;
    });
  }, [projectSlug]);

  return { recentAgentCommands, addRecentAgent };
}
