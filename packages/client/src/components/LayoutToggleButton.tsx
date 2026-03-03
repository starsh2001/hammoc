/**
 * LayoutToggleButton - Toggle between narrow (1280px) and wide (full-width) layout
 */

import { Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLayoutMode } from '../hooks/useLayoutMode';

interface LayoutToggleButtonProps {
  className?: string;
}

export function LayoutToggleButton({ className = '' }: LayoutToggleButtonProps) {
  const { layoutMode, toggleLayoutMode } = useLayoutMode();
  const { t } = useTranslation('settings');
  const isWide = layoutMode === 'wide';

  return (
    <button
      onClick={toggleLayoutMode}
      className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                 text-gray-600 dark:text-gray-400 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      aria-label={isWide ? t('layout.narrowAria') : t('layout.wideAria')}
      title={isWide ? t('layout.narrowTitle') : t('layout.wideTitle')}
    >
      {isWide ? (
        <Minimize2 className="w-5 h-5" aria-hidden="true" />
      ) : (
        <Maximize2 className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
