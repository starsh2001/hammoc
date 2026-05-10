/**
 * Story 30.2 (Task 5.6): single-source-of-truth issue lookup for the lint marker.
 *
 * Each of the 5 harness panels (Skill / Mcp / Hook / Command / Agent) calls
 * this hook with its own (domain, cardName) and gets back the LintIssue list
 * to feed `<LintMarker />`. The lookup logic lives here so a future change
 * to issue identity (e.g. adding `cardScope` filtering, hook event bucketing)
 * only edits one file.
 */

import { useHarnessLintStore } from '../stores/harnessLintStore';
import type { LintCardDomain, LintIssue } from '@hammoc/shared';

export function useCardLintIssues(domain: LintCardDomain, cardName: string): LintIssue[] {
  // Subscribe only to the array reference — zustand re-renders the consumer
  // when `issues` is replaced. Running `.filter` *outside* the selector keeps
  // the new-array-per-render from being treated as state churn (which would
  // loop forever in React strict mode).
  const issues = useHarnessLintStore((s) => s.issues);
  return issues.filter((i) => i.cardDomain === domain && i.cardName === cardName);
}

/**
 * All lint issues for a given sub-section domain — used by the per-panel
 * `<LintIssueList />` rendered at the top of each panel (AC1.b). Same
 * subscribe-only-to-`issues` discipline as `useCardLintIssues` so a click on
 * a single row doesn't churn other panels.
 */
export function useDomainLintIssues(domain: LintCardDomain): LintIssue[] {
  const issues = useHarnessLintStore((s) => s.issues);
  return issues.filter((i) => i.cardDomain === domain);
}

/**
 * Default activation handler — scroll the card root into view. Each panel
 * passes a stable card-root ref via the second argument.
 *
 * Field-level focus (`location.kind === 'path'`) is left to the panel's own
 * expand/focus hook because the `path: ['mcpServers', name, 'command']` →
 * DOM ref mapping is panel-specific. The marker still surfaces the rule +
 * message in its tooltip so users see what's wrong without a click.
 */
export function activateCardScroll(
  cardEl: HTMLElement | null,
  options: { expand?: () => void } = {},
): void {
  options.expand?.();
  if (cardEl) {
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Brief flash so the user can locate the card after a long scroll.
    cardEl.classList.add('lint-marker-target-flash');
    setTimeout(() => cardEl.classList.remove('lint-marker-target-flash'), 1200);
  }
}
