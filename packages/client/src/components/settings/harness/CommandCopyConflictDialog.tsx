/**
 * Story 28.5: Three-way copy-conflict dialog for slash commands.
 *
 * Mirrors the SkillCopyConflictDialog scaffold (Story 28.2) — overwrite / skip
 * / rename. The rename path collects a new relative path the server can write.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  slashName: string;
  targetScope: 'project' | 'user';
  errorMessage?: string;
  defaultRenamePath: string;
  onSubmit(choice: 'overwrite' | 'skip' | 'rename', renamePath?: string): void;
  onClose(): void;
}

const RESERVED_RE = /[\\<>:"|?*\x00-\x1F]/;
const TRAILING_DOT_RE = /[. ]$/;

function validateRenamePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'required';
  if (!trimmed.endsWith('.md')) return 'extension';
  if (trimmed.includes('..')) return 'traversal';
  for (const seg of trimmed.split('/')) {
    if (!seg.length) return 'empty';
    if (RESERVED_RE.test(seg)) return 'reserved';
    if (TRAILING_DOT_RE.test(seg)) return 'trailing';
  }
  return null;
}

export function CommandCopyConflictDialog({
  slashName,
  targetScope,
  errorMessage,
  defaultRenamePath,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const [choice, setChoice] = useState<'overwrite' | 'skip' | 'rename'>('overwrite');
  const [renamePath, setRenamePath] = useState(defaultRenamePath);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (choice === 'rename') {
      const err = validateRenamePath(renamePath);
      if (err) {
        setRenameError(err);
        return;
      }
    }
    onSubmit(choice, choice === 'rename' ? renamePath : undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.command.copy.conflict.title', { defaultValue: 'Command already exists at target' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.command.copy.conflict.title', { defaultValue: 'Command already exists at target' })}
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t('harness.command.copy.conflict.intro', {
            slashName,
            scope: targetScope,
            defaultValue: `${slashName} already exists in ${targetScope}. Choose what to do:`,
          })}
        </p>
        {errorMessage && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cmd-copy-conflict"
              value="overwrite"
              checked={choice === 'overwrite'}
              onChange={() => setChoice('overwrite')}
            />
            <span>{t('harness.command.copy.conflict.overwrite', { defaultValue: 'Overwrite' })}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cmd-copy-conflict"
              value="skip"
              checked={choice === 'skip'}
              onChange={() => setChoice('skip')}
            />
            <span>{t('harness.command.copy.conflict.skip', { defaultValue: 'Skip' })}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cmd-copy-conflict"
              value="rename"
              checked={choice === 'rename'}
              onChange={() => setChoice('rename')}
            />
            <span>{t('harness.command.copy.conflict.rename', { defaultValue: 'Rename and add' })}</span>
          </label>
          {choice === 'rename' && (
            <div className="flex flex-col gap-1 ml-6 mt-1">
              <label className="text-xs text-gray-600 dark:text-gray-400">
                {t('harness.command.copy.conflict.renamePathLabel', {
                  defaultValue: 'New relative path',
                })}
              </label>
              <input
                type="text"
                value={renamePath}
                onChange={(e) => {
                  setRenamePath(e.target.value);
                  setRenameError(null);
                }}
                className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-sm bg-white dark:bg-gray-800"
                aria-invalid={renameError ? 'true' : 'false'}
              />
              {renameError && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {t(`harness.command.create.errors.${
                    renameError === 'required'
                      ? 'fileNameRequired'
                      : renameError === 'extension'
                        ? 'extensionInvalid'
                        : 'reservedChars'
                  }`, { defaultValue: 'Invalid path.' })}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.command.copy.conflict.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            {t('harness.command.copy.conflict.submit', { defaultValue: 'Continue' })}
          </button>
        </div>
      </div>
    </div>
  );
}
