/**
 * Message Store - Zustand store for session history messages
 * Story 27.1: Simplified to receive messages exclusively via WebSocket.
 * setMessages() is the primary API — "store whatever the server sends."
 */

import { create } from 'zustand';
import type { HistoryMessage, ImageRef } from '@hammoc/shared';
import { generateUUID } from '../utils/uuid';
import { debugLog } from '../utils/debugLogger';

interface MessageState {
  messages: HistoryMessage[];
  currentProjectSlug: string | null;
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface MessageActions {
  /** Replace all messages with server-authoritative data (stream:history / stream:complete-messages) */
  setMessages: (messages: HistoryMessage[]) => void;
  clearMessages: () => void;
  /** Add a user message from server user:message event */
  addUserMessage: (content: string, images?: ImageRef[], timestamp?: string) => void;
  /** Add multiple messages in batch (used by completeStreaming) */
  addMessages: (newMessages: HistoryMessage[]) => void;
}

type MessageStore = MessageState & MessageActions;

export const useMessageStore = create<MessageStore>((set, get) => ({
  // State
  messages: [],
  currentProjectSlug: null,
  currentSessionId: null,
  isLoading: false,
  error: null,

  setMessages: (messages: HistoryMessage[]) => {
    const current = get().messages;

    // Skip no-op: same length and all IDs match (common on reconnect/re-join)
    if (
      current.length === messages.length &&
      current.length > 0 &&
      current.every((m, i) => m.id === messages[i].id)
    ) {
      debugLog.message('setMessages skipped (no change)', { count: messages.length });
      return;
    }

    debugLog.message('setMessages called', {
      count: messages.length,
      types: messages.map(m => m.type),
    });

    // Story 27.2: Server always provides ImageRef with URL in both
    // user:message and stream:history / stream:complete-messages,
    // so client-side image preservation is no longer needed.
    set({ messages, isLoading: false, error: null });
  },

  clearMessages: () => {
    set({
      messages: [],
      currentProjectSlug: null,
      currentSessionId: null,
      isLoading: false,
      error: null,
    });
  },

  addUserMessage: (content: string, images?: ImageRef[], timestamp?: string) => {
    const trimmed = content.trim();
    const ts = timestamp ?? new Date().toISOString();

    const message: HistoryMessage = {
      id: `user-${generateUUID()}`,
      type: 'user',
      content: trimmed,
      timestamp: ts,
      ...(images && images.length > 0 ? { images } : {}),
    };
    set((state) => ({ messages: [...state.messages, message] }));
  },

  addMessages: (newMessages: HistoryMessage[]) => {
    if (newMessages.length === 0) return;
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const uniqueNewMessages = newMessages.filter((m) => !existingIds.has(m.id));
      if (uniqueNewMessages.length === 0) return state;
      return { messages: [...state.messages, ...uniqueNewMessages] };
    });
  },
}));
