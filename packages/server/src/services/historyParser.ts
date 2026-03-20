/**
 * History Parser Service
 * Story 3.5: Session History Loading
 *
 * Parses Claude Code JSONL session files and transforms them
 * into HistoryMessage format for client display.
 *
 * Content blocks within a single assistant/user message are split into
 * separate HistoryMessages to match streaming segment order:
 *   thinking → text → tool_use (each) with tool_result merged by ID
 */

import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import * as readline from 'node:readline';
import type {
  RawJSONLMessage,
  HistoryMessage,
  ContentBlock,
  TextContentBlock,
  ThinkingContentBlock,
  ToolUseContentBlock,
  ToolResultContentBlock,
  ImageContentBlock,
} from '@hammoc/shared';

/**
 * Parse a JSONL file and return raw messages
 * @param filePath Path to the JSONL session file
 * @returns Array of parsed raw messages
 */
export async function parseJSONLFile(filePath: string): Promise<RawJSONLMessage[]> {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const messages: RawJSONLMessage[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]) as RawJSONLMessage;
      // queue-operation messages lack uuid — assign a synthetic one
      if (!parsed.uuid) {
        parsed.uuid = `__line-${i}`;
      }
      messages.push(parsed);
    } catch {
      // Skip invalid JSON lines (e.g. trailing newlines, partial writes)
    }
  }

  return messages;
}

/**
 * Lightweight stream-based JSONL parser for session metadata extraction.
 * Reads line-by-line using readline streams instead of loading the entire
 * file into memory. Extracts firstPrompt and messageCount without building
 * a full message array.
 *
 * @param filePath Path to the JSONL session file
 * @returns Session metadata (firstPrompt, messageCount) or null if file missing/unparseable
 */
export async function parseJSONLSessionMeta(
  filePath: string
): Promise<{ firstPrompt: string; messageCount: number } | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return new Promise((resolve) => {
    let firstPrompt = '';
    let messageCount = 0;
    let firstPromptFound = false;
    let settled = false;

    const settle = (value: { firstPrompt: string; messageCount: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line);
        const type = parsed.type;

        if (type === 'user' || type === 'assistant') {
          messageCount++;
        }

        // Extract firstPrompt from the first user message
        if (!firstPromptFound && type === 'user') {
          firstPromptFound = true;
          const content = parsed.message?.content;
          if (typeof content === 'string') {
            firstPrompt = content;
          } else if (Array.isArray(content)) {
            const textBlock = content
              .filter((b: { type: string }) => b.type === 'text')
              .find(
                (b: { text?: string }) =>
                  typeof b.text === 'string' && cleanCommandTags(b.text).trim()
              );
            if (textBlock && typeof textBlock.text === 'string') {
              firstPrompt = textBlock.text;
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    });

    rl.on('close', () => {
      settle({ firstPrompt, messageCount });
    });

    rl.on('error', () => {
      settle(null);
    });

    stream.on('error', () => {
      rl.close();
      settle(null);
    });
  });
}

/**
 * Sort messages by parentUuid to maintain conversation order
 * Uses BFS traversal based on parent-child relationships
 * @param messages Array of raw messages
 * @returns Sorted array of messages in conversation order
 */
export function sortMessagesByParentUuid(messages: RawJSONLMessage[]): RawJSONLMessage[] {
  const childrenMap = new Map<string, RawJSONLMessage[]>();

  // Build children map
  for (const msg of messages) {
    if (msg.parentUuid) {
      const children = childrenMap.get(msg.parentUuid) || [];
      children.push(msg);
      childrenMap.set(msg.parentUuid, children);
    }
  }

  // Find root messages (no parentUuid)
  const roots = messages.filter((m) => !m.parentUuid);

  // Sort roots by timestamp
  roots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // BFS traversal
  const sorted: RawJSONLMessage[] = [];
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const children = childrenMap.get(current.uuid) || [];
    // Sort children by timestamp for consistent ordering
    children.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    queue.push(...children);
  }

  // Final sort by timestamp to handle session resume scenarios
  // where multiple root trees exist and BFS order doesn't reflect chronological order
  sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return sorted;
}

