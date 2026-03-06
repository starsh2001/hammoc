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

/** Client → Server: request list of active terminal sessions for a project */
export interface TerminalListRequest {
  projectSlug: string;
}

/** Server → Client: list of active terminal sessions */
export interface TerminalListResponse {
  projectSlug: string;
  terminals: Array<{ terminalId: string; shell: string }>;
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
  TERMINAL_ACCESS_DENIED: {
    code: 'TERMINAL_ACCESS_DENIED',
    httpStatus: 403,
    message: '보안상 로컬 네트워크 외부에서는 터미널을 이용할 수 없습니다',
  },
} as const;

// ===== Access Control Types =====

/** Terminal access information sent to client on connection */
export interface TerminalAccessInfo {
  allowed: boolean;
  enabled: boolean;  // Whether terminal feature is enabled in server settings
  reason?: string;   // Reason for denial (non-local IP, terminal disabled, etc.)
}
