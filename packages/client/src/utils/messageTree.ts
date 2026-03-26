import type { HistoryMessage } from '@hammoc/shared';
import { ROOT_BRANCH_KEY } from '@hammoc/shared';

// Re-export for existing consumers
export { ROOT_BRANCH_KEY };

// --- Types ---

export interface TreeNode {
  message: HistoryMessage;
  children: TreeNode[];
  branchIndex: number;
}

export interface MessageTree {
  roots: TreeNode[];
  nodeMap: Map<string, TreeNode>;
}

export interface BranchPoint {
  total: number;
  current: number;
  /** The key to use in branchSelections (server-provided for server-detected branches) */
  selectionKey?: string;
}

// --- Helpers ---

/**
 * Extract base UUID from a split message ID.
 * Split IDs follow patterns: {uuid}-text-{n}, {uuid}-tool-{id}, {uuid}-thinking
 * The first fragment of a split keeps the original {uuid} with no suffix.
 */
export function getBaseUuid(id: string): string {
  const match = id.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(text-\d+|tool-.+|thinking))?$/);
  return match ? match[1] : id;
}

/**
 * Group children into logical branches.
 *
 * Split fragments from the same assistant turn (same base UUID) are always
 * grouped together.  Beyond that, a true branch only exists when a parent has
 * multiple *user*-type children (from edits / resumes).  Sequential non-user
 * children (tool_result, assistant continuations) are part of the linear flow
 * and must NOT create false branches.
 */
export function groupChildrenIntoBranches(children: TreeNode[]): TreeNode[][] {
  // Step 1: group split fragments by base UUID
  const groups: Map<string, TreeNode[]> = new Map();
  for (const child of children) {
    const base = getBaseUuid(child.message.id);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(child);
  }
  const uuidGroups = Array.from(groups.values());

  if (uuidGroups.length <= 1) return uuidGroups;

  // Step 2: detect true branches — only user-type groups count
  const userGroupCount = uuidGroups.filter((g) =>
    g.some((n) => n.message.type === 'user'),
  ).length;

  if (userGroupCount <= 1) {
    // No real branches — all children are sequential flow
    return [children];
  }

  // Multiple user groups = true branch point.
  // Fold non-user groups into the nearest preceding user group so that
  // every selectable branch has a user message anchor for the pager.
  const branches: TreeNode[][] = [];
  for (const group of uuidGroups) {
    const hasUser = group.some((n) => n.message.type === 'user');
    if (hasUser) {
      branches.push([...group]);
    } else if (branches.length > 0) {
      // Append to previous user branch (sequential continuation)
      branches[branches.length - 1].push(...group);
    } else {
      // Leading non-user group before any user branch — start a new group
      // that will be merged when the first user group arrives
      branches.push([...group]);
    }
  }
  return branches;
}

// --- Core Functions ---

/**
 * Build a message tree from a flat array of HistoryMessages using parentId links.
 * Handles orphan messages (invalid parentId) and circular references defensively.
 */
export function buildMessageTree(messages: HistoryMessage[]): MessageTree {
  try {
    const nodeMap = new Map<string, TreeNode>();
    const childrenMap = new Map<string, TreeNode[]>();
    const roots: TreeNode[] = [];

    // Phase 1: Create all nodes
    for (const msg of messages) {
      const node: TreeNode = { message: msg, children: [], branchIndex: 0 };
      nodeMap.set(msg.id, node);
    }

    // Phase 2: Link parent→children, detect orphans
    for (const msg of messages) {
      const node = nodeMap.get(msg.id)!;
      if (msg.parentId === undefined) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(msg.parentId);
        if (!parent) {
          // Orphan: parentId references non-existent message → treat as root
          console.warn(`[messageTree] Orphan message "${msg.id}" references non-existent parent "${msg.parentId}", treating as root`);
          roots.push(node);
        } else {
          parent.children.push(node);
        }
      }
    }

    // Phase 3: Detect circular references using visited set
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function detectCycle(node: TreeNode): boolean {
      if (inStack.has(node.message.id)) return true;
      if (visited.has(node.message.id)) return false;

      visited.add(node.message.id);
      inStack.add(node.message.id);

      for (const child of node.children) {
        if (detectCycle(child)) {
          // Break circular link: remove child from parent and make it a root
          console.warn(`[messageTree] Circular reference detected at "${child.message.id}", breaking link and treating as root`);
          node.children = node.children.filter((c) => c !== child);
          roots.push(child);
        }
      }

      inStack.delete(node.message.id);
      return false;
    }

    for (const root of [...roots]) {
      detectCycle(root);
    }

    // Phase 3b: Promote unvisited nodes as roots (rootless cycles or disconnected chains)
    for (const node of nodeMap.values()) {
      if (!visited.has(node.message.id)) {
        console.warn(`[messageTree] Unreachable node "${node.message.id}" promoted to root`);
        roots.push(node);
        detectCycle(node);
      }
    }

    // Phase 4: Assign branchIndex to children based on UUID grouping
    for (const node of nodeMap.values()) {
      if (node.children.length > 0) {
        const branches = groupChildrenIntoBranches(node.children);
        for (let bi = 0; bi < branches.length; bi++) {
          for (const child of branches[bi]) {
            child.branchIndex = bi;
          }
        }
      }
    }

    return { roots, nodeMap };
  } catch (err) {
    // Graceful degradation: return flat linear list
    console.error('[messageTree] Tree building failed, falling back to linear mode:', err);
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];
    let prev: TreeNode | null = null;
    for (const msg of messages) {
      const node: TreeNode = { message: msg, children: [], branchIndex: 0 };
      nodeMap.set(msg.id, node);
      if (prev) {
        prev.children.push(node);
      } else {
        roots.push(node);
      }
      prev = node;
    }
    return { roots, nodeMap };
  }
}

