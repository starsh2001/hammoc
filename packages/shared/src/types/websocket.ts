/**
 * WebSocket Types for Socket.io communication
 * Story 1.4: WebSocket Server Setup
 * Story 1.6: Session Management - Added session events
 */

import type { StreamChunk, ToolCall, Message, PermissionRequest, PermissionMode } from './sdk.js';
import type { ToolResult } from './streaming.js';
import type { SessionInfo } from './session.js';

// ===== Connection Status =====

/**
 * WebSocket connection status
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

// ===== Client to Server Events =====

/**
 * Events emitted from client to server
 */
export interface ClientToServerEvents {
  'chat:send': (data: {
    content: string;
    workingDirectory: string;
    sessionId?: string;
    resume?: boolean;
    permissionMode?: PermissionMode;
  }) => void;
  'permission:respond': (data: { requestId: string; approved: boolean }) => void;
  'session:join': (sessionId: string) => void;
  'session:leave': (sessionId: string) => void;
  'session:list': (data: { projectPath: string }) => void;
}

// ===== Server to Client Events =====

/**
 * Events emitted from server to client
 */
export interface ServerToClientEvents {
  'message:chunk': (data: StreamChunk) => void;
  'message:complete': (data: Message) => void;
  'tool:call': (data: ToolCall) => void;
  'tool:input-update': (data: { toolCallId: string; input: Record<string, unknown> }) => void;
  'tool:result': (data: { toolCallId: string; result: ToolResult }) => void;
  'permission:request': (data: PermissionRequest) => void;
  'error': (data: { code: string; message: string }) => void;
  'session:created': (data: { sessionId: string }) => void;
  'session:resumed': (data: { sessionId: string }) => void;
  'session:list': (data: { sessions: SessionInfo[] }) => void;
}

// ===== Inter-server Events =====

/**
 * Events for server-to-server communication (if needed)
 */
export interface InterServerEvents {
  ping: () => void;
}

// ===== Socket Data =====

/**
 * Data associated with each socket connection
 */
export interface SocketData {
  userId?: string;
  sessionId?: string;
}
