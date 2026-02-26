/**
 * ProjectTerminalPage - Remote terminal view
 * Story 17.2: Terminal Emulator Component
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import { useTerminal } from '../hooks/useTerminal';
import { TerminalEmulator } from '../components/terminal/TerminalEmulator';

export function ProjectTerminalPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { terminalId, status, create, close } = useTerminal(projectSlug ?? '');

  // Auto-create terminal on mount, close on unmount
  useEffect(() => {
    if (projectSlug && !terminalId && !status) {
      create();
    }
    return () => {
      close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug]);

  if (!projectSlug) {
    return null;
  }

  if (!terminalId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-2xl mb-4">
          <Terminal className="w-10 h-10 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>터미널 세션 생성 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <TerminalEmulator terminalId={terminalId} autoFocus />
    </div>
  );
}
