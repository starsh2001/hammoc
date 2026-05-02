/**
 * Story 28.2: Skill copy conflict dialog.
 *
 * 3-way resolution modal — overwrite / skip / rename — used both for the
 * initial copy attempt (where the user pre-selects intent) and for retries
 * after the rename target itself collides. Reserved-character validation
 * runs inline and disables the submit button until the name is OS-safe.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  defaultName: string;
  targetScope: 'project' | 'user';
  errorMessage?: string | null;
  onSubmit(resolution: { onConflict: 'overwrite' | 'skip' | 'rename'; targetName: string }): void;
  onClose(): void;
}

// OS-reserved characters + trailing dot/space — mirrors the server-side
// validation. Control-char range (0x00-0x1F) is part of the security check.
// eslint-disable-next-line no-control-regex
const RESERVED_RE = /[\\/<>:"|?*\x00-\x1F]|[. ]$/;

export function SkillCopyConflictDialog({
  defaultName,
  targetScope,
  errorMessage,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const [resolution, setResolution] = useState<'overwrite' | 'skip' | 'rename'>('overwrite');
  const [renameInput, setRenameInput] = useState(defaultName);

  const isInvalid =
    resolution === 'rename'
    && (renameInput.trim() === '' || renameInput === defaultName || RESERVED_RE.test(renameInput));

  const handleSubmit = () => {
    if (isInvalid) return;
    onSubmit({
      onConflict: resolution,
      targetName: resolution === 'rename' ? renameInput.trim() : defaultName,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-copy-conflict-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50">
          <h2
            id="skill-copy-conflict-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('harness.skill.copy.conflict.title')}
          </h2>
          <button
            type="button"
            aria-label={t('harness.skill.copy.conflict.close', { defaultValue: 'Close' })}
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-gray-700 dark:text-gray-200 overflow-y-auto">
          <p>
            {t('harness.skill.copy.conflict.intro', {
              targetScope: t(`harness.skill.scopeBadge.${targetScope}`),
              name: defaultName,
              defaultValue: `Copy ${defaultName} into ${targetScope}.`,
            })}
          </p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="conflict"
              value="overwrite"
              checked={resolution === 'overwrite'}
              onChange={() => setResolution('overwrite')}
            />
            <span>{t('harness.skill.copy.conflict.overwrite')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="conflict"
              value="skip"
              checked={resolution === 'skip'}
              onChange={() => setResolution('skip')}
            />
            <span>{t('harness.skill.copy.conflict.skip')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="conflict"
              value="rename"
              checked={resolution === 'rename'}
              onChange={() => setResolution('rename')}
            />
            <span>{t('harness.skill.copy.conflict.rename')}</span>
          </label>

          {resolution === 'rename' && (
            <div className="ml-6 mt-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                {t('harness.skill.copy.conflict.renameLabel')}
              </label>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                aria-invalid={isInvalid}
              />
              {isInvalid && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {t('harness.skill.copy.conflict.renameInvalid')}
                </p>
              )}
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-800 dark:text-red-200"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.skill.copy.conflict.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isInvalid}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('harness.skill.copy.conflict.submit', { defaultValue: 'Continue' })}
          </button>
        </div>
      </div>
    </div>
  );
}
