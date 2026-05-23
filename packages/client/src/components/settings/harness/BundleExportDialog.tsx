/**
 * Story 30.6 (Task C.1): Export bundle dialog.
 *
 * Section checkboxes + 3-radio secrets policy + (included-explicit only) the
 * 2-stage acknowledgement defence: a filename notice, a confirm checkbox,
 * and a 5-second post-download toast. The active plugin list previews
 * `pluginDependencies` so the user can see what the importer will need.
 *
 * The dialog is store-driven — `bundleStore.exportDialogOpen` decides
 * whether it renders, and `bundleStore.close()` closes it. Parent components
 * only need to mount this once.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { BUNDLE_SECTIONS, type BundleSection, type SecretsPolicy } from '@hammoc/shared';
import { useHarnessBundleStore } from '../../../stores/harnessBundleStore';

interface Props {
  projectSlug: string;
  /** When true, also offer the `bmad` section toggle (default false). */
  bmadEnabled?: boolean;
}

const SECRETS_POLICIES: readonly SecretsPolicy[] = [
  'excluded',
  'placeholder',
  'included-explicit',
] as const;

const POLICY_I18N_KEY: Record<SecretsPolicy, string> = {
  excluded: 'excluded',
  placeholder: 'placeholder',
  'included-explicit': 'includedExplicit',
};

const POLICY_DETAIL_KEY: Record<SecretsPolicy, string> = {
  excluded: 'excludedDetail',
  placeholder: 'placeholderDetail',
  'included-explicit': 'includedExplicitDetail',
};

export function BundleExportDialog({ projectSlug, bmadEnabled = false }: Props) {
  const { t } = useTranslation('settings');
  const open = useHarnessBundleStore((s) => s.exportDialogOpen);
  const exportConfig = useHarnessBundleStore((s) => s.exportConfig);
  const exportPluginDeps = useHarnessBundleStore((s) => s.exportPluginDeps);
  const isExporting = useHarnessBundleStore((s) => s.isExporting);
  const lastExportSuccess = useHarnessBundleStore((s) => s.lastExportSuccess);
  const error = useHarnessBundleStore((s) => s.error);
  const toggleSection = useHarnessBundleStore((s) => s.toggleSection);
  const setSecretsPolicy = useHarnessBundleStore((s) => s.setSecretsPolicy);
  const setAck = useHarnessBundleStore((s) => s.setAcknowledgedSecretInclusion);
  const executeExport = useHarnessBundleStore((s) => s.executeExport);
  const clearExportSuccess = useHarnessBundleStore((s) => s.clearExportSuccess);
  const close = useHarnessBundleStore((s) => s.close);

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && closeBtnRef.current) closeBtnRef.current.focus();
  }, [open]);

  // Fire the included-explicit 5-second toast exactly once when the
  // download completes, then clear the success payload so re-renders do not
  // duplicate the toast.
  useEffect(() => {
    if (!lastExportSuccess) return;
    if (lastExportSuccess.hadPlaintextSecrets) {
      toast(t('harness.tools.bundle.secretsPolicy.includedExplicitDownloadToast'), {
        duration: 5000,
      });
    } else {
      toast.success(
        t('harness.tools.bundle.export.downloadSuccess', { filename: lastExportSuccess.filename }),
      );
    }
    clearExportSuccess();
  }, [lastExportSuccess, t, clearExportSuccess]);

  if (!open) return null;

  const visibleSections: BundleSection[] = BUNDLE_SECTIONS.filter(
    (s) => bmadEnabled || s !== 'bmad',
  );

  const policy = exportConfig.secretsPolicy;
  const needsAck = policy === 'included-explicit';
  const isExportEnabled =
    !isExporting && exportConfig.includes.length > 0 && (!needsAck || exportConfig.acknowledgedSecretInclusion);

  const handleExport = async () => {
    try {
      await executeExport(projectSlug);
    } catch {
      /* error is surfaced via the store; the banner shows the message. */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-export-title"
      data-testid="bundle-export-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-xl rounded-lg bg-white dark:bg-gray-900 shadow-xl flex flex-col max-h-[90vh] mx-4">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="bundle-export-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('harness.tools.bundle.export.title')}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            aria-label="Close"
            onClick={close}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm text-gray-700 dark:text-gray-200">
          {error && (
            <div
              role="alert"
              data-testid="bundle-export-error"
              className="px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
            >
              {error}
            </div>
          )}

          <fieldset>
            <legend className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">
              {t('harness.tools.bundle.export.includesLabel')}
            </legend>
            <div className="flex flex-col gap-1.5">
              {visibleSections.map((section) => {
                const checked = exportConfig.includes.includes(section);
                return (
                  <label key={section} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid={`bundle-export-section-${section}`}
                      checked={checked}
                      onChange={(e) => toggleSection(section, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>{section}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">
              {t('harness.tools.bundle.export.secretsPolicyLabel')}
            </legend>
            <div className="flex flex-col gap-2">
              {SECRETS_POLICIES.map((p) => (
                <label key={p} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bundle-export-secrets-policy"
                    data-testid={`bundle-export-policy-${p}`}
                    value={p}
                    checked={policy === p}
                    onChange={() => setSecretsPolicy(p)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {t(`harness.tools.bundle.secretsPolicy.${POLICY_I18N_KEY[p]}`)}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {t(`harness.tools.bundle.secretsPolicy.${POLICY_DETAIL_KEY[p]}`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {needsAck && (
            <div
              data-testid="bundle-export-included-explicit-block"
              className="px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 space-y-2"
            >
              <p className="text-xs">
                {t('harness.tools.bundle.secretsPolicy.includedExplicitFilenameNotice')}
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  data-testid="bundle-export-ack"
                  checked={exportConfig.acknowledgedSecretInclusion}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-sm">
                  {t('harness.tools.bundle.secretsPolicy.includedExplicitConfirm')}
                </span>
              </label>
            </div>
          )}

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">
              {t('harness.tools.bundle.pluginDependencies.bannerTitle')}
            </h3>
            {exportPluginDeps.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">—</p>
            ) : (
              <ul className="text-xs space-y-1" data-testid="bundle-export-plugin-deps">
                {exportPluginDeps.map((p) => (
                  <li key={`${p.name}@${p.marketplace}`}>
                    {t('harness.tools.bundle.pluginDependencies.missingLabel', {
                      name: p.name,
                      marketplace: p.marketplace,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 text-sm rounded text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            data-testid="bundle-export-submit"
            disabled={!isExportEnabled}
            onClick={() => void handleExport()}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
          >
            {isExporting
              ? t('harness.tools.bundle.export.exporting')
              : t('harness.tools.bundle.export.exportButton')}
          </button>
        </footer>
      </div>
    </div>
  );
}
