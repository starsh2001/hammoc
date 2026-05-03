/**
 * Story 28.6: Three-way copy-conflict dialog for sub-agents.
 *
 * Mirrors the CommandCopyConflictDialog scaffold (Story 28.5) — overwrite /
 * skip / rename. The rename path collects a new agent name that must satisfy
 * the agent name regex (3-50 chars, lowercase letters / digits / hyphens,
 * cannot start or end with a hyphen — AC6.a).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  agentName: string;
  targetScope: 'project' | 'user';
  errorMessage?: string;
  defaultRenameName: string;
  onSubmit(choice: 'overwrite' | 'skip' | 'rename', renameName?: string): void;
  onClose(): void;
}

const AGENT_NAME_RE = /^[a-z][a-z0-9-]{1,48}[a-z0-9]$/;
// eslint-disable-next-line no-control-regex
const RESERVED_RE = /[\\/<>:"|?*\x00-\x1F]/;

function validateRenameName(value: string, original: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'required';
  if (trimmed === original) return 'unchanged';
  if (RESERVED_RE.test(trimmed)) return 'reserved';
  if (!AGENT_NAME_RE.test(trimmed)) return 'pattern';
  return null;
}

export function AgentCopyConflictDialog({
  agentName,
  targetScope,
  errorMessage,
  defaultRenameName,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const [choice, setChoice] = useState<'overwrite' | 'skip' | 'rename'>('overwrite');
  const [renameName, setRenameName] = useState(defaultRenameName);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (choice === 'rename') {
      const err = validateRenameName(renameName, agentName);
      if (err) {
        setRenameError(err);
        return;
      }
    }
    onSubmit(choice, choice === 'rename' ? renameName : undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.agent.copy.conflict.title', {
        defaultValue: 'Agent already exists at target',
      })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.agent.copy.conflict.title', {
            defaultValue: 'Agent already exists at target',
          })}
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t('harness.agent.copy.conflict.intro', {
            name: agentName,
            scope: targetScope,
            defaultValue: `${agentName} already exists in ${targetScope}. Choose what to do:`,
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
              name="agent-copy-conflict"
              value="overwrite"
              checked={choice === 'overwrite'}
              onChange={() => setChoice('overwrite')}
            />
            <span>
              {t('harness.agent.copy.conflict.overwrite', { defaultValue: 'Overwrite' })}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="agent-copy-conflict"
              value="skip"
              checked={choice === 'skip'}
              onChange={() => setChoice('skip')}
            />
            <span>
              {t('harness.agent.copy.conflict.skip', { defaultValue: 'Skip' })}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="agent-copy-conflict"
              value="rename"
              checked={choice === 'rename'}
              onChange={() => setChoice('rename')}
            />
            <span>
              {t('harness.agent.copy.conflict.rename', {
                defaultValue: 'Rename and add',
              })}
            </span>
          </label>
          {choice === 'rename' && (
            <div className="flex flex-col gap-1 ml-6 mt-1">
              <label className="text-xs text-gray-600 dark:text-gray-400">
                {t('harness.agent.copy.conflict.renameNameLabel', {
                  defaultValue: 'New agent name',
                })}
              </label>
              <input
                type="text"
                value={renameName}
                data-testid="agent-rename-input"
                onChange={(e) => {
                  setRenameName(e.target.value);
                  setRenameError(null);
                }}
                className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-sm bg-white dark:bg-gray-800"
                aria-invalid={renameError ? 'true' : 'false'}
              />
              {renameError && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {t(`harness.agent.create.errors.${
                    renameError === 'required'
                      ? 'nameRequired'
                      : renameError === 'unchanged'
                        ? 'nameUnchanged'
                        : 'namePattern'
                  }`, { defaultValue: 'Invalid name.' })}
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
            {t('harness.agent.copy.conflict.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            {t('harness.agent.copy.conflict.submit', { defaultValue: 'Continue' })}
          </button>
        </div>
      </div>
    </div>
  );
}
