/**
 * Summarize Service — Story 25.9
 *
 * Uses Anthropic REST SDK to generate conversation summaries
 * independently from the Agent SDK session system.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.js';

const log = createLogger('summarizeService');

const SYSTEM_PROMPT = `You are a conversation summarizer. Given a conversation between a user and an AI assistant, produce a concise structured summary that preserves:

1. **Key decisions made** — what was agreed upon
2. **Important code changes** — files created/modified, patterns adopted
3. **Current state** — what has been completed, what remains
4. **Critical context** — constraints, gotchas, or requirements mentioned

Format the summary as a bulleted list grouped by these categories. Be concise but complete — the summary will be used to continue the conversation from an earlier point. Write in the same language as the original conversation.`;

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
}

/**
 * Summarize a list of conversation messages using Anthropic REST API.
 */
export async function summarize(
  messages: SummarizeMessage[],
  options?: SummarizeOptions
): Promise<string> {
  if (!messages || messages.length === 0) {
    throw new Error('No messages to summarize');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
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
  }

  // Format conversation for the user message
  const conversationText = truncated
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  // Build system prompt with optional locale
  let systemPrompt = SYSTEM_PROMPT;
  if (options?.locale) {
    systemPrompt += `\nRespond in ${options.locale} language.`;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.SUMMARIZE_MODEL || 'claude-sonnet-4-20250514';

  log.info(`Generating summary with model=${model}, messageCount=${truncated.length}`);

  const response = await client.messages.create(
    {
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `<conversation>\n${conversationText}\n</conversation>\n\nSummarize the above conversation.`,
        },
      ],
    },
    {
      signal: options?.signal,
    }
  );

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in summary response');
  }

  return textBlock.text;
}