/**
 * Find the default branch selections by tracing back from the newest leaf to the root.
 * This ensures the most recent conversation path is shown by default (AC 5).
 */
export function getDefaultBranchSelections(roots: TreeNode[]): Map<string, number> {
  const selections = new Map<string, number>();
  if (roots.length === 0) return selections;

  // Find all leaves and their timestamps
  let newestLeaf: TreeNode | null = null;
  let newestTime = '';

  function findLeaves(node: TreeNode) {
    const branches = groupChildrenIntoBranches(node.children);
    if (branches.length === 0) {
      // Leaf node
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

  // Trace back from newest leaf to root, recording branch indices
  // Build parent map for reverse traversal
  const parentMap = new Map<string, TreeNode>();

  function buildParentMap(node: TreeNode) {
    for (const child of node.children) {
      parentMap.set(child.message.id, node);
      buildParentMap(child);
    }
  }

  for (const root of roots) {
    buildParentMap(root);
  }

  // Walk up from leaf
  let current: TreeNode | null = newestLeaf;
  while (current) {
    const parent = parentMap.get(current.message.id);
    if (parent) {
      const branches = groupChildrenIntoBranches(parent.children);
      if (branches.length > 1) {
        // Find which branch index contains current
        const branchIdx = branches.findIndex((branch) =>
          branch.some((n) => n.message.id === current!.message.id),
        );
        if (branchIdx >= 0) {
          selections.set(parent.message.id, branchIdx);
        }
      }
    } else {
      // current is a root — check multi-root selection
      if (roots.length > 1) {
        const rootIdx = roots.indexOf(current);
        if (rootIdx >= 0) {
          selections.set(ROOT_BRANCH_KEY, rootIdx);
        }
      }
    }
    current = parent || null;
  }

  return selections;
}

/**
 * Extract the active branch as a flat message array, following branch selections.
 * Unselected branch points default to the last (newest) branch.
 */
export function getActiveBranch(
  roots: TreeNode[],
  branchSelections: Map<string, number>,
): { displayMessages: HistoryMessage[]; branchPoints: Map<string, BranchPoint>; branchKeyToParent: Map<string, string> } {
  const displayMessages: HistoryMessage[] = [];
  const branchPoints = new Map<string, BranchPoint>();
  const branchKeyToParent = new Map<string, string>();

  if (roots.length === 0) return { displayMessages, branchPoints, branchKeyToParent };

  // Handle multi-root: paginate when there are multiple user-type roots
  // (real branches from same missing parent, or compact_boundary roots).
  // Single-type orphan chains (e.g. sequential messages whose parents are
  // not loaded) are displayed sequentially without pagination.
  let activeRoots: TreeNode[];
  if (roots.length > 1) {
    const userRootCount = roots.filter((r) => r.message.type === 'user').length;
    const hasCompactBoundary = roots.some(
      (r) => r.message.type === 'system' && r.message.subtype === 'compact_boundary',
    );

    if (userRootCount > 1 || hasCompactBoundary) {
      const selectedIdx = branchSelections.get(ROOT_BRANCH_KEY) ?? roots.length - 1;
      const clampedIdx = Math.max(0, Math.min(selectedIdx, roots.length - 1));
      const selectedRoot = roots[clampedIdx];
      // Tag the selected root user message with branch info
      const rootKey = selectedRoot.message.type === 'user' ? selectedRoot.message.id : ROOT_BRANCH_KEY;
      branchPoints.set(rootKey, { total: roots.length, current: clampedIdx });
      if (rootKey !== ROOT_BRANCH_KEY) {
        branchKeyToParent.set(rootKey, ROOT_BRANCH_KEY);
      }
      activeRoots = [selectedRoot];
    } else {
      // Sequential orphan roots — display all
      activeRoots = roots;
    }
  } else {
    activeRoots = roots;
  }

  function traverse(node: TreeNode) {
    displayMessages.push(node.message);

    const branches = groupChildrenIntoBranches(node.children);
    if (branches.length === 0) return;

    if (branches.length > 1) {
      const selectedIdx = branchSelections.get(node.message.id) ?? branches.length - 1;
      const clampedIdx = Math.max(0, Math.min(selectedIdx, branches.length - 1));

      // Tag the first user message in the selected branch with branch info
      // so pagination renders inside the user message card, not on the parent
      const selectedBranch = branches[clampedIdx];
      const firstUserInBranch = selectedBranch.find((n) => n.message.type === 'user');
      const branchKey = firstUserInBranch ? firstUserInBranch.message.id : node.message.id;
      branchPoints.set(branchKey, { total: branches.length, current: clampedIdx });
      if (branchKey !== node.message.id) {
        branchKeyToParent.set(branchKey, node.message.id);
      }

      // Traverse all messages in the selected branch group
      for (const child of selectedBranch) {
        traverse(child);
      }
    } else {
      // Single branch — traverse all children
      for (const child of branches[0]) {
        traverse(child);
      }
    }
  }

  for (const root of activeRoots) {
    traverse(root);
  }

  return { displayMessages, branchPoints, branchKeyToParent };
}