/**
 * Extract text content from message content
 * Handles both string content and array of content blocks
 * @param content The message content (string or ContentBlock[])
 * @returns Extracted text string
 */
function extractTextContent(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';

  // If content is a string, return it directly
  if (typeof content === 'string') {
    return content;
  }

  // If content is an array, extract text from text blocks
  if (Array.isArray(content)) {
    return content
      .filter((block): block is TextContentBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Extract image attachments from message content
 * @param content The message content (array of ContentBlock)
 * @returns Array of image attachments in HistoryMessage format
 */
function extractImages(content: ContentBlock[] | undefined): Array<{ mimeType: string; data: string; name: string }> | undefined {
  if (!content || !Array.isArray(content)) return undefined;

  const images = content
    .filter((block): block is ImageContentBlock => block.type === 'image')
    .map((block, index) => ({
      mimeType: block.source.media_type,
      data: block.source.data,
      name: `image-${index + 1}`, // Generate name from index
    }));

  return images.length > 0 ? images : undefined;
}

/**
 * Check if content is a task-notification message inserted by the SDK
 * @param content The raw message content
 * @returns Parsed task notification data, or null if not a task notification
 */
function parseTaskNotification(content: string): { status: 'completed' | 'failed' | 'stopped'; summary: string; toolUseId?: string } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('<task-notification>')) return null;

  // Require both <task-id> and <status> to distinguish SDK-generated notifications
  // from user messages that happen to start with the tag text
  if (!/<task-id>/.test(trimmed)) return null;

  const statusMatch = trimmed.match(/<status>(completed|failed|stopped)<\/status>/);
  const summaryMatch = trimmed.match(/<summary>([\s\S]*?)<\/summary>/);
  const toolUseIdMatch = trimmed.match(/<tool-use-id>([\s\S]*?)<\/tool-use-id>/);

  if (!statusMatch) return null;

  return {
    status: statusMatch[1] as 'completed' | 'failed' | 'stopped',
    summary: summaryMatch?.[1] ?? '',
    toolUseId: toolUseIdMatch?.[1]?.trim() || undefined,
  };
}

/**
 * Clean up command tags from user messages
 * Converts "<command-message>X</command-message>\n<command-name>/Y</command-name>" to "/Y"
 * @param content The raw message content
 * @returns Cleaned content showing just the command
 */
export function cleanCommandTags(content: string): string {
  // Skip local command output (CLI-only messages like "Compacted", "Login successful")
  if (content.includes('<local-command-stdout>')) {
    return '';
  }
  let cleaned = content;
  // Remove <ide_opened_file> blocks entirely (content included)
  cleaned = cleaned.replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '');
  // Remove <command-message> blocks entirely (content included)
  cleaned = cleaned.replace(/<command-message>[\s\S]*?<\/command-message>/g, '');
  // Remove <command-args> blocks entirely (content included)
  cleaned = cleaned.replace(/<command-args>[\s\S]*?<\/command-args>/g, '');
  // Strip <command-name> tags but keep inner text
  cleaned = cleaned.replace(/<\/?command-name>/g, '');
  return cleaned.trim();
}

/**
 * Transform raw JSONL messages to HistoryMessage format.
 *
 * Key behavior: splits content blocks from a single SDK message into
 * separate HistoryMessages (thinking, text, each tool_use) and merges
 * tool_result blocks back into their corresponding tool_use by ID.
 * This produces an ordering that matches real-time streaming segments.
 *
 * @param raw Array of raw messages (sorted)
 * @returns Array of transformed HistoryMessages for display
 */
