/**
 * Story 31.4 (C.3): Copy-only install / uninstall / marketplace-add guide modal.
 *
 * Renders the `/plugin …` command block + a copy button. There are NO
 * spike-gated action buttons: spike #1 (negative) means `/plugin` is not
 * interpreted in the Hammoc chat (SDK) session, and spike #2 (negative) means
 * direct-install automation is unsafe — so the guaranteed path is copy-to-CLI
 * only. The `add` mode adds a URL input that builds the
 * `/plugin marketplace add <url>` command live. (AC2.a / AC3 / AC4)
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type GuideMode = 'install' | 'uninstall' | 'add';

interface Props {
  mode: GuideMode;
  /** "<name>@<marketplace>" — required for install/uninstall. */
  entryKey?: string;
  onClose: () => void;
}

function buildCommand(mode: GuideMode, entryKey: string | undefined, url: string): string {
  if (mode === 'add') return `/plugin marketplace add ${url || '<url>'}`;
  if (mode === 'uninstall') return `/plugin uninstall ${entryKey ?? ''}`.trim();
  return `/plugin install ${entryKey ?? ''}`.trim();
}

export function InstallGuideModal({ mode, entryKey, onClose }: Props) {
  const { t } = useTranslation('settings');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const command = buildCommand(mode, entryKey, url.trim());
  const titleKey =
    mode === 'add'
      ? 'harness.marketplace.modal.addTitle'
      : mode === 'uninstall'
        ? 'harness.marketplace.modal.uninstallTitle'
        : 'harness.marketplace.modal.installTitle';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard denied — the command text is still visible to select manually
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        data-testid="marketplace-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t(titleKey)}
        className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t(titleKey)}</h3>
          <button
            type="button"
            data-testid="marketplace-modal-close"
            aria-label={t('harness.marketplace.modal.close')}
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400">
          {t('harness.marketplace.modal.cliHint')}
        </p>

        {mode === 'add' && (
          <label className="flex flex-col gap-1 text-xs text-gray-700 dark:text-gray-300">
            {t('harness.marketplace.modal.addUrlLabel')}
            <input
              type="url"
              data-testid="marketplace-modal-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('harness.marketplace.modal.addUrlPlaceholder')}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-800 dark:text-gray-100"
            />
          </label>
        )}

        <div className="flex items-stretch gap-2">
          <code
            data-testid="marketplace-modal-command"
            className="flex-1 overflow-x-auto rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-100 whitespace-pre"
          >
            {command}
          </code>
          <button
            type="button"
            data-testid="marketplace-modal-copy"
            onClick={handleCopy}
            className="shrink-0 inline-flex items-center rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white"
          >
            {copied ? t('harness.marketplace.modal.copied') : t('harness.marketplace.modal.copy')}
          </button>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {t('harness.marketplace.modal.cliOnlyNote')}
        </p>
      </div>
    </div>
  );
}
