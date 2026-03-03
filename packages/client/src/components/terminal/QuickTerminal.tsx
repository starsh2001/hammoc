/**
 * QuickTerminal Component
 * Content-only panel for quick terminal access (rendered inside QuickPanel)
 * [Source: Story 17.4 - Task 3, Story 19.1 - Task 7]
 */

import { useTranslation } from 'react-i18next';
import { ExternalLink, Minus, Plus, ShieldAlert, Terminal } from 'lucide-react';
import { useTerminal } from '../../hooks/useTerminal';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalEmulator } from './TerminalEmulator';

interface QuickTerminalProps {
  projectSlug: string;
  onNavigateToTerminalTab?: () => void;
}

export function QuickTerminal({
  projectSlug,
  onNavigateToTerminalTab,
}: QuickTerminalProps) {
  const { t } = useTranslation('common');
  const { terminalId, terminals, terminalAccess, create } = useTerminal(projectSlug);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const increaseFontSize = useTerminalStore((s) => s.increaseFontSize);
  const decreaseFontSize = useTerminalStore((s) => s.decreaseFontSize);
  const resetFontSize = useTerminalStore((s) => s.resetFontSize);

  return (
    <div className="flex flex-col h-full">
      {/* Header: font controls + navigate link */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-0.5">
          <button
            onClick={decreaseFontSize}
            className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label={t('terminal.fontDecrease')}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={resetFontSize}
            className="px-1 py-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors min-w-[1.75rem] text-center"
            aria-label={t('terminal.fontReset')}
          >
            {fontSize}
          </button>
          <button
            onClick={increaseFontSize}
            className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label={t('terminal.fontIncrease')}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {onNavigateToTerminalTab && (
          <button
            onClick={onNavigateToTerminalTab}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600
                       dark:text-blue-400 dark:hover:text-blue-300 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
          >
            {t('terminal.openInTab')}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0">
        {terminalAccess && !terminalAccess.allowed ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center" role="alert">
            <ShieldAlert className="w-8 h-8 text-amber-500 dark:text-amber-400 mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              {!terminalAccess.enabled
                ? t('terminal.disabledMessage')
                : t('terminal.securityMessage')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {!terminalAccess.enabled
                ? t('terminal.disabledDescriptionShort')
                : t('terminal.securityDescriptionShort')}
            </p>
          </div>
        ) : terminalId ? (
          <TerminalEmulator terminalId={terminalId} autoFocus />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-2xl mb-3">
              <Terminal className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {t('terminal.emptyMessage')}
            </p>
            <button
              onClick={create}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('terminal.newTerminal')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
