/**
 * QuickTerminal Component
 * Content-only panel for quick terminal access (rendered inside QuickPanel)
 * Supports multi-terminal tabs with create/close/switch.
 * [Source: Story 17.4 - Task 3, Story 19.1 - Task 7]
 */

import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Minus, Plus, ShieldAlert, Terminal, X } from 'lucide-react';
import { useTerminal } from '../../hooks/useTerminal';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalEmulator } from './TerminalEmulator';

const MAX_TERMINALS = 5;

function getShellName(shellPath: string): string {
  const name = shellPath.replace(/\\/g, '/').split('/').pop() || shellPath;
  return name.replace(/\.exe$/i, '');
}

interface QuickTerminalProps {
  projectSlug: string;
  onNavigateToTerminalTab?: () => void;
}

export function QuickTerminal({
  projectSlug,
  onNavigateToTerminalTab,
}: QuickTerminalProps) {
  const { t } = useTranslation('common');
  const { terminalId, terminals, terminalAccess, create, closeById, switchTerminal, listTerminals } = useTerminal(projectSlug);

  // Restore existing server sessions on mount
  useEffect(() => {
    listTerminals();
  }, [listTerminals]);

  const fontSize = useTerminalStore((s) => s.fontSize);
  const increaseFontSize = useTerminalStore((s) => s.increaseFontSize);
  const decreaseFontSize = useTerminalStore((s) => s.decreaseFontSize);
  const resetFontSize = useTerminalStore((s) => s.resetFontSize);

  const terminalEntries = Array.from(terminals.entries());

  const getTerminalLabel = useCallback(
    (tid: string, shellPath: string) => {
      const name = getShellName(shellPath);
      const sameShell = terminalEntries.filter(([, s]) => getShellName(s.shell) === name);
      if (sameShell.length <= 1) return name;
      const index = sameShell.findIndex(([id]) => id === tid);
      return `${name} ${index + 1}`;
    },
    [terminalEntries]
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const ids = terminalEntries.map(([id]) => id);
      const currentIndex = terminalId ? ids.indexOf(terminalId) : -1;

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
          switchTerminal(ids[prev]);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
          switchTerminal(ids[next]);
          break;
        }
        case 'Delete': {
          e.preventDefault();
          if (terminalId) closeById(terminalId);
          break;
        }
      }
    },
    [terminalEntries, terminalId, switchTerminal, closeById]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header: font controls + new terminal + navigate link */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-[#253040]">
        <div className="flex items-center gap-0.5">
          <button
            onClick={decreaseFontSize}
            className="p-1 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040] rounded transition-colors"
            aria-label={t('terminal.fontDecrease')}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={resetFontSize}
            className="px-1 py-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040] rounded transition-colors min-w-[1.75rem] text-center"
            aria-label={t('terminal.fontReset')}
          >
            {fontSize}
          </button>
          <button
            onClick={increaseFontSize}
            className="p-1 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040] rounded transition-colors"
            aria-label={t('terminal.fontIncrease')}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {/* New terminal button */}
          <button
            onClick={create}
            disabled={terminals.size >= MAX_TERMINALS}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('terminal.newTerminal')}
          >
            <Plus className="w-3 h-3" />
            <Terminal className="w-3 h-3" />
          </button>
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
      </div>

      {/* Terminal session tabs (only when multiple terminals) */}
      {terminals.size > 0 && (
        <div
          role="tablist"
          className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-[#253040] flex-shrink-0 overflow-x-auto"
          onKeyDown={handleTabKeyDown}
        >
          {terminalEntries.map(([id, session]) => {
            const isActive = id === terminalId;
            return (
              <div
                key={id}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => switchTerminal(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    switchTerminal(id);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]'
                }`}
              >
                <Terminal className="w-3 h-3" />
                <span className="truncate max-w-[6rem]">{getTerminalLabel(id, session.shell)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeById(id);
                  }}
                  className="ml-0.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[#2d3a4a]"
                  aria-label={`Close ${getTerminalLabel(id, session.shell)}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

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
            <p className="text-xs text-gray-500 dark:text-gray-300">
              {!terminalAccess.enabled
                ? t('terminal.disabledDescriptionShort')
                : t('terminal.securityDescriptionShort')}
            </p>
          </div>
        ) : terminalId ? (
          <TerminalEmulator terminalId={terminalId} autoFocus />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="p-3 bg-gray-100 dark:bg-[#263240] rounded-2xl mb-3">
              <Terminal className="w-8 h-8 text-gray-500 dark:text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">
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
