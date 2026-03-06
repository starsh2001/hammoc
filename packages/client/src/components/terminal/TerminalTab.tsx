/**
 * TerminalTab - Multi-terminal management with session tabs
 * Story 17.3: Terminal Tab
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Minus, Terminal, X, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../hooks/useTerminal';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalEmulator } from './TerminalEmulator';

interface TerminalTabProps {
  projectSlug: string;
}

const MAX_TERMINALS = 5;

function getShellName(shellPath: string): string {
  const name = shellPath.replace(/\\/g, '/').split('/').pop() || shellPath;
  return name.replace(/\.exe$/i, '');
}

export function TerminalTab({ projectSlug }: TerminalTabProps) {
  const { t } = useTranslation('common');
  const {
    terminalId: activeTerminalId,
    terminals,
    status,
    shell,
    terminalAccess,
    create,
    closeById,
    switchTerminal,
    listTerminals,
  } = useTerminal(projectSlug);

  const fontSize = useTerminalStore((s) => s.fontSize);
  const increaseFontSize = useTerminalStore((s) => s.increaseFontSize);
  const decreaseFontSize = useTerminalStore((s) => s.decreaseFontSize);
  const resetFontSize = useTerminalStore((s) => s.resetFontSize);

  // Story 17.5: Show warning when terminal access is denied
  if (terminalAccess && !terminalAccess.allowed) {
    const message = !terminalAccess.enabled
      ? t('terminal.disabledMessage')
      : t('terminal.securityMessage');
    const description = !terminalAccess.enabled
      ? t('terminal.disabledDescription')
      : t('terminal.securityDescription');

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" role="alert">
        <div className="p-4 bg-amber-100 dark:bg-amber-900/30 rounded-2xl mb-4">
          <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>
        <p className="text-base font-medium text-gray-900 dark:text-white mb-2">{message}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{description}</p>
      </div>
    );
  }

  const clearTerminalsForProjectChange = useTerminalStore(
    (s) => s.clearTerminalsForProjectChange
  );
  const setActiveTerminalId = useTerminalStore((s) => s.setActiveTerminalId);

  const tabsRef = useRef<HTMLDivElement>(null);

  // Project change detection + restore existing server sessions
  useEffect(() => {
    clearTerminalsForProjectChange(projectSlug);
    listTerminals();
  }, [projectSlug, clearTerminalsForProjectChange, listTerminals]);

  // Auto-select first terminal when active one is removed
  useEffect(() => {
    if (terminals.size > 0 && !activeTerminalId) {
      const firstId = terminals.keys().next().value;
      if (firstId) {
        setActiveTerminalId(firstId);
      }
    }
  }, [terminals.size, activeTerminalId, setActiveTerminalId]);

  const activeSession = activeTerminalId ? terminals.get(activeTerminalId) ?? null : null;

  // Build terminal entries array for tab bar
  const terminalEntries = Array.from(terminals.entries());

  // Shell name counter for display (e.g., "bash 1", "bash 2")
  const getTerminalLabel = useCallback(
    (terminalId: string, shellPath: string) => {
      const name = getShellName(shellPath);
      const sameShellTerminals = terminalEntries.filter(
        ([, s]) => getShellName(s.shell) === name
      );
      if (sameShellTerminals.length <= 1) return name;
      const index = sameShellTerminals.findIndex(([id]) => id === terminalId);
      return `${name} ${index + 1}`;
    },
    [terminalEntries]
  );

  // Keyboard navigation for tab bar
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const ids = terminalEntries.map(([id]) => id);
      const currentIndex = activeTerminalId ? ids.indexOf(activeTerminalId) : -1;

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
          switchTerminal(ids[prevIndex]);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const nextIndex = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
          switchTerminal(ids[nextIndex]);
          break;
        }
        case 'Delete': {
          e.preventDefault();
          if (activeTerminalId) {
            closeById(activeTerminalId);
          }
          break;
        }
      }
    },
    [terminalEntries, activeTerminalId, switchTerminal, closeById]
  );

  // Status badge renderer
  const renderStatusBadge = () => {
    if (!activeSession) return null;

    switch (activeSession.status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {t('terminal.connected')}
          </span>
        );
      case 'disconnected':
        return (
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {t('terminal.disconnectedBadge')}
          </span>
        );
      case 'exited':
        return (
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            {t('terminal.exitedBadge', { exitCode: activeSession.exitCode ?? '?' })}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Shell info */}
          {activeSession && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {getShellName(activeSession.shell)}
            </span>
          )}
          {/* Status badge */}
          {renderStatusBadge()}
        </div>

        <div className="flex items-center gap-1">
          {/* Font size controls */}
          <div className="flex items-center gap-0.5 mr-2">
            <button
              onClick={decreaseFontSize}
              className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label={t('terminal.fontDecrease')}
              title={t('terminal.fontDecreaseTooltip')}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetFontSize}
              className="px-1 py-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors min-w-[2rem] text-center"
              aria-label={t('terminal.fontReset')}
              title={t('terminal.fontResetTooltip')}
            >
              {fontSize}
            </button>
            <button
              onClick={increaseFontSize}
              className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label={t('terminal.fontIncrease')}
              title={t('terminal.fontIncreaseTooltip')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* New terminal button */}
          <button
            onClick={create}
            disabled={terminals.size >= MAX_TERMINALS}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              terminals.size >= MAX_TERMINALS
                ? 'opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-500'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('terminal.newTerminal')}
          </button>
        </div>
      </div>

      {/* Terminal session tabs (only when multiple terminals) */}
      {terminals.size > 0 && (
        <div
          ref={tabsRef}
          role="tablist"
          className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-x-auto"
          onKeyDown={handleTabKeyDown}
        >
          {terminalEntries.map(([id, session]) => {
            const isActive = id === activeTerminalId;
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
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Terminal className="w-3 h-3" />
                <span>{getTerminalLabel(id, session.shell)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeById(id);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  aria-label={`Close ${getTerminalLabel(id, session.shell)}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal emulator area */}
      <div className="flex-1 min-h-0">
        {activeTerminalId ? (
          <TerminalEmulator terminalId={activeTerminalId} autoFocus />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl mb-4">
              <Terminal className="w-10 h-10 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('terminal.emptyMessage')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {t('terminal.emptyHelpText')}
            </p>
            <button
              onClick={create}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('terminal.newTerminal')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
