import { query, type Query, type Options, type SDKMessage, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import type {
  ChatServiceConfig,
  ChatOptions,
  ChatResponse,
  PermissionMode,
  StreamCallbacks,
  ImageAttachment,
} from '@bmad-studio/shared';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { InvalidPathError, parseSDKError } from '../utils/errors.js';
import { StreamHandler } from './streamHandler.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('chatService');

/**
 * Build workspace context to append to the system prompt.
 * Replicates the VS Code extension's appended context (~3,500 tokens) almost
 * verbatim — only the environment name differs ("BMad Studio" vs "VSCode").
 * Without this grounding (code-reference rules, git status with real file paths),
 * the model hallucinates paths like /Users/jake/test.txt.
 */
function buildWorkspaceContext(cwd: string): string {
  // --- Header & Code References (mirrors VS Code extension context) ---
  const header = [
    '',
    '# BMad Studio Context',
    '',
    'You are running inside BMad Studio, a web-based IDE.',
    '',
    '## Code References in Text',
    'IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:',
    '- For files: [filename.ts](src/filename.ts)',
    '- For specific lines: [filename.ts:42](src/filename.ts#L42)',
    '- For a range of lines: [filename.ts:42-51](src/filename.ts#L42-L51)',
    '- For folders: [src/utils/](src/utils/)',
    'Unless explicitly asked for by the user, DO NOT USE backticks ` or HTML tags like code for file references - always use markdown [text](link) format.',
    "The URL links should be relative paths from the root of the user's workspace.",
  ].join('\n');

  // --- Git status (same format as VS Code) ---
  let gitSection = '';
  try {
    const stdio: ['pipe', 'pipe', 'pipe'] = ['pipe', 'pipe', 'pipe'];
    const execOpts = { cwd, encoding: 'utf-8' as const, timeout: 3000, stdio };
    const branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).toString().trim();
    let mainBranch = 'main';
    try {
      execSync('git rev-parse --verify refs/heads/main', execOpts);
      mainBranch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify refs/heads/master', execOpts);
        mainBranch = 'master';
      } catch {
        // fallback
      }
    }
    const gitStatus = execSync('git status --short', { ...execOpts, timeout: 5000 }).toString().trim();
    const statusLines = gitStatus ? gitStatus.split('\n') : [];
    const truncatedStatus = statusLines.length > 30
      ? [...statusLines.slice(0, 30), `... and ${statusLines.length - 30} more files`].join('\n')
      : gitStatus;

    gitSection = [
      '',
      'gitStatus: This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.',
      `Current branch: ${branch}`,
      '',
      `Main branch (you will usually use this for PRs): ${mainBranch}`,
      '',
      'Status:',
      truncatedStatus || '(clean)',
    ].join('\n');
  } catch {
    // Not a git repo or git not available
  }

  return [header, gitSection].join('\n');
}

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
export class ChatService {
  private workingDirectory: string | undefined;
  private permissionMode: PermissionMode;
  private allowedTools: string[];
  private disallowedTools: string[];
  private currentQuery: Query | null = null;

  constructor(config: ChatServiceConfig = {}) {
    this.workingDirectory = config.workingDirectory;
    this.permissionMode = config.permissionMode ?? 'default';
    this.allowedTools = [];
    this.disallowedTools = [];
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

    // Build systemPrompt based on customSystemPrompt option
    const systemPrompt = (() => {
      if (options.customSystemPrompt) {
        // Replace mode: use custom prompt + workspace context
        return this.workingDirectory
          ? options.customSystemPrompt + '\n\n' + buildWorkspaceContext(this.workingDirectory)
          : options.customSystemPrompt;
      }
      // Default: Claude Code preset with workspace context
      if (this.workingDirectory) {
        return {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          append: buildWorkspaceContext(this.workingDirectory),
        };
      }
      return undefined;
    })();

    const queryOptions: Options = {
      cwd: this.workingDirectory,
      permissionMode: this.permissionMode,
      allowedTools: resolvedAllowed.length > 0 ? resolvedAllowed : undefined,
      disallowedTools: resolvedDisallowed.length > 0 ? resolvedDisallowed : undefined,
      maxTurns: options.maxTurns,
      abortController: options.abortController,
      model: options.model,
      resume: options.resume,
      sessionId: options.sessionId,
      includePartialMessages: true, // Enable real-time streaming
      settingSources: ['user', 'project', 'local'], // Load settings & .claude/commands/ for skill discovery
      systemPrompt,
      maxThinkingTokens: options.maxThinkingTokens,
      maxBudgetUsd: options.maxBudgetUsd,
      canUseTool,
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

    log.debug(`SDK query cwd="${queryOptions.cwd}"${queryOptions.resume ? `, resume="${queryOptions.resume}"` : ''}${queryOptions.model ? `, model="${queryOptions.model}"` : ''}${queryOptions.sessionId ? `, sessionId="${queryOptions.sessionId}"` : ''}`);

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
              contextWindow: extractContextWindow(msg.modelUsage),
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
    onRawMessage?: (messageType: string) => void
  ): Promise<ChatResponse> {
    const streamHandler = new StreamHandler();
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
}

/**
 * Create a new ChatService instance
 */
export function createChatService(config?: ChatServiceConfig): ChatService {
  return new ChatService(config);
}

/**
 * Create an AsyncIterable prompt with text and image content for SDK query()
 * Story 5.5: Image Attachment
 */
async function* createMessageWithImages(
  text: string,
  images: ImageAttachment[]
): AsyncGenerator<{
  type: 'user';
  session_id: string;
  message: { role: 'user'; content: Array<{ type: string; [key: string]: unknown }> };
  parent_tool_use_id: null;
}> {
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
  };
}
