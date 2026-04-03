import { useMemo, useCallback } from 'react';
import type { HistoryMessage } from '@hammoc/shared';
import { getBaseUuid } from '../utils/messageTree';
import type { BranchPoint } from '../utils/messageTree';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore, scheduleBranchSwitchEmit } from '../stores/chatStore';
import { getSocket } from '../services/socket';

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

  // Build branchPoints directly from message.branchInfo (set by server).
  // No UUID matching needed — server attaches branchInfo to the correct message.
  const branchPoints = useMemo(() => {
    const result = new Map<string, BranchPoint>();
    for (const msg of messages) {
      if (msg.branchInfo) {
        result.set(msg.id, msg.branchInfo);
      }
    }
    return result;
  }, [messages]);

  // Check if branch navigation should be disabled (streaming/compacting)
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isCompacting = useChatStore((s) => s.isCompacting);
  const isBranchNavigationDisabled = isStreaming || isCompacting;

  const navigateBranch = useCallback(
    (messageId: string, direction: 'prev' | 'next') => {
      // Guard: block during streaming/compacting
      const chatState = useChatStore.getState();
      if (chatState.isStreaming || chatState.isCompacting) return;
      if (!chatState.isBranchViewerMode) return; // Only navigate in viewer mode

      // Look up branchInfo from the message itself
      const msgState = useMessageStore.getState();
      const msg = msgState.messages.find(
        (m) => m.id === messageId || getBaseUuid(m.id) === getBaseUuid(messageId),
      );
      if (!msg?.branchInfo || msg.branchInfo.total <= 0) return;

      const { total } = msg.branchInfo;
      const current = msg.branchInfo.current;

      // Compute new index
      const newIdx = direction === 'prev'
        ? Math.max(0, current - 1)
        : Math.min(total - 1, current + 1);
      if (newIdx === current) return;

      // Accumulate selection and emit via WebSocket (debounced)
      const { updateViewerSelection } = useChatStore.getState();
      updateViewerSelection(msg.branchInfo.selectionKey, newIdx);

      scheduleBranchSwitchEmit(() => {
        const socket = getSocket();
        const sessionId = useMessageStore.getState().currentSessionId;
        const { viewerBranchSelections } = useChatStore.getState();
        if (socket && sessionId) {
          socket.emit('messages:switch-branch', {
            sessionId,
            branchSelections: viewerBranchSelections,
          });
        }
      }, 150);

      // Scroll the branch point into view
      requestAnimationFrame(() => {
        try {
          const el = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } catch {
          // Ignore selector errors from unexpected messageId formats
        }
      });
    },
    [],
  );

  return { displayMessages, branchPoints, navigateBranch, isBranchNavigationDisabled };
}
