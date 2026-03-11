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
import { existsSync } from 'fs';
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

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLMessage;
      messages.push(parsed);
    } catch {
      // Skip invalid JSON lines (e.g. trailing newlines, partial writes)
    }
  }

  return messages;
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
    toolUseId: toolUseIdMatch?.[1],
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
    if (!['user', 'assistant', 'tool_use', 'tool_result'].includes(m.type)) continue;
    if (m.isMeta) continue;

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
