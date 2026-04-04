/**
 * SessionBufferManager — unified per-session message buffer
 * Story 27.1: Holds history + streaming messages in memory,
 * delivers all message data exclusively via WebSocket.
 */

import type { HistoryMessage } from '@hammoc/shared';
import { ROOT_BRANCH_KEY } from '@hammoc/shared';
import { parseJSONLFile, transformToHistoryMessages } from './historyParser.js';
import { sessionService } from './sessionService.js';
import {
  buildRawMessageTree,
  getActiveRawBranch,
  getDefaultRawBranchSelections,
} from '../utils/messageTree.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sessionBufferManager');

export interface SessionBuffer {
  sessionId: string;
  messages: HistoryMessage[];
  streaming: boolean;
}

export class SessionBufferManager {
  private buffers = new Map<string, SessionBuffer>();

  create(sessionId: string, streaming = false): SessionBuffer {
    const existing = this.buffers.get(sessionId);
    if (existing) {
      existing.streaming = streaming;
      return existing;
    }
    const buffer: SessionBuffer = { sessionId, messages: [], streaming };
    this.buffers.set(sessionId, buffer);
    log.debug(`Buffer created for session ${sessionId}`);
    return buffer;
  }

  get(sessionId: string): SessionBuffer | undefined {
    return this.buffers.get(sessionId);
  }

  setMessages(sessionId: string, messages: HistoryMessage[]): void {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) {
      log.warn(`setMessages: no buffer for session ${sessionId}`);
      return;
    }
    buffer.messages = messages;
  }

  addMessage(sessionId: string, message: HistoryMessage): void {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) {
      log.warn(`addMessage: no buffer for session ${sessionId}`);
      return;
    }
    buffer.messages.push(message);
  }

  setStreaming(sessionId: string, streaming: boolean): void {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) {
      log.warn(`setStreaming: no buffer for session ${sessionId}`);
      return;
    }
    buffer.streaming = streaming;
  }

  async reloadFromJSONL(
    sessionId: string,
    projectSlug: string,
    branchSelections?: Record<string, number>,
  ): Promise<HistoryMessage[]> {
    const filePath = sessionService.getSessionFilePath(projectSlug, sessionId);
    const rawMessages = await parseJSONLFile(filePath);
    if (rawMessages.length === 0) {
      if (!branchSelections) {
        this.setMessages(sessionId, []);
      }
      return [];
    }
    const tree = buildRawMessageTree(rawMessages);
    const defaults = getDefaultRawBranchSelections(tree.roots);
    const selections = branchSelections
      ? { ...defaults, ...branchSelections }
      : defaults;
    const { messages: branchMessages, branchPoints } = getActiveRawBranch(tree.roots, selections);
    const historyMessages = transformToHistoryMessages(branchMessages, projectSlug, sessionId);
    // Attach branchInfo to individual messages so the client can render branch navigation
    if (Object.keys(branchPoints).length > 0) {
      const idIndex = new Map<string, HistoryMessage>();
      for (const m of historyMessages) {
        idIndex.set(m.id, m);
      }
      for (const [msgId, info] of Object.entries(branchPoints)) {
        const msg = idIndex.get(msgId)
          // ROOT_BRANCH_KEY ('__root__') won't match any message ID —
          // attach to the first message so root-level branches are navigable.
          ?? (msgId === ROOT_BRANCH_KEY ? historyMessages[0] : undefined);
        if (msg) {
          msg.branchInfo = info;
        }
      }
    }
    if (!branchSelections) {
      this.setMessages(sessionId, historyMessages);
    }
    log.debug(`reloadFromJSONL: session=${sessionId}, ${historyMessages.length} messages`);
    return historyMessages;
  }

  rekey(oldId: string, newId: string): void {
    const buffer = this.buffers.get(oldId);
    if (!buffer) {
      log.warn(`rekey: no buffer for session ${oldId}`);
      return;
    }
    this.buffers.delete(oldId);
    buffer.sessionId = newId;
    this.buffers.set(newId, buffer);
    log.debug(`Buffer re-keyed: ${oldId} → ${newId}`);
  }

  destroy(sessionId: string): void {
    const deleted = this.buffers.delete(sessionId);
    if (deleted) {
      log.debug(`Buffer destroyed for session ${sessionId}`);
    }
  }

  /** Visible for testing */
  get size(): number {
    return this.buffers.size;
  }
}

export const sessionBufferManager = new SessionBufferManager();
