import type { HistoryMessage } from '@hammoc/shared';

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
}

// Special key for root-level branch selection (multi-root from compact_boundary)
export const ROOT_BRANCH_KEY = '__root__' as const;

// --- Helpers ---

/**
 * Extract base UUID from a split message ID.
 * Split IDs follow patterns: {uuid}-text-{n}, {uuid}-tool-{id}, {uuid}-thinking
 * The first fragment of a split keeps the original {uuid} with no suffix.
 */
export function getBaseUuid(id: string): string {
  const match = id.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(text|tool|thinking))?/);
  return match ? match[1] : id;
}

/**
 * Group children by base UUID — each group = one logical branch (turn).
 * Split messages from the same assistant turn share the same UUID prefix.
 */
export function groupChildrenIntoBranches(children: TreeNode[]): TreeNode[][] {
  const groups: Map<string, TreeNode[]> = new Map();
  for (const child of children) {
    const base = getBaseUuid(child.message.id);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(child);
  }
  return Array.from(groups.values());
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
): { displayMessages: HistoryMessage[]; branchPoints: Map<string, BranchPoint> } {
  const displayMessages: HistoryMessage[] = [];
  const branchPoints = new Map<string, BranchPoint>();

  if (roots.length === 0) return { displayMessages, branchPoints };

  // Handle multi-root (compact_boundary)
  let activeRoots: TreeNode[];
  if (roots.length > 1) {
    const selectedIdx = branchSelections.get(ROOT_BRANCH_KEY) ?? roots.length - 1;
    const clampedIdx = Math.max(0, Math.min(selectedIdx, roots.length - 1));
    branchPoints.set(ROOT_BRANCH_KEY, { total: roots.length, current: clampedIdx });
    activeRoots = [roots[clampedIdx]];
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
      branchPoints.set(node.message.id, { total: branches.length, current: clampedIdx });

      // Traverse all messages in the selected branch group
      for (const child of branches[clampedIdx]) {
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

  return { displayMessages, branchPoints };
}
