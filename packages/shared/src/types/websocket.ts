/**
 * WebSocket Types for Socket.io communication
 * Story 1.4: WebSocket Server Setup
 * Story 1.6: Session Management - Added session events
 */

import type { StreamChunk, ToolCall, Message, PermissionRequest, PermissionMode, ChatUsage, ThinkingEffort, SubscriptionRateLimit, ApiHealthStatus } from './sdk.js';
import type { ToolResult, CompactMetadata, TaskNotificationData } from './streaming.js';
import type { ImageAttachment, ImageRef } from './message.js';
import type { QueueItem, QueueProgressEvent, QueueItemCompleteEvent, QueueErrorEvent, QueueItemsUpdatedEvent } from './queue.js';
import type { TerminalCreateRequest, TerminalListRequest, TerminalListResponse, TerminalInputEvent, TerminalResizeEvent, TerminalCreatedResponse, TerminalOutputEvent, TerminalExitEvent, TerminalErrorEvent, TerminalAccessInfo } from './terminal.js';
import type { DashboardStatusChangeEvent } from './dashboard.js';
import type { HistoryMessage } from './history.js';
import type { SnippetItem } from './command.js';
import type { HarnessScope, HarnessExternalChangeEvent } from './harness.js';
import type { UserPreferences } from './preferences.js';
import type { ProjectSettingsApiResponse } from './project.js';

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
    effort?: ThinkingEffort;
    resumeSessionAt?: string;
    forkSession?: boolean;
    rewindToMessageUuid?: string;
    expectedBranchTotal?: number;
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
  // Story 37.8: CLI mirror collapse/expand + remount restore. The mirror panel emits this
  // (no payload) whenever it (re)mounts; the server resolves the socket's current session
  // and pushes a one-time cli:screen-frame from the screen cache (cache miss / SDK → no-op).
  // A control channel separate from the cli:screen-frame display event, so collapse/expand —
  // which does NOT re-fire session:join — can still pull the current screen.
  'cli:request-screen-frame': () => void;
  'cli:debug-log': (data: { ts: string; ev: string; d?: Record<string, unknown> }) => void;
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
  'terminal:access:request': () => void;
  // Story 20.1: Dashboard subscription events
  'dashboard:subscribe': () => void;
  'dashboard:unsubscribe': () => void;
  // Story 24.1: Prompt chain events
  'chain:add': (data: { sessionId: string; content: string; workingDirectory: string; permissionMode?: PermissionMode; model?: string; effort?: ThinkingEffort }) => void;
  'chain:remove': (data: { sessionId: string; id: string }) => void;
  'chain:clear': (data: { sessionId: string }) => void;
  'chain:reorder': (data: { sessionId: string; ids: string[] }) => void;
  // Story 25.8: Standalone file rewind
  'session:rewind-files': (data: {
    sessionId: string;
    workingDirectory: string;
    messageUuid: string;
    dryRun?: boolean;
  }) => void;
  // Story 25.9: Summarize & continue
  'session:generate-summary': (data: {
    sessionId: string;
    messageUuid: string;
  }) => void;
  'session:cancel-summary': (data: {
    sessionId: string;
  }) => void;
  // Story 27.3: Branch viewer mode — switch branch via custom selections
  'messages:switch-branch': (data: { sessionId: string; branchSelections: Record<string, number> }) => void;
  // ISSUE-54: Snippet autocomplete — request available snippets list
  'snippets:list': (data: { workingDirectory: string }) => void;
  // Story 28.0.5: Harness workbench external-change subscription (Epic 28)
  'harness:subscribe': (data: { scope: HarnessScope; projectSlug?: string }) => void;
  'harness:unsubscribe': (data: { scope: HarnessScope; projectSlug?: string }) => void;
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
  'tool:result': (data: { toolCallId: string; result: ToolResult; provisional?: boolean }) => void;
  'permission:request': (data: PermissionRequest) => void;
  'error': (data: { code: string; message: string }) => void;
  'session:created': (data: { sessionId: string; model?: string }) => void;
  'session:resumed': (data: { sessionId: string; model?: string }) => void;
  'session:forked': (data: { sessionId: string; originalSessionId: string; model?: string }) => void;
  'context:usage': (data: ChatUsage) => void;
  'assistant:usage': (data: { inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number }) => void;
  'context:estimate': (data: { estimatedTokens: number; contextWindow: number }) => void;
  'thinking:chunk': (data: { content: string; provisional?: boolean }) => void;
  'system:compact': (data: CompactMetadata) => void;
  'tool:progress': (data: { toolUseId: string; elapsedTimeSeconds: number; toolName: string }) => void;
  // Story 32.7: CLI-engine generation progress — transient "↓ N tokens · Ns" signal
  // parsed from the claude TUI spinner (live-only; skipped on buffer replay). Story 37.11:
  // `thinking?` flags the THINKING phase (spinner reads "· [still ]thinking …") so the client
  // labels the indicator "Thinking…" — additive optional, absent = generic generation (shape unchanged).
  'generation:progress': (data: { tokens: number; elapsedSeconds: number; thinking?: boolean }) => void;
  // Story 36.2: CLI-engine pre-generation phase (boot/inject window). Transient,
  // live-only (skipped on buffer replay); a null phase hands off to generation:progress.
  'cli:phase': (data: { phase: 'launching' | 'submitting' | 'waiting' | null }) => void;
  // CLI-engine full-screen mirror frame (Story 37.8). The server-side @xterm/headless
  // emulator's CURRENT screen, serialized to a string WITH ANSI/color via the serialize
  // addon, pushed on a ~100ms trailing throttle. Each frame is SELF-CONTAINED (a complete
  // screen, not an in-place delta), so the read-only mirror restores fully on collapse/
  // expand, late-join, and refresh by simply reset()+write(frame). Transient, live-only
  // (skipped on buffer replay). Gated on CLI mode + the cliPtyMirror preference (default
  // ON, opt-out). Also pushed once to a joining socket on session:join (cache hit) and in
  // response to cli:request-screen-frame. Replaces the old cli:pty-raw delta + cli:screen-
  // snapshot grid pair (unified — one self-contained frame covers live + restore).
  'cli:screen-frame': (data: { sessionId: string; frame: string }) => void;
  // Soft CLI screen-stall signal (cliScreenStallMs watchdog). `stalled:true` when the reconstructed
  // screen showed no content change for the configured window during an active CLI turn (and no modal
  // awaited input); `stalled:false` when it moves again or the turn ends. Advisory only — the client
  // surfaces a "looks stuck — Stop?" affordance; the server never auto-aborts. Transient, live-only.
  'cli:screen-stall': (data: { sessionId: string; stalled: boolean }) => void;
  // Background-wait state. Emitted when the main assistant response ended but background
  // tasks are still pending. waiting:true enters the wait, waiting:false when all tasks
  // complete. pendingCount tracks how many background tasks remain.
  'background:waiting': (data: { sessionId: string; waiting: boolean; pendingCount: number }) => void;
  'system:task-notification': (data: TaskNotificationData) => void;
  'tool:summary': (data: { summary: string; precedingToolUseIds: string[] }) => void;
  'result:error': (data: { subtype: string; errors?: string[]; totalCostUSD?: number; numTurns?: number; result: string }) => void;
  'stream:status': (data: { active: boolean; sessionId: string; permissionMode?: PermissionMode }) => void;
  'stream:detached': (data: { sessionId: string; reason: string }) => void;
  'permission:already-resolved': (data: { requestId: string }) => void;
  'permission:resolved': (data: { requestId: string; approved: boolean; interactionType: 'permission' | 'question'; response?: string | string[] | Record<string, string | string[]> }) => void;
  'session:stream-change': (data: { sessionId: string; active: boolean; projectSlug?: string | null }) => void;
  'session:waiting-change': (data: { sessionId: string; waiting: boolean; projectSlug: string }) => void;
  'user:message': (data: { content: string; sessionId: string; timestamp?: string; images?: ImageRef[] }) => void;
  // Story 15.2: Queue runner events
  'queue:progress': (data: QueueProgressEvent) => void;
  'queue:itemComplete': (data: QueueItemCompleteEvent) => void;
  'queue:error': (data: QueueErrorEvent) => void;
  'queue:itemsUpdated': (data: QueueItemsUpdatedEvent) => void;
  'queue:editState': (data: { isEditing: boolean }) => void;
  'rateLimit:update': (data: SubscriptionRateLimit) => void;
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
  // Story 27.1: Session history — deliver buffer messages on session:join
  'stream:history': (data: { sessionId: string; messages: HistoryMessage[] }) => void;
  // Story 27.1: Confirmed messages after streaming completion (JSONL re-parsed)
  'stream:complete-messages': (data: { sessionId: string; messages: HistoryMessage[]; usage?: ChatUsage; aborted?: boolean }) => void;
  // Buffer replay: send entire buffer as a single batch for fast session join
  'stream:buffer-replay': (data: { sessionId: string; events: Array<{ event: string; data: unknown }>; engineMode?: 'sdk' | 'cli' }) => void;
  // ISSUE-54: Snippet autocomplete — return available snippets
  'snippets:list': (data: { snippets: SnippetItem[] }) => void;
  // Story 25.8: Standalone file rewind result
  'session:rewind-result': (data: {
    success: boolean;
    dryRun: boolean;
    error?: string;
    filesChanged?: string[];
    insertions?: number;
    deletions?: number;
  }) => void;
  // Story 25.9: Summarize result
  'session:summary-result': (data: {
    requestId?: string;
    messageUuid: string;
    summary?: string;
    error?: string;
  }) => void;
  // File watcher: external modification/deletion detected in project
  'file:external-change': (data: {
    projectSlug: string;
    /** Project-relative POSIX path */
    path: string;
    /** 'modified' — file content/metadata changed on disk; 'deleted' — file removed */
    type: 'modified' | 'deleted';
    /** New mtime (ISO 8601); absent for 'deleted' */
    mtime?: string;
  }) => void;
  // Story 28.0.5: Harness workbench external-change (Epic 28)
  // Emits for user-scope (~/.claude) or project-scope (.claude) subtree mutations.
  // Intentionally a separate channel from 'file:external-change' so the editor
  // and file-explorer panels do not over-react to harness edits.
  'harness:external-change': (data: HarnessExternalChangeEvent) => void;
  // Settings multi-device sync: broadcast persisted settings changes to OTHER
  // connected browsers so their open settings screens reflect the change live.
  // The originating browser is excluded server-side (via a socket-id header) so
  // it never receives its own echo. `preferences:changed` carries the full
  // merged global preferences; `project:settings-changed` is keyed by
  // projectSlug and the client ignores payloads for projects it isn't viewing.
  'preferences:changed': (data: { preferences: UserPreferences }) => void;
  'project:settings-changed': (data: { projectSlug: string; settings: ProjectSettingsApiResponse }) => void;
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
