/**
 * Prefix-based status matching.
 * Handles statuses with parenthetical annotations like
 * "Ready for Review (QA fixes applied — REACT-001, PERF-001)".
 */
export function statusMatches(actual: string | null | undefined, expected: string): boolean {
  if (actual == null) return false;
  return actual === expected || actual.startsWith(expected + ' ');
}
