import { useMemo, useCallback } from 'react';
import type { HistoryMessage } from '@hammoc/shared';
import { getBaseUuid } from '../utils/messageTree';
import type { BranchPoint } from '../utils/messageTree';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';

interface UseMessageTreeReturn {
  displayMessages: HistoryMessage[];
  branchPoints: Map<string, BranchPoint>;
  navigateBranch: (messageId: string, direction: 'prev' | 'next') => void;
  /** True when branch navigation is disabled (streaming or compacting) */
  isBranchNavigationDisabled: boolean;
}

export function useMessageTree(messages: HistoryMessage[]): UseMessageTreeReturn {
  // Server-driven: messages are already the active branch — use directly
  const displayMessages = messages;

  // Build branchPoints from serverBranchPoints by matching against displayMessages
  const serverBranchPoints = useMessageStore((s) => s.serverBranchPoints);

  const branchPoints = useMemo(() => {
    const result = new Map<string, BranchPoint>();
    if (!serverBranchPoints) return result;

    const matchedServerKeys = new Set<string>();
    for (const msg of messages) {
      const baseUuid = getBaseUuid(msg.id);
      if (baseUuid in serverBranchPoints && !matchedServerKeys.has(baseUuid)) {
        result.set(msg.id, serverBranchPoints[baseUuid]);
        matchedServerKeys.add(baseUuid);
      }
    }
    return result;
  }, [messages, serverBranchPoints]);

  // Check if branch navigation should be disabled (streaming/compacting)
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isCompacting = useChatStore((s) => s.isCompacting);
  const isBranchNavigationDisabled = isStreaming || isCompacting;

  const navigateBranch = useCallback(
    (messageId: string, direction: 'prev' | 'next') => {
      // Guard: block during streaming/compacting
      const chatState = useChatStore.getState();
      if (chatState.isStreaming || chatState.isCompacting) return;

      // Look up server branchPoints for this message
      const baseUuid = getBaseUuid(messageId);
      const serverInfo = serverBranchPoints?.[baseUuid]
        ?? serverBranchPoints?.[messageId];
      if (!serverInfo) return;

      // Determine the selection key and current index
      const selectionKey = serverInfo.selectionKey ?? baseUuid;
      const { currentBranchSelections, currentProjectSlug, currentSessionId, fetchMessages } =
        useMessageStore.getState();
      const current = currentBranchSelections?.[selectionKey] ?? serverInfo.current;

      // Compute new index
      const newIdx = direction === 'prev'
        ? Math.max(0, current - 1)
        : Math.min(serverInfo.total - 1, current + 1);
      if (newIdx === current) return;

      // Build new branchSelections record preserving other branch choices
      const newSelections = { ...currentBranchSelections, [selectionKey]: newIdx };

      // Request messages from server with new selections
      if (currentProjectSlug && currentSessionId) {
        fetchMessages(currentProjectSlug, currentSessionId, {
          silent: true,
          branchSelections: newSelections,
          isBranchSwitch: true,
        });
      }

      // Scroll the branch point into view
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-message-id="${messageId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    },
    [serverBranchPoints],
  );

  return { displayMessages, branchPoints, navigateBranch, isBranchNavigationDisabled };
}
