/**
 * Story 30.6 (Task C.2): Import bundle dialog — 4-step wizard.
 *
 *   1. select   — file drop / browse
 *   2. scanning — preview request in flight
 *   3. preview  — per-item status badges + action selectboxes + bulk actions,
 *                 with banners for plugin deps / unknown sections /
 *                 included-explicit incoming bundles
 *   4. applying — apply request in flight; success closes the dialog
 *
 * Compatibility branches (`future` / `invalid` / `malformed`) block the
 * preview step and surface a dedicated modal so the user knows why the
 * bundle was rejected. The included-explicit incoming acknowledge is a
 * step gate before the preview body renders.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import type {
  ImportCompatibility,
  ImportItemAction,
  ImportPreviewItem,
} from '@hammoc/shared';
import { useHarnessBundleStore } from '../../../stores/harnessBundleStore';

interface Props {
  projectSlug: string;
}

const BLOCKED_COMPATIBILITIES: readonly ImportCompatibility[] = [
  'future',
  'invalid',
  'malformed',
] as const;

function isBlockedCompatibility(c: ImportCompatibility | undefined): c is 'future' | 'invalid' | 'malformed' {
  return c !== undefined && (BLOCKED_COMPATIBILITIES as readonly string[]).includes(c);
}

export function BundleImportDialog({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const open = useHarnessBundleStore((s) => s.importDialogOpen);
  const step = useHarnessBundleStore((s) => s.importStep);
  const preview = useHarnessBundleStore((s) => s.importPreviewResponse);
  const itemActions = useHarnessBundleStore((s) => s.importItemActions);
  const acknowledged = useHarnessBundleStore((s) => s.importAcknowledged);
  const isImporting = useHarnessBundleStore((s) => s.isImporting);
  const lastImportSummary = useHarnessBundleStore((s) => s.lastImportSummary);
  const error = useHarnessBundleStore((s) => s.error);

  const loadImportPreview = useHarnessBundleStore((s) => s.loadImportPreview);
  const acknowledgeImport = useHarnessBundleStore((s) => s.acknowledgeImport);
  const setItemAction = useHarnessBundleStore((s) => s.setItemAction);
  const applyBulkAction = useHarnessBundleStore((s) => s.applyBulkAction);
  const executeImport = useHarnessBundleStore((s) => s.executeImport);
  const clearImportSummary = useHarnessBundleStore((s) => s.clearImportSummary);
  const close = useHarnessBundleStore((s) => s.close);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && closeBtnRef.current) closeBtnRef.current.focus();
  }, [open]);

  // Fire the apply-success toast once, then close the dialog. The store
  // already cleared isImporting before this effect runs.
  useEffect(() => {
    if (!lastImportSummary) return;
    toast.success(
      t('harness.tools.bundle.importPreview.applySuccess', {
        applied: lastImportSummary.applied,
        skipped: lastImportSummary.skipped,
        renamed: lastImportSummary.renamed,
      }),
    );
    clearImportSummary();
    close();
  }, [lastImportSummary, t, clearImportSummary, close]);

  if (!open) return null;

  const compatibility = preview?.compatibility;
  const showCompatibilityBlock = isBlockedCompatibility(compatibility);
  const manifestPolicy = preview?.manifest.secretsPolicy;
  const needsIncomingAck = !!preview && manifestPolicy === 'included-explicit' && !acknowledged;
  const missingPlugins = preview?.preview.missingPlugins ?? [];
  const unknownSections = preview?.preview.unknownSections ?? [];

  const handleFileChosen = async (file: File | null) => {
    if (!file) return;
    try {
      await loadImportPreview(projectSlug, file);
      const fresh = useHarnessBundleStore.getState().importPreviewResponse;
      // Fire side-channel toasts that mirror the manifest's secrets policy —
      // gives the user a one-line cue about how the bundle was sanitised.
      if (fresh?.manifest.secretsPolicy === 'excluded') {
        toast(t('harness.tools.bundle.secretsPolicy.excludedImportToast'));
      } else if (fresh?.manifest.secretsPolicy === 'placeholder') {
        toast(t('harness.tools.bundle.secretsPolicy.placeholderImportToast'));
      }
    } catch {
      /* error is in the store; the select-step banner surfaces it. */
    }
  };

  const handleApply = async () => {
    try {
      await executeImport(projectSlug);
    } catch (err) {
      // AC3.f — apply failure surfaces a distinct toast so the user can tell
      // "we rolled back before touching anything" (applyAbort) apart from
      // "N items were written, then reverted in reverse snapshot order"
      // (applyPartialRollback). The Story 30.5 server currently returns only
      // `{ error: { code, message } }` without a per-item count, so the
      // default branch is `applyAbort`. If a future server contract echoes a
      // numeric `appliedBeforeRollback` via `ApiError.details`, this branch
      // activates the partial-rollback variant without any further wiring.
      const partialCount = extractAppliedBeforeRollback(err);
      if (partialCount > 0) {
        toast.error(
          t('harness.tools.bundle.importPreview.applyPartialRollback', {
            count: partialCount,
          }),
        );
      } else {
        toast.error(t('harness.tools.bundle.importPreview.applyAbort'));
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-import-title"
      data-testid="bundle-import-dialog"
      data-step={step}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-900 shadow-xl flex flex-col max-h-[90vh] mx-4">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="bundle-import-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('harness.tools.bundle.importPreview.title')}
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

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm text-gray-700 dark:text-gray-200">
          {/* Step 1 — file select (also visible after a failed preview) */}
          {(step === 'select' || step === 'scanning') && (
            <section>
              {error && (
                <div
                  role="alert"
                  data-testid="bundle-import-error"
                  className="mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                >
                  {error}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                data-testid="bundle-import-file-input"
                onChange={(e) => void handleFileChosen(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              {step === 'scanning' && (
                <p
                  className="mt-2 text-xs text-gray-500 dark:text-gray-400"
                  data-testid="bundle-import-scanning"
                >
                  {t('harness.tools.bundle.export.exporting')}
                </p>
              )}
            </section>
          )}

          {/* Compatibility block — `future` / `invalid` / `malformed` */}
          {(step === 'preview' || step === 'applying') && showCompatibilityBlock && (
            <CompatibilityBlock
              compatibility={compatibility!}
              detail={preview?.compatibilityDetail}
            />
          )}

          {/* Included-explicit incoming acknowledge — gates the preview body */}
          {(step === 'preview' || step === 'applying') &&
            !showCompatibilityBlock &&
            needsIncomingAck && (
              <div
                data-testid="bundle-import-incoming-ack"
                className="px-3 py-3 rounded border border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 space-y-2"
              >
                <p className="font-medium">
                  {t('harness.tools.bundle.secretsPolicy.importIncludedSecretsWarning')}
                </p>
                <button
                  type="button"
                  data-testid="bundle-import-incoming-ack-button"
                  onClick={acknowledgeImport}
                  className="px-3 py-1.5 text-sm rounded bg-amber-700 text-white hover:bg-amber-800"
                >
                  {t('harness.tools.bundle.secretsPolicy.includedExplicitConfirm')}
                </button>
              </div>
            )}

          {/* Plugin deps banner */}
          {(step === 'preview' || step === 'applying') &&
            !showCompatibilityBlock &&
            !needsIncomingAck &&
            missingPlugins.length > 0 && (
              <div
                role="alert"
                data-testid="bundle-import-missing-plugins"
                className="px-3 py-2 rounded border border-red-400 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200 space-y-2"
              >
                <p className="font-medium">
                  {t('harness.tools.bundle.pluginDependencies.bannerTitle')}
                </p>
                <p className="text-xs">
                  {t('harness.tools.bundle.pluginDependencies.bannerDetail', {
                    total: preview?.manifest.pluginDependencies.length ?? missingPlugins.length,
                    missing: missingPlugins.length,
                  })}
                </p>
                <ul className="text-xs space-y-1">
                  {missingPlugins.map((p) => (
                    <li
                      key={`${p.name}@${p.marketplace}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {t('harness.tools.bundle.pluginDependencies.missingLabel', {
                          name: p.name,
                          marketplace: p.marketplace,
                        })}
                      </span>
                      <button
                        type="button"
                        data-testid={`bundle-import-install-${p.name}`}
                        onClick={() =>
                          toast(
                            t('harness.tools.bundle.pluginDependencies.installFallbackToast', {
                              name: p.name,
                              marketplace: p.marketplace,
                            }),
                          )
                        }
                        className="px-2 py-1 text-xs rounded bg-red-700 text-white hover:bg-red-800"
                      >
                        {t('harness.tools.bundle.pluginDependencies.installCta')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Unknown sections warning */}
          {(step === 'preview' || step === 'applying') &&
            !showCompatibilityBlock &&
            !needsIncomingAck &&
            unknownSections.length > 0 && (
              <div
                role="alert"
                data-testid="bundle-import-unknown-sections"
                className="px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
              >
                {unknownSections.map((name) => (
                  <p key={name} className="text-xs">
                    {t('harness.tools.bundle.compat.unknownSectionWarning', { name })}
                  </p>
                ))}
              </div>
            )}

          {/* Preview body — item table + bulk actions */}
          {(step === 'preview' || step === 'applying') &&
            !showCompatibilityBlock &&
            !needsIncomingAck &&
            preview && (
              <PreviewBody
                items={preview.preview.items}
                itemActions={itemActions}
                onItemAction={setItemAction}
                onBulkAction={applyBulkAction}
              />
            )}

          {/* In-flight apply banner */}
          {step === 'applying' && (
            <p
              className="text-xs text-gray-500 dark:text-gray-400"
              data-testid="bundle-import-applying"
            >
              {t('harness.tools.bundle.importPreview.applying')}
            </p>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 text-sm rounded text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          {step === 'preview' && !showCompatibilityBlock && !needsIncomingAck && (
            <button
              type="button"
              data-testid="bundle-import-apply"
              disabled={isImporting}
              onClick={() => void handleApply()}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-300 disabled:text-gray-500"
            >
              {isImporting
                ? t('harness.tools.bundle.importPreview.applying')
                : t('harness.tools.bundle.importPreview.applyButton')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ----- helpers -------------------------------------------------------------

/**
 * Peek at the apply-error's `details` payload for a numeric count that the
 * server may have set when it managed to write some items before rolling
 * back. Returns 0 when the field is absent / non-numeric so the caller can
 * fall back to the unconditional "abort" toast. Treats the ApiError shape
 * structurally (rather than importing) so the test harness can fake the
 * error without instantiating the real class.
 */
function extractAppliedBeforeRollback(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const maybeDetails = (err as { details?: unknown }).details;
  if (!maybeDetails || typeof maybeDetails !== 'object') return 0;
  const value = (maybeDetails as { appliedBeforeRollback?: unknown }).appliedBeforeRollback;
  return typeof value === 'number' && value > 0 ? value : 0;
}

interface PreviewBodyProps {
  items: ImportPreviewItem[];
  itemActions: Record<string, ImportItemAction>;
  onItemAction(itemId: string, action: ImportItemAction): void;
  onBulkAction(action: 'overwrite' | 'skip' | 'addOnly'): void;
}

function PreviewBody({ items, itemActions, onItemAction, onBulkAction }: PreviewBodyProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-3" data-testid="bundle-import-preview-body">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="bundle-import-bulk-overwrite"
          onClick={() => onBulkAction('overwrite')}
          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {t('harness.tools.bundle.importPreview.bulkOverwrite')}
        </button>
        <button
          type="button"
          data-testid="bundle-import-bulk-skip"
          onClick={() => onBulkAction('skip')}
          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {t('harness.tools.bundle.importPreview.bulkSkip')}
        </button>
        <button
          type="button"
          data-testid="bundle-import-bulk-addonly"
          onClick={() => onBulkAction('addOnly')}
          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {t('harness.tools.bundle.importPreview.bulkAddOnly')}
        </button>
      </div>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {items.map((item) => {
          const key = `${item.domain}:${item.identity}`;
          const action = itemActions[key] ?? item.defaultAction;
          // Only the CLAUDE.md domain may use appendSection — the spec
          // gates the option in the selectbox at AC3.d.
          const allowAppend = item.domain === 'claude-md';
          return (
            <li
              key={key}
              data-testid={`bundle-import-item-${key}`}
              data-status={item.status}
              className="py-1.5 flex items-center gap-2"
            >
              <StatusBadge status={item.status} />
              <div className="flex-1 min-w-0">
                <p className="font-mono truncate">{item.targetPath}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {item.domain} · {item.identity}
                </p>
              </div>
              <select
                data-testid={`bundle-import-action-${key}`}
                value={action}
                onChange={(e) => onItemAction(key, e.target.value as ImportItemAction)}
                className="text-xs border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 bg-white dark:bg-gray-800"
              >
                <option value="overwrite">
                  {t('harness.tools.bundle.importPreview.actionOverwrite')}
                </option>
                <option value="skip">
                  {t('harness.tools.bundle.importPreview.actionSkip')}
                </option>
                <option value="rename">
                  {t('harness.tools.bundle.importPreview.actionRename')}
                </option>
                {allowAppend && (
                  <option value="appendSection">
                    {t('harness.tools.bundle.importPreview.actionAppendSection')}
                  </option>
                )}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STATUS_LABEL_KEY: Record<ImportPreviewItem['status'], string> = {
  new: 'statusNew',
  overwrite: 'statusOverwrite',
  same: 'statusSame',
  conflict: 'statusConflict',
};

const STATUS_CLASS: Record<ImportPreviewItem['status'], string> = {
  new: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  overwrite: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  same: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  conflict: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

function StatusBadge({ status }: { status: ImportPreviewItem['status'] }) {
  const { t } = useTranslation('settings');
  return (
    <span
      data-testid={`bundle-import-status-${status}`}
      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_CLASS[status]}`}
    >
      {t(`harness.tools.bundle.importPreview.${STATUS_LABEL_KEY[status]}`)}
    </span>
  );
}

interface CompatibilityBlockProps {
  compatibility: 'future' | 'invalid' | 'malformed';
  detail?: {
    bundleVersion?: number;
    jsonError?: string;
    issues?: Array<{ path: (string | number)[]; message: string }>;
  };
}

function CompatibilityBlock({ compatibility, detail }: CompatibilityBlockProps) {
  const { t } = useTranslation('settings');
  return (
    <div
      role="alert"
      data-testid={`bundle-import-compat-${compatibility}`}
      className="px-3 py-3 rounded border border-red-400 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200 space-y-2"
    >
      {compatibility === 'future' && (
        <>
          <p className="font-medium">{t('harness.tools.bundle.compat.futureBundleTitle')}</p>
          <p className="text-xs">
            {t('harness.tools.bundle.compat.futureBundleDetail', {
              bundleVersion: detail?.bundleVersion ?? '?',
            })}
          </p>
        </>
      )}
      {compatibility === 'invalid' && (
        <p className="font-medium">{t('harness.tools.bundle.compat.invalidBundleTitle')}</p>
      )}
      {compatibility === 'malformed' && (
        <>
          <p className="font-medium">{t('harness.tools.bundle.compat.malformedManifestTitle')}</p>
          <p className="text-xs">{t('harness.tools.bundle.compat.malformedManifestDetail')}</p>
          {(detail?.jsonError || (detail?.issues && detail.issues.length > 0)) && (
            <details className="text-xs">
              <summary className="cursor-pointer">Details</summary>
              {detail?.jsonError && <p className="font-mono break-all">{detail.jsonError}</p>}
              {detail?.issues && (
                <ul className="font-mono">
                  {detail.issues.map((iss, i) => (
                    <li key={i}>
                      {iss.path.join('.')}: {iss.message}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )}
        </>
      )}
    </div>
  );
}
