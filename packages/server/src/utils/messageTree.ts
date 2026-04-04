/**
 * Server-side message tree building utilities
 * Story 25.4: Branch-aware Message Pagination
 *
 * Pure functions that work with RawJSONLMessage to build a tree,
 * extract active branch paths, and compute branch points.
 */

import type { RawJSONLMessage } from '@hammoc/shared';
import { ROOT_BRANCH_KEY } from '@hammoc/shared';
import { createLogger } from './logger.js';

const log = createLogger('messageTree');

// --- Types ---

export interface RawTreeNode {
  message: RawJSONLMessage;
  children: RawTreeNode[];
}

export interface RawMessageTree {
  roots: RawTreeNode[];
  nodeMap: Map<string, RawTreeNode>;
}

export interface BranchPointInfo {
  total: number;
  current: number;
  /** The key to use in branchSelections when navigating this branch point.
   *  For inner branches: the parent node's UUID. For root-level: ROOT_BRANCH_KEY. */
  selectionKey: string;
}

export interface ActiveBranchResult {
  messages: RawJSONLMessage[];
  branchPoints: Record<string, BranchPointInfo>;
}

// --- Helpers ---

/** Message types that participate in the conversation tree for branch selection */
const CONVERSATION_TYPES = new Set(['user', 'assistant', 'system']);

/**
 * Detect task-notification user messages injected by background tasks.
 * These are user-type messages whose content starts with <task-notification> —
 * they should not count as branch-creating user messages since they are
 * system-injected and can arrive concurrently with real user input.
 */
function isTaskNotification(node: RawTreeNode): boolean {
  const content = node.message.message?.content;
  if (typeof content === 'string') return content.trimStart().startsWith('<task-notification>');
  if (Array.isArray(content)) {
    const first = content.find((c): c is { type: 'text'; text: string } => c.type === 'text');
    return first?.text?.trimStart().startsWith('<task-notification>') ?? false;
  }
  return false;
}

/**
 * Extract base UUID from a potentially split message UUID.
 * Split IDs follow patterns: {uuid}-text-{n}, {uuid}-tool-{id}, {uuid}-thinking
 */
function getBaseUuid(uuid: string): string {
  const match = uuid.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(text-\d+|tool-.+|thinking))?$/,
  );
  return match ? match[1] : uuid;
}

/**
 * Group children into logical branches by UUID prefix.
 * A true branch exists only when there are multiple user-type groups.
 * Mirrors client-side groupChildrenIntoBranches logic.
 */
export function groupRawChildrenIntoBranches(children: RawTreeNode[]): RawTreeNode[][] {
  // Step 1: group split fragments by base UUID
  const groups: Map<string, RawTreeNode[]> = new Map();
  for (const child of children) {
    const base = getBaseUuid(child.message.uuid);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(child);
  }
  const uuidGroups = Array.from(groups.values());

  if (uuidGroups.length <= 1) return uuidGroups;

  // Step 2: detect true branches — only user-type groups count.
  // A group "leads to a user" if it directly contains a user-type node OR
  // if it contains a non-conversation intermediary (e.g. attachment, progress)
  // whose subtree contains any conversation node. This handles chains like
  // user → attachment → attachment → assistant (normal flow through attachments)
  // and assistant → progress → user (resumeSessionAt asymmetry).
  function hasConversationDescendant(n: RawTreeNode, depth: number): boolean {
    if (depth > 10) return false;
    if (CONVERSATION_TYPES.has(n.message.type)) return true;
    return n.children.some((c) => hasConversationDescendant(c, depth + 1));
  }
  function groupLeadsToUser(g: RawTreeNode[]): boolean {
    return g.some((n) =>
      (n.message.type === 'user' && !isTaskNotification(n)) ||
      (!CONVERSATION_TYPES.has(n.message.type) && hasConversationDescendant(n, 0)),
    );
  }
  const userGroupCount = uuidGroups.filter(groupLeadsToUser).length;

  if (userGroupCount <= 1) {
    // No real branches — all children are sequential flow
    return [children];
  }

  // Multiple user groups = true branch point.
  // Fold non-user groups into the nearest preceding user group.
  const branches: RawTreeNode[][] = [];
  for (const group of uuidGroups) {
    if (groupLeadsToUser(group)) {
      branches.push([...group]);
    } else if (branches.length > 0) {
      branches[branches.length - 1].push(...group);
    } else {
      branches.push([...group]);
    }
  }
  return branches;
}

// --- Core Functions ---

/**
 * Build a raw message tree from JSONL messages using parentUuid links.
 * Handles orphans (missing parent) and circular references defensively.
 */
