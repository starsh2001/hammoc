/**
 * Terminal Store - Zustand store for PTY terminal session state
 * Story 17.2: Terminal Emulator Component
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TerminalCreatedResponse,
  TerminalOutputEvent,
  TerminalExitEvent,
  TerminalErrorEvent,
} from '@bmad-studio/shared';
import { getSocket } from '../services/socket';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TerminalSession {
  terminalId: string;
  shell: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'exited';
  exitCode?: number;
}

type DataCallback = (data: string) => void;

interface TerminalStore {
  // State
  terminals: Map<string, TerminalSession>;
  activeTerminalId: string | null;
  currentProjectSlug: string | null;

  // Actions
  createTerminal: (projectSlug: string) => void;
  reattachTerminal: (projectSlug: string, terminalId: string) => void;
  closeTerminal: (terminalId: string) => void;
  sendInput: (terminalId: string, data: string) => void;
  resize: (terminalId: string, cols: number, rows: number) => void;
  setActiveTerminalId: (terminalId: string) => void;
  clearTerminalsForProjectChange: (newProjectSlug: string) => void;

  // Socket listener lifecycle
  setupTerminalListeners: (socket: TypedSocket) => void;
  cleanupTerminalListeners: (socket: TypedSocket) => void;

  // Data callback routing
  registerDataCallback: (terminalId: string, cb: DataCallback) => () => void;
}

// Internal callback registry (outside store to avoid serialization issues)
const dataCallbacks = new Map<string, Set<DataCallback>>();

// Named handler refs for cleanup
let _onCreated: ((data: TerminalCreatedResponse) => void) | null = null;
let _onData: ((data: TerminalOutputEvent) => void) | null = null;
let _onExit: ((data: TerminalExitEvent) => void) | null = null;
let _onError: ((data: TerminalErrorEvent) => void) | null = null;

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  // State
  terminals: new Map(),
  activeTerminalId: null,
  currentProjectSlug: null,

  // Actions
  createTerminal: (projectSlug: string) => {
    const socket = getSocket();
    socket.emit('terminal:create', { projectSlug });
  },

  reattachTerminal: (projectSlug: string, terminalId: string) => {
    const socket = getSocket();
    socket.emit('terminal:create', { projectSlug, terminalId });
  },

  closeTerminal: (terminalId: string) => {
    const socket = getSocket();
    socket.emit('terminal:close', { terminalId });
    const terminals = new Map(get().terminals);
    terminals.delete(terminalId);
    // Clean up data callbacks
    dataCallbacks.delete(terminalId);
    let activeTerminalId = get().activeTerminalId;
    if (activeTerminalId === terminalId) {
      // Auto-select first remaining terminal (Map insertion order)
      const firstRemaining = terminals.keys().next().value;
      activeTerminalId = firstRemaining ?? null;
    }
    set({ terminals, activeTerminalId });
  },

  sendInput: (terminalId: string, data: string) => {
    const socket = getSocket();
    socket.emit('terminal:input', { terminalId, data });
  },

  resize: (terminalId: string, cols: number, rows: number) => {
    const socket = getSocket();
    socket.emit('terminal:resize', { terminalId, cols, rows });
  },

  setActiveTerminalId: (terminalId: string) => {
    const { terminals } = get();
    if (terminals.has(terminalId)) {
      set({ activeTerminalId: terminalId });
    }
  },

  clearTerminalsForProjectChange: (newProjectSlug: string) => {
    const { currentProjectSlug, terminals } = get();
    if (currentProjectSlug && currentProjectSlug !== newProjectSlug && terminals.size > 0) {
      // Close all existing terminals from previous project
      const socket = getSocket();
      for (const terminalId of terminals.keys()) {
        socket.emit('terminal:close', { terminalId });
        dataCallbacks.delete(terminalId);
      }
      set({ terminals: new Map(), activeTerminalId: null, currentProjectSlug: newProjectSlug });
    } else {
      set({ currentProjectSlug: newProjectSlug });
    }
  },

  // Socket listener lifecycle
  setupTerminalListeners: (socket: TypedSocket) => {
    // Clean up any existing listeners first
    get().cleanupTerminalListeners(socket);

    _onCreated = (data: TerminalCreatedResponse) => {
      const terminals = new Map(get().terminals);
      terminals.set(data.terminalId, {
        terminalId: data.terminalId,
        shell: data.shell,
        status: 'connected',
      });
      set({ terminals, activeTerminalId: data.terminalId });
    };

    _onData = (data: TerminalOutputEvent) => {
      const callbacks = dataCallbacks.get(data.terminalId);
      if (callbacks) {
        callbacks.forEach((cb) => cb(data.data));
      }
    };

    _onExit = (data: TerminalExitEvent) => {
      const terminals = new Map(get().terminals);
      const session = terminals.get(data.terminalId);
      if (session) {
        terminals.set(data.terminalId, {
          ...session,
          status: 'exited',
          exitCode: data.exitCode,
        });
        set({ terminals });
      }
    };

    _onError = (data: TerminalErrorEvent) => {
      toast.error(data.message);
      if (data.terminalId) {
        const terminals = new Map(get().terminals);
        const session = terminals.get(data.terminalId);
        if (session) {
          terminals.set(data.terminalId, {
            ...session,
            status: 'disconnected',
          });
          set({ terminals });
        }
      }
    };

    socket.on('terminal:created', _onCreated);
    socket.on('terminal:data', _onData);
    socket.on('terminal:exit', _onExit);
    socket.on('terminal:error', _onError);
  },

  cleanupTerminalListeners: (socket: TypedSocket) => {
    if (_onCreated) {
      socket.off('terminal:created', _onCreated);
      _onCreated = null;
    }
    if (_onData) {
      socket.off('terminal:data', _onData);
      _onData = null;
    }
    if (_onExit) {
      socket.off('terminal:exit', _onExit);
      _onExit = null;
    }
    if (_onError) {
      socket.off('terminal:error', _onError);
      _onError = null;
    }
  },

  // Data callback routing
  registerDataCallback: (terminalId: string, cb: DataCallback) => {
    if (!dataCallbacks.has(terminalId)) {
      dataCallbacks.set(terminalId, new Set());
    }
    dataCallbacks.get(terminalId)!.add(cb);

    // Return cleanup function
    return () => {
      const callbacks = dataCallbacks.get(terminalId);
      if (callbacks) {
        callbacks.delete(cb);
        if (callbacks.size === 0) {
          dataCallbacks.delete(terminalId);
        }
      }
    };
  },
}));
