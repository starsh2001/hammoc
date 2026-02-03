/**
 * History Parser Service
 * Story 3.5: Session History Loading
 *
 * Parses Claude Code JSONL session files and transforms them
 * into HistoryMessage format for client display.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import type {
  RawJSONLMessage,
  HistoryMessage,
  ContentBlock,
  TextContentBlock,
} from '@bmad-studio/shared';

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
      // Skip invalid JSON lines
      console.warn('Invalid JSON line in session file:', line.slice(0, 50));
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
 * Extract tool use info from content blocks
 * @param content The message content (ContentBlock[])
 * @returns Tool use info or null
 */
function extractToolUseFromContent(
  content: ContentBlock[]
): { name: string; input: Record<string, unknown> } | null {
  const toolUseBlock = content.find((block) => block.type === 'tool_use');
  if (toolUseBlock && toolUseBlock.type === 'tool_use') {
    return {
      name: toolUseBlock.name,
      input: toolUseBlock.input,
    };
  }
  return null;
}

/**
 * Clean up command tags from user messages
 * Converts "<command-message>X</command-message>\n<command-name>/Y</command-name>" to "/Y"
 * @param content The raw message content
 * @returns Cleaned content showing just the command
 */
function cleanCommandTags(content: string): string {
  // Check if this is a command message
  const commandNameMatch = content.match(/<command-name>([^<]+)<\/command-name>/);
  if (commandNameMatch) {
    return commandNameMatch[1]; // Return just the command name like "/sm"
  }
  return content;
}

/**
 * Transform raw JSONL messages to HistoryMessage format
 * Filters out init/system/progress/meta messages and messages with empty content
 * @param raw Array of raw messages
 * @returns Array of transformed HistoryMessages for display
 */
export function transformToHistoryMessages(raw: RawJSONLMessage[]): HistoryMessage[] {
  const displayTypes = ['user', 'assistant', 'tool_use', 'tool_result'];

  return raw
    .filter((m) => displayTypes.includes(m.type))
    // Filter out meta messages (expanded slash commands)
    .filter((m) => !m.isMeta)
    .map((m): HistoryMessage | null => {
      const base: HistoryMessage = {
        id: m.uuid,
        type: m.type as HistoryMessage['type'],
        timestamp: m.timestamp,
        content: '',
      };

      if (m.type === 'user' || m.type === 'assistant') {
        const messageContent = m.message?.content;
        base.content = extractTextContent(messageContent);

        // Clean up command tags from user messages (show "/sm" instead of full XML)
        if (m.type === 'user' && typeof base.content === 'string') {
          base.content = cleanCommandTags(base.content);
        }

        // Check for tool_use blocks in assistant messages
        if (m.type === 'assistant' && Array.isArray(messageContent)) {
          const toolUse = extractToolUseFromContent(messageContent);
          if (toolUse) {
            base.type = 'tool_use';
            base.toolName = toolUse.name;
            base.toolInput = toolUse.input;
            if (!base.content) {
              base.content = `Calling ${toolUse.name}`;
            }
          }
        }
      } else if (m.type === 'tool_use') {
        base.toolName = m.toolName;
        base.toolInput = m.toolInput;
        base.content = `Calling ${m.toolName}`;
      } else if (m.type === 'tool_result') {
        base.toolResult = {
          success: !m.error,
          output: m.result,
          error: m.error,
        };
        base.content = m.error || m.result || '';
      }

      // Filter out messages with empty content (e.g., thinking-only blocks)
      if (!base.content || base.content.trim() === '') {
        return null;
      }

      return base;
    })
    .filter((m): m is HistoryMessage => m !== null);
}

/**
 * Parse a session file and return processed HistoryMessages
 * Combines parseJSONLFile, sortMessagesByParentUuid, and transformToHistoryMessages
 * @param filePath Path to the JSONL session file
 * @returns Array of processed HistoryMessages ready for display
 */
export async function parseSessionHistory(filePath: string): Promise<HistoryMessage[]> {
  const rawMessages = await parseJSONLFile(filePath);
  const sorted = sortMessagesByParentUuid(rawMessages);
  return transformToHistoryMessages(sorted);
}
