/**
 * QuickTerminal Component
 * Content-only panel for quick terminal access (rendered inside QuickPanel)
 * [Source: Story 17.4 - Task 3, Story 19.1 - Task 7]
 */

import { useEffect } from 'react';
import { ExternalLink, Loader2, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../hooks/useTerminal';
import { TerminalEmulator } from './TerminalEmulator';

interface QuickTerminalProps {
  projectSlug: string;
  onNavigateToTerminalTab?: () => void;
}

export function QuickTerminal({
  projectSlug,
  onNavigateToTerminalTab,
}: QuickTerminalProps) {
  const { terminalId, terminals, terminalAccess, create } = useTerminal(projectSlug);

  // Create terminal if none exists on mount (mount = panel open)
  useEffect(() => {
    if (terminals.size === 0) {
      create();
    }
  }, [terminals.size, create]);

  return (
    <div className="flex flex-col h-full">
      {/* Navigate to terminal tab link */}
      {onNavigateToTerminalTab && (
        <div className="flex justify-end px-4 py-1.5 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onNavigateToTerminalTab}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600
                       dark:text-blue-400 dark:hover:text-blue-300 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
          >
            터미널 탭에서 열기
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Terminal area */}
      <div className="flex-1 min-h-0">
        {terminalAccess && !terminalAccess.allowed ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center" role="alert">
            <ShieldAlert className="w-8 h-8 text-amber-500 dark:text-amber-400 mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              {!terminalAccess.enabled
                ? '터미널 기능이 비활성화되어 있습니다'
                : '보안상 로컬 네트워크 외부에서는 터미널을 이용할 수 없습니다'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {!terminalAccess.enabled
                ? '설정에서 터미널을 활성화하세요.'
                : '로컬 네트워크에서 접속해 주세요.'}
            </p>
          </div>
        ) : terminalId ? (
          <TerminalEmulator terminalId={terminalId} autoFocus />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