export function buildRawMessageTree(messages: RawJSONLMessage[]): RawMessageTree {
  const nodeMap = new Map<string, RawTreeNode>();
  const roots: RawTreeNode[] = [];

  // Phase 1: Create all nodes
  for (const msg of messages) {
    nodeMap.set(msg.uuid, { message: msg, children: [] });
  }

  // Phase 2: Link parent→children, detect orphans
  for (const msg of messages) {
    const node = nodeMap.get(msg.uuid)!;
    if (!msg.parentUuid) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(msg.parentUuid);
      if (!parent) {
        log.warn(`Orphan message "${msg.uuid}" references non-existent parent "${msg.parentUuid}", treating as root`);
        roots.push(node);
      } else {
        parent.children.push(node);
      }
    }
  }

  // Phase 3: Detect circular references
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function detectCycle(node: RawTreeNode): boolean {
    if (inStack.has(node.message.uuid)) return true;
    if (visited.has(node.message.uuid)) return false;

    visited.add(node.message.uuid);
    inStack.add(node.message.uuid);

    for (const child of node.children) {
      if (detectCycle(child)) {
        log.warn(`Circular reference detected at "${child.message.uuid}", breaking link and treating as root`);
        node.children = node.children.filter((c) => c !== child);
        roots.push(child);
      }
    }

    inStack.delete(node.message.uuid);
    return false;
  }

  for (const root of [...roots]) {
    detectCycle(root);
  }

  // Phase 3b: Promote unvisited nodes (rootless cycles)
  for (const node of nodeMap.values()) {
    if (!visited.has(node.message.uuid)) {
      log.warn(`Unreachable node "${node.message.uuid}" promoted to root`);
      roots.push(node);
      detectCycle(node);
    }
  }

  return { roots, nodeMap };
}

/**
 * Find default branch selections by tracing from the newest leaf to root.
 * Returns a Record<string, number> mapping branch point UUIDs to selected indices.
 */
export function getDefaultRawBranchSelections(roots: RawTreeNode[]): Record<string, number> {
  const selections: Record<string, number> = {};
  if (roots.length === 0) return selections;

  // Find newest leaf
  let newestLeaf: RawTreeNode | null = null;
  let newestTime = '';

  function findLeaves(node: RawTreeNode) {
    const branches = groupRawChildrenIntoBranches(node.children);
    if (branches.length === 0) {
      // Only consider conversation-relevant types (user, assistant, system) as
      // leaf candidates. Metadata types (queue-operation, file-history-snapshot,
      // progress, last-prompt) are often isolated roots with no children — if
      // their timestamp is newer than the last conversation message they would
      // be incorrectly selected, causing getActiveRawBranch to pick an empty root.
      if (!CONVERSATION_TYPES.has(node.message.type)) return;
      const ts = node.message.timestamp || '';
      if (ts > newestTime || !newestLeaf) {
        newestTime = ts;
        newestLeaf = node;
      }
      return;
    }
    for (const branch of branches) {
      for (const child of branch) {
        findLeaves(child);
      }
    }
  }

  for (const root of roots) {
    findLeaves(root);
  }

  if (!newestLeaf) return selections;

  // Build parent map for reverse traversal
  const parentMap = new Map<string, RawTreeNode>();
  function buildParentMap(node: RawTreeNode) {
    for (const child of node.children) {
      parentMap.set(child.message.uuid, node);
      buildParentMap(child);
    }
  }
  for (const root of roots) {
    buildParentMap(root);
  }

  // Walk up from leaf
  let current: RawTreeNode | null = newestLeaf;
  while (current) {
    const parent = parentMap.get(current.message.uuid);
    if (parent) {
      const branches = groupRawChildrenIntoBranches(parent.children);
      if (branches.length > 1) {
        const branchIdx = branches.findIndex((branch) =>
          branch.some((n) => n.message.uuid === current!.message.uuid),
        );
        if (branchIdx >= 0) {
          selections[parent.message.uuid] = branchIdx;
        }
      }
    } else {
      // current is a root — check multi-root selection
      // Use conversation-relevant roots only (matching getActiveRawBranch)
      const convRoots = roots.filter((r) =>
        r.children.length > 0 || CONVERSATION_TYPES.has(r.message.type),
      );
      if (convRoots.length > 1) {
        const rootIdx = convRoots.indexOf(current);
        if (rootIdx >= 0) {
          selections[ROOT_BRANCH_KEY] = rootIdx;
        }
      }
    }
    current = parent || null;
  }

  return selections;
}

/**
 * Extract the active branch as a flat RawJSONLMessage array,
 * following branch selections. Unselected branch points default to last (newest) branch.
 * Also computes branchPoints info for the response.
 */
