/**
 * Story 30.6 (Task B): client store for the harness Export/Import bundle
 * workbench dialogs.
 *
 * Single source of truth for:
 *   - Export dialog open state + per-section toggles + secrets policy radio +
 *     the included-explicit acknowledgement checkbox + pre-fetched plugin deps.
 *   - Import dialog open state + the 4-step wizard cursor + the entire
 *     `ImportPreviewResponse` (preserves `bundleToken` so apply can echo it) +
 *     per-item action selectbox + the included-explicit incoming acknowledge.
 *
 * Patterns follow `harnessLintStore.ts` (Story 30.2) — the dialogs subscribe
 * to `*DialogOpen` flags instead of receiving open/onClose props, so the
 * dialog lifecycle stays inside this store.
 */

import { create } from 'zustand';
import {
  BUNDLE_SECTIONS,
  type BundlePluginRef,
  type BundleSection,
  type ImportApplySummary,
  type ImportItemAction,
  type ImportPreviewResponse,
  type SecretsPolicy,
} from '@hammoc/shared';
import {
  exportBundle,
  fetchPluginDeps,
  importApply,
  importPreview,
} from '../services/api/harnessBundleApi';

/**
 * Wizard cursor for the Import dialog. Matches the 4-step flow in AC3.a:
 *   1. `select` — drop / browse for a ZIP
 *   2. `scanning` — preview request in flight
 *   3. `preview` — dry-run results with per-item action selectboxes
 *   4. `applying` — apply request in flight (success closes the dialog)
 */
export type ImportWizardStep = 'select' | 'scanning' | 'preview' | 'applying';

export interface BundleExportConfig {
  includes: BundleSection[];
  secretsPolicy: SecretsPolicy;
  acknowledgedSecretInclusion: boolean;
}

const DEFAULT_EXPORT_CONFIG: BundleExportConfig = {
  includes: [...BUNDLE_SECTIONS],
  secretsPolicy: 'excluded',
  acknowledgedSecretInclusion: false,
};

export interface ExportSuccessPayload {
  filename: string;
  hadPlaintextSecrets: boolean;
}

interface HarnessBundleStoreState {
  // Export ---------------------------------------------------------------
  exportDialogOpen: boolean;
  exportConfig: BundleExportConfig;
  exportPluginDeps: BundlePluginRef[];
  isExporting: boolean;
  /** Filled when `executeExport` resolves so the dialog can fire its toast. */
  lastExportSuccess: ExportSuccessPayload | null;

  // Import ---------------------------------------------------------------
  importDialogOpen: boolean;
  importStep: ImportWizardStep;
  importPreviewResponse: ImportPreviewResponse | null;
  importItemActions: Record<string, ImportItemAction>;
  /** included-explicit incoming bundle requires an explicit acknowledge. */
  importAcknowledged: boolean;
  isImporting: boolean;
  lastImportSummary: ImportApplySummary | null;

  // Shared ---------------------------------------------------------------
  error: string | null;

  // Actions --------------------------------------------------------------
  openExport(projectSlug: string): Promise<void>;
  toggleSection(section: BundleSection, included: boolean): void;
  setSecretsPolicy(policy: SecretsPolicy): void;
  setAcknowledgedSecretInclusion(v: boolean): void;
  executeExport(projectSlug: string): Promise<void>;
  clearExportSuccess(): void;

  openImport(): void;
  loadImportPreview(projectSlug: string, file: File): Promise<void>;
  acknowledgeImport(): void;
  setItemAction(itemId: string, action: ImportItemAction): void;
  applyBulkAction(action: 'overwrite' | 'skip' | 'addOnly'): void;
  executeImport(projectSlug: string): Promise<void>;
  clearImportSummary(): void;

  close(): void;
}

/**
 * Builds the per-item action map from a preview response — keys are the
 * `<domain>:<identity>` composite that the server expects in the apply
 * request body (matches `ImportApplyRequest.itemActions`).
 */
function buildItemActionsFromPreview(
  preview: ImportPreviewResponse,
): Record<string, ImportItemAction> {
  const out: Record<string, ImportItemAction> = {};
  for (const item of preview.preview.items) {
    out[`${item.domain}:${item.identity}`] = item.defaultAction;
  }
  return out;
}

