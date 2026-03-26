import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { HistoryMessage } from '@hammoc/shared';
import {
  buildMessageTree,
  getDefaultBranchSelections,
  getActiveBranch,
  groupChildrenIntoBranches,
  getBaseUuid,
  ROOT_BRANCH_KEY,
} from '../utils/messageTree';
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
  const [branchSelections, setBranchSelections] = useState<Map<string, number>>(new Map());
  const prevMessagesRef = useRef<HistoryMessage[]>([]);

  // Build tree (only recomputes when messages change)
  const tree = useMemo(() => buildMessageTree(messages), [messages]);

  // When messages change, merge new default selections (keep user selections for existing branch points)
  useEffect(() => {
    if (messages === prevMessagesRef.current) return;
    prevMessagesRef.current = messages;

    const defaults = getDefaultBranchSelections(tree.roots);
    setBranchSelections((prev) => {
      const merged = new Map(defaults);
      // Preserve user selections that are still valid
      for (const [key, idx] of prev) {
        if (key === ROOT_BRANCH_KEY) {
          if (tree.roots.length > 1 && idx < tree.roots.length) {
            merged.set(key, idx);
          }
        } else {
          const node = tree.nodeMap.get(key);
          if (node) {
            const branches = groupChildrenIntoBranches(node.children);
            if (idx < branches.length) {
              merged.set(key, idx);
            }
          }
        }
      }
      return merged;
    });
  }, [messages, tree]);

  // Use server branchPoints if available, falling back to client-computed
  const serverBranchPoints = useMessageStore((s) => s.serverBranchPoints);

  // Extract active branch (recomputes when tree or selections change)
  const { displayMessages, branchPoints: clientBranchPoints, branchKeyToParent } = useMemo(
    () => getActiveBranch(tree.roots, branchSelections),
    [tree, branchSelections],
  );

  // Merge server branchPoints into client branchPoints when available.
  // Server keys are raw UUIDs; client keys may be split IDs (e.g., {uuid}-text-0).
  // Match using getBaseUuid() on client keys.
  const branchPoints = useMemo(() => {
    if (!serverBranchPoints || Object.keys(serverBranchPoints).length === 0) {
      return clientBranchPoints;
    }

    const merged = new Map(clientBranchPoints);
    // Override client values with server values where they match
    for (const [clientKey, clientValue] of clientBranchPoints) {
      const baseUuid = getBaseUuid(clientKey);
      if (baseUuid in serverBranchPoints) {
        merged.set(clientKey, serverBranchPoints[baseUuid]);
      } else if (clientKey in serverBranchPoints) {
        merged.set(clientKey, serverBranchPoints[clientKey]);
      } else {
        // Keep client value as-is
        merged.set(clientKey, clientValue);
      }
    }
    return merged;
  }, [clientBranchPoints, serverBranchPoints]);

  // Check if branch navigation should be disabled (streaming/compacting)
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isCompacting = useChatStore((s) => s.isCompacting);
  const isBranchNavigationDisabled = isStreaming || isCompacting;

  const navigateBranch = useCallback(
    (messageId: string, direction: 'prev' | 'next') => {
      // Block during streaming/compacting — JSONL may be incomplete
      const chatState = useChatStore.getState();
      if (chatState.isStreaming || chatState.isCompacting) return;

      setBranchSelections((prev) => {
        const next = new Map(prev);
        let total: number;
        // Resolve the actual parent key used in branchSelections
        const selectionKey = branchKeyToParent.get(messageId) ?? messageId;

        if (selectionKey === ROOT_BRANCH_KEY) {
          total = tree.roots.length;
        } else {
          const node = tree.nodeMap.get(selectionKey);
          if (!node) return prev;
          const branches = groupChildrenIntoBranches(node.children);
          total = branches.length;
        }

        const current = prev.get(selectionKey) ?? total - 1;
        const newIdx = direction === 'prev'
          ? Math.max(0, current - 1)
          : Math.min(total - 1, current + 1);

        if (newIdx === current) return prev;
        next.set(selectionKey, newIdx);

        // Trigger server refetch with new branchSelections (Story 25.4)
        const { currentProjectSlug, currentSessionId } = useMessageStore.getState();
        if (currentProjectSlug && currentSessionId) {
          // Convert Map to Record for API
          const selectionsRecord: Record<string, number> = {};
          for (const [k, v] of next) {
            selectionsRecord[k] = v;
          }
          // Fire and forget — optimistic local switch happens immediately via setBranchSelections
          useMessageStore.getState().fetchMessages(currentProjectSlug, currentSessionId, {
            silent: true,
            branchSelections: selectionsRecord,
            isBranchSwitch: true,
          });
        }

        return next;
      });

      // Scroll the branch point into view after state update
      requestAnimationFrame(() => {
        const targetId = messageId === ROOT_BRANCH_KEY ? undefined : messageId;
        if (targetId) {
          const el = document.querySelector(`[data-message-id="${targetId}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    },
    [tree, branchKeyToParent],
  );

  return { displayMessages, branchPoints, navigateBranch, isBranchNavigationDisabled };
}
