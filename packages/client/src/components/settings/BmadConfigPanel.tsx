/**
 * Story 31.1: BMad core-config editor panel (Epic 31).
 *
 * Mounts under "Project Settings → BMad 설정" (nav item gated by
 * `isBmadProject`). Renders the 18-key form in 5 collapsible groups (general /
 * qa / prd / architecture / brownfieldEpic — HookPanel collapsible pattern),
 * a Raw/Form toggle (HookEditor pattern) with a lazy CodeMirror YAML editor
 * (SnippetEditor lazy-load pattern), a read-only "unknown keys" section (AC4),
 * and the external-change / STALE_WRITE reload-overwrite flow (AC3.d/e).
 *
 * The store is the single source of truth; this panel owns only the local
 * raw-draft, collapsible, and confirm-modal UI state.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import type { HarnessExternalChangeEvent } from '@hammoc/shared';
import { getSocket } from '../../services/socket';
import {
  useBmadCoreConfigStore,
  BMAD_GROUPS,
  BMAD_KNOWN_KEYS_MATRIX,
  type BmadGroup,
  type BmadKeyDef,
} from '../../stores/bmadCoreConfigStore';
import { BmadToggleWidget } from './harness/bmad/BmadToggleWidget';
import { BmadStringWidget } from './harness/bmad/BmadStringWidget';
import { BmadPathWidget } from './harness/bmad/BmadPathWidget';
import { BmadGlobWidget } from './harness/bmad/BmadGlobWidget';
import { BmadArrayWidget } from './harness/bmad/BmadArrayWidget';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));

/** AC4.a: JS-type hint for an unknown key value (developer token, not i18n'd). */
function jsTypeHint(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value; // 'string' | 'number' | 'boolean' | 'object'
}

function renderWidget(keyDef: BmadKeyDef, projectSlug: string) {
  switch (keyDef.widget) {
    case 'boolean':
      return <BmadToggleWidget keyDef={keyDef} />;
    case 'string':
      return <BmadStringWidget keyDef={keyDef} />;
    case 'path':
      return <BmadPathWidget keyDef={keyDef} projectSlug={projectSlug} />;
    case 'glob':
      return <BmadGlobWidget keyDef={keyDef} projectSlug={projectSlug} />;
    case 'array':
      return <BmadArrayWidget keyDef={keyDef} />;
    default:
      return null;
  }
}

