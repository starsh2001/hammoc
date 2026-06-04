import type { CanUseTool, RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import type { StreamCallbacks, ChatOptions, ChatResponse, PermissionMode } from '@hammoc/shared';

/**
 * ChatEngine — the SDK-independent seam for the conversation streaming engine (Epic 32).
 *
 * Both conversation call sites (the browser WebSocket handler and the queue runner)
 * talk to a conversation engine through *this* surface only. Today the sole
 * implementation is the Claude Agent SDK engine (`ChatService`); a follow-up story
 * adds a Claude Code CLI (PTY + session JSONL) engine as a second implementation,
 * selected via `createChatEngine(mode, config)`.
 *
 * This interface intentionally contains only the members the two call sites actually
 * invoke on the engine instance (verified by grep, see Story 32.2 "외부 표면
 * enumeration"). Abort is *not* a member: cancellation flows through
 * `ChatOptions.abortController` (an engine-independent signal), so no `interrupt()`
 * is needed here.
 *
 * It lives server-side (not in `@hammoc/shared`) because `canUseTool` is typed with
 * the SDK's `CanUseTool`; shared must stay SDK-independent. The server already
 * depends on the SDK, so the interface belongs here.
 *
 * Extensibility: do not seal this. Follow-up stories extend it (e.g. rewind file
 * operations) and attach the CLI engine as a second implementation.
 */
export interface ChatEngine {
  /** Warning message from a non-fatal rewind failure; read by the caller after a send. */
  rewindWarning: string | null;

  /**
   * Send a message and stream events back through the provided callbacks.
   * Cancellation is delivered via `options.abortController`.
   */
  sendMessageWithCallbacks(
    content: string,
    callbacks: StreamCallbacks,
    options?: ChatOptions,
    canUseTool?: CanUseTool,
    onRawMessage?: (messageType: string) => void
  ): Promise<ChatResponse>;

  /** Update the permission mode mid-conversation (propagates to the live query). */
  setPermissionMode(mode: PermissionMode): Promise<void>;

  /** Read the current permission mode (used by permission-gating call-site logic). */
  getPermissionMode(): PermissionMode;

  /**
   * Standalone file rewind (no message send): rewind project files to the
   * checkpoint at `messageUuid` for `sessionId`. `dryRun` previews without writing.
   * Used by the `session:rewind-files` handler. This is the *separate* operation
   * from the inline rewind-before-send (`ChatOptions.rewindToMessageUuid`, whose
   * outcome surfaces via `rewindWarning`) — do not conflate the two.
   */
  rewindFiles(params: { sessionId: string; messageUuid: string; dryRun?: boolean }): Promise<RewindFilesResult>;
}