export function transformToHistoryMessages(raw: RawJSONLMessage[]): HistoryMessage[] {
  const results: HistoryMessage[] = [];
  // Map tool_use block id → index in results (for merging tool_results)
  const toolUseIndexMap = new Map<string, number>();

  for (const m of raw) {
    // Skip non-display types and meta messages
    if (!['user', 'assistant', 'tool_use', 'tool_result', 'queue-operation'].includes(m.type)) continue;
    if (m.isMeta) continue;

    // Handle queue-operation task notifications
    if (m.type === 'queue-operation' && m.content) {
      const taskNotif = parseTaskNotification(m.content);
      if (taskNotif) {
        results.push({
          id: m.uuid || `task-notif-${results.length}`,
          type: 'task_notification',
          content: taskNotif.summary,
          timestamp: m.timestamp,
          taskStatus: taskNotif.status,
          taskSummary: taskNotif.summary,
          taskToolUseId: taskNotif.toolUseId,
        });
      }
      continue;
    }

    if (m.type === 'assistant') {
      const messageContent = m.message?.content;

      if (Array.isArray(messageContent)) {
        // Split content blocks into separate HistoryMessages
        let thinkingContent: string | undefined;

        for (const block of messageContent) {
          if (block.type === 'thinking') {
            thinkingContent = (block as ThinkingContentBlock).thinking;
          } else if (block.type === 'text') {
            const text = (block as TextContentBlock).text;
            // Skip "(no content)" placeholder
            if (text.trim() && text.trim() !== '(no content)') {
              results.push({
                id: `${m.uuid}-text-${results.length}`,
                type: 'assistant',
                content: text,
                timestamp: m.timestamp,
                thinking: thinkingContent,
              });
              thinkingContent = undefined;
            }
          } else if (block.type === 'tool_use') {
            const toolBlock = block as ToolUseContentBlock;
            const idx = results.length;
            results.push({
              id: `${m.uuid}-tool-${toolBlock.id}`,
              type: 'tool_use',
              content: `Calling ${toolBlock.name}`,
              timestamp: m.timestamp,
              toolName: toolBlock.name,
              toolInput: toolBlock.input,
              thinking: thinkingContent,
            });
            toolUseIndexMap.set(toolBlock.id, idx);
            thinkingContent = undefined;
          }
        }

        // If only thinking with no text/tool, create thinking-only message
        if (thinkingContent) {
          results.push({
            id: `${m.uuid}-thinking`,
            type: 'assistant',
            content: '',
            timestamp: m.timestamp,
            thinking: thinkingContent,
          });
        }
      } else {
        // Simple string content
        const text = extractTextContent(messageContent);
        if (text.trim() && text.trim() !== '(no content)') {
          results.push({
            id: m.uuid,
            type: 'assistant',
            content: text,
            timestamp: m.timestamp,
          });
        }
      }
    } else if (m.type === 'user') {
      const messageContent = m.message?.content;

      if (Array.isArray(messageContent)) {
        // Merge each tool_result into its corresponding tool_use
        const toolResultBlocks = messageContent.filter(
          (b): b is ToolResultContentBlock => b.type === 'tool_result'
        );

        for (const block of toolResultBlocks) {
          const toolUseId = block.tool_use_id;
          const idx = toolUseIndexMap.get(toolUseId);
          if (idx !== undefined) {
            const rawContent = typeof block.content === 'string' ? block.content : '';
            // Strip SDK XML wrapper tags (e.g. <tool_use_error>...</tool_use_error>)
            const resultContent = rawContent.replace(/<\/?(?:tool_use_error|error|result)>/g, '').trim();
            const isError = (block as unknown as { is_error?: boolean }).is_error ?? false;
            results[idx].toolResult = {
              success: !isError,
              output: isError ? undefined : resultContent,
              error: isError ? resultContent : undefined,
            };
            // Compute tool execution duration from timestamp diff
            const toolUseTs = new Date(results[idx].timestamp).getTime();
            const toolResultTs = new Date(m.timestamp).getTime();
            if (toolUseTs && toolResultTs && toolResultTs > toolUseTs) {
              results[idx].toolDuration = toolResultTs - toolUseTs;
            }
          }
        }

        // If user message has text content (not just tool_results), create user message
        if (toolResultBlocks.length === 0) {
          const textContent = extractTextContent(messageContent);
          // Check for SDK-inserted task notification
          const taskNotif = parseTaskNotification(textContent);
          if (taskNotif) {
            results.push({
              id: m.uuid,
              type: 'task_notification',
              content: taskNotif.summary,
              timestamp: m.timestamp,
              taskStatus: taskNotif.status,
              taskSummary: taskNotif.summary,
              taskToolUseId: taskNotif.toolUseId,
            });
          } else {
            const cleaned = cleanCommandTags(textContent);
            if (cleaned.trim()) {
              const images = extractImages(messageContent);
              results.push({
                id: m.uuid,
                type: 'user',
                content: cleaned,
                timestamp: m.timestamp,
                ...(images && { images }),
              });
            }
          }
        }
      } else {
        // Simple string content
        const text = extractTextContent(messageContent);
        // Check for SDK-inserted task notification
        const taskNotif = parseTaskNotification(text);
        if (taskNotif) {
          results.push({
            id: m.uuid,
            type: 'task_notification',
            content: taskNotif.summary,
            timestamp: m.timestamp,
            taskStatus: taskNotif.status,
            taskSummary: taskNotif.summary,
            taskToolUseId: taskNotif.toolUseId,
          });
        } else {
          const cleaned = cleanCommandTags(text);
          if (cleaned.trim()) {
            results.push({
              id: m.uuid,
              type: 'user',
              content: cleaned,
              timestamp: m.timestamp,
            });
          }
        }
      }
    } else if (m.type === 'tool_use') {
      // Legacy inline tool_use format
      const idx = results.length;
      results.push({
        id: m.uuid,
        type: 'tool_use',
        content: `Calling ${m.toolName}`,
        timestamp: m.timestamp,
        toolName: m.toolName,
        toolInput: m.toolInput,
      });
      // Legacy tool_use doesn't have a block id — use uuid as key
      toolUseIndexMap.set(m.uuid, idx);
    } else if (m.type === 'tool_result') {
      // Legacy inline tool_result format — merge into last unresolved tool_use
      let merged = false;
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i].type === 'tool_use' && !results[i].toolResult) {
          results[i].toolResult = {
            success: !m.error,
            output: m.result,
            error: m.error,
          };
          // Compute tool execution duration from timestamp diff
          const toolUseTs = new Date(results[i].timestamp).getTime();
          const toolResultTs = new Date(m.timestamp).getTime();
          if (toolUseTs && toolResultTs && toolResultTs > toolUseTs) {
            results[i].toolDuration = toolResultTs - toolUseTs;
          }
          merged = true;
          break;
        }
      }
      // If no matching tool_use found, keep as standalone (error display)
      if (!merged) {
        const content = m.error || m.result || '';
        if (content.trim()) {
          results.push({
            id: m.uuid,
            type: 'tool_result',
            content,
            timestamp: m.timestamp,
            toolResult: {
              success: !m.error,
              output: m.result,
              error: m.error,
            },
          });
        }
      }
    }
  }

  return results;
}

