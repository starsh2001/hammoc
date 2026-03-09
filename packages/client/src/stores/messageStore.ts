/**
 * Message Store - Zustand store for session history messages
 * [Source: Story 3.5 - Task 5]
 */

import { create } from 'zustand';
import type { HistoryMessage, PaginationInfo, ImageAttachment } from '@hammoc/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';
import { useChatStore } from './chatStore';
import { generateUUID } from '../utils/uuid';
import { debugLog } from '../utils/debugLogger';
import i18n from '../i18n';

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

      // Guard: don't overwrite optimistic/current messages with incomplete server response
      // Block update when server returns FEWER messages than we already have, when:
      // 1. Actively streaming (buffer replay may not be complete), OR
      // 2. Segments pending clear (post-streaming, but server JSONL hasn't flushed yet), OR
      // 3. Within cooldown after stream completion (SDK may not have flushed JSONL yet,
      //    especially after compaction when JSONL may be rewritten), OR
      // 4. Context compaction in progress (SDK is rewriting the JSONL file — reading
      //    during the rewrite can return partial/stale data)
      // Exception: If pagination intentionally returns fewer (offset > 0), always allow.
      const currentMessages = get().messages;
      const chatState = useChatStore.getState();
      const isPaginationFetch = (response.pagination?.offset ?? 0) > 0;
      const STREAM_COMPLETE_COOLDOWN_MS = 10000; // 10s cooldown after streaming ends
      const isInCooldown = chatState.streamCompletedAt !== null &&
                           (Date.now() - chatState.streamCompletedAt) < STREAM_COMPLETE_COOLDOWN_MS;
      // Block during buffer replay restoration to prevent fetchMessages from
      // inserting JSONL data between stream:status and user:message, which can
      // cause user message to appear below assistant response.
      // Exception: when server returns MORE messages (multi-turn history, e.g.
      // queue runner sessions where previous turns have completed), allow the
      // update through. ChatPage's fetchMessages().then() callback handles
      // trimming the current streaming turn to prevent duplication with buffer replay.
      const isRestoring = chatState.streamingMessageId === 'restoring';
      const shouldGuard = !isPaginationFetch &&
                          ((isRestoring && response.messages.length <= currentMessages.length) ||
                           (!isRestoring && response.messages.length < currentMessages.length &&
                            (chatState.isStreaming || chatState.segmentsPendingClear || isInCooldown || chatState.isCompacting)));

      // DETAILED GUARD DEBUG: Track why messages might disappear
      debugLog.message('fetchMessages → guard check', {
        shouldGuard,
        isRestoring,
        isPaginationFetch,
        serverCount: response.messages.length,
        currentCount: currentMessages.length,
        serverLessThanCurrent: response.messages.length < currentMessages.length,
        isStreaming: chatState.isStreaming,
        segmentsPendingClear: chatState.segmentsPendingClear,
        isInCooldown,
        isCompacting: chatState.isCompacting,
        streamCompletedAt: chatState.streamCompletedAt,
        guardConditionMet: chatState.isStreaming || chatState.segmentsPendingClear || isInCooldown || chatState.isCompacting,
        paginationOffset: response.pagination?.offset,
        currentAssistantCount: currentMessages.filter(m => m.type === 'assistant').length,
        serverAssistantCount: response.messages.filter(m => m.type === 'assistant').length,
      });

      if (shouldGuard) {
        debugLog.message('fetchMessages → streaming guard BLOCKED update', {
          serverCount: response.messages.length,
          currentCount: currentMessages.length,
          isStreaming: chatState.isStreaming,
          segmentsPendingClear: chatState.segmentsPendingClear,
          isInCooldown,
          isCompacting: chatState.isCompacting,
        });
        set({ isLoading: false });
        return;
      }

      // During stream restoration, server data may include partial messages from
      // the current streaming turn. Duplication with buffer replay is handled by
      // ChatPage's fetchMessages().then() callback, which trims messages after
      // the last user message when streaming is active (ChatPage.tsx ~line 429).

      // Reconcile optimistic messages with server-authoritative messages
      // (includes image preservation from optimistic originals)
      const reconciledMessages = reconcileOptimisticMessages(currentMessages, response.messages);

      // Ensure chronological order — reconciliation preserves server order but
      // appended unmatched optimistic messages or edge cases may break ordering.
      reconciledMessages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Detailed debug: message type sequences for history loss tracking
      const summarize = (msgs: { type: string; content?: string }[]) =>
        msgs.map((m, i) => `${i}:${m.type}:${(m.content || '').slice(0, 30)}`);

      debugLog.message('fetchMessages → messages updated', {
        serverCount: response.messages.length,
        currentCount: currentMessages.length,
        reconciledCount: reconciledMessages.length,
        serverTypes: response.messages.map(m => m.type),
        currentTypes: currentMessages.map(m => m.type),
        reconciledTypes: reconciledMessages.map(m => m.type),
        serverMsgs: summarize(response.messages),
        currentMsgs: summarize(currentMessages),
        reconciledMsgs: summarize(reconciledMessages),
        paginationTotal: response.pagination?.total,
        paginationOffset: response.pagination?.offset,
        paginationHasMore: response.pagination?.hasMore,
      });

      debugLog.message('DEDUP fetchMessages → setting messages', {
        serverCount: response.messages.length,
        reconciledCount: reconciledMessages.length,
        reconciledTypes: reconciledMessages.map(m => m.type),
        isStreaming: useChatStore.getState().isStreaming,
        segCount: useChatStore.getState().streamingSegments.length,
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
          : i18n.t('notification:message.loadError');
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

      // Merge older messages with current and sort to guarantee chronological order
      const merged = [...response.messages, ...messages];
      merged.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      set({
        messages: merged,
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
      debugLog.message('DEDUP addMessages', {
        incomingCount: newMessages.length,
        incomingTypes: newMessages.map(m => m.type),
        existingCount: state.messages.length,
        existingTypes: state.messages.map(m => m.type),
        uniqueCount: uniqueNewMessages.length,
        duplicateCount: newMessages.length - uniqueNewMessages.length,
      });
      if (uniqueNewMessages.length === 0) return state;
      const merged = [...state.messages, ...uniqueNewMessages];
      merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { messages: merged };
    });
  },
}));
