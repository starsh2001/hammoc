/**
 * Story 31.2 (Task D.1): SessionStart context-builder panel (Epic 31).
 *
 * Mounts under "Project Settings → 컨텍스트 빌더" (nav item NOT gated — available
 * on all projects, unlike Story 31.1's BMad gate). Container for the 3 widgets
 * (FileListEditor / VariableToggleList / CustomCommandBlock), the enable/disable
 * (generate/cleanup) action, the assembled-size threshold warning (AC4.c), and
 * the external-change / STALE_WRITE reload-overwrite flow.
 *
 * The store is the single source of truth; this panel owns only local modal UI
 * state. Reference-file byte sizes are resolved here (useReferenceFileSizes) and
 * passed down to FileListEditor + used for the total threshold.
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, KeyRound } from 'lucide-react';
import type { HarnessExternalChangeEvent } from '@hammoc/shared';
import { getSocket } from '../../services/socket';
import {
  useContextBuilderStore,
  assembledSizeLevel,
  CONTEXT_BUILDER_HARD_CAP_CHARS,
} from '../../stores/contextBuilderStore';
import { FileListEditor } from './harness/contextBuilder/FileListEditor';
import { VariableToggleList } from './harness/contextBuilder/VariableToggleList';
import { CustomCommandBlock } from './harness/contextBuilder/CustomCommandBlock';
import { useReferenceFileSizes, formatBytes } from './harness/contextBuilder/useReferenceFileSizes';

/** Rough per-enabled-variable runtime size estimate (bytes) for the threshold. */
const VARIABLE_ESTIMATE_BYTES: Record<string, number> = {
  gitBranch: 80,
  activeBmadStory: 160,
  recentCommits: 400,
  today: 40,
  uncommittedCount: 60,
};

