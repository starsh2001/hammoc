/**
 * Story 31.1: string key widget (3 keys: prd.prdVersion,
 * architecture.architectureVersion, slashPrefix). Plain text input; the store
 * debounces the save (300ms). Local draft state keeps the cursor stable and
 * re-syncs when the value changes externally (reload / overwrite).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBmadCoreConfigStore,
  getAtPath,
  isRequiredBmadKey,
  type BmadKeyDef,
} from '../../../../stores/bmadCoreConfigStore';

export function BmadStringWidget({ keyDef }: { keyDef: BmadKeyDef }) {
  const { t } = useTranslation('settings');
  const value = useBmadCoreConfigStore((s) => getAtPath(s.knownKeys, keyDef.path)) as string | undefined;
  const patchKey = useBmadCoreConfigStore((s) => s.patchKey);
  const [draft, setDraft] = useState<string>(value ?? '');

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
      <input
        type="text"
        className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          patchKey(keyDef.path, e.target.value);
        }}
        data-testid={`bmad-input-${keyDef.id}`}
      />
      {showRequiredWarning && (
        <p className="mt-1 text-xs text-amber-400" data-testid={`bmad-required-warning-${keyDef.id}`}>
          {t('harness.bmad.requiredKeyEmptyWarning')}
        </p>
      )}
    </div>
  );
}