export function getActiveRawBranch(
  roots: RawTreeNode[],
  branchSelections: Record<string, number>,
): ActiveBranchResult {
  const messages: RawJSONLMessage[] = [];
  const branchPoints: Record<string, BranchPointInfo> = {};

  if (roots.length === 0) return { messages, branchPoints };

  // Handle multi-root
  // Filter to conversation-relevant roots: roots that either have children
  // (part of a conversation chain) or are displayable types (user/assistant/system).
  // Isolated metadata roots (queue-operation, file-history-snapshot, progress
  // without children, last-prompt) are noise and must not participate in
  // branch selection — otherwise they inflate the root count and cause the
  // wrong root to be selected as the active conversation epoch.
  let activeRoots: RawTreeNode[];
  const conversationRoots = roots.filter((r) =>
    r.children.length > 0 || CONVERSATION_TYPES.has(r.message.type),
  );

  if (conversationRoots.length > 1) {
    const userRootCount = conversationRoots.filter((r) => r.message.type === 'user').length;
    const hasCompactBoundary = conversationRoots.some(
      (r) => r.message.type === 'system' && r.message.subtype === 'compact_boundary',
    );

    if (userRootCount > 1 || hasCompactBoundary) {
      const selectedIdx = branchSelections[ROOT_BRANCH_KEY] ?? conversationRoots.length - 1;
      const clampedIdx = Math.max(0, Math.min(selectedIdx, conversationRoots.length - 1));
      const selectedRoot = conversationRoots[clampedIdx];
      const rootKey = selectedRoot.message.type === 'user' ? selectedRoot.message.uuid : ROOT_BRANCH_KEY;
      branchPoints[rootKey] = { total: conversationRoots.length, current: clampedIdx, selectionKey: ROOT_BRANCH_KEY };
      activeRoots = [selectedRoot];
    } else {
      // Sequential orphan roots — display all conversation roots
      activeRoots = conversationRoots;
    }
  } else {
    // 0 or 1 conversation root — traverse all conversation roots (+ metadata
    // roots with children, already included via the filter)
    activeRoots = conversationRoots.length > 0 ? conversationRoots : roots;
  }

  function traverse(node: RawTreeNode) {
    messages.push(node.message);

    const branches = groupRawChildrenIntoBranches(node.children);
    if (branches.length === 0) return;

    if (branches.length > 1) {
      const selectedIdx = branchSelections[node.message.uuid] ?? branches.length - 1;
      const clampedIdx = Math.max(0, Math.min(selectedIdx, branches.length - 1));

      // Tag the first user message in the selected branch with branch info.
      // If no direct user child exists, check one level deeper (handles
      // assistant → progress → user pattern where progress is intermediary).
      const selectedBranch = branches[clampedIdx];
      const firstUserInBranch = selectedBranch.find((n) => n.message.type === 'user')
        || selectedBranch.flatMap((n) => n.children).find((c) => c.message.type === 'user');
      const branchKey = firstUserInBranch ? firstUserInBranch.message.uuid : node.message.uuid;
      branchPoints[branchKey] = { total: branches.length, current: clampedIdx, selectionKey: node.message.uuid };

      for (const child of selectedBranch) {
        traverse(child);
      }
    } else {
      for (const child of branches[0]) {
        traverse(child);
      }
    }
  }

  for (const root of activeRoots) {
    traverse(root);
  }

  return { messages, branchPoints };
}

/**
 * Find branch selections that lead to a specific message UUID.
 * Returns a branchSelections record suitable for getActiveRawBranch,
 * or null if the UUID is not found in the tree.
 */
export function findBranchSelectionsForUuid(
  roots: RawTreeNode[],
  targetUuid: string,
): Record<string, number> | null {
  const selections: Record<string, number> = {};

  function containsUuid(node: RawTreeNode): boolean {
    if (node.message.uuid === targetUuid) return true;
    return node.children.some(containsUuid);
  }

  function traverse(node: RawTreeNode): boolean {
    if (node.message.uuid === targetUuid) return true;

    const branches = groupRawChildrenIntoBranches(node.children);
    if (branches.length === 0) return false;

    for (let i = 0; i < branches.length; i++) {
      if (branches[i].some(containsUuid)) {
        if (branches.length > 1) {
          selections[node.message.uuid] = i;
        }
        for (const child of branches[i]) {
          if (traverse(child)) return true;
        }
        return true;
      }
    }
    return false;
  }

  // Handle multi-root: check which root tree contains the target
  const conversationRoots = roots.filter((r) =>
    r.children.length > 0 || CONVERSATION_TYPES.has(r.message.type),
  );
  if (conversationRoots.length > 1) {
    for (let i = 0; i < conversationRoots.length; i++) {
      if (containsUuid(conversationRoots[i])) {
        selections[ROOT_BRANCH_KEY] = i;
        if (traverse(conversationRoots[i])) return selections;
        return selections;
      }
    }
    return null;
  }

  const searchRoots = conversationRoots.length > 0 ? conversationRoots : roots;
  for (const root of searchRoots) {
    if (traverse(root)) return selections;
  }
  return null;
}
