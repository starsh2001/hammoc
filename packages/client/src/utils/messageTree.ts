import { ROOT_BRANCH_KEY } from '@hammoc/shared';

// Re-export for existing consumers
export { ROOT_BRANCH_KEY };

// --- Types ---

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
