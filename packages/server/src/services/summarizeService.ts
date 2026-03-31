/**
 * Summarize Service — Story 25.9
 *
 * Uses Agent SDK query() with a temporary session to generate conversation
 * summaries. Works with both OAuth and API key authentication.
 * The temporary session JSONL is deleted after use.
 */

import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '../utils/logger.js';
import { SessionService } from './sessionService.js';

const log = createLogger('summarizeService');

const SUMMARY_PROMPT_PREFIX = `You are a conversation summarizer. Given the following conversation between a user and an AI assistant, produce a concise structured summary that preserves:

1. **Key decisions made** — what was agreed upon
2. **Important code changes** — files created/modified, patterns adopted
3. **Current state** — what has been completed, what remains
4. **Critical context** — constraints, gotchas, or requirements mentioned

Format the summary as a bulleted list grouped by these categories. Be concise but complete — the summary will be used to continue the conversation from an earlier point. Write in the same language as the original conversation.

<conversation>
`;

const SUMMARY_PROMPT_SUFFIX = `
</conversation>

Summarize the above conversation.`;

/** Max estimated tokens for input messages (safety margin) */
const MAX_INPUT_TOKENS = 200_000;

/** Simple heuristic: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface SummarizeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SummarizeOptions {
  signal?: AbortSignal;
  locale?: string;
  /** Working directory for SDK query (needed for project context) */
  cwd?: string;
  /** Project slug for temp session cleanup — uses SessionService path encoding */
  projectSlug?: string;
}

/**
 * Summarize a list of conversation messages using Agent SDK query().
 * Creates a temporary session, extracts the summary, then deletes the session file.
 */
export async function summarize(
  messages: SummarizeMessage[],
  options?: SummarizeOptions
): Promise<string> {
  if (!messages || messages.length === 0) {
    throw new Error('No messages to summarize');
  }

  // Truncate from the beginning if over token limit (keep recent messages)
  let truncated = messages;
  let totalTokens = truncated.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  if (totalTokens > MAX_INPUT_TOKENS) {
    truncated = [...messages];
    while (totalTokens > MAX_INPUT_TOKENS && truncated.length > 0) {
      const removed = truncated.shift()!;
      totalTokens -= estimateTokens(removed.content);
    }
    log.info(`Truncated messages from ${messages.length} to ${truncated.length} (token estimate: ${totalTokens})`);
    if (truncated.length === 0) {
      throw new Error('Conversation too large to summarize');
    }
  }

  // Format conversation
  const conversationText = truncated
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  let localeHint = '';
  if (options?.locale) {
    localeHint = `\nRespond in ${options.locale} language.\n`;
  }

  const prompt = SUMMARY_PROMPT_PREFIX + conversationText + SUMMARY_PROMPT_SUFFIX + localeHint;

  const tempSessionId = randomUUID();

  // Resolve temp session JSONL path using SessionService (same encoding as SDK)
  let tempSessionPath: string | null = null;
  if (options?.projectSlug) {
    const sessionService = new SessionService();
    tempSessionPath = sessionService.getSessionFilePath(options.projectSlug, tempSessionId);
  }

  log.info(`Generating summary: tempSession=${tempSessionId}, messageCount=${truncated.length}`);

  try {
    const q = query({
      prompt,
      options: {
        maxTurns: 1,
        sessionId: tempSessionId,
        cwd: options?.cwd,
        permissionMode: 'dontAsk',
        enableFileCheckpointing: false,
        abortController: options?.signal
          ? (() => { const ac = new AbortController(); options.signal.addEventListener('abort', () => ac.abort(), { once: true }); return ac; })()
          : undefined,
      },
    });

    let resultText = '';

    for await (const message of q) {
      if (options?.signal?.aborted) {
        await q.return();
        break;
      }
      if (message.type === 'result') {
        const msg = message as unknown as { result?: string; subtype?: string; is_error?: boolean };
        if (msg.subtype === 'success' && msg.result) {
          resultText = msg.result;
        } else if (msg.is_error || (msg.subtype && msg.subtype !== 'success')) {
          throw new Error(msg.result || `Summary failed: ${msg.subtype}`);
        }
      }
    }

    if (!resultText) {
      throw new Error('No text content in summary response');
    }

    return resultText;
  } finally {
    // Clean up temporary session JSONL
    if (tempSessionPath) {
      try {
        await unlink(tempSessionPath);
        log.debug(`Deleted temp session: ${tempSessionPath}`);
      } catch {
        log.warn(`Failed to delete temp session: ${tempSessionPath}`);
      }
    }
  }
}
