/**
 * Story 28.3: Secret-confirmation modal shown before copying an MCP server
 * whose configuration contains values that look like plaintext secrets
 * (Bearer / sk- / AKIA / xoxb / long base64). Triggered by the heuristic in
 * `harnessMcpService.detectSecretsInConfig` — env-variable references
 * (`${TOKEN}`) are excluded. The user must explicitly tick the acknowledgement
 * checkbox before "Copy with secrets" enables.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  /** Dot-paths into the source object (e.g. `env.GITHUB_TOKEN`). */
  secretPaths: string[];
  onConfirm(): void;
  onClose(): void;
}

export function McpSecretConfirmDialog({ secretPaths, onConfirm, onClose }: Props) {
  const { t } = useTranslation('settings');
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-secret-confirm-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50">
          <h2
            id="mcp-secret-confirm-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('harness.mcp.copy.secret.title')}
          </h2>
          <button
            type="button"
            aria-label={t('harness.mcp.copy.secret.cancel', { defaultValue: 'Cancel' })}
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-gray-700 dark:text-gray-200 overflow-y-auto">
          <p>{t('harness.mcp.copy.secret.intro')}</p>
          <ul className="list-disc ml-5 text-xs font-mono">
            {secretPaths.map((path) => (
              <li key={path} className="text-amber-700 dark:text-amber-300">
                {path}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <span>{t('harness.mcp.copy.secret.ack')}</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.mcp.copy.secret.cancel', { defaultValue: 'Cancel' })}
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
            {t('harness.mcp.copy.secret.submit', { defaultValue: 'Copy with secrets' })}
          </button>
        </div>
      </div>
    </div>
  );
}
