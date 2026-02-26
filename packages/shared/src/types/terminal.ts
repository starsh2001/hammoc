/**
 * Terminal Types for PTY Session Management
 * Story 17.1: PTY Session Management API
 */

// ===== Request / Response Types =====

/** Request to create a new terminal session or reattach to an existing one */
export interface TerminalCreateRequest {
  projectSlug: string;
  /** If provided, reattach to an existing session instead of creating a new one */
  terminalId?: string;
}

/** Response when a terminal session is created or reattached */
export interface TerminalCreatedResponse {
  terminalId: string;
  shell: string;
}

// ===== Event Types =====

/** Client → Server: stdin input */
export interface TerminalInputEvent {
  terminalId: string;
  data: string;
}

/** Server → Client: stdout output */
export interface TerminalOutputEvent {
  terminalId: string;
  data: string;
}

/** Client → Server: terminal resize */
export interface TerminalResizeEvent {
  terminalId: string;
  cols: number;
  rows: number;
}

/** Server → Client: terminal process exited */
export interface TerminalExitEvent {
  terminalId: string;
  exitCode: number;
}

/** Server → Client: terminal error */
export interface TerminalErrorEvent {
  terminalId?: string;
  code: string;
  message: string;
}

// ===== Error Constants =====

export const TERMINAL_ERRORS = {
  PTY_SPAWN_ERROR: {
    code: 'PTY_SPAWN_ERROR',
    httpStatus: 500,
    message: 'Failed to create terminal session',
  },
  TERMINAL_NOT_FOUND: {
    code: 'TERMINAL_NOT_FOUND',
    httpStatus: 404,
    message: 'Terminal session not found',
  },
  INVALID_DIMENSIONS: {
    code: 'INVALID_DIMENSIONS',
    httpStatus: 400,
    message: 'Invalid terminal dimensions',
  },
  MAX_SESSIONS_REACHED: {
    code: 'MAX_SESSIONS_REACHED',
    httpStatus: 429,
    message: 'Maximum terminal sessions reached',
  },
  TERMINAL_DISABLED: {
    code: 'TERMINAL_DISABLED',
    httpStatus: 403,
    message: 'Terminal feature is disabled',
  },
} as const;
