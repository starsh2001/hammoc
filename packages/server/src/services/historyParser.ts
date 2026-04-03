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

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
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
  ImageRef,
} from '@hammoc/shared';
import { sessionService } from './sessionService.js';
import { createLogger } from '../utils/logger.js';

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
): Promise<{ firstPrompt: string; messageCount: number; cwd?: string } | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return new Promise((resolve) => {
    let firstPrompt = '';
    let messageCount = 0;
    let firstPromptFound = false;
    let cwd: string | undefined;
    let settled = false;

    const settle = (value: { firstPrompt: string; messageCount: number; cwd?: string } | null) => {
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

        if (!cwd && parsed.cwd && typeof parsed.cwd === 'string') {
          cwd = parsed.cwd;
        }

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
      settle({ firstPrompt, messageCount, cwd });
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

const extractImagesLog = createLogger('historyParser:extractImages');

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/**
 * Extract image attachments from message content as URL-based ImageRef[].
 * Story 27.2: Computes SHA-256 hash of base64 data to generate deterministic URLs.
 * Lazy backfill: writes image file to disk if not already present (for pre-existing sessions).
 */
function extractImages(content: ContentBlock[] | undefined, projectSlug?: string, sessionId?: string): ImageRef[] | undefined {
  if (!content || !Array.isArray(content)) return undefined;
  if (!projectSlug || !sessionId) return undefined;

  const imageBlocks = content.filter((block): block is ImageContentBlock => block.type === 'image');
  if (imageBlocks.length === 0) return undefined;

  const images: ImageRef[] = [];

  for (let i = 0; i < imageBlocks.length; i++) {
    const block = imageBlocks[i];
    try {
      const mimeType = block.source.media_type;
      const ext = MIME_TO_EXT[mimeType];
      if (!ext) continue;

      const hash = crypto.createHash('sha256').update(block.source.data).digest('hex').substring(0, 16);
      const filename = `${hash}${ext}`;
      const url = `/api/projects/${projectSlug}/sessions/${sessionId}/images/${filename}`;

      // Lazy backfill: write image to disk if missing
      const projectDir = sessionService.getProjectDir(projectSlug);
      const imageDir = path.join(projectDir, 'images', sessionId);
      const filePath = path.join(imageDir, filename);
      if (!existsSync(filePath)) {
        // Fire-and-forget async write — next parse will find it on disk
        fs.mkdir(imageDir, { recursive: true })
          .then(() => fs.writeFile(filePath, Buffer.from(block.source.data, 'base64')))
          .catch((err) => extractImagesLog.warn(`Lazy backfill failed for ${filename}: ${err}`));
      }

      images.push({ url, mimeType, name: `image-${i + 1}` });
    } catch (err) {
      extractImagesLog.warn(`Failed to process image block ${i}: ${err}`);
    }
  }

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
export function transformToHistoryMessages(raw: RawJSONLMessage[], projectSlug?: string, sessionId?: string): HistoryMessage[] {
  const results: HistoryMessage[] = [];
  // Map tool_use block id → index in results (for merging tool_results)
  const toolUseIndexMap = new Map<string, number>();

  // Redirect map: when a message is skipped (non-display type, isMeta, empty
  // content), record uuid → parentUuid so that its children's parentId resolves
  // to the nearest included ancestor. Without this, children of skipped messages
  // become orphan roots in the client tree, breaking the conversation chain.
  const skippedRedirect = new Map<string, string | undefined>();

  function resolveParentId(parentUuid: string | null | undefined): string | undefined {
    if (!parentUuid) return undefined;
    let id: string | undefined = parentUuid;
    const visited = new Set<string>();
    while (id && skippedRedirect.has(id)) {
      if (visited.has(id)) return undefined; // cycle → treat as root
      visited.add(id);
      id = skippedRedirect.get(id);
    }
    return id;
  }

  for (const m of raw) {
    // Skip non-display types and meta messages, but record redirect so children
    // can resolve to the nearest included ancestor.
    const isDisplayType = ['user', 'assistant', 'tool_use', 'tool_result', 'queue-operation', 'system'].includes(m.type);
    if (!isDisplayType || m.isMeta) {
      skippedRedirect.set(m.uuid, m.parentUuid ?? undefined);
      continue;
    }

    // Track whether this message produces any visible output.
    const resultsBefore = results.length;

    // Resolve parentId through redirect chain (handles skipped ancestors)
    const parentId = resolveParentId(m.parentUuid);

    // Handle system messages (e.g., compact_boundary)
    if (m.type === 'system') {
      if (m.subtype === 'compact_boundary') {
        results.push({
          id: m.uuid,
          type: 'system',
          subtype: 'compact_boundary',
          content: m.content || 'Conversation compacted',
          parentId,
          timestamp: m.timestamp,
        });
      }
      // Non-compact_boundary system messages: skip with redirect
      if (results.length === resultsBefore) {
        skippedRedirect.set(m.uuid, m.parentUuid ?? undefined);
      }
      continue;
    }

    // Handle queue-operation task notifications
    if (m.type === 'queue-operation' && m.content) {
      const taskNotif = parseTaskNotification(m.content);
      if (taskNotif) {
        results.push({
          id: m.uuid || `task-notif-${results.length}`,
          type: 'task_notification',
          content: taskNotif.summary,
          timestamp: m.timestamp,
          parentId,
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
        // Split content blocks into separate HistoryMessages.
        // The first emitted fragment uses m.uuid as its id so that child
        // messages whose parentId references this raw uuid can resolve it.
        let thinkingContent: string | undefined;
        let firstFragmentEmitted = false;

        for (const block of messageContent) {
          if (block.type === 'thinking') {
            thinkingContent = (block as ThinkingContentBlock).thinking;
          } else if (block.type === 'text') {
            const text = (block as TextContentBlock).text;
            // Skip "(no content)" placeholder
            if (text.trim() && text.trim() !== '(no content)') {
              const id = !firstFragmentEmitted ? m.uuid : `${m.uuid}-text-${results.length}`;
              firstFragmentEmitted = true;
              results.push({
                id,
                type: 'assistant',
                content: text,
                timestamp: m.timestamp,
                parentId,
                thinking: thinkingContent,
              });
              thinkingContent = undefined;
            }
          } else if (block.type === 'tool_use') {
            const toolBlock = block as ToolUseContentBlock;
            const idx = results.length;
            const id = !firstFragmentEmitted ? m.uuid : `${m.uuid}-tool-${toolBlock.id}`;
            firstFragmentEmitted = true;
            results.push({
              id,
              type: 'tool_use',
              content: `Calling ${toolBlock.name}`,
              timestamp: m.timestamp,
              parentId,
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
          const id = !firstFragmentEmitted ? m.uuid : `${m.uuid}-thinking`;
          results.push({
            id,
            type: 'assistant',
            content: '',
            timestamp: m.timestamp,
            parentId,
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
            parentId,
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
              parentId,
              taskStatus: taskNotif.status,
              taskSummary: taskNotif.summary,
              taskToolUseId: taskNotif.toolUseId,
            });
          } else {
            const cleaned = cleanCommandTags(textContent);
            if (cleaned.trim()) {
              const images = extractImages(messageContent, projectSlug, sessionId);
              results.push({
                id: m.uuid,
                type: 'user',
                content: cleaned,
                timestamp: m.timestamp,
                parentId,
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
            parentId,
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
              parentId,
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
        parentId,
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
            parentId,
            toolResult: {
              success: !m.error,
              output: m.result,
              error: m.error,
            },
          });
        }
      }
    }

    // If this raw message produced no visible output (e.g., empty assistant,
    // user consumed entirely by tool_result merging), register redirect so
    // children's parentId resolves to this message's parent instead.
    if (results.length === resultsBefore) {
      skippedRedirect.set(m.uuid, m.parentUuid ?? undefined);
    }
  }

  return results;
}
