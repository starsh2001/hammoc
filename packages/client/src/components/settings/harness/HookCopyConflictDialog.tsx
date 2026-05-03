/**
 * Story 28.4: Hook copy conflict dialog — surfaces when the target scope
 * already contains a hook with the same matcher AND identical body. Three
 * resolutions: overwrite the existing entry, skip silently, or duplicate
 * (intentional). Hook entries have no name, so a "rename" path does not exist.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  targetScope: 'project' | 'user';
  errorMessage?: string | null;
  onSubmit(resolution: 'overwrite' | 'skip' | 'duplicate'): void;
  onClose(): void;
}

export function HookCopyConflictDialog({ targetScope, errorMessage, onSubmit, onClose }: Props) {
  const { t } = useTranslation('settings');
  const [resolution, setResolution] = useState<'overwrite' | 'skip' | 'duplicate'>('overwrite');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hook-copy-conflict-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50">
          <h2
            id="hook-copy-conflict-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('harness.hook.copy.conflict.title', {
              defaultValue: 'An identical hook already exists',
            })}
          </h2>
          <button
            type="button"
            aria-label={t('harness.hook.copy.conflict.close', { defaultValue: 'Close' })}
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-gray-700 dark:text-gray-200 overflow-y-auto">
          <p>
            {t('harness.hook.copy.conflict.intro', {
              targetScope: t(`harness.hook.scopeBadge.${targetScope}`),
              defaultValue: `An entry with the same matcher and body already exists in ${targetScope}.`,
            })}
          </p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="hook-conflict"
              value="overwrite"
              checked={resolution === 'overwrite'}
              onChange={() => setResolution('overwrite')}
            />
            <span>{t('harness.hook.copy.conflict.overwrite')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="hook-conflict"
              value="skip"
              checked={resolution === 'skip'}
              onChange={() => setResolution('skip')}
            />
            <span>{t('harness.hook.copy.conflict.skip')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="hook-conflict"
              value="duplicate"
              checked={resolution === 'duplicate'}
              onChange={() => setResolution('duplicate')}
            />
            <span>{t('harness.hook.copy.conflict.duplicate')}</span>
          </label>

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
            {t('harness.hook.copy.conflict.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={() => onSubmit(resolution)}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white"
          >
            {t('harness.hook.copy.conflict.submit', { defaultValue: 'Continue' })}
          </button>
        </div>
      </div>
    </div>
  );
}
