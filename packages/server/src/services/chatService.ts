import { query, type Query, type Options, type SDKMessage, type SDKUserMessage, type CanUseTool, type RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import type {
  ChatServiceConfig,
  ChatOptions,
  ChatResponse,
  PermissionMode,
  StreamCallbacks,
  ImageAttachment,
} from '@hammoc/shared';
import { correctContextWindow, resolveEffectiveModel, effectiveModelIs1M } from '@hammoc/shared';
import path from 'path';
import fs from 'fs/promises';
import { InvalidPathError, parseSDKError } from '../utils/errors.js';
import { StreamHandler } from './streamHandler.js';
import { SessionService } from './sessionService.js';
import { rewindSessionFiles } from './fileRewind.js';
import { DEFAULT_WORKSPACE_TEMPLATE, resolveTemplateVariables } from './workspaceContext.js';
import type { ChatEngine } from './chatEngine.js';
import { createLogger } from '../utils/logger.js';
import { isBlockedBackgroundCall, BACKGROUND_BLOCK_REASON } from '../utils/backgroundBlock.js';

const log = createLogger('chatService');

// Intentionally duplicated in streamHandler.ts for file independence
function extractContextWindow(modelUsage?: { [model: string]: { contextWindow: number } }): number {
  if (!modelUsage) return 0;
  const windows = Object.values(modelUsage).map(m => m.contextWindow);
  return windows.length > 0 ? Math.max(...windows) : 0;
}

/**
 * ChatService - Wrapper for Claude Agent SDK
 * Handles communication with Claude Code through the official SDK
 */
export class ChatService implements ChatEngine {
  private workingDirectory: string | undefined;
  private permissionMode: PermissionMode;
  private allowedTools: string[];
  private disallowedTools: string[];
  /** Auto-compaction master switch (both engines). Mirrors the autoCompactEnabled preference; default true. */
  private autoCompactEnabled: boolean;
  private currentQuery: Query | null = null;
  /** Warning message from rewindFiles failure (non-fatal, streaming continues) */
  rewindWarning: string | null = null;

  constructor(config: ChatServiceConfig = {}) {
    this.workingDirectory = config.workingDirectory;
    this.permissionMode = config.permissionMode ?? 'default';
    this.allowedTools = [];
    this.disallowedTools = [];
    this.autoCompactEnabled = config.autoCompactEnabled ?? true;
  }

  /**
   * Initialize a new session with a project directory
   */
  async initSession(projectPath: string): Promise<void> {
    const resolvedPath = path.resolve(projectPath);
    const isValid = await this.validateProjectPath(resolvedPath);

    if (!isValid) {
      throw new InvalidPathError(projectPath);
    }

    this.workingDirectory = resolvedPath;
  }

  /**
   * Validate that a project path exists and is a directory
   */
  private async validateProjectPath(projectPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(projectPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Set the list of allowed tools
   */
  setAllowedTools(tools: string[]): void {
    this.allowedTools = [...tools];
  }

  /**
   * Set the list of disallowed tools
   */
  setDisallowedTools(tools: string[]): void {
    this.disallowedTools = [...tools];
  }

  /**
   * Get the current working directory
   */
  getWorkingDirectory(): string | undefined {
    return this.workingDirectory;
  }

  /**
   * Send a message and receive responses through an async generator
   */
  async *sendMessage(
    content: string,
    options: ChatOptions = {},
    canUseTool?: CanUseTool
  ): AsyncGenerator<SDKMessage, ChatResponse, void> {
    const resolvedAllowed = options.allowedTools ?? this.allowedTools;
    const resolvedDisallowed = options.disallowedTools ?? this.disallowedTools;

    // Build systemPrompt: Claude Code preset + workspace context template.
    // customSystemPrompt is a full template with {variable} placeholders
    // (e.g. {gitBranch}, {gitStatus}) that are resolved at runtime.
    // If not set, DEFAULT_WORKSPACE_TEMPLATE is used.
    const systemPrompt = (() => {
      const template = options.customSystemPrompt || DEFAULT_WORKSPACE_TEMPLATE;
      const append = this.workingDirectory
        ? resolveTemplateVariables(template, this.workingDirectory)
        : template;
      return {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append,
      };
    })();

    // Whether this request actually runs at 1M — drives both the `[1m]` suffix
    // applied below and the contextWindow meter correction at the result message.
    const is1M = effectiveModelIs1M(options.model);

    const queryOptions: Options = {
      cwd: this.workingDirectory,
      permissionMode: this.permissionMode,
      allowDangerouslySkipPermissions: this.permissionMode === 'bypassPermissions',
      allowedTools: resolvedAllowed.length > 0 ? resolvedAllowed : undefined,
      disallowedTools: resolvedDisallowed.length > 0 ? resolvedDisallowed : undefined,
      maxTurns: options.maxTurns,
      abortController: options.abortController,
      // Resolve the `[1m]` suffix that opts into the native 1M window. Centralized
      // in resolveEffectiveModel: Opus auto-upgrades (free on Max), Sonnet stays
      // bare unless the user explicitly opted in (Sonnet 1M bills to usage credits).
      model: resolveEffectiveModel(options.model) || undefined,
      resume: options.resume,
      sessionId: options.sessionId,
      includePartialMessages: true, // Enable real-time streaming
      settingSources: ['user', 'project', 'local'], // Load settings & .claude/commands/ for skill discovery
      // Auto-compaction master switch — inline flag-settings layer (highest priority among
      // user-controlled settings, equivalent to the CLI's --settings). The bundled engine honors
      // `autoCompactEnabled` (default true); false stops the SDK auto-compacting as context fills.
      // Mirrors the user preference; sits on top of settingSources without replacing them.
      settings: { autoCompactEnabled: this.autoCompactEnabled },
      systemPrompt,
      maxThinkingTokens: options.maxThinkingTokens,
      maxBudgetUsd: options.maxBudgetUsd,
      effort: options.effort,
      // Explicit thinking config for adaptive-thinking models. On Opus 4.7+ this
      // opts back in to `display: 'summarized'` so ThinkingBlock UI stays visible
      // (the API flipped the default to 'omitted' starting 2026-04-16).
      ...(options.thinking ? { thinking: options.thinking as unknown as Options['thinking'] } : {}),
      resumeSessionAt: options.resumeSessionAt,
      forkSession: options.forkSession,
      enableFileCheckpointing: options.enableFileCheckpointing,
      canUseTool,
      // Story 36.1: block background tool execution (run_in_background) before it
      // reaches the shell. A PreToolUse deny bypasses canUseTool, so this also
      // covers auto-approved (bypass/auto) calls that canUseTool never sees.
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (input) => {
                if (
                  input.hook_event_name === 'PreToolUse' &&
                  isBlockedBackgroundCall(input.tool_input)
                ) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse' as const,
                      permissionDecision: 'deny' as const,
                      permissionDecisionReason: BACKGROUND_BLOCK_REASON,
                    },
                  };
                }
                return { continue: true };
              },
            ],
          },
        ],
      },
      // Capture CLI stderr for debugging process exit errors
      stderr: (data: string) => {
        log.error(`CLI stderr: ${data.trimEnd()}`);
      },
    };

    // Remove undefined values
    Object.keys(queryOptions).forEach((key) => {
      if (queryOptions[key as keyof Options] === undefined) {
        delete queryOptions[key as keyof Options];
      }
    });

    log.debug(`SDK query cwd="${queryOptions.cwd}"${queryOptions.resume ? `, resume="${queryOptions.resume}"` : ''}${queryOptions.model ? `, model="${queryOptions.model}"` : ''}${queryOptions.sessionId ? `, sessionId="${queryOptions.sessionId}"` : ''}${queryOptions.resumeSessionAt ? `, resumeSessionAt="${queryOptions.resumeSessionAt}"` : ''}${queryOptions.forkSession ? `, forkSession=true` : ''}${options.enableFileCheckpointing ? `, checkpointing=true` : ''}`);

    // Story 25.7: explicit log for resumeSessionAt branching
    if (queryOptions.resumeSessionAt) {
      log.info(`resumeSessionAt branch: assistantUuid="${queryOptions.resumeSessionAt}", resume="${queryOptions.resume}"`);
    }

    // Strip empty user messages left by rewind before SDK reads the JSONL.
    // SDK query({ prompt: '' }) used for file rewind writes an empty text
    // block that triggers cache_control 400 errors on subsequent API calls.
    const resumeSessionId = queryOptions.resume;
    if (resumeSessionId && this.workingDirectory) {
      try {
        const sessionService = new SessionService();
        const cleaned = sessionService.cleanRewindDirty(this.workingDirectory, resumeSessionId);
        if (cleaned) {
          log.info(`Cleaned rewind-dirty JSONL for session ${resumeSessionId}`);
        }
      } catch (err) {
        log.warn(`cleanRewindDirty failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Use AsyncIterable prompt when images are present (Story 5.5)
    const { images } = options;
    if (images && images.length > 0) {
      this.currentQuery = query({
        prompt: createMessageWithImages(content, images),
        options: queryOptions,
      });
    } else {
      this.currentQuery = query({
        prompt: content,
        options: queryOptions,
      });
    }

    // Story 25.7: rewind files to the specified user message checkpoint before streaming
    this.rewindWarning = null;
    if (options.rewindToMessageUuid && !this.currentQuery) {
      log.error('rewindFiles requested but currentQuery is null');
      this.rewindWarning = 'File rewind failed: query not initialized';
    } else if (options.rewindToMessageUuid && this.currentQuery) {
      try {
        const rewindResult = await this.currentQuery.rewindFiles(options.rewindToMessageUuid);
        log.info(`rewindFiles result: canRewind=${rewindResult.canRewind}, filesChanged=${rewindResult.filesChanged?.length ?? 0}, insertions=${rewindResult.insertions ?? 0}, deletions=${rewindResult.deletions ?? 0}`);
        if (!rewindResult.canRewind) {
          const reason = rewindResult.error ?? 'unknown reason';
          log.warn(`rewindFiles failed: ${reason}`);
          this.rewindWarning = `File rewind failed: ${reason}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`rewindFiles threw: ${msg}`);
        this.rewindWarning = `File rewind error: ${msg}`;
      }
    }

    let finalResponse: ChatResponse = {
      id: '',
      sessionId: '',
      content: '',
      done: false,
      isError: false,
    };

    try {
      for await (const message of this.currentQuery) {
        yield message;

        // Process result message
        if (message.type === 'result') {
          const msg = message as unknown as {
            type: 'result';
            subtype: string;
            result: string;
            session_id: string;
            uuid: string;
            is_error: boolean;
            usage: {
              input_tokens: number;
              output_tokens: number;
              cache_read_input_tokens: number;
              cache_creation_input_tokens: number;
            };
            total_cost_usd: number;
            modelUsage?: {
              [modelName: string]: {
                contextWindow: number;
              };
            };
          };
          finalResponse = {
            id: msg.uuid,
            sessionId: msg.session_id,
            content: msg.subtype === 'success' ? msg.result : '',
            done: true,
            isError: msg.is_error,
            usage: {
              inputTokens: msg.usage.input_tokens,
              outputTokens: msg.usage.output_tokens,
              cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
              cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
              totalCostUSD: msg.total_cost_usd,
              contextWindow: correctContextWindow(extractContextWindow(msg.modelUsage), is1M),
            },
          };
        }
      }
    } catch (error) {
      throw parseSDKError(error);
    } finally {
      this.currentQuery = null;
    }

    return finalResponse;
  }

  /**
   * Send a message and collect all responses (non-streaming)
   */
  async sendMessageSync(
    content: string,
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const messages: SDKMessage[] = [];

    const generator = this.sendMessage(content, options);
    let result = await generator.next();

    while (!result.done) {
      messages.push(result.value);
      result = await generator.next();
    }

    return result.value;
  }

  /**
   * Interrupt the current query
   */
  async interrupt(): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.interrupt();
    }
  }

  /**
   * Get the current permission mode
   */
  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  /**
   * Set the permission mode for the current session
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.permissionMode = mode;
    if (this.currentQuery) {
      await this.currentQuery.setPermissionMode(mode);
    }
  }

  /**
   * Send a message with callback-based event handling
   * Uses StreamHandler internally to process the async generator
   */
  async sendMessageWithCallbacks(
    content: string,
    callbacks: StreamCallbacks,
    options: ChatOptions = {},
    canUseTool?: CanUseTool,
    /** Called for every raw SDK message yielded — use for timeout reset */
    onRawMessage?: (messageType: string) => void,
    /**
     * Story 32.7: CLI-engine generation-progress callback. Accepted to satisfy the
     * `ChatEngine` interface but intentionally UNUSED here — SDK mode streams real
     * tokens, so a derived "↓ N tokens" counter adds nothing (regression-0). `_`-prefixed
     * so eslint no-unused-vars stays clean.
     */
    _onGenerationProgress?: (progress: { tokens: number; elapsedSeconds: number; thinking?: boolean }) => void,
    /** Story 36.2: CLI phase callback — accepted for the ChatEngine interface, UNUSED in SDK mode. */
    _onPhase?: (phase: 'launching' | 'submitting' | 'waiting' | null) => void
  ): Promise<ChatResponse> {
    const streamHandler = new StreamHandler(effectiveModelIs1M(options.model));
    const generator = this.sendMessage(content, options, canUseTool);

    // Wrapper generator: calls onRawMessage for every SDK message,
    // and emits heartbeat while waiting for generator.next() to confirm SDK is alive.
    async function* wrapGenerator(): AsyncGenerator<SDKMessage, void, unknown> {
      let result = await generator.next();
      while (!result.done) {
        onRawMessage?.((result.value as { type?: string }).type ?? 'unknown');
        yield result.value;

        // Wait for next message with 30s heartbeat to confirm SDK is alive
        const nextPromise = generator.next();
        let heartbeatId: ReturnType<typeof setInterval> | null = setInterval(() => {
          log.verbose('heartbeat: generator.next() still pending — SDK is alive');
          onRawMessage?.('heartbeat');
        }, 30000);

        result = await nextPromise;

        if (heartbeatId) {
          clearInterval(heartbeatId);
          heartbeatId = null;
        }
      }
    }

    return streamHandler.processStream(wrapGenerator(), callbacks);
  }

  /**
   * Standalone file rewind (no message send) — backs the `session:rewind-files`
   * handler. Delegates to the shared billing-neutral `rewindSessionFiles` helper
   * (Story 32.5) so the SDK and CLI engines share ONE rewind mechanism and one
   * `--session-id`+`--resume` footgun guard (no comment drift between engines).
   *
   * This is the *separate* operation from the inline rewind-before-send path
   * (`sendMessage`'s `options.rewindToMessageUuid`, whose outcome surfaces via
   * `rewindWarning`) — do not conflate the two.
   */
  async rewindFiles(params: { sessionId: string; messageUuid: string; dryRun?: boolean }): Promise<RewindFilesResult> {
    return rewindSessionFiles(params, this.workingDirectory);
  }
}

/**
 * Create an AsyncIterable prompt with text and image content for SDK query()
 * Story 5.5: Image Attachment
 */
async function* createMessageWithImages(
  text: string,
  images: ImageAttachment[]
): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user' as const,
    session_id: '',
    message: {
      role: 'user' as const,
      content: [
        { type: 'text', text },
        ...images.map((img) => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: img.mimeType,
            data: img.data,
          },
        })),
      ],
    },
    parent_tool_use_id: null,
  } as SDKUserMessage;
}
