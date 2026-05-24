/**
 * Story 30.1 (Task 6.3): hard-block dialog shown when the server returns
 * `HARNESS_SECRET_ON_SHARED`. Three actions:
 *
 *   1. Move to local file — re-route the save to a `*.local.<ext>` sibling
 *      (auto-create when missing). Triggered by `onMoveToLocal`.
 *   2. Mark this value as not a secret — single-save opt-out. Triggered by
 *      `onMarkNotSecret`. The opt-out does not persist beyond this attempt.
 *   3. Cancel — return to the editor without saving.
 *
 * Pattern follows `McpSecretConfirmDialog.tsx` for visual consistency, but
 * the semantics differ: this is a HARD block (server enforces) and does not
 * accept simple acknowledgement.
 */

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  /** Path of the file the user attempted to save. Shown in the dialog header. */
  targetPath: string;
  /** Computed `*.local.<ext>` sibling — passed in so the dialog can show it. */
  siblingLocalPath: string;
  /** Whether the sibling will be auto-created on click (vs. already existing). */
  willAutoCreateSibling: boolean;
  /** Detected secret locations (line numbers OR dot-paths). */
  secretLocations?: string[];
  /**
   * Story 30.7 (Task C.0): caller-supplied i18n key for the 1st action
   * button. Defaults to `harness.tools.secretOnShared.action.moveToLocal`
   * (the v0.7 label) so any call site that does not opt into the
   * domain-aware label gets the same visual as before. The router/store
   * decides the label — the dialog only does the `t()` lookup.
   *
   * Visual integrity: layout, color, button placement do not change. Only
   * the label text inside the primary button switches.
   */
  actionLabelKey?: string;
  onMoveToLocal(): void;
  onMarkNotSecret(): void;
  onCancel(): void;
}

export function SecretOnSharedDialog({
  targetPath,
  siblingLocalPath,
  willAutoCreateSibling,
  secretLocations,
  actionLabelKey,
  onMoveToLocal,
  onMarkNotSecret,
  onCancel,
}: Props) {
  const { t } = useTranslation('settings');

  return (
    <div
      data-testid="secret-on-shared-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-on-shared-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50">
          <h2
            id="secret-on-shared-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('harness.tools.secretOnShared.title')}
          </h2>
          <button
            type="button"
            aria-label={t('harness.tools.secretOnShared.action.cancel')}
            onClick={onCancel}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-gray-700 dark:text-gray-200 overflow-y-auto">
          <p>{t('harness.tools.secretOnShared.body')}</p>
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">
            {targetPath}
          </p>
          {secretLocations && secretLocations.length > 0 && (
            <ul className="list-disc ml-5 text-xs font-mono">
              {secretLocations.map((loc) => (
                <li key={loc} className="text-amber-700 dark:text-amber-300">
                  {loc}
                </li>
              ))}
            </ul>
          )}
          {willAutoCreateSibling && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t('harness.tools.secretOnShared.autoCreateSiblingNotice', {
                path: siblingLocalPath,
              })}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50">
          <button
            type="button"
            data-testid="secret-on-shared-cancel"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.tools.secretOnShared.action.cancel')}
          </button>
          <button
            type="button"
            data-testid="secret-on-shared-mark-not-secret"
            onClick={onMarkNotSecret}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.tools.secretOnShared.action.markNotSecret')}
          </button>
          <button
            type="button"
            data-testid="secret-on-shared-move-to-local"
            onClick={onMoveToLocal}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white"
          >
            {t(actionLabelKey ?? 'harness.tools.secretOnShared.action.moveToLocal')}
          </button>
        </div>
      </div>
    </div>
  );
}
