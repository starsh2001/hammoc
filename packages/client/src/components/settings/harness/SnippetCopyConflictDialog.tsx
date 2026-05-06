/**
 * Story 29.2 (AC3.b): Three-way copy-conflict dialog for snippets.
 *
 * Mirrors the AgentCopyConflictDialog scaffold (Story 28.6) — overwrite /
 * abort / rename. Rename collects a new name that must satisfy the snippet
 * NAME_RE (`[A-Za-z0-9._-]+`) and differ from the conflicting source name.
 * Snippets do NOT support 'skip' — copy is always intentional, so skip
 * collapses into 'abort'.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SNIPPET_NAME_RE } from './snippetShared';

interface Props {
  snippetName: string;
  targetScope: 'project' | 'user';
  errorMessage?: string;
  defaultRenameName: string;
  onSubmit(choice: 'overwrite' | 'abort' | 'rename', renameName?: string): void;
  onClose(): void;
}

function validateRenameName(value: string, original: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'required';
  if (trimmed === original) return 'unchanged';
  if (trimmed === '..' || trimmed === '.' || trimmed.includes('/') || trimmed.includes('\\')) {
    return 'reserved';
  }
  if (!SNIPPET_NAME_RE.test(trimmed)) return 'pattern';
  return null;
}

export function SnippetCopyConflictDialog({
  snippetName,
  targetScope,
  errorMessage,
  defaultRenameName,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const [choice, setChoice] = useState<'overwrite' | 'abort' | 'rename'>('overwrite');
  const [renameName, setRenameName] = useState(defaultRenameName);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (choice === 'rename') {
      const err = validateRenameName(renameName, snippetName);
      if (err) {
        setRenameError(err);
        return;
      }
    }
    onSubmit(choice, choice === 'rename' ? renameName.trim() : undefined);
  };

  const renameErrorMessage = renameError
    ? t(`harness.snippets.copy.conflict.renameError.${renameError}`, {
        defaultValue:
          renameError === 'required'
            ? 'Name is required.'
            : renameError === 'unchanged'
              ? 'Pick a name distinct from the original.'
              : renameError === 'reserved'
                ? 'Name cannot contain path separators.'
                : 'Use letters, digits, dots, underscores, and hyphens only.',
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.snippets.copy.conflict.title', {
        defaultValue: 'Snippet already exists at target',
      })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="snippet-copy-conflict-dialog"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.snippets.copy.conflict.title', {
            defaultValue: 'Snippet already exists at target',
          })}
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t('harness.snippets.copy.conflict.description', {
            name: snippetName,
            scope:
              targetScope === 'project'
                ? t('harness.snippets.scope.project', { defaultValue: 'Project' })
                : t('harness.snippets.scope.user', { defaultValue: 'Global' }),
            defaultValue: `A snippet named "${snippetName}" already exists in ${targetScope}.`,
          })}
        </p>

        {errorMessage && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="sr-only">
            {t('harness.snippets.copy.conflict.legend', { defaultValue: 'Conflict resolution' })}
          </legend>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="snippet-conflict-choice"
              value="overwrite"
              checked={choice === 'overwrite'}
              onChange={() => setChoice('overwrite')}
              data-testid="snippet-conflict-overwrite"
              className="mt-1"
            />
            <span>
              <strong>
                {t('harness.snippets.copy.conflict.overwrite.label', { defaultValue: 'Overwrite' })}
              </strong>
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                {t('harness.snippets.copy.conflict.overwrite.help', {
                  defaultValue: 'Replace the target body with the source body.',
                })}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="snippet-conflict-choice"
              value="rename"
              checked={choice === 'rename'}
              onChange={() => setChoice('rename')}
              data-testid="snippet-conflict-rename"
              className="mt-1"
            />
            <span className="flex-1">
              <strong>
                {t('harness.snippets.copy.conflict.rename.label', { defaultValue: 'Copy with new name' })}
              </strong>
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                {t('harness.snippets.copy.conflict.rename.help', {
                  defaultValue: 'Save the source body under a different name.',
                })}
              </span>
              {choice === 'rename' && (
                <>
                  <input
                    type="text"
                    value={renameName}
                    onChange={(e) => {
                      setRenameName(e.target.value);
                      setRenameError(null);
                    }}
                    data-testid="snippet-conflict-rename-input"
                    className="mt-1 w-full rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
                  />
                  {renameErrorMessage && (
                    <span data-testid="snippet-conflict-rename-error" className="text-xs text-red-600 dark:text-red-400">
                      {renameErrorMessage}
                    </span>
                  )}
                </>
              )}
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="snippet-conflict-choice"
              value="abort"
              checked={choice === 'abort'}
              onChange={() => setChoice('abort')}
              data-testid="snippet-conflict-abort"
              className="mt-1"
            />
            <span>
              <strong>
                {t('harness.snippets.copy.conflict.abort.label', { defaultValue: 'Cancel copy' })}
              </strong>
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                {t('harness.snippets.copy.conflict.abort.help', {
                  defaultValue: 'Leave the target unchanged.',
                })}
              </span>
            </span>
          </label>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('common.close', { defaultValue: 'Close' })}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            data-testid="snippet-conflict-submit"
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            {t('harness.snippets.copy.conflict.submit', { defaultValue: 'Confirm' })}
          </button>
        </div>
      </div>
    </div>
  );
}
