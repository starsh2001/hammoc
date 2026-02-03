/**
 * Message Store - Zustand store for session history messages
 * [Source: Story 3.5 - Task 5]
 */

import { create } from 'zustand';
import type { HistoryMessage, PaginationInfo } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';

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
  fetchMessages: (projectSlug: string, sessionId: string, options?: { silent?: boolean }) => Promise<void>;
  fetchMoreMessages: () => Promise<void>;
  clearMessages: () => void;
  /** Add user message optimistically (before server confirmation) */
  addOptimisticMessage: (content: string) => void;
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
  fetchMessages: async (projectSlug: string, sessionId: string, options?: { silent?: boolean }) => {
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
      set({
        messages: response.messages,
        pagination: response.pagination,
        isLoading: false,
      });
    } catch (err) {
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

  addOptimisticMessage: (content: string) => {
    const { messages } = get();
    const optimisticMessage: HistoryMessage = {
      id: `optimistic-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    set({ messages: [...messages, optimisticMessage] });
  },
}));
