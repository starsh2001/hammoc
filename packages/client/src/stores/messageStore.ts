/**
 * Message Store - Zustand store for session history messages
 * [Source: Story 3.5 - Task 5]
 */

import { create } from 'zustand';
import type { HistoryMessage, PaginationInfo, ImageAttachment } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';
import { useChatStore } from './chatStore';

interface MessageState {
  messages: HistoryMessage[];
  currentProjectSlug: string | null;
  currentSessionId: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  pagination: PaginationInfo | null;
}

interface MessageActions {
  fetchMessages: (projectSlug: string, sessionId: string, options?: { silent?: boolean; minMessageCount?: number }) => Promise<void>;
  fetchMoreMessages: () => Promise<void>;
  clearMessages: () => void;
  /** Add user message optimistically (before server confirmation) */
  addOptimisticMessage: (content: string, images?: ImageAttachment[]) => void;
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
  isLoadingMore: false,
  error: null,
  pagination: null,

  // Actions
  fetchMessages: async (projectSlug: string, sessionId: string, options?: { silent?: boolean; minMessageCount?: number }) => {
    const state = get();
    const isSameSession = state.currentSessionId === sessionId;

    // Clear if switching session
    if (!isSameSession) {
      set({ messages: [], pagination: null });
    }

    // Only show loading for session switch, not for silent refresh
    if (!options?.silent && !isSameSession) {
      set({ isLoading: true });
    }

    set({
      error: null,
      currentProjectSlug: projectSlug,
      currentSessionId: sessionId,
    });

    try {
      const response = await sessionsApi.getMessages(projectSlug, sessionId);

      // Stale data guard: if caller specified a minimum message count and
      // the server returned fewer messages, the SDK hasn't flushed yet — skip update.
      if (options?.minMessageCount && response.messages.length < options.minMessageCount) {
        return;
      }

      // Preserve images from existing user messages (server doesn't store images)
      const existingImages = new Map<string, HistoryMessage['images']>();
      for (const msg of get().messages) {
        if (msg.type === 'user' && msg.images && msg.images.length > 0) {
          existingImages.set(msg.content, msg.images);
        }
      }

      // Merge preserved images into fetched messages
      const messagesWithImages = response.messages.map((msg) => {
        if (msg.type === 'user' && !msg.images && existingImages.has(msg.content)) {
          return { ...msg, images: existingImages.get(msg.content) };
        }
        return msg;
      });

      // Guard: don't overwrite optimistic messages with stale empty response
      // while streaming is active (buffer replay may have added messages
      // between request send and response arrival)
      const currentMessages = get().messages;
      if (messagesWithImages.length < currentMessages.length && useChatStore.getState().isStreaming) {
        set({ isLoading: false });
        return;
      }

      set({
        messages: messagesWithImages,
        pagination: response.pagination,
        isLoading: false,
      });
    } catch (err) {
      // For silent background fetches, don't set error state (preserves current messages)
      if (options?.silent) {
        return;
      }
      const message =
        err instanceof ApiError
          ? err.message
          : '메시지를 불러오는 중 오류가 발생했습니다.';
      set({ error: message, isLoading: false });
    }
  },

  fetchMoreMessages: async () => {
    const state = get();
    const { currentProjectSlug, currentSessionId, pagination, messages, isLoadingMore } = state;

    if (!currentProjectSlug || !currentSessionId || !pagination?.hasMore || isLoadingMore) {
      return;
    }

    set({ isLoadingMore: true });

    try {
      const response = await sessionsApi.getMessages(
        currentProjectSlug,
        currentSessionId,
        { limit: pagination.limit, offset: pagination.offset + pagination.limit }
      );

      set({
        // Prepend older messages to the beginning (they come before current messages)
        messages: [...response.messages, ...messages],
        pagination: response.pagination,
        isLoadingMore: false,
      });
    } catch {
      set({ isLoadingMore: false });
    }
  },

  clearMessages: () =>
    set({
      messages: [],
      currentProjectSlug: null,
      currentSessionId: null,
      pagination: null,
      error: null,
    }),

  addOptimisticMessage: (content: string, images?: ImageAttachment[]) => {
    const { messages } = get();
    const optimisticMessage: HistoryMessage = {
      id: `optimistic-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date().toISOString(),
      ...(images && images.length > 0 ? { images } : {}),
    };
    set({ messages: [...messages, optimisticMessage] });
  },

  addMessages: (newMessages: HistoryMessage[]) => {
    if (newMessages.length === 0) return;
    const { messages } = get();
    set({ messages: [...messages, ...newMessages] });
  },
}));
