/**
 * useTerminal Hook - Page-level PTY session lifecycle management
 * Story 17.2: Terminal Emulator Component
 *
 * Manages create/close lifecycle for PTY sessions.
 * Data binding (sendInput, resize, registerDataCallback) is handled
 * directly by TerminalEmulator via terminalStore.
 */

import { useEffect, useCallback } from 'react';
import { useTerminalStore } from '../stores/terminalStore';
import type { TerminalSession } from '../stores/terminalStore';
import type { TerminalAccessInfo } from '@hammoc/shared';
import { getSocket } from '../services/socket';

export interface UseTerminalReturn {
  terminalId: string | null;
  isConnected: boolean;
  shell: string | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'exited' | null;
  terminals: Map<string, TerminalSession>;
  terminalAccess: TerminalAccessInfo | null;
  create: () => void;
  close: () => void;
  closeById: (terminalId: string) => void;
  switchTerminal: (terminalId: string) => void;
  listTerminals: () => void;
}

export function useTerminal(projectSlug: string): UseTerminalReturn {
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const terminalAccess = useTerminalStore((s) => s.terminalAccess);
  const setupTerminalListeners = useTerminalStore((s) => s.setupTerminalListeners);
  const cleanupTerminalListeners = useTerminalStore((s) => s.cleanupTerminalListeners);
  const createTerminal = useTerminalStore((s) => s.createTerminal);
  const closeTerminal = useTerminalStore((s) => s.closeTerminal);
  const setActiveTerminalId = useTerminalStore((s) => s.setActiveTerminalId);
  const listTerminalsAction = useTerminalStore((s) => s.listTerminals);

  const session = activeTerminalId ? terminals.get(activeTerminalId) ?? null : null;

  // Setup/cleanup socket listeners
  useEffect(() => {
    const socket = getSocket();
    setupTerminalListeners(socket);
    return () => {
      cleanupTerminalListeners(socket);
    };
  }, [setupTerminalListeners, cleanupTerminalListeners]);

  const create = useCallback(() => {
    createTerminal(projectSlug);
  }, [createTerminal, projectSlug]);

  const close = useCallback(() => {
    if (activeTerminalId) {
      closeTerminal(activeTerminalId);
    }
  }, [closeTerminal, activeTerminalId]);

  const closeById = useCallback(
    (terminalId: string) => {
      closeTerminal(terminalId);
    },
    [closeTerminal]
  );

  const switchTerminal = useCallback(
    (terminalId: string) => {
      setActiveTerminalId(terminalId);
    },
    [setActiveTerminalId]
  );

  const listTerminals = useCallback(() => {
    listTerminalsAction(projectSlug);
  }, [listTerminalsAction, projectSlug]);

  return {
    terminalId: activeTerminalId,
    isConnected: session?.status === 'connected',
    shell: session?.shell ?? null,
    status: session?.status ?? null,
    terminals,
    terminalAccess,
    create,
    close,
    closeById,
    switchTerminal,
    listTerminals,
  };
}