/**
 * Triggers a browser download of the export ZIP by synthesising an anchor
 * click. We revoke the object URL on the next tick to free memory once the
 * browser has handed the file to the user.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Some browsers require the anchor to be in the DOM for `.click()` to fire.
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const useHarnessBundleStore = create<HarnessBundleStoreState>((set, get) => ({
  exportDialogOpen: false,
  exportConfig: { ...DEFAULT_EXPORT_CONFIG, includes: [...DEFAULT_EXPORT_CONFIG.includes] },
  exportPluginDeps: [],
  isExporting: false,
  lastExportSuccess: null,

  importDialogOpen: false,
  importStep: 'select',
  importPreviewResponse: null,
  importItemActions: {},
  importAcknowledged: false,
  isImporting: false,
  lastImportSummary: null,

  error: null,

  async openExport(projectSlug) {
    set({
      exportDialogOpen: true,
      exportConfig: { ...DEFAULT_EXPORT_CONFIG, includes: [...DEFAULT_EXPORT_CONFIG.includes] },
      exportPluginDeps: [],
      lastExportSuccess: null,
      error: null,
    });
    try {
      const result = await fetchPluginDeps(projectSlug);
      set({ exportPluginDeps: result.pluginDependencies });
    } catch (err) {
      // Plugin deps prefetch failing should not block the dialog — surface
      // as a non-blocking error so the export can still proceed.
      set({ error: extractErrorMessage(err) });
    }
  },

  toggleSection(section, included) {
    const current = get().exportConfig;
    const includes = included
      ? Array.from(new Set([...current.includes, section]))
      : current.includes.filter((s) => s !== section);
    set({ exportConfig: { ...current, includes } });
  },

  setSecretsPolicy(policy) {
    const current = get().exportConfig;
    // Switching away from included-explicit always resets the ack flag so a
    // stale acknowledgement can never carry over.
    const ack = policy === 'included-explicit' ? current.acknowledgedSecretInclusion : false;
    set({
      exportConfig: { ...current, secretsPolicy: policy, acknowledgedSecretInclusion: ack },
    });
  },

  setAcknowledgedSecretInclusion(v) {
    const current = get().exportConfig;
    set({ exportConfig: { ...current, acknowledgedSecretInclusion: v } });
  },

  async executeExport(projectSlug) {
    const config = get().exportConfig;
    set({ isExporting: true, error: null, lastExportSuccess: null });
    try {
      const result = await exportBundle({
        projectSlug,
        includes: config.includes,
        secretsPolicy: config.secretsPolicy,
        acknowledgedSecretInclusion:
          config.secretsPolicy === 'included-explicit'
            ? config.acknowledgedSecretInclusion
            : undefined,
      });
      triggerBlobDownload(result.blob, result.filename);
      set({
        isExporting: false,
        lastExportSuccess: {
          filename: result.filename,
          hadPlaintextSecrets: config.secretsPolicy === 'included-explicit',
        },
      });
    } catch (err) {
      set({ isExporting: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  clearExportSuccess() {
    set({ lastExportSuccess: null });
  },

  openImport() {
    set({
      importDialogOpen: true,
      importStep: 'select',
      importPreviewResponse: null,
      importItemActions: {},
      importAcknowledged: false,
      lastImportSummary: null,
      error: null,
    });
  },

  async loadImportPreview(projectSlug, file) {
    set({ importStep: 'scanning', error: null });
    try {
      const response = await importPreview(projectSlug, file);
      // Reset the acknowledge flag every time a new bundle is scanned —
      // a previous bundle's acknowledgement cannot carry over (AC3.g).
      set({
        importStep: 'preview',
        importPreviewResponse: response,
        importItemActions: buildItemActionsFromPreview(response),
        importAcknowledged: false,
      });
    } catch (err) {
      set({ importStep: 'select', error: extractErrorMessage(err) });
      throw err;
    }
  },

  acknowledgeImport() {
    set({ importAcknowledged: true });
  },

  setItemAction(itemId, action) {
    const current = get().importItemActions;
    set({ importItemActions: { ...current, [itemId]: action } });
  },

  applyBulkAction(action) {
    const preview = get().importPreviewResponse;
    if (!preview) return;
    const next: Record<string, ImportItemAction> = {};
    for (const item of preview.preview.items) {
      const key = `${item.domain}:${item.identity}`;
      if (action === 'addOnly') {
        // "Add new only" — accept items that are new, leave existing alone.
        next[key] = item.status === 'new' ? 'overwrite' : 'skip';
      } else if (action === 'overwrite') {
        // `same` items are a no-op even when bulk-overwrite is selected; the
        // server would treat overwrite-on-equal-bytes as skip anyway.
        next[key] = item.status === 'same' ? 'skip' : 'overwrite';
      } else {
        next[key] = 'skip';
      }
    }
    set({ importItemActions: next });
  },

  async executeImport(projectSlug) {
    const preview = get().importPreviewResponse;
    if (!preview) return;
    set({ isImporting: true, importStep: 'applying', error: null });
    try {
      const summary = await importApply({
        projectSlug,
        bundleToken: preview.bundleToken,
        itemActions: get().importItemActions,
      });
      set({ isImporting: false, lastImportSummary: summary });
    } catch (err) {
      set({ isImporting: false, importStep: 'preview', error: extractErrorMessage(err) });
      throw err;
    }
  },

  clearImportSummary() {
    set({ lastImportSummary: null });
  },

  close() {
    set({
      exportDialogOpen: false,
      exportConfig: {
        ...DEFAULT_EXPORT_CONFIG,
        includes: [...DEFAULT_EXPORT_CONFIG.includes],
      },
      exportPluginDeps: [],
      isExporting: false,
      lastExportSuccess: null,
      importDialogOpen: false,
      importStep: 'select',
      importPreviewResponse: null,
      importItemActions: {},
      importAcknowledged: false,
      isImporting: false,
      lastImportSummary: null,
      error: null,
    });
  },
}));

// Exposed for tests so a fixture can reset state between cases without
// poking the dialog open/close machinery.
export const __testing__ = { DEFAULT_EXPORT_CONFIG, buildItemActionsFromPreview };
