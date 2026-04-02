/**
 * SessionBufferManager — unified per-session message buffer
 * Story 27.1: Holds history + streaming messages in memory,
 * delivers all message data exclusively via WebSocket.
 */

import type { HistoryMessage } from '@hammoc/shared';
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

  create(sessionId: string): SessionBuffer {
    const existing = this.buffers.get(sessionId);
    if (existing) {
      log.debug(`Buffer already exists for session ${sessionId}, reusing`);
      return existing;
    }
    const buffer: SessionBuffer = { sessionId, messages: [], streaming: false };
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

  async reloadFromJSONL(sessionId: string, projectSlug: string): Promise<HistoryMessage[]> {
    const filePath = sessionService.getSessionFilePath(projectSlug, sessionId);
    const rawMessages = await parseJSONLFile(filePath);
    if (rawMessages.length === 0) {
      this.setMessages(sessionId, []);
      return [];
    }
    const tree = buildRawMessageTree(rawMessages);
    const selections = getDefaultRawBranchSelections(tree.roots);
    const { messages: branchMessages } = getActiveRawBranch(tree.roots, selections);
    const historyMessages = transformToHistoryMessages(branchMessages);
    this.setMessages(sessionId, historyMessages);
    log.debug(`reloadFromJSONL: session ${sessionId}, ${historyMessages.length} messages`);
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
