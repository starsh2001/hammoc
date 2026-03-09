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
  TerminalListResponse,
  TerminalOutputEvent,
  TerminalExitEvent,
  TerminalErrorEvent,
  TerminalAccessInfo,
} from '@hammoc/shared';
import { getSocket } from '../services/socket';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TerminalSession {
  terminalId: string;
  shell: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'exited';
  exitCode?: number;
}

type DataCallback = (data: string) => void;

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

interface TerminalStore {
  // State
  terminals: Map<string, TerminalSession>;
  activeTerminalId: string | null;
  currentProjectSlug: string | null;
  terminalAccess: TerminalAccessInfo | null;
  pendingCreate: boolean;
  fontSize: number;

  // Actions
  setTerminalAccess: (access: TerminalAccessInfo) => void;
  createTerminal: (projectSlug: string) => void;
  reattachTerminal: (projectSlug: string, terminalId: string) => void;
  listTerminals: (projectSlug: string) => void;
  closeTerminal: (terminalId: string) => void;
  sendInput: (terminalId: string, data: string) => void;
  resize: (terminalId: string, cols: number, rows: number) => void;
  setActiveTerminalId: (terminalId: string) => void;
  clearTerminalsForProjectChange: (newProjectSlug: string) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;

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
let _onAccess: ((data: TerminalAccessInfo) => void) | null = null;
let _onList: ((data: TerminalListResponse) => void) | null = null;

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  // State
  terminals: new Map(),
  activeTerminalId: null,
  currentProjectSlug: null,
  terminalAccess: null,
  pendingCreate: false,
  fontSize: DEFAULT_FONT_SIZE,

  // Actions
  setTerminalAccess: (access: TerminalAccessInfo) => {
    set({ terminalAccess: access });
  },

  increaseFontSize: () => {
    const { fontSize } = get();
    if (fontSize < MAX_FONT_SIZE) set({ fontSize: fontSize + 1 });
  },

  decreaseFontSize: () => {
    const { fontSize } = get();
    if (fontSize > MIN_FONT_SIZE) set({ fontSize: fontSize - 1 });
  },

  resetFontSize: () => {
    set({ fontSize: DEFAULT_FONT_SIZE });
  },

  createTerminal: (projectSlug: string) => {
    if (get().pendingCreate) return;
    set({ pendingCreate: true });
    const socket = getSocket();
    socket.emit('terminal:create', { projectSlug });
  },

  reattachTerminal: (projectSlug: string, terminalId: string) => {
    const socket = getSocket();
    socket.emit('terminal:create', { projectSlug, terminalId });
  },

  listTerminals: (projectSlug: string) => {
    const socket = getSocket();
    socket.emit('terminal:list', { projectSlug });
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
      // Clear client state only — server terminals persist per project
      for (const terminalId of terminals.keys()) {
        dataCallbacks.delete(terminalId);
      }
      set({ terminals: new Map(), activeTerminalId: null, currentProjectSlug: newProjectSlug, pendingCreate: false });
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
      set({ terminals, activeTerminalId: data.terminalId, pendingCreate: false });
    };

    _onData = (data: TerminalOutputEvent) => {
      const callbacks = dataCallbacks.get(data.terminalId);
      if (callbacks) {
        callbacks.forEach((cb) => cb(data.data));
      }
    };

    _onExit = (data: TerminalExitEvent) => {
      const terminals = new Map(get().terminals);
      terminals.delete(data.terminalId);
      dataCallbacks.delete(data.terminalId);
      let activeTerminalId = get().activeTerminalId;
      if (activeTerminalId === data.terminalId) {
        const firstRemaining = terminals.keys().next().value;
        activeTerminalId = firstRemaining ?? null;
      }
      set({ terminals, activeTerminalId });
    };

    _onError = (data: TerminalErrorEvent) => {
      toast.error(data.message);
      set({ pendingCreate: false });
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

    _onList = (data: TerminalListResponse) => {
      // Ignore responses for a different project (race condition guard)
      if (data.projectSlug !== get().currentProjectSlug) return;

      // Treat server response as authoritative — rebuild terminal map
      const terminals = new Map<string, TerminalSession>();
      for (const t of data.terminals) {
        const existing = get().terminals.get(t.terminalId);
        terminals.set(t.terminalId, existing ?? {
          terminalId: t.terminalId,
          shell: t.shell,
          status: 'connected',
        });
      }
      let activeTerminalId = get().activeTerminalId;
      if (activeTerminalId && !terminals.has(activeTerminalId)) {
        activeTerminalId = terminals.keys().next().value ?? null;
      } else if (!activeTerminalId && terminals.size > 0) {
        activeTerminalId = terminals.keys().next().value ?? null;
      }
      set({ terminals, activeTerminalId });
    };

    _onAccess = (data: TerminalAccessInfo) => {
      get().setTerminalAccess(data);
    };

    socket.on('terminal:list', _onList);
    socket.on('terminal:access', _onAccess);
    socket.on('terminal:created', _onCreated);
    socket.on('terminal:data', _onData);
    socket.on('terminal:exit', _onExit);
    socket.on('terminal:error', _onError);
  },

  cleanupTerminalListeners: (socket: TypedSocket) => {
    if (_onList) {
      socket.off('terminal:list', _onList);
      _onList = null;
    }
    if (_onAccess) {
      socket.off('terminal:access', _onAccess);
      _onAccess = null;
    }
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
