/**
 * ThemeToggleButton - Standalone theme toggle button
 * Can be used in any header to switch between dark/light modes
 */

import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

interface ThemeToggleButtonProps {
  /** Additional CSS classes */
  className?: string;
}

export function ThemeToggleButton({ className = '' }: ThemeToggleButtonProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useTranslation('settings');
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg
                 text-gray-600 dark:text-gray-300 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      aria-label={isDark ? t('theme.lightAria') : t('theme.darkAria')}
    >
      {isDark ? (
        <Sun className="w-5 h-5" aria-hidden="true" />
      ) : (
        <Moon className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
