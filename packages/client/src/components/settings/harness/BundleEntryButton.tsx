/**
 * Story 30.6 (Task C.3): "Bundle" entry point button + Export/Import dropdown.
 *
 * Sits next to the existing "lint 규칙" trigger in the workbench meta line.
 * Mode-agnostic — visible in both Mode A and Mode B (the Mode B banner's CTA
 * provides a second, more prominent entry for non-private workflows).
 *
 * The button toggles a small Export/Import menu. Selecting either menu item
 * delegates to the harness bundle store, which owns the dialog lifecycle.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { useHarnessBundleStore } from '../../../stores/harnessBundleStore';

interface Props {
  projectSlug: string;
}

export function BundleEntryButton({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the menu when the user clicks outside it. This is a one-shot
  // listener that mounts only while the menu is open, so we never leak.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openExport = useHarnessBundleStore((s) => s.openExport);
  const openImport = useHarnessBundleStore((s) => s.openImport);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="bundle-entry-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <Package className="w-3.5 h-3.5" aria-hidden />
        <span>{t('harness.tools.bundle.entry.button')}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('harness.tools.bundle.entry.menuTitle')}
          data-testid="bundle-entry-menu"
          className="absolute right-0 mt-1 z-30 min-w-[10rem] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="bundle-entry-export"
            onClick={() => {
              setOpen(false);
              void openExport(projectSlug);
            }}
            className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.tools.bundle.entry.menuExport')}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="bundle-entry-import"
            onClick={() => {
              setOpen(false);
              openImport();
            }}
            className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.tools.bundle.entry.menuImport')}
          </button>
        </div>
      )}
    </div>
  );
}
