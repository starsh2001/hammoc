/**
 * Story 31.1: path key widget (7 keys: qa.qaLocation, prd.prdFile,
 * prd.prdShardedLocation, architecture.architectureFile,
 * architecture.architectureShardedLocation, devDebugLog, devStoryLocation).
 * Text input + a "browse" trigger that opens the isolated BmadPathPickerDialog
 * (AC2.c). The store debounces the save (300ms).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderSearch } from 'lucide-react';
import {
  useBmadCoreConfigStore,
  getAtPath,
  isRequiredBmadKey,
  type BmadKeyDef,
} from '../../../../stores/bmadCoreConfigStore';
import { BmadPathPickerDialog } from './BmadPathPickerDialog';

export function BmadPathWidget({ keyDef, projectSlug }: { keyDef: BmadKeyDef; projectSlug: string }) {
  const { t } = useTranslation('settings');
  const value = useBmadCoreConfigStore((s) => getAtPath(s.knownKeys, keyDef.path)) as string | undefined;
  const patchKey = useBmadCoreConfigStore((s) => s.patchKey);
  const [draft, setDraft] = useState<string>(value ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const showRequiredWarning = isRequiredBmadKey(keyDef.id) && draft.trim() === '';

  return (
    <div className="py-1.5" data-testid={`bmad-key-${keyDef.id}`}>
      <label className="block text-sm font-medium text-gray-200">
        {t(`harness.bmad.keys.${keyDef.id}.label`)}
      </label>
      <p className="mt-0.5 mb-1 text-xs text-gray-500">
        {t(`harness.bmad.keys.${keyDef.id}.description`)}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            patchKey(keyDef.path, e.target.value);
          }}
          data-testid={`bmad-input-${keyDef.id}`}
        />
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          onClick={() => setPickerOpen(true)}
          title={t('harness.bmad.widgets.path.browse')}
          data-testid={`bmad-path-picker-trigger-${keyDef.id}`}
        >
          <FolderSearch size={14} />
          {t('harness.bmad.widgets.path.browse')}
        </button>
      </div>
      {showRequiredWarning && (
        <p className="mt-1 text-xs text-amber-400" data-testid={`bmad-required-warning-${keyDef.id}`}>
          {t('harness.bmad.requiredKeyEmptyWarning')}
        </p>
      )}
      {pickerOpen && (
        <BmadPathPickerDialog
          projectSlug={projectSlug}
          keyId={keyDef.id}
          onSelect={(relPath) => {
            setDraft(relPath);
            patchKey(keyDef.path, relPath);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