export function ContextBuilderPanel({ projectSlug }: { projectSlug: string }) {
  const { t } = useTranslation('settings');

  const manifest = useContextBuilderStore((s) => s.manifest);
  const isLoading = useContextBuilderStore((s) => s.isLoading);
  const isSaving = useContextBuilderStore((s) => s.isSaving);
  const error = useContextBuilderStore((s) => s.error);
  const staleConflict = useContextBuilderStore((s) => s.staleConflict);
  const externalChangePending = useContextBuilderStore((s) => s.externalChangePending);
  const entryRegistered = useContextBuilderStore((s) => s.entryRegistered);
  const secretWarningCommandIndices = useContextBuilderStore((s) => s.secretWarningCommandIndices);

  // Mount: load + subscribe to the workbench external-change feed.
  useEffect(() => {
    void useContextBuilderStore.getState().load(projectSlug);
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: HarnessExternalChangeEvent) =>
      useContextBuilderStore.getState().handleExternalChange(payload, projectSlug);
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
      useContextBuilderStore.getState().reset();
    };
  }, [projectSlug]);

  const { sizes, totalBytes } = useReferenceFileSizes(projectSlug, manifest.files);

  const estimatedBytes = useMemo(() => {
    let total = totalBytes;
    for (const [id, on] of Object.entries(manifest.variables)) {
      if (on) total += VARIABLE_ESTIMATE_BYTES[id] ?? 0;
    }
    return total;
  }, [totalBytes, manifest.variables]);

  const sizeLevel = assembledSizeLevel(estimatedBytes);

  const store = useContextBuilderStore.getState();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-gray-400" data-testid="context-builder-panel-loading">
        <Loader2 size={16} className="animate-spin" />
        {t('harness.contextBuilder.loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="context-builder-panel">
      {/* Header: title + enable switch */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">{t('harness.contextBuilder.title')}</h3>
          <p className="text-xs text-gray-500">{t('harness.contextBuilder.subtitle')}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          {t('harness.contextBuilder.enable')}
          <button
            type="button"
            role="switch"
            aria-checked={manifest.enabled}
            aria-label={t('harness.contextBuilder.enable')}
            onClick={() => store.setEnabled(!manifest.enabled)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              manifest.enabled ? 'bg-blue-600' : 'bg-gray-600'
            }`}
            data-testid="context-builder-enable-toggle"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                manifest.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      {manifest.enabled && entryRegistered && (
        <p className="text-[11px] text-gray-500" data-testid="context-builder-registered-note">
          {t('harness.contextBuilder.registeredNote')}
        </p>
      )}

      {/* External-change banner */}
      {externalChangePending && (
        <div
          className="flex items-center justify-between gap-2 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-xs text-amber-200"
          data-testid="context-builder-external-change-banner"
        >
          <span className="flex items-center gap-1">
            <AlertTriangle size={14} />
            {t('harness.contextBuilder.externalChange.banner')}
          </span>
          <button
            type="button"
            className="rounded bg-amber-700 px-2 py-1 text-amber-50 hover:bg-amber-600"
            onClick={() => void store.load(projectSlug)}
          >
            {t('harness.contextBuilder.externalChange.reload')}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-300" data-testid="context-builder-error">
          {error.message}
        </p>
      )}

      {/* AC4.c — assembled-size threshold warning */}
      {sizeLevel !== 'ok' && (
        <div
          className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${
            sizeLevel === 'over'
              ? 'border-red-700 bg-red-950/30 text-red-300'
              : 'border-amber-700 bg-amber-900/30 text-amber-200'
          }`}
          data-testid="context-builder-size-warning"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {t(sizeLevel === 'over' ? 'harness.contextBuilder.size.over' : 'harness.contextBuilder.size.warn', {
              total: formatBytes(estimatedBytes),
              cap: CONTEXT_BUILDER_HARD_CAP_CHARS,
            })}
          </span>
        </div>
      )}

      {/* AC5.c — non-blocking secret notice */}
      {secretWarningCommandIndices.length > 0 && (
        <div className="flex items-start gap-2 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-xs text-amber-200" data-testid="context-builder-secret-notice">
          <KeyRound size={14} className="mt-0.5 shrink-0" />
          <span>{t('harness.contextBuilder.commands.secretNotice', { count: secretWarningCommandIndices.length })}</span>
        </div>
      )}

      <FileListEditor
        projectSlug={projectSlug}
        files={manifest.files}
        sizes={sizes}
        onAdd={(p) => store.addFile(p)}
        onRemove={(p) => store.removeFile(p)}
      />

      <VariableToggleList
        variables={manifest.variables}
        recentCommitsCount={manifest.recentCommitsCount ?? 5}
        onToggle={(id, on) => store.toggleVariable(id, on)}
        onCountChange={(n) => store.setRecentCommitsCount(n)}
      />

      <CustomCommandBlock
        commands={manifest.customCommands}
        secretWarningIndices={secretWarningCommandIndices}
        onAdd={(cmd, ack) => store.addCustomCommand(cmd, ack)}
        onUpdate={(i, patch) => store.updateCustomCommand(i, patch)}
        onRemove={(i) => store.removeCustomCommand(i)}
      />

      {isSaving && (
        <p className="flex items-center gap-1 text-[11px] text-gray-500" data-testid="context-builder-saving">
          <Loader2 size={11} className="animate-spin" /> {t('harness.contextBuilder.saving')}
        </p>
      )}

      {/* STALE_WRITE reload/overwrite modal */}
      {staleConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="context-builder-stale-modal">
          <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl">
            <h4 className="text-sm font-semibold text-gray-100">{t('harness.contextBuilder.stale.modalTitle')}</h4>
            <p className="mt-2 text-sm text-gray-300">{t('harness.contextBuilder.stale.body')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => void store.resolveStale('reload')}
                data-testid="context-builder-stale-reload"
              >
                {t('harness.contextBuilder.stale.reload')}
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
                onClick={() => void store.resolveStale('overwrite')}
                data-testid="context-builder-stale-overwrite"
              >
                {t('harness.contextBuilder.stale.overwrite')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
