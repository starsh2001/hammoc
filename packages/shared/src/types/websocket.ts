/**
 * WebSocket Types for Socket.io communication
 * Story 1.4: WebSocket Server Setup
 * Story 1.6: Session Management - Added session events
 */

import type { StreamChunk, ToolCall, Message, PermissionRequest, PermissionMode, ChatUsage, ThinkingEffort, SubscriptionRateLimit, ApiHealthStatus } from './sdk.js';
import type { ToolResult, CompactMetadata, TaskNotificationData } from './streaming.js';
import type { SessionInfo } from './session.js';
import type { ImageAttachment } from './message.js';
import type { QueueItem, QueueProgressEvent, QueueItemCompleteEvent, QueueErrorEvent, QueueItemsUpdatedEvent } from './queue.js';
import type { TerminalCreateRequest, TerminalListRequest, TerminalListResponse, TerminalInputEvent, TerminalResizeEvent, TerminalCreatedResponse, TerminalOutputEvent, TerminalExitEvent, TerminalErrorEvent, TerminalAccessInfo } from './terminal.js';
import type { DashboardStatusChangeEvent } from './dashboard.js';

// ===== Prompt Chain =====

/**
 * Story 24.1: Prompt chain item for server-side chain state management
 */
export interface PromptChainItem {
  id: string;
  content: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  createdAt: number;
  retryCount?: number;
}

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
    model?: string;
    images?: ImageAttachment[];
  }) => void;
  'chat:abort': () => void;
  'permission:respond': (data: {
    requestId: string;
    approved: boolean;
    interactionType: 'permission' | 'question';
    response?: string | string[] | Record<string, string | string[]>;
  }) => void;
  'permission:mode-change': (data: { mode: PermissionMode; projectSlug?: string }) => void;
  'session:join': (sessionId: string, projectSlug?: string) => void;
  'session:leave': (sessionId: string) => void;
  // Story 15.2: Queue runner events
  'queue:start': (data: { items: QueueItem[]; sessionId?: string; projectSlug: string; permissionMode?: PermissionMode }) => void;
  'queue:pause': (data: { projectSlug: string }) => void;
  'queue:resume': (data: { projectSlug: string }) => void;
  'queue:abort': (data: { projectSlug: string }) => void;
  'queue:cancelPause': (data: { projectSlug: string }) => void;
  'queue:removeItem': (data: { projectSlug: string; itemIndex: number }) => void;
  'queue:addItem': (data: { projectSlug: string; rawLine: string }) => void;
  'queue:reorderItems': (data: { projectSlug: string; newOrder: number[] }) => void;
  'queue:replaceItems': (data: { projectSlug: string; items: QueueItem[] }) => void;
  'queue:editStart': (data: { projectSlug: string }) => void;
  'queue:editEnd': (data: { projectSlug: string }) => void;
  'project:join': (projectSlug: string) => void;
  'project:leave': (projectSlug: string) => void;
  // Story 17.1: Terminal PTY events
  'terminal:create': (data: TerminalCreateRequest) => void;
  'terminal:input': (data: TerminalInputEvent) => void;
  'terminal:resize': (data: TerminalResizeEvent) => void;
  'terminal:close': (data: { terminalId: string }) => void;
  'terminal:list': (data: TerminalListRequest) => void;
  // Story 20.1: Dashboard subscription events
  'dashboard:subscribe': () => void;
  'dashboard:unsubscribe': () => void;
  // Story 24.1: Prompt chain events
  'chain:add': (data: { sessionId: string; content: string; workingDirectory: string; permissionMode?: PermissionMode; model?: string; effort?: ThinkingEffort }) => void;
  'chain:remove': (data: { sessionId: string; id: string }) => void;
  'chain:clear': (data: { sessionId: string }) => void;
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
  'session:created': (data: { sessionId: string; model?: string }) => void;
  'session:resumed': (data: { sessionId: string; model?: string }) => void;
  'context:usage': (data: ChatUsage) => void;
  'assistant:usage': (data: { inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number }) => void;
  'context:estimate': (data: { estimatedTokens: number; contextWindow: number }) => void;
  'thinking:chunk': (data: { content: string }) => void;
  'system:compact': (data: CompactMetadata) => void;
  'tool:progress': (data: { toolUseId: string; elapsedTimeSeconds: number; toolName: string }) => void;
  'system:task-notification': (data: TaskNotificationData) => void;
  'tool:summary': (data: { summary: string; precedingToolUseIds: string[] }) => void;
  'result:error': (data: { subtype: string; errors?: string[]; totalCostUSD?: number; numTurns?: number; result: string }) => void;
  'stream:status': (data: { active: boolean; sessionId: string; permissionMode?: PermissionMode }) => void;
  'stream:detached': (data: { sessionId: string; reason: string }) => void;
  'permission:already-resolved': (data: { requestId: string }) => void;
  'permission:resolved': (data: { requestId: string; approved: boolean; interactionType: 'permission' | 'question'; response?: string | string[] | Record<string, string | string[]> }) => void;
  'session:stream-change': (data: { sessionId: string; active: boolean; projectSlug?: string | null }) => void;
  'user:message': (data: { content: string; sessionId: string; timestamp?: string; imageCount?: number }) => void;
  // Story 15.2: Queue runner events
  'queue:progress': (data: QueueProgressEvent) => void;
  'queue:itemComplete': (data: QueueItemCompleteEvent) => void;
  'queue:error': (data: QueueErrorEvent) => void;
  'queue:itemsUpdated': (data: QueueItemsUpdatedEvent) => void;
  'queue:editState': (data: { isEditing: boolean }) => void;
  'rateLimit:update': (data: SubscriptionRateLimit) => void;
  'auth:subscriber': (data: { isSubscriber: boolean }) => void;
  'permission:mode-change': (data: { mode: PermissionMode }) => void;
  'apiHealth:update': (data: ApiHealthStatus) => void;
  // Story 17.1: Terminal PTY events
  'terminal:created': (data: TerminalCreatedResponse) => void;
  'terminal:data': (data: TerminalOutputEvent) => void;
  'terminal:exit': (data: TerminalExitEvent) => void;
  'terminal:error': (data: TerminalErrorEvent) => void;
  'terminal:list': (data: TerminalListResponse) => void;
  // Story 17.5: Terminal security — access info sent on connection
  'terminal:access': (data: TerminalAccessInfo) => void;
  // Story 20.1: Dashboard status change event
  'dashboard:status-change': (data: DashboardStatusChangeEvent) => void;
  // Story 24.1: Prompt chain update
  'chain:update': (data: { sessionId: string; items: PromptChainItem[] }) => void;
  // Buffer replay: send entire buffer as a single batch for fast session join
  'stream:buffer-replay': (data: { sessionId: string; events: Array<{ event: string; data: unknown }> }) => void;
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
  language?: string;
}
