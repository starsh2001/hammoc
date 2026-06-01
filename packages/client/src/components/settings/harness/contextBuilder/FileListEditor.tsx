/**
 * Story 31.2 (Task C.1): reference-file list editor for the context builder.
 *
 * Lists the declared reference files with each file's byte size (AC4.a) and a
 * `~token` approximation (AC4.b — heuristic until Story 31.3's tokenizer lands).
 * "Add file" reuses the Story 31.1 `BmadPathPickerDialog` (project-root-relative
 * path return). Selectors are namespaced `context-builder-file-*` so integration
 * tests can target this list without colliding with the BMad picker.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, FileText, AlertTriangle } from 'lucide-react';
import { BmadPathPickerDialog } from '../bmad/BmadPathPickerDialog';
import {
  approximateTokens,
  TOKEN_APPROXIMATION_IS_HEURISTIC,
} from '../../../../stores/contextBuilderStore';
import { formatBytes } from './useReferenceFileSizes';

interface FileListEditorProps {
  projectSlug: string;
  files: string[];
  /** path → bytes (resolved by the panel via useReferenceFileSizes). */
  sizes: Map<string, number>;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
  disabled?: boolean;
}

export function FileListEditor({ projectSlug, files, sizes, onAdd, onRemove, disabled }: FileListEditorProps) {
  const { t } = useTranslation('settings');
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <section data-testid="context-builder-file-list">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-100">
          {t('harness.contextBuilder.files.title')}
        </h4>
        <button
          type="button"
          className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          data-testid="context-builder-file-add"
        >
          <Plus size={13} /> {t('harness.contextBuilder.files.add')}
        </button>
      </div>

      <p className="mb-2 text-xs text-gray-500">{t('harness.contextBuilder.files.help')}</p>

      {files.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500">
          {t('harness.contextBuilder.files.empty')}
        </p>
      ) : (
        <ul className="space-y-1" data-testid="context-builder-file-items">
          {files.map((file) => {
            const size = sizes.get(file);
            const missing = size === undefined;
            return (
              <li
                key={file}
                className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800/40 px-2 py-1.5 text-sm"
                data-testid={`context-builder-file-item-${file}`}
              >
                <FileText size={14} className="shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-gray-200" title={file}>{file}</span>
                {missing ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-amber-400" title={t('harness.contextBuilder.files.missing')}>
                    <AlertTriangle size={12} /> {t('harness.contextBuilder.files.missingShort')}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatBytes(size)} · ~{approximateTokens(size)} {t('harness.contextBuilder.files.tokens')}
                    {TOKEN_APPROXIMATION_IS_HEURISTIC && (
                      <span className="ml-1 text-gray-600" title={t('harness.contextBuilder.files.tokenApproxNote')}>≈</span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-50"
                  onClick={() => onRemove(file)}
                  disabled={disabled}
                  aria-label={t('harness.contextBuilder.files.remove')}
                  data-testid={`context-builder-file-remove-${file}`}
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pickerOpen && (
        <BmadPathPickerDialog
          projectSlug={projectSlug}
          keyId="contextBuilder.files"
          onSelect={(rel) => {
            onAdd(rel);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}
