/**
 * Chain Store - Zustand store for server-synced prompt chain state
 * [Source: Story 24.2 - Task 1]
 */

import { create } from 'zustand';
import type { PromptChainItem } from '@hammoc/shared';

interface ChainStore {
  /** The session this chain state belongs to. Used to filter `chain:update`
   * events that target a different session without relying on messageStore,
   * which may be mid-transition during session switch / StrictMode remount. */
  sessionId: string | null;
  chainItems: PromptChainItem[];
  /** Bind the store to a session. Clears items if the session changes. */
  bindSession: (sessionId: string | null) => void;
  /** Apply a server-sent update. Dropped when sessionId doesn't match. */
  applyUpdate: (sessionId: string, items: PromptChainItem[]) => void;
  setChainItems: (items: PromptChainItem[]) => void;
  clearChainItems: () => void;
}

export const useChainStore = create<ChainStore>((set, get) => ({
  sessionId: null,
  chainItems: [],
  bindSession: (sessionId) => {
    const prev = get().sessionId;
    if (prev === sessionId) return;
    set({ sessionId, chainItems: [] });
  },
  applyUpdate: (sessionId, items) => {
    if (get().sessionId !== sessionId) return;
    set({ chainItems: items });
  },
  setChainItems: (items) => set({ chainItems: items }),
  clearChainItems: () => set({ chainItems: [] }),
}));
