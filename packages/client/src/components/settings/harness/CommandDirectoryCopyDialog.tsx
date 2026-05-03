/**
 * Story 28.5: Directory-level slash-command copy dialog.
 *
 * Resolves bulk-copy conflicts with three strategies (overwrite-all / skip-all
 * / per-file). The per-file mode lists each conflicting target so the user can
 * choose individually.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PerFileDecision {
  decision: 'overwrite' | 'skip' | 'rename';
  renamePath?: string;
}

interface Props {
  sourceDir: string;
  targetDir: string;
  fileCount: number;
  /** Conflicting target relative paths. Empty array → no conflicts (auto-submit). */
  conflicts: string[];
  onSubmit(
    onConflict: 'overwrite-all' | 'skip-all' | 'per-file',
    perFileChoices?: Record<string, 'overwrite' | 'skip' | 'rename'>,
    perFileRenames?: Record<string, string>,
  ): void;
  onClose(): void;
}

export function CommandDirectoryCopyDialog({
  sourceDir,
  targetDir,
  fileCount,
  conflicts,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const [strategy, setStrategy] = useState<'overwrite-all' | 'skip-all' | 'per-file'>(
    conflicts.length === 0 ? 'overwrite-all' : 'overwrite-all',
  );
  const [perFile, setPerFile] = useState<Record<string, PerFileDecision>>(() => {
    const initial: Record<string, PerFileDecision> = {};
    for (const c of conflicts) initial[c] = { decision: 'overwrite' };
    return initial;
  });

  const handleSubmit = () => {
    if (strategy !== 'per-file') {
      onSubmit(strategy);
      return;
    }
    const choices: Record<string, 'overwrite' | 'skip' | 'rename'> = {};
    const renames: Record<string, string> = {};
    for (const [path, dec] of Object.entries(perFile)) {
      choices[path] = dec.decision;
      if (dec.decision === 'rename' && dec.renamePath) {
        renames[path] = dec.renamePath;
      }
    }
    onSubmit('per-file', choices, renames);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.command.copy.directory.title', { defaultValue: 'Copy entire directory' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.command.copy.directory.title', { defaultValue: 'Copy entire directory' })}
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t('harness.command.copy.directory.intro', {
            count: fileCount,
            sourceScope: sourceDir,
            targetScope: targetDir,
            defaultValue: `Copying ${fileCount} commands from ${sourceDir} to ${targetDir}.`,
          })}
        </p>

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cmd-dir-strategy"
              value="overwrite-all"
              checked={strategy === 'overwrite-all'}
              onChange={() => setStrategy('overwrite-all')}
            />
            <span>{t('harness.command.copy.directory.overwriteAll', { defaultValue: 'Overwrite all conflicts' })}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cmd-dir-strategy"
              value="skip-all"
              checked={strategy === 'skip-all'}
              onChange={() => setStrategy('skip-all')}
            />
            <span>{t('harness.command.copy.directory.skipAll', { defaultValue: 'Skip all conflicts' })}</span>
          </label>
          {conflicts.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="cmd-dir-strategy"
                value="per-file"
                checked={strategy === 'per-file'}
                onChange={() => setStrategy('per-file')}
              />
              <span>{t('harness.command.copy.directory.perFile', { defaultValue: 'Decide per file' })}</span>
            </label>
          )}
        </div>

        {strategy === 'per-file' && conflicts.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-2 py-1 text-left">
                    {t('harness.command.copy.directory.perFileTable.file', { defaultValue: 'File' })}
                  </th>
                  <th className="px-2 py-1 text-left">
                    {t('harness.command.copy.directory.perFileTable.decision', { defaultValue: 'Decision' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((path) => (
                  <tr key={path} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-2 py-1 font-mono text-gray-800 dark:text-gray-100 break-all">{path}</td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`decision-${path}`}
                        value={perFile[path]?.decision ?? 'overwrite'}
                        onChange={(e) => {
                          const next = e.target.value as 'overwrite' | 'skip' | 'rename';
                          setPerFile((prev) => ({
                            ...prev,
                            [path]: { decision: next, renamePath: prev[path]?.renamePath },
                          }));
                        }}
                        className="rounded border border-gray-300 dark:border-gray-700 px-1 py-0.5 bg-white dark:bg-gray-800"
                      >
                        <option value="overwrite">overwrite</option>
                        <option value="skip">skip</option>
                        <option value="rename">rename</option>
                      </select>
                      {perFile[path]?.decision === 'rename' && (
                        <input
                          type="text"
                          aria-label={`rename-path-${path}`}
                          placeholder="new/relative/path.md"
                          value={perFile[path]?.renamePath ?? ''}
                          onChange={(e) => {
                            const next = e.target.value;
                            setPerFile((prev) => ({
                              ...prev,
                              [path]: { decision: 'rename', renamePath: next },
                            }));
                          }}
                          className="ml-2 rounded border border-gray-300 dark:border-gray-700 px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