/**
 * Convert completed stream buffer events to HistoryMessages.
 * Used by getMessages API to merge recent stream data with JSONL history
 * when the SDK hasn't flushed to disk yet.
 */
export function transformBufferToHistoryMessages(
  events: Array<{ event: string; data: unknown }>,
): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  let messageId: string | null = null;
  let pendingThinking: string | undefined;
  let textAccumulator = '';
  const toolResults = new Map<string, { result: { success: boolean; output?: string; error?: string } }>();
  const toolInputUpdates = new Map<string, Record<string, unknown>>();

  // First pass: collect tool results, input updates, and message:complete timestamp
  let completeTimestamp: string | undefined;
  for (const { event, data } of events) {
    if (event === 'tool:result') {
      const d = data as { toolCallId: string; result: { success: boolean; output?: string; error?: string } };
      toolResults.set(d.toolCallId, { result: d.result });
    } else if (event === 'tool:input-update') {
      const d = data as { toolCallId: string; input: Record<string, unknown> };
      toolInputUpdates.set(d.toolCallId, d.input);
    } else if (event === 'message:complete') {
      const d = data as { timestamp?: Date | string };
      if (d.timestamp) {
        completeTimestamp = d.timestamp instanceof Date ? d.timestamp.toISOString() : d.timestamp;
      }
    }
  }
  // Fallback timestamp — prefer message:complete time over parse time
  const baseTimestamp = completeTimestamp ?? new Date().toISOString();

  const flushText = () => {
    if (textAccumulator && messageId) {
      messages.push({
        id: `${messageId}-text-${messages.length}`,
        type: 'assistant',
        content: textAccumulator,
        timestamp: baseTimestamp,
        ...(pendingThinking && { thinking: pendingThinking }),
      });
      pendingThinking = undefined;
      textAccumulator = '';
    }
  };

  for (const { event, data } of events) {
    switch (event) {
      case 'user:message': {
        const d = data as { content: string; sessionId?: string; timestamp?: string; imageCount?: number };
        if (d.sessionId && !messageId) messageId = d.sessionId;
        messages.push({
          id: `${messageId || 'buf'}-user-${messages.length}`,
          type: 'user',
          content: d.content,
          timestamp: d.timestamp || baseTimestamp,
        });
        break;
      }
      case 'system:task-notification': {
        const d = data as { taskId: string; status: 'completed' | 'failed' | 'stopped'; summary?: string; toolUseId?: string };
        messages.push({
          id: `${messageId || 'buf'}-task-${d.taskId}`,
          type: 'task_notification',
          content: d.summary || '',
          timestamp: baseTimestamp,
          taskStatus: d.status,
          taskSummary: d.summary,
          taskToolUseId: d.toolUseId,
        });
        break;
      }
      case 'session:created':
      case 'session:resumed': {
        const d = data as { sessionId: string };
        if (!messageId) messageId = d.sessionId;
        break;
      }
      case 'message:chunk': {
        const d = data as { messageId?: string; content: string };
        if (d.messageId) messageId = d.messageId;
        textAccumulator += d.content;
        break;
      }
      case 'thinking:chunk': {
        const d = data as { content: string };
        flushText();
        pendingThinking = (pendingThinking ?? '') + d.content;
        break;
      }
      case 'tool:call': {
        const d = data as { id: string; name: string; input?: Record<string, unknown>; startedAt?: number };
        flushText();
        // Use final input from tool:input-update if available, fall back to initial
        const finalInput = toolInputUpdates.get(d.id) ?? d.input;
        const result = toolResults.get(d.id);
        messages.push({
          id: `${messageId}-tool-${d.id}`,
          type: 'tool_use',
          content: `Calling ${d.name}`,
          // Use startedAt as timestamp if available (actual event time)
          timestamp: d.startedAt ? new Date(d.startedAt).toISOString() : new Date().toISOString(),
          toolName: d.name,
          toolInput: finalInput,
          ...(pendingThinking && { thinking: pendingThinking }),
          ...(result && { toolResult: result.result }),
          // toolDuration is not computed from buffer — JSONL parser computes
          // it accurately from tool_use/tool_result timestamp diff instead.
        });
        pendingThinking = undefined;
        break;
      }
      case 'message:complete': {
        flushText();
        if (pendingThinking && messageId) {
          messages.push({
            id: `${messageId}-thinking-${messages.length}`,
            type: 'assistant',
            content: '',
            timestamp: baseTimestamp,
            thinking: pendingThinking,
          });
          pendingThinking = undefined;
        }
        break;
      }
    }
  }

  flushText();
  return messages;
}
