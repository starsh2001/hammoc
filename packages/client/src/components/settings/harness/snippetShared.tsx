/**
 * Story 29.2 — Shared primitives for the snippet panel components.
 *
 * Extracted to one module so SnippetPanel.tsx, SnippetEditor.tsx, and
 * SnippetCopyConflictDialog.tsx all consume a single source of truth for the
 * snippet name regex (matches the server `NAME_RE` in snippetResolver.ts) and
 * the scope pill rendering.
 */

import { useTranslation } from 'react-i18next';
import type { SnippetScope } from '@hammoc/shared';

export const SNIPPET_NAME_RE = /^[a-zA-Z0-9._-]+$/;

interface ScopePillProps {
  scope: SnippetScope;
  className?: string;
}

const SCOPE_CLASS: Record<SnippetScope, string> = {
  project:
    'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200',
  user: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
  bundled:
    'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200',
};

const SCOPE_DEFAULT_LABEL: Record<SnippetScope, string> = {
  project: 'Project',
  user: 'Global',
  bundled: 'Bundled',
};

export function ScopePill({ scope, className }: ScopePillProps) {
  const { t } = useTranslation('settings');
  const label = t(`harness.snippets.scope.${scope}`, {
    defaultValue: SCOPE_DEFAULT_LABEL[scope],
  });
  return (
    <span
      data-testid={`snippet-scope-pill-${scope}`}
      className={
        'inline-flex rounded px-1.5 py-0.5 text-xs font-medium ' +
        SCOPE_CLASS[scope] +
        (className ? ` ${className}` : '')
      }
    >
      {label}
    </span>
  );
}
