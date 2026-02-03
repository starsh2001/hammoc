/**
 * Message Store - Zustand store for session history messages
 * [Source: Story 3.5 - Task 5]
 */

import { create } from 'zustand';
import type { HistoryMessage, PaginationInfo } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';

/** Cache validity duration in milliseconds (5 minutes) */
const CACHE_DURATION_MS = 5 * 60 * 1000;

/** Cache key: projectSlug:sessionId */
type CacheKey = string;

/** Cache entry for messages per session */
interface MessageCacheEntry {
  messages: HistoryMessage[];
  pagination: PaginationInfo | null;
  fetchedAt: number;
}

interface MessageState {
  messages: HistoryMessage[];
  currentProjectSlug: string | null;
  currentSessionId: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  pagination: PaginationInfo | null;
  /** Cache for messages by session */
  cache: Map<CacheKey, MessageCacheEntry>;
}

interface MessageActions {
  /** Fetch messages (uses cache unless forceRefresh is true) */
  fetchMessages: (projectSlug: string, sessionId: string, forceRefresh?: boolean) => Promise<void>;
  fetchMoreMessages: () => Promise<void>;
  clearMessages: () => void;
  /** Add user message optimistically (before server confirmation) */
  addOptimisticMessage: (content: string) => void;
  /** Invalidate cache for a specific session or all sessions */
  invalidateCache: (projectSlug?: string, sessionId?: string) => void;
  /** Update cache with new messages (after streaming completes) */
  updateCacheMessages: (messages: HistoryMessage[]) => void;
}

type MessageStore = MessageState & MessageActions;

/** Generate cache key from projectSlug and sessionId */
function getCacheKey(projectSlug: string, sessionId: string): CacheKey {
  return `${projectSlug}:${sessionId}`;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  // State
  messages: [],
  currentProjectSlug: null,
  currentSessionId: null,
  isLoading: false,
  isLoadingMore: false,
  error: null,
  pagination: null,
  cache: new Map(),

  // Actions
  fetchMessages: async (projectSlug: string, sessionId: string, forceRefresh = false) => {
    const state = get();
    const cacheKey = getCacheKey(projectSlug, sessionId);
    const cached = state.cache.get(cacheKey);

    // Check if cache is valid (has data, not expired, and not force refresh)
    if (
      !forceRefresh &&
      cached &&
      cached.messages.length > 0 &&
      Date.now() - cached.fetchedAt < CACHE_DURATION_MS
    ) {
      // Use cached data if switching session
      if (state.currentSessionId !== sessionId) {
        set({
          messages: cached.messages,
          pagination: cached.pagination,
          currentProjectSlug: projectSlug,
          currentSessionId: sessionId,
          error: null,
        });
      }
      return;
    }

    // Clear if switching session (and no valid cache)
    if (state.currentSessionId !== sessionId) {
      set({ messages: [], pagination: null });
    }

    set({
      isLoading: true,
      error: null,
      currentProjectSlug: projectSlug,
      currentSessionId: sessionId,
    });

    try {
      const response = await sessionsApi.getMessages(projectSlug, sessionId);

      // Update cache
      const newCache = new Map(state.cache);
      newCache.set(cacheKey, {
        messages: response.messages,
        pagination: response.pagination,
        fetchedAt: Date.now(),
      });

      set({
        messages: response.messages,
        pagination: response.pagination,
        isLoading: false,
        cache: newCache,
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

      const newMessages = [...response.messages, ...messages];

      // Update cache with combined messages
      const cacheKey = getCacheKey(currentProjectSlug, currentSessionId);
      const newCache = new Map(state.cache);
      newCache.set(cacheKey, {
        messages: newMessages,
        pagination: response.pagination,
        fetchedAt: Date.now(),
      });

      set({
        // Prepend older messages to the beginning (they come before current messages)
        messages: newMessages,
        pagination: response.pagination,
        isLoadingMore: false,
        cache: newCache,
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

  invalidateCache: (projectSlug?: string, sessionId?: string) => {
    const state = get();
    if (projectSlug && sessionId) {
      const cacheKey = getCacheKey(projectSlug, sessionId);
      const newCache = new Map(state.cache);
      newCache.delete(cacheKey);
      set({ cache: newCache });
    } else if (projectSlug) {
      // Invalidate all sessions for a project
      const newCache = new Map(state.cache);
      for (const key of newCache.keys()) {
        if (key.startsWith(`${projectSlug}:`)) {
          newCache.delete(key);
        }
      }
      set({ cache: newCache });
    } else {
      set({ cache: new Map() });
    }
  },

  updateCacheMessages: (messages: HistoryMessage[]) => {
    const state = get();
    const { currentProjectSlug, currentSessionId, pagination } = state;
    if (!currentProjectSlug || !currentSessionId) return;

    const cacheKey = getCacheKey(currentProjectSlug, currentSessionId);
    const newCache = new Map(state.cache);
    newCache.set(cacheKey, {
      messages,
      pagination,
      fetchedAt: Date.now(),
    });
    set({ cache: newCache });
  },
}));