export function BmadConfigPanel({ projectSlug }: { projectSlug: string }) {
  const { t } = useTranslation('settings');

  const isLoading = useBmadCoreConfigStore((s) => s.isLoading);
  const error = useBmadCoreConfigStore((s) => s.error);
  const mode = useBmadCoreConfigStore((s) => s.mode);
  const rawContent = useBmadCoreConfigStore((s) => s.rawContent);
  const unknownKeys = useBmadCoreConfigStore((s) => s.unknownKeys);
  const isSaving = useBmadCoreConfigStore((s) => s.isSaving);
  const dirtyRawDraft = useBmadCoreConfigStore((s) => s.dirtyRawDraft);
  const staleConflict = useBmadCoreConfigStore((s) => s.staleConflict);
  const externalChangePending = useBmadCoreConfigStore((s) => s.externalChangePending);

  const [expandedGroups, setExpandedGroups] = useState<Set<BmadGroup>>(() => new Set(BMAD_GROUPS));
  const [unknownExpanded, setUnknownExpanded] = useState(false);
  const [rawDraft, setRawDraft] = useState('');
  const [rawParseError, setRawParseError] = useState(false);
  const [confirm, setConfirm] = useState<null | 'toRaw' | 'toForm'>(null);
  const [yamlExt, setYamlExt] = useState<Extension[] | null>(null);

  // Mount: load the config + subscribe to the workbench external-change feed
  // (B.4 decision — the store-level subscribe lives where the bmad nav mounts).
  useEffect(() => {
    void useBmadCoreConfigStore.getState().load(projectSlug);
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: HarnessExternalChangeEvent) =>
      useBmadCoreConfigStore.getState().handleExternalChange(payload, projectSlug);
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
      useBmadCoreConfigStore.getState().reset();
    };
  }, [projectSlug]);

  // Lazy-load the YAML language extension for the Raw editor.
  useEffect(() => {
    let alive = true;
    void import('@codemirror/lang-yaml').then((m) => {
      if (alive) setYamlExt([m.yaml()]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const unknownEntries = useMemo(() => Object.entries(unknownKeys), [unknownKeys]);

  const enterRaw = () => {
    setRawDraft(rawContent ?? '');
    setRawParseError(false);
    useBmadCoreConfigStore.getState().setDirtyRawDraft(undefined);
    useBmadCoreConfigStore.getState().setMode('raw');
  };

  const goRaw = () => {
    if (isSaving) {
      setConfirm('toRaw');
      return;
    }
    enterRaw();
  };

  const goForm = () => {
    if (dirtyRawDraft !== undefined) {
      if (rawParseError) return; // AC5.c — invalid YAML keeps the user in Raw with the inline warning.
      setConfirm('toForm');
      return;
    }
    useBmadCoreConfigStore.getState().setMode('form');
  };

  const onRawChange = (next: string) => {
    setRawDraft(next);
    useBmadCoreConfigStore.getState().setDirtyRawDraft(next);
    // Light client-side YAML validity probe so the Form toggle / Save can gate.
    void import('yaml').then((m) => {
      try {
        m.parse(next);
        setRawParseError(false);
      } catch {
        setRawParseError(true);
      }
    });
  };

  const saveRaw = () => {
    void useBmadCoreConfigStore.getState().writeRaw(rawDraft);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-gray-400" data-testid="bmad-config-panel-loading">
        <Loader2 size={16} className="animate-spin" />
        {t('harness.bmad.loading')}
      </div>
    );
  }

  if (error && rawContent === undefined) {
    return (
      <div className="p-4 text-sm text-red-400" data-testid="bmad-config-panel-error">
        {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="bmad-config-panel">
      {/* Header: title + Raw/Form segmented toggle */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-100">{t('harness.bmad.title')}</h3>
        <div className="inline-flex overflow-hidden rounded border border-gray-600 text-xs">
          <button
            type="button"
            className={`px-3 py-1 ${mode === 'form' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}
            onClick={goForm}
            data-testid="bmad-mode-form"
          >
            {t('harness.bmad.raw.toggleToForm')}
          </button>
          <button
            type="button"
            className={`px-3 py-1 ${mode === 'raw' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}
            onClick={goRaw}
            data-testid="bmad-mode-raw"
          >
            {t('harness.bmad.raw.toggleToRaw')}
          </button>
        </div>
      </div>

      {/* AC3.d: external-change banner */}
      {externalChangePending && (
        <div
          className="flex items-center justify-between gap-2 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-xs text-amber-200"
          data-testid="bmad-external-change-banner"
        >
          <span className="flex items-center gap-1">
            <AlertTriangle size={14} />
            {t('harness.bmad.externalChange.banner')}
          </span>
          <button
            type="button"
            className="rounded bg-amber-700 px-2 py-1 text-amber-50 hover:bg-amber-600"
            onClick={() => void useBmadCoreConfigStore.getState().load(projectSlug)}
          >
            {t('harness.bmad.externalChange.reload')}
          </button>
        </div>
      )}

      {/* Form mode — 5 collapsible groups */}
      {mode === 'form' && (
        <div className="flex flex-col gap-2">
          {BMAD_GROUPS.map((group) => {
            const keys = BMAD_KNOWN_KEYS_MATRIX.filter((k) => k.group === group);
            const open = expandedGroups.has(group);
            return (
              <section key={group} className="rounded border border-gray-700" data-testid={`bmad-group-${group}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-medium text-gray-200"
                  onClick={() =>
                    setExpandedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group)) next.delete(group);
                      else next.add(group);
                      return next;
                    })
                  }
                  data-testid={`bmad-group-header-${group}`}
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  {t(`harness.bmad.groupTitles.${group}`)}
                </button>
                {open && (
                  <div className="flex flex-col gap-1 border-t border-gray-800 px-3 py-2">
                    {keys.map((keyDef) => (
                      <div key={keyDef.id}>{renderWidget(keyDef, projectSlug)}</div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {/* AC4: unknown keys section (read-only, default collapsed) */}
          {unknownEntries.length > 0 && (
            <section className="rounded border border-gray-700" data-testid="bmad-unknown-keys">
              <button
                type="button"
                className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-medium text-gray-300"
                onClick={() => setUnknownExpanded((v) => !v)}
                data-testid="bmad-unknown-keys-header"
              >
                {unknownExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {t('harness.bmad.unknownKeys.title')} ({unknownEntries.length})
              </button>
              {unknownExpanded && (
                <div className="border-t border-gray-800 px-3 py-2">
                  <p className="mb-2 text-xs text-gray-500">{t('harness.bmad.unknownKeys.description')}</p>
                  <dl className="flex flex-col gap-1">
                    {unknownEntries.map(([key, value]) => (
                      <div key={key} className="flex items-baseline gap-2 text-sm" data-testid={`bmad-unknown-key-${key}`}>
                        <dt className="font-mono text-gray-200">{key}</dt>
                        <dd className="min-w-0 flex-1 truncate font-mono text-gray-400">
                          {JSON.stringify(value)}
                        </dd>
                        <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] uppercase text-gray-300">
                          {jsTypeHint(value)}
                        </span>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[11px] text-gray-600">{t('harness.bmad.unknownKeys.readOnly')}</p>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Raw mode — CodeMirror YAML editor */}
      {mode === 'raw' && (
        <div className="flex flex-col gap-2" data-testid="bmad-raw-editor">
          <div className="overflow-hidden rounded border border-gray-700">
            <Suspense fallback={<div className="p-3 text-xs text-gray-500">{t('harness.bmad.loading')}</div>}>
              <LazyCodeMirror
                value={rawDraft}
                onChange={onRawChange}
                extensions={yamlExt ?? []}
                height="360px"
                theme="dark"
                basicSetup={{ lineNumbers: true }}
              />
            </Suspense>
          </div>
          {rawParseError && (
            <p className="text-xs text-red-400" data-testid="bmad-raw-parse-error">
              {t('harness.bmad.raw.parseError')}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={saveRaw}
              disabled={rawParseError || isSaving}
              data-testid="bmad-raw-save"
            >
              {t('harness.bmad.raw.save')}
            </button>
          </div>
        </div>
      )}

      {/* AC5.e: unsaved-changes confirm modal on Form↔Raw switch */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="bmad-unsaved-confirm">
          <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl">
            <p className="text-sm text-gray-200">
              {confirm === 'toRaw'
                ? t('harness.bmad.raw.unsavedFormChangesWarning')
                : t('harness.bmad.raw.unsavedRawChangesWarning')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-3 py-1 text-sm text-gray-300 hover:bg-gray-700"
                onClick={() => setConfirm(null)}
              >
                {t('harness.bmad.raw.cancel')}
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
                onClick={() => {
                  if (confirm === 'toRaw') {
                    enterRaw();
                  } else {
                    useBmadCoreConfigStore.getState().setDirtyRawDraft(undefined);
                    useBmadCoreConfigStore.getState().setMode('form');
                  }
                  setConfirm(null);
                }}
              >
                {t('harness.bmad.raw.discardAndSwitch')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AC3.e: STALE_WRITE reload/overwrite modal */}
      {staleConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="bmad-stale-modal">
          <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl">
            <h4 className="text-sm font-semibold text-gray-100">{t('harness.bmad.stale.modalTitle')}</h4>
            <p className="mt-2 text-sm text-gray-300">{t('harness.bmad.stale.body')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => void useBmadCoreConfigStore.getState().resolveStale('reload')}
                data-testid="bmad-stale-reload"
              >
                {t('harness.bmad.stale.reload')}
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
                onClick={() => void useBmadCoreConfigStore.getState().resolveStale('overwrite')}
                data-testid="bmad-stale-overwrite"
              >
                {t('harness.bmad.stale.overwrite')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
