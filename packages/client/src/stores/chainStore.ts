/**
 * Chain Store - Zustand store for server-synced prompt chain state
 * [Source: Story 24.2 - Task 1]
 */

import { create } from 'zustand';
import type { PromptChainItem } from '@hammoc/shared';

interface ChainStore {
  chainItems: PromptChainItem[];
  setChainItems: (items: PromptChainItem[]) => void;
  clearChainItems: () => void;
}

export const useChainStore = create<ChainStore>((set) => ({
  chainItems: [],
  setChainItems: (items) => set({ chainItems: items }),
  clearChainItems: () => set({ chainItems: [] }),
}));
