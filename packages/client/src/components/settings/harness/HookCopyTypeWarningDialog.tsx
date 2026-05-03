/**
 * Story 28.4: Hook copy type-warning modal — shown as the first step of every
 * hook copy. The modal text differs per `hookType` (command vs. prompt) so the
 * user understands the distinct trust boundaries:
 *   - command: arbitrary shell command will run on every trigger.
 *   - prompt: LLM call on every trigger → cost + latency.
 * If the secret heuristic matched on the source body the dialog also lists the
 * affected paths (`command` / `prompt`).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  hookType: 'command' | 'prompt';
  /** Source body verbatim (no masking) so the user can audit before acknowledging. */
  body: string;
  /** Field names from `detectSecretsInHook` — empty array hides the secret callout. */
  secretPaths: string[];
  onConfirm(): void;
  onClose(): void;
}

export function HookCopyTypeWarningDialog({
  hookType,
  body,
  secretPaths,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const [acknowledged, setAcknowledged] = useState(false);
  const introKey =
    hookType === 'command' ? 'harness.hook.copy.warning.commandIntro' : 'harness.hook.copy.warning.promptIntro';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hook-copy-warning-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50">
          <h2
            id="hook-copy-warning-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('harness.hook.copy.warning.title', { defaultValue: 'Review hook before copying' })}
          </h2>
          <button
            type="button"
            aria-label={t('harness.hook.copy.warning.cancel', { defaultValue: 'Cancel' })}
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-gray-700 dark:text-gray-200 overflow-y-auto">
          <p className="font-medium">{t(introKey)}</p>

          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              {t('harness.hook.copy.warning.bodyPreview', { defaultValue: 'Body:' })}
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2">
              {body}
            </pre>
          </div>

          {secretPaths.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {t('harness.hook.copy.warning.secretPaths', {
                paths: secretPaths.join(', '),
                defaultValue: `Secret-looking values detected at: ${secretPaths.join(', ')}.`,
              })}
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <span>
              {t('harness.hook.copy.warning.ack', {
                defaultValue: 'I have reviewed the body and want to copy.',
              })}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.hook.copy.warning.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!acknowledged) return;
              onConfirm();
            }}
            disabled={!acknowledged}
            className="px-3 py-1.5 text-sm rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('harness.hook.copy.warning.submit', { defaultValue: 'Copy' })}
          </button>
        </div>
      </div>
    </div>
  );
}
