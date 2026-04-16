/**
 * Server Message Tree Tests
 * Story 25.4: Branch-aware Message Pagination — Task 7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RawJSONLMessage } from '@hammoc/shared';
import { ROOT_BRANCH_KEY } from '@hammoc/shared';
import {
  buildRawMessageTree,
  getDefaultRawBranchSelections,
  getActiveRawBranch,
  groupRawChildrenIntoBranches,
} from '../messageTree.js';

// Mock logger to suppress warnings in tests
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }),
}));

// --- Helper ---
let counter = 0;
function makeRawMsg(
  uuid: string,
  parentUuid: string | null,
  type: 'user' | 'assistant' | 'system' = 'user',
  timestamp?: string,
  extra?: Partial<RawJSONLMessage>,
): RawJSONLMessage {
  counter++;
  return {
    uuid,
    parentUuid: parentUuid ?? undefined,
    type,
    message: { role: type === 'user' ? 'user' : 'assistant', content: `msg-${uuid}` },
    timestamp: timestamp ?? new Date(Date.now() + counter * 1000).toISOString(),
    ...extra,
  } as RawJSONLMessage;
}

beforeEach(() => { counter = 0; });

// --- buildRawMessageTree ---

describe('buildRawMessageTree', () => {
  it('should build a linear tree from sequential messages', () => {
    const msgs = [
      makeRawMsg('a', null, 'user'),
      makeRawMsg('b', 'a', 'assistant'),
      makeRawMsg('c', 'b', 'user'),
    ];
    const tree = buildRawMessageTree(msgs);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].message.uuid).toBe('a');
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].message.uuid).toBe('b');
    expect(tree.roots[0].children[0].children).toHaveLength(1);
  });

  it('should handle orphan messages by treating them as roots', () => {
    const msgs = [
      makeRawMsg('a', null, 'user'),
      makeRawMsg('b', 'nonexistent', 'assistant'),
    ];
    const tree = buildRawMessageTree(msgs);
    expect(tree.roots).toHaveLength(2);
  });

  it('should handle circular references by breaking the link', () => {
    // Create a cycle: a → b → c → a
    const msgs = [
      makeRawMsg('a', 'c', 'user'),
      makeRawMsg('b', 'a', 'assistant'),
      makeRawMsg('c', 'b', 'user'),
    ];
    const tree = buildRawMessageTree(msgs);
    // Should not infinite loop, all nodes should be reachable
    expect(tree.nodeMap.size).toBe(3);
    expect(tree.roots.length).toBeGreaterThan(0);
  });

  it('should handle multiple roots', () => {
    const msgs = [
      makeRawMsg('a', null, 'user'),
      makeRawMsg('b', null, 'system', undefined, { subtype: 'compact_boundary' }),
      makeRawMsg('c', 'b', 'user'),
    ];
    const tree = buildRawMessageTree(msgs);
    expect(tree.roots).toHaveLength(2);
  });
});

// --- groupRawChildrenIntoBranches ---

describe('groupRawChildrenIntoBranches', () => {
  it('should group split messages by UUID prefix', () => {
    const tree = buildRawMessageTree([
      makeRawMsg('a', null, 'user'),
      makeRawMsg('b', 'a', 'assistant'),
      makeRawMsg('b-text-1', 'a', 'assistant'),
    ]);
    const root = tree.roots[0];
    const branches = groupRawChildrenIntoBranches(root.children);
    // All share same base UUID 'b', so single branch
    expect(branches).toHaveLength(1);
    expect(branches[0]).toHaveLength(2);
  });

  it('should detect true branches when multiple user groups exist', () => {
    const tree = buildRawMessageTree([
      makeRawMsg('parent', null, 'assistant'),
      makeRawMsg('u1', 'parent', 'user'),
      makeRawMsg('u2', 'parent', 'user'),
    ]);
    const root = tree.roots[0];
    const branches = groupRawChildrenIntoBranches(root.children);
    expect(branches).toHaveLength(2);
  });

  it('should detect branches through attachment chains (user → attachment → assistant vs user sibling)', () => {
    // Simulates root edit: root user has both attachment chain (normal flow)
    // and a direct user child (from resumeSessionAt edit)
    const tree = buildRawMessageTree([
      makeRawMsg('root-user', null, 'user'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uuid: 'attach1', parentUuid: 'root-user', type: 'attachment' as any, timestamp: new Date().toISOString() } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uuid: 'attach2', parentUuid: 'attach1', type: 'attachment' as any, timestamp: new Date().toISOString() } as any,
      makeRawMsg('first-assistant', 'attach2', 'assistant'),
      makeRawMsg('edit-user', 'root-user', 'user'),
    ]);
    const root = tree.roots[0];
    const branches = groupRawChildrenIntoBranches(root.children);
    // attachment chain leads to assistant (conversation type) → counts as a branch
    // edit-user is a direct user child → counts as a branch
    expect(branches).toHaveLength(2);
  });

  it('should not create branches for non-user children only', () => {
    const tree = buildRawMessageTree([
      makeRawMsg('parent', null, 'user'),
      makeRawMsg('a1', 'parent', 'assistant'),
      makeRawMsg('a2', 'parent', 'assistant'),
    ]);
    const root = tree.roots[0];
    const branches = groupRawChildrenIntoBranches(root.children);
    // Only one user group (zero) → single branch
    expect(branches).toHaveLength(1);
  });
});

// --- getDefaultRawBranchSelections ---

describe('getDefaultRawBranchSelections', () => {
  it('should return empty for linear conversation', () => {
    const msgs = [
      makeRawMsg('a', null, 'user', '2024-01-01T00:00:00Z'),
      makeRawMsg('b', 'a', 'assistant', '2024-01-01T00:01:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const selections = getDefaultRawBranchSelections(tree.roots);
    expect(Object.keys(selections)).toHaveLength(0);
  });

  it('should select the newest leaf path at branch points', () => {
    const msgs = [
      makeRawMsg('root', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg('u1', 'root', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg('a1', 'u1', 'assistant', '2024-01-01T00:02:00Z'),
      makeRawMsg('u2', 'root', 'user', '2024-01-01T00:03:00Z'),
      makeRawMsg('a2', 'u2', 'assistant', '2024-01-01T00:04:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const selections = getDefaultRawBranchSelections(tree.roots);
    // u2 branch has newer leaf → should select branch index 1 at 'root'
    expect(selections['root']).toBe(1);
  });

  it('should handle multi-root with ROOT_BRANCH_KEY', () => {
    const msgs = [
      makeRawMsg('r1', null, 'user', '2024-01-01T00:00:00Z'),
      makeRawMsg('cb', null, 'system', '2024-01-01T00:05:00Z', { subtype: 'compact_boundary' }),
      makeRawMsg('r2', 'cb', 'user', '2024-01-01T00:06:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const selections = getDefaultRawBranchSelections(tree.roots);
    // Two roots, newest leaf is in r2 → select root index 1
    expect(selections[ROOT_BRANCH_KEY]).toBe(1);
  });

  it('should select compact epoch when its deepest conversation node only has non-conversation children', () => {
    // Reproduces the real compact structure: compact epoch ends with
    // user → attachment (non-conversation leaf). Without the fix,
    // findLeaves finds no conversation leaf in the compact epoch and
    // falls back to the pre-compact root (page 1).
    const msgs: RawJSONLMessage[] = [
      makeRawMsg('r1', null, 'user', '2026-04-04T14:11:33Z'),
      makeRawMsg('a1', 'r1', 'assistant', '2026-04-04T14:11:38Z'),
      makeRawMsg('cb', null, 'system', '2026-04-05T03:26:11Z', { subtype: 'compact_boundary' }),
      makeRawMsg('summary', 'cb', 'user', '2026-04-05T03:26:11Z'),
      makeRawMsg('cmd-caveat', 'summary', 'user', '2026-04-05T03:24:47Z'),
      makeRawMsg('cmd-compact', 'cmd-caveat', 'user', '2026-04-05T03:24:47Z'),
      makeRawMsg('cmd-stdout', 'cmd-compact', 'user', '2026-04-05T03:26:11Z'),
      // attachment is the tree leaf but NOT a conversation type
      { uuid: 'attach-1', parentUuid: 'cmd-stdout', type: 'attachment' as 'user',
        timestamp: '2026-04-05T03:26:10Z', message: { role: 'user', content: '' } } as RawJSONLMessage,
    ];
    const tree = buildRawMessageTree(msgs);
    const selections = getDefaultRawBranchSelections(tree.roots);
    // Should select compact epoch (root index 1), NOT pre-compact (root index 0)
    expect(selections[ROOT_BRANCH_KEY]).toBe(1);
  });
});

// --- getActiveRawBranch ---

describe('getActiveRawBranch', () => {
  it('should return all messages for linear conversation with empty branchPoints', () => {
    const msgs = [
      makeRawMsg('a', null, 'user'),
      makeRawMsg('b', 'a', 'assistant'),
      makeRawMsg('c', 'b', 'user'),
    ];
    const tree = buildRawMessageTree(msgs);
    const { messages, branchPoints } = getActiveRawBranch(tree.roots, {});
    expect(messages).toHaveLength(3);
    expect(Object.keys(branchPoints)).toHaveLength(0);
  });

  it('should follow branchSelections to extract correct path', () => {
    const msgs = [
      makeRawMsg('root', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg('u1', 'root', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg('a1', 'u1', 'assistant', '2024-01-01T00:02:00Z'),
      makeRawMsg('u2', 'root', 'user', '2024-01-01T00:03:00Z'),
      makeRawMsg('a2', 'u2', 'assistant', '2024-01-01T00:04:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);

    // Select first branch (u1)
    const { messages: branch0 } = getActiveRawBranch(tree.roots, { root: 0 });
    expect(branch0.map(m => m.uuid)).toEqual(['root', 'u1', 'a1']);

    // Select second branch (u2)
    const { messages: branch1 } = getActiveRawBranch(tree.roots, { root: 1 });
    expect(branch1.map(m => m.uuid)).toEqual(['root', 'u2', 'a2']);
  });

  it('should report branchPoints with total and current', () => {
    const msgs = [
      makeRawMsg('root', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg('u1', 'root', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg('u2', 'root', 'user', '2024-01-01T00:03:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const { branchPoints } = getActiveRawBranch(tree.roots, { root: 0 });
    // Branch point should be keyed by the first user message in selected branch
    expect(branchPoints['u1']).toMatchObject({ total: 2, current: 0, selectionKey: 'root' });
  });

  it('should handle multiple branch points', () => {
    const msgs = [
      makeRawMsg('root', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg('u1', 'root', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg('a1', 'u1', 'assistant', '2024-01-01T00:02:00Z'),
      makeRawMsg('u2', 'root', 'user', '2024-01-01T00:03:00Z'),
      // Nested branch at a1
      makeRawMsg('n1', 'a1', 'user', '2024-01-01T00:04:00Z'),
      makeRawMsg('n2', 'a1', 'user', '2024-01-01T00:05:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const { messages, branchPoints } = getActiveRawBranch(tree.roots, { root: 0, a1: 1 });
    expect(messages.map(m => m.uuid)).toEqual(['root', 'u1', 'a1', 'n2']);
    // Should have branch points at both root and a1
    expect(Object.keys(branchPoints)).toHaveLength(2);
  });

  it('should default unselected branch points to last (newest) branch', () => {
    const msgs = [
      makeRawMsg('root', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg('u1', 'root', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg('u2', 'root', 'user', '2024-01-01T00:03:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    // Empty selections → default to last branch
    const { messages } = getActiveRawBranch(tree.roots, {});
    expect(messages.map(m => m.uuid)).toEqual(['root', 'u2']);
  });

  it('should handle multi-root with ROOT_BRANCH_KEY selection', () => {
    const msgs = [
      makeRawMsg('r1', null, 'user', '2024-01-01T00:00:00Z'),
      makeRawMsg('a1', 'r1', 'assistant', '2024-01-01T00:01:00Z'),
      makeRawMsg('cb', null, 'system', '2024-01-01T00:05:00Z', { subtype: 'compact_boundary' }),
      makeRawMsg('r2', 'cb', 'user', '2024-01-01T00:06:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const { messages } = getActiveRawBranch(tree.roots, { [ROOT_BRANCH_KEY]: 0 });
    // Should select first root (r1)
    expect(messages[0].uuid).toBe('r1');
  });

  it('should handle partial branchSelections (use default for missing)', () => {
    const msgs = [
      makeRawMsg('root', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg('u1', 'root', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg('a1', 'u1', 'assistant', '2024-01-01T00:02:00Z'),
      makeRawMsg('u2', 'root', 'user', '2024-01-01T00:03:00Z'),
      makeRawMsg('n1', 'a1', 'user', '2024-01-01T00:04:00Z'),
      makeRawMsg('n2', 'a1', 'user', '2024-01-01T00:05:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    // Select first branch at root, but no selection at a1 → defaults to last
    const { messages } = getActiveRawBranch(tree.roots, { root: 0 });
    expect(messages.map(m => m.uuid)).toEqual(['root', 'u1', 'a1', 'n2']);
  });

  it('should handle orphan messages as roots', () => {
    const msgs = [
      makeRawMsg('a', null, 'user'),
      makeRawMsg('b', 'nonexistent', 'assistant'),
    ];
    const tree = buildRawMessageTree(msgs);
    const { messages } = getActiveRawBranch(tree.roots, {});
    // Both treated as roots, all should appear
    expect(messages).toHaveLength(2);
  });

  it('should handle circular references gracefully', () => {
    const msgs = [
      makeRawMsg('a', 'c', 'user'),
      makeRawMsg('b', 'a', 'assistant'),
      makeRawMsg('c', 'b', 'user'),
    ];
    const tree = buildRawMessageTree(msgs);
    const { messages } = getActiveRawBranch(tree.roots, {});
    // All 3 nodes should be reachable (cycles broken)
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.length).toBeLessThanOrEqual(3);
  });

  it('should group split messages (same UUID prefix) as one branch', () => {
    // Use real UUID v4 format so getBaseUuid regex matches
    const baseUuid = '11111111-1111-4111-8111-111111111111';
    const splitUuid = `${baseUuid}-text-1`;
    const otherUuid = '22222222-2222-4222-8222-222222222222';
    const msgs = [
      makeRawMsg('parent', null, 'assistant', '2024-01-01T00:00:00Z'),
      makeRawMsg(baseUuid, 'parent', 'user', '2024-01-01T00:01:00Z'),
      makeRawMsg(splitUuid, 'parent', 'user', '2024-01-01T00:01:01Z'),
      makeRawMsg(otherUuid, 'parent', 'user', '2024-01-01T00:02:00Z'),
    ];
    const tree = buildRawMessageTree(msgs);
    const branches = groupRawChildrenIntoBranches(tree.roots[0].children);
    // baseUuid and splitUuid share the same base UUID → same branch
    // otherUuid is a separate branch → 2 branches total
    expect(branches).toHaveLength(2);
    expect(branches[0]).toHaveLength(2); // baseUuid + splitUuid
    expect(branches[1]).toHaveLength(1); // otherUuid
  });
});

// --- 50+ messages + multi-branch pagination ---

describe('50+ messages with multi-branch pagination', () => {
  it('should correctly paginate active branch from a large tree', () => {
    // Build 50 linear messages: user → assistant alternating
    const msgs: RawJSONLMessage[] = [];
    msgs.push(makeRawMsg('msg-0', null, 'user', '2024-01-01T00:00:00Z'));
    for (let i = 1; i < 50; i++) {
      const type = i % 2 === 0 ? 'user' : 'assistant';
      msgs.push(makeRawMsg(`msg-${i}`, `msg-${i - 1}`, type as 'user' | 'assistant',
        `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`));
    }

    // Branch at msg-9 (assistant): two user children = true branch
    // msg-10 (user) is the original child; branch-a-0 is the edit
    msgs.push(makeRawMsg('branch-a-0', 'msg-9', 'user', '2024-01-01T01:00:00Z'));
    for (let i = 1; i < 10; i++) {
      const type = i % 2 === 0 ? 'user' : 'assistant';
      msgs.push(makeRawMsg(`branch-a-${i}`, `branch-a-${i - 1}`, type as 'user' | 'assistant',
        `2024-01-01T01:${String(i).padStart(2, '0')}:00Z`));
    }

    // Branch at msg-29 (assistant): two user children = true branch
    // msg-30 (user) is the original child; branch-b-0 is the edit
    msgs.push(makeRawMsg('branch-b-0', 'msg-29', 'user', '2024-01-01T02:00:00Z'));
    for (let i = 1; i < 5; i++) {
      const type = i % 2 === 0 ? 'user' : 'assistant';
      msgs.push(makeRawMsg(`branch-b-${i}`, `branch-b-${i - 1}`, type as 'user' | 'assistant',
        `2024-01-01T02:${String(i).padStart(2, '0')}:00Z`));
    }

    const tree = buildRawMessageTree(msgs);
    expect(tree.nodeMap.size).toBe(65); // 50 + 10 + 5

    // Default branch should be the one with newest leaf
    const defaults = getDefaultRawBranchSelections(tree.roots);

    // Get active branch with defaults
    const { messages: activeBranch, branchPoints } = getActiveRawBranch(tree.roots, defaults);

    // Active branch should not include messages from non-selected branches
    const activeIds = new Set(activeBranch.map(m => m.uuid));
    // Check that branch points exist (msg-9 and msg-29 are branch points)
    expect(Object.keys(branchPoints).length).toBeGreaterThan(0);

    // Verify: all messages in active branch form a contiguous parent→child chain
    for (let i = 1; i < activeBranch.length; i++) {
      const msg = activeBranch[i];
      if (msg.parentUuid) {
        expect(activeIds.has(msg.parentUuid)).toBe(true);
      }
    }

    // Select branch-a at msg-9 (branch-a-0 is the second user group, index depends on order)
    // msg-10 is original child (user), branch-a-0 is edit (user) → 2 user groups
    // branch-a-0 is added after msg-10 in the array, so it should be index 1
    const { messages: branchAPath } = getActiveRawBranch(tree.roots, {
      ...defaults,
      'msg-9': 1, // Select branch-a (second branch)
    });
    const branchAIds = new Set(branchAPath.map(m => m.uuid));
    expect(branchAIds.has('branch-a-0')).toBe(true);
    expect(branchAIds.has('branch-a-9')).toBe(true);
    // Should not contain the original path from msg-10 onwards
    expect(branchAIds.has('msg-11')).toBe(false);
    expect(branchAIds.has('branch-b-0')).toBe(false);
  });
});

// --- Metadata root filtering ---

describe('metadata root filtering', () => {
  it('should ignore isolated metadata roots (queue-operation, progress) for leaf selection and branch handling', () => {
    // Simulate real SDK JSONL: conversation chain + isolated metadata roots
    const msgs: RawJSONLMessage[] = [
      // Isolated metadata roots (no children) — like queue-operation, file-history-snapshot
      { uuid: '__line-0', type: 'queue-operation' as 'user', parentUuid: undefined, timestamp: '2026-01-15T10:05:00Z', message: { role: 'user', content: '' } } as RawJSONLMessage,
      { uuid: '__line-1', type: 'progress' as 'user', parentUuid: undefined, timestamp: '2026-01-15T10:06:00Z', message: { role: 'user', content: '' } } as RawJSONLMessage,
      // Conversation chain
      makeRawMsg('progress-root', null, 'user', '2026-01-15T10:00:00Z', { type: 'progress' as 'user' }),
      makeRawMsg('u1', 'progress-root', 'user', '2026-01-15T10:00:01Z'),
      makeRawMsg('a1', 'u1', 'assistant', '2026-01-15T10:00:02Z'),
      makeRawMsg('u2', 'a1', 'user', '2026-01-15T10:00:03Z'),
      makeRawMsg('a2', 'u2', 'assistant', '2026-01-15T10:00:04Z'),
    ];

    const tree = buildRawMessageTree(msgs);
    // Metadata roots are newer (10:05, 10:06) but should NOT be selected as newest leaf
    const defaults = getDefaultRawBranchSelections(tree.roots);
    const { messages } = getActiveRawBranch(tree.roots, defaults);

    // Should include conversation messages, not just the isolated metadata root
    const uuids = messages.map(m => m.uuid);
    expect(uuids).toContain('u1');
    expect(uuids).toContain('a1');
    expect(uuids).toContain('u2');
    expect(uuids).toContain('a2');
  });

  it('should select correct compact_boundary root even with newer metadata roots', () => {
    const msgs: RawJSONLMessage[] = [
      // Initial conversation tree (progress root)
      makeRawMsg('progress-root', null, 'user', '2026-01-15T10:00:00Z', { type: 'progress' as 'user' }),
      makeRawMsg('u1', 'progress-root', 'user', '2026-01-15T10:00:01Z'),
      makeRawMsg('a1', 'u1', 'assistant', '2026-01-15T10:00:02Z'),
      // Compact boundary epoch
      makeRawMsg('compact-1', null, 'system', '2026-01-15T11:00:00Z', { subtype: 'compact_boundary' }),
      makeRawMsg('u2', 'compact-1', 'user', '2026-01-15T11:00:01Z'),
      makeRawMsg('a2', 'u2', 'assistant', '2026-01-15T11:00:02Z'),
      // Isolated metadata root AFTER compact_boundary (newer timestamp)
      { uuid: '__line-99', type: 'queue-operation' as 'user', parentUuid: undefined, timestamp: '2026-01-15T11:01:00Z', message: { role: 'user', content: '' } } as RawJSONLMessage,
    ];

    const tree = buildRawMessageTree(msgs);
    const defaults = getDefaultRawBranchSelections(tree.roots);
    const { messages, branchPoints } = getActiveRawBranch(tree.roots, defaults);

    // Should select compact_boundary epoch (not the metadata root)
    const uuids = messages.map(m => m.uuid);
    expect(uuids).toContain('compact-1');
    expect(uuids).toContain('u2');
    expect(uuids).toContain('a2');
    // Should NOT contain pre-compaction messages
    expect(uuids).not.toContain('u1');
    // Branch points should reflect 2 conversation roots
    expect(Object.keys(branchPoints).length).toBeGreaterThan(0);
  });
});
