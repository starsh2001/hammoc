/**
 * useSnippets - Fetch and cache available snippet items via WebSocket
 * [Source: ISSUE-54 - Snippet autocomplete]
 */

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';
import type { SnippetItem } from '@hammoc/shared';

export function useSnippets(workingDirectory: string | undefined) {
  const [snippets, setSnippets] = useState<SnippetItem[]>([]);

  useEffect(() => {
    if (!workingDirectory) {
      setSnippets([]);
      return;
    }

    const socket = getSocket();

    const handleSnippetsList = (data: { snippets: SnippetItem[] }) => {
      setSnippets(data.snippets);
    };

    socket.on('snippets:list', handleSnippetsList);

    // Request initial list
    socket.emit('snippets:list', { workingDirectory });

    return () => {
      socket.off('snippets:list', handleSnippetsList);
    };
  }, [workingDirectory]);

  const refresh = useCallback(() => {
    if (!workingDirectory) return;
    const socket = getSocket();
    socket.emit('snippets:list', { workingDirectory });
  }, [workingDirectory]);

  return { snippets, refresh };
}
