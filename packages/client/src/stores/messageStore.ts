/**
 * Message Store - Zustand store for session history messages
 * [Source: Story 3.5 - Task 5]
 */

import { create } from 'zustand';
import type { HistoryMessage, PaginationInfo, ImageAttachment } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';
import { useChatStore } from './chatStore';
import { generateUUID } from '../utils/uuid';
import { debugLog } from '../utils/debugLogger';

/** Client-local extension: marks optimistic messages for reconciliation */
type OptimisticHistoryMessage = HistoryMessage & { _optimistic?: boolean };

interface MessageState {
  messages: OptimisticHistoryMessage[];
  currentProjectSlug: string | null;
  currentSessionId: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  pagination: PaginationInfo | null;
  /** Last slash command from full session history (server-provided, survives pagination) */
  lastAgentCommand: string | null;
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

/**
 * Reconcile optimistic messages with server-authoritative messages.
 * Matches optimistic user messages to server user messages by content (trim),
 * preserving images from optimistic messages (server doesn't store images).
 */
function reconcileOptimisticMessages(
  currentMessages: OptimisticHistoryMessage[],
  serverMessages: HistoryMessage[]
): HistoryMessage[] {
  if (serverMessages.length === 0) return currentMessages;
  if (currentMessages.length === 0) return serverMessages;

  // 1. Index server user messages by trimmed content
  const serverUserByContent = new Map<string, HistoryMessage[]>();
  for (const msg of serverMessages) {
    if (msg.type === 'user') {
      const key = msg.content.trim();
      const arr = serverUserByContent.get(key) ?? [];
      arr.push(msg);
      serverUserByContent.set(key, arr);
    }
  }

  // 2. Match optimistic messages to server messages (consume in order via shift)
  const matchedServerIds = new Set<string>();
  const matchedOptimisticIds = new Set<string>();
  const optimisticToServer = new Map<string, string>();
  for (const msg of currentMessages) {
    if (msg._optimistic && msg.type === 'user') {
      const key = msg.content.trim();
      const candidates = serverUserByContent.get(key);
      if (candidates && candidates.length > 0) {
        const matched = candidates.shift()!;
        matchedServerIds.add(matched.id);
        matchedOptimisticIds.add(msg.id);
        optimisticToServer.set(matched.id, msg.id);
      }
    }
  }

  // 3. Build result from server messages, restoring images from optimistic originals
  const optimisticById = new Map(
    currentMessages.filter((m) => m._optimistic).map((m) => [m.id, m])
  );

  // Also build image map from non-optimistic existing user messages (for image preservation)
  const existingImages = new Map<string, HistoryMessage['images']>();
  for (const msg of currentMessages) {
    if (msg.type === 'user' && msg.images && msg.images.length > 0 && !msg._optimistic) {
      existingImages.set(msg.content, msg.images);
    }
  }

  const result: HistoryMessage[] = [];
  for (const serverMsg of serverMessages) {
    if (serverMsg.type === 'user' && matchedServerIds.has(serverMsg.id)) {
      // Matched server message — restore images from optimistic original
      const optimisticId = optimisticToServer.get(serverMsg.id);
      const optimistic = optimisticId ? optimisticById.get(optimisticId) : undefined;
      if (optimistic?.images && optimistic.images.length > 0) {
        result.push({ ...serverMsg, images: optimistic.images });
      } else {
        result.push(serverMsg);
      }
    } else if (serverMsg.type === 'user' && !serverMsg.images && existingImages.has(serverMsg.content)) {
      // Non-matched user message — preserve images from existing messages
      result.push({ ...serverMsg, images: existingImages.get(serverMsg.content) });
    } else {
      result.push(serverMsg);
    }
  }

  // 4. Append unmatched optimistic messages (not yet on server)
  for (const msg of currentMessages) {
    if (msg._optimistic && !matchedOptimisticIds.has(msg.id)) {
      result.push(msg);
    }
  }

  return result;
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
  lastAgentCommand: null,

  // Actions
  fetchMessages: async (projectSlug: string, sessionId: string, options?: { silent?: boolean; minMessageCount?: number }) => {
    const state = get();
    const isSameSession = state.currentSessionId === sessionId;
    debugLog.message('fetchMessages called', {
      projectSlug,
      sessionId,
      silent: options?.silent,
      minMessageCount: options?.minMessageCount,
      isSameSession,
      currentMsgCount: state.messages.length,
      isStreaming: useChatStore.getState().isStreaming,
    });

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
        debugLog.message('fetchMessages → stale data guard (minMessageCount)', {
          serverCount: response.messages.length,
          minRequired: options.minMessageCount,
        });
        return;
      }

      // Guard: don't overwrite optimistic messages with stale empty response
      // while streaming is active (buffer replay may have added messages
      // between request send and response arrival)
      const currentMessages = get().messages;
      if (response.messages.length < currentMessages.length && useChatStore.getState().isStreaming) {
        debugLog.message('fetchMessages → streaming guard (server < current)', {
          serverCount: response.messages.length,
          currentCount: currentMessages.length,
          isStreaming: true,
        });
        set({ isLoading: false });
        return;
      }

      // Reconcile optimistic messages with server-authoritative messages
      // (includes image preservation from optimistic originals)
      const reconciledMessages = reconcileOptimisticMessages(currentMessages, response.messages);

      debugLog.message('fetchMessages → messages updated', {
        serverCount: response.messages.length,
        currentCount: currentMessages.length,
        reconciledCount: reconciledMessages.length,
        lastMsgType: reconciledMessages[reconciledMessages.length - 1]?.type,
        lastMsgPreview: reconciledMessages[reconciledMessages.length - 1]?.content?.slice(0, 50),
      });

      set({
        messages: reconciledMessages,
        pagination: response.pagination,
        lastAgentCommand: response.lastAgentCommand ?? null,
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
        lastAgentCommand: response.lastAgentCommand ?? get().lastAgentCommand,
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
      lastAgentCommand: null,
      error: null,
    }),

  addOptimisticMessage: (content: string, images?: ImageAttachment[]) => {
    const state = get();
    const { messages } = state;

    // Rapid fire guard: skip if same content within 1 second (Task 4.1)
    const lastMessage = messages[messages.length - 1];
    if (
      (lastMessage as OptimisticHistoryMessage)?._optimistic &&
      lastMessage?.type === 'user' &&
      lastMessage?.content.trim() === content.trim() &&
      Date.now() - new Date(lastMessage.timestamp).getTime() < 1000
    ) {
      return;
    }

    const optimisticMessage: OptimisticHistoryMessage = {
      id: `optimistic-${generateUUID()}`,
      type: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      _optimistic: true,
      ...(images && images.length > 0 ? { images } : {}),
    };
    set({ messages: [...messages, optimisticMessage] });
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
