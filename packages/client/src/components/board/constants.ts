/**
 * Board shared constants — Badge definitions and resolution
 * [Source: Story 21.2 - QA recommendation, Badge-based column mapping]
 */

import type { BoardItem } from '@hammoc/shared';

// Badge condition: a field on BoardItem and the value it must match
interface BadgeCondition {
  field: keyof BoardItem;
  value: string;
}

export interface BadgeDefinition {
  id: string;
  label: string;
  colorClass: string;
  conditions: BadgeCondition[];
}

// Ordered list — first match wins. More specific conditions (more entries) come first.
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // QA gate compound badges (status + gateResult)
  // Ready for Review variants
  {
    id: 'qa-failed',
    label: 'QA Failed',
    colorClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    conditions: [{ field: 'status', value: 'Ready for Review' }, { field: 'gateResult', value: 'FAIL' }],
  },
  {
    id: 'qa-concerns',
    label: 'QA Concerns',
    colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    conditions: [{ field: 'status', value: 'Ready for Review' }, { field: 'gateResult', value: 'CONCERNS' }],
  },
  {
    id: 'qa-passed',
    label: 'QA Passed',
    colorClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    conditions: [{ field: 'status', value: 'Ready for Review' }, { field: 'gateResult', value: 'PASS' }],
  },
  {
    id: 'qa-waived',
    label: 'QA Waived',
    colorClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    conditions: [{ field: 'status', value: 'Ready for Review' }, { field: 'gateResult', value: 'WAIVED' }],
  },
  {
    id: 'qa-fixed',
    label: 'QA Fixed',
    colorClass: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
    conditions: [{ field: 'status', value: 'Ready for Review' }, { field: 'gateResult', value: 'FIXED' }],
  },
  // Single-field badges (status only) — order doesn't matter among these
  {
    id: 'open',
    label: 'Open',
    colorClass: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    conditions: [{ field: 'status', value: 'Open' }],
  },
  {
    id: 'draft',
    label: 'Draft',
    colorClass: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    conditions: [{ field: 'status', value: 'Draft' }],
  },
  {
    id: 'approved',
    label: 'Approved',
    colorClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    conditions: [{ field: 'status', value: 'Approved' }],
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    conditions: [{ field: 'status', value: 'In Progress' }],
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    conditions: [{ field: 'status', value: 'InProgress' }],
  },
  {
    id: 'blocked',
    label: 'Blocked',
    colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    conditions: [{ field: 'status', value: 'Blocked' }],
  },
  {
    id: 'ready-for-review',
    label: 'Ready for Review',
    colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    conditions: [{ field: 'status', value: 'Ready for Review' }],
  },
  {
    id: 'ready-for-done',
    label: 'Ready for Done',
    colorClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    conditions: [{ field: 'status', value: 'Ready for Done' }],
  },
  {
    id: 'done',
    label: 'Done',
    colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    conditions: [{ field: 'status', value: 'Done' }],
  },
  {
    id: 'closed',
    label: 'Closed',
    colorClass: 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400',
    conditions: [{ field: 'status', value: 'Closed' }],
  },
  {
    id: 'promoted',
    label: 'Promoted',
    colorClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    conditions: [{ field: 'status', value: 'Promoted' }],
  },
];

// Fallback badge for items that don't match any definition
export const FALLBACK_BADGE: BadgeDefinition = {
  id: 'unknown',
  label: 'Unknown',
  colorClass: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  conditions: [],
};

/**
 * Resolve which badge applies to a board item.
 * Evaluates BADGE_DEFINITIONS in order; first match wins.
 * Returns FALLBACK_BADGE if no definition matches (label falls back to item.status).
 */
export function resolveBadge(item: BoardItem): BadgeDefinition {
  for (const badge of BADGE_DEFINITIONS) {
    const match = badge.conditions.every((cond) => {
      const fieldValue = item[cond.field];
      return fieldValue != null && String(fieldValue) === cond.value;
    });
    if (match) return badge;
  }
  return { ...FALLBACK_BADGE, label: item.status };
}

/** All unique badge IDs for use in config UI */
export const ALL_BADGE_IDS = [...new Set(BADGE_DEFINITIONS.map((b) => b.id))];

/** Lookup badge definition by ID (returns first match) */
export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.id === id);
}
