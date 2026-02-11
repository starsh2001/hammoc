/**
 * LayoutToggleButton - Toggle between narrow (1280px) and wide (full-width) layout
 */

import { Maximize2, Minimize2 } from 'lucide-react';
import { useLayoutMode } from '../hooks/useLayoutMode';

interface LayoutToggleButtonProps {
  className?: string;
}

export function LayoutToggleButton({ className = '' }: LayoutToggleButtonProps) {
  const { layoutMode, toggleLayoutMode } = useLayoutMode();
  const isWide = layoutMode === 'wide';

  return (
    <button
      onClick={toggleLayoutMode}
      className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                 text-gray-600 dark:text-gray-400 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      aria-label={isWide ? '좁은 레이아웃으로 전환' : '넓은 레이아웃으로 전환'}
      title={isWide ? '좁은 레이아웃' : '넓은 레이아웃'}
    >
      {isWide ? (
        <Minimize2 className="w-5 h-5" aria-hidden="true" />
      ) : (
        <Maximize2 className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
