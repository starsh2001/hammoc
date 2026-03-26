import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { HistoryMessage } from '@hammoc/shared';
import {
  buildMessageTree,
  getDefaultBranchSelections,
  getActiveBranch,
  groupChildrenIntoBranches,
  ROOT_BRANCH_KEY,
} from '../utils/messageTree';
import type { BranchPoint } from '../utils/messageTree';

interface UseMessageTreeReturn {
  displayMessages: HistoryMessage[];
  branchPoints: Map<string, BranchPoint>;
  navigateBranch: (messageId: string, direction: 'prev' | 'next') => void;
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

  // Extract active branch (recomputes when tree or selections change)
  const { displayMessages, branchPoints } = useMemo(
    () => getActiveBranch(tree.roots, branchSelections),
    [tree, branchSelections],
  );

  const navigateBranch = useCallback(
    (messageId: string, direction: 'prev' | 'next') => {
      setBranchSelections((prev) => {
        const next = new Map(prev);
        let total: number;

        if (messageId === ROOT_BRANCH_KEY) {
          total = tree.roots.length;
        } else {
          const node = tree.nodeMap.get(messageId);
          if (!node) return prev;
          const branches = groupChildrenIntoBranches(node.children);
          total = branches.length;
        }

        const current = prev.get(messageId) ?? total - 1;
        const newIdx = direction === 'prev'
          ? Math.max(0, current - 1)
          : Math.min(total - 1, current + 1);

        if (newIdx === current) return prev;
        next.set(messageId, newIdx);
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
    [tree],
  );

  return { displayMessages, branchPoints, navigateBranch };
}
