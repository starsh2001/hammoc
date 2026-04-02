/**
 * Message Store - Zustand store for session history messages
 * Story 27.1: Simplified to receive messages exclusively via WebSocket.
 * setMessages() is the primary API — "store whatever the server sends."
 */

import { create } from 'zustand';
import type { HistoryMessage, ImageAttachment } from '@hammoc/shared';
import { generateUUID } from '../utils/uuid';
import { debugLog } from '../utils/debugLogger';

/** Client-local extension: marks optimistic messages for reconciliation */
type OptimisticHistoryMessage = HistoryMessage & { _optimistic?: boolean };

interface MessageState {
  messages: OptimisticHistoryMessage[];
  currentProjectSlug: string | null;
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface MessageActions {
  /** Replace all messages with server-authoritative data (stream:history / stream:complete-messages) */
  setMessages: (messages: HistoryMessage[]) => void;
  clearMessages: () => void;
  /** Add user message optimistically (before server confirmation) */
  addOptimisticMessage: (content: string, images?: ImageAttachment[], timestamp?: string) => void;
  /** Add multiple messages in batch (used by completeStreaming) */
  addMessages: (newMessages: HistoryMessage[]) => void;
}

type MessageStore = MessageState & MessageActions;

/**
 * Client-side image cache: preserves user-attached images across session
 * re-entry during active streaming.
 * - Keyed by sessionId + trimmed content to prevent cross-session collisions
 * - Populated when sendMessage includes real image data
 * - Read during buffer replay to restore images (server only sends imageCount)
 * - NOT cleared on session change (must survive re-entry); bounded by entry count
 * - Survives ChatPage unmount (module-level) but not page refresh
 */
const userImageCache = new Map<string, ImageAttachment[]>();
const MAX_IMAGE_CACHE_ENTRIES = 5;

/** Clear image cache (called on session change) */
export function clearUserImageCache() {
  userImageCache.clear();
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  // State
  messages: [],
  currentProjectSlug: null,
  currentSessionId: null,
  isLoading: false,
  error: null,

  // Actions

  setMessages: (messages: HistoryMessage[]) => {
    debugLog.message('setMessages called', {
      count: messages.length,
      types: messages.map(m => m.type),
    });

    // Preserve images from existing user messages (server doesn't store images)
    const current = get().messages;
    const existingImages = new Map<string, HistoryMessage['images']>();
    for (const msg of current) {
      if (msg.type === 'user' && msg.images && msg.images.length > 0) {
        existingImages.set(msg.content, msg.images);
      }
    }

    const result = messages.map(msg => {
      if (msg.type === 'user' && !msg.images && existingImages.has(msg.content)) {
        return { ...msg, images: existingImages.get(msg.content) };
      }
      return msg;
    });

    set({ messages: result, isLoading: false, error: null });
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

  addOptimisticMessage: (content: string, images?: ImageAttachment[], timestamp?: string) => {
    const state = get();
    const { messages } = state;

    // Rapid fire guard: skip if same content within 1 second
    const lastMessage = messages[messages.length - 1];
    if (
      (lastMessage as OptimisticHistoryMessage)?._optimistic &&
      lastMessage?.type === 'user' &&
      lastMessage?.content.trim() === content.trim() &&
      Date.now() - new Date(lastMessage.timestamp).getTime() < 1000
    ) {
      return;
    }

    const trimmed = content.trim();
    const ts = timestamp ?? new Date().toISOString();
    const cacheKey = `${state.currentSessionId ?? ''}:${ts}:${trimmed}`;

    // Image cache: store real images, restore from cache for placeholders
    let resolvedImages = images;
    if (images && images.length > 0 && images.every(i => i.data)) {
      userImageCache.set(cacheKey, images);
      if (userImageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
        const firstKey = userImageCache.keys().next().value;
        if (firstKey) userImageCache.delete(firstKey);
      }
    } else if (images && images.length > 0 && images.every(i => !i.data)) {
      const cached = userImageCache.get(cacheKey);
      if (cached) {
        resolvedImages = cached;
      }
    }

    const optimisticMessage: OptimisticHistoryMessage = {
      id: `optimistic-${generateUUID()}`,
      type: 'user',
      content: trimmed,
      timestamp: ts,
      _optimistic: true,
      ...(resolvedImages && resolvedImages.length > 0 ? { images: resolvedImages } : {}),
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
        existingCount: state.messages.length,
        uniqueCount: uniqueNewMessages.length,
      });
      if (uniqueNewMessages.length === 0) return state;
      const merged = [...state.messages, ...uniqueNewMessages];
      merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { messages: merged };
    });
  },
}));
