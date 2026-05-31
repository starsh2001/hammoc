/**
 * Story 31.1: boolean key widget (3 keys: markdownExploder, prd.prdSharded,
 * architecture.architectureSharded). Tailwind `peer` switch (Epic 28 plugin
 * toggle pattern). Toggling saves immediately via the store's debounced patch.
 */

import { useTranslation } from 'react-i18next';
import { useBmadCoreConfigStore, getAtPath, type BmadKeyDef } from '../../../../stores/bmadCoreConfigStore';

export function BmadToggleWidget({ keyDef }: { keyDef: BmadKeyDef }) {
  const { t } = useTranslation('settings');
  const value = useBmadCoreConfigStore((s) => getAtPath(s.knownKeys, keyDef.path)) as boolean | undefined;
  const patchKey = useBmadCoreConfigStore((s) => s.patchKey);
  const checked = value === true;

  return (
    <div className="flex items-start justify-between gap-3 py-1.5" data-testid={`bmad-key-${keyDef.id}`}>
      <div className="min-w-0">
        <label className="block text-sm font-medium text-gray-200">
          {t(`harness.bmad.keys.${keyDef.id}.label`)}
        </label>
        <p className="mt-0.5 text-xs text-gray-500">
          {t(`harness.bmad.keys.${keyDef.id}.description`)}
        </p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => patchKey(keyDef.path, e.target.checked)}
          aria-label={t(`harness.bmad.keys.${keyDef.id}.label`)}
          data-testid={`bmad-toggle-${keyDef.id}`}
        />
        <div className="h-5 w-9 rounded-full bg-gray-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-500 peer-checked:after:translate-x-4" />
      </label>
    </div>
  );
}
