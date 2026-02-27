/**
 * Panel Store - Unified quick panel state management
 * [Source: Story 19.1 - Task 1]
 */

import { create } from 'zustand';

export type QuickPanelType = 'sessions' | 'files' | 'git' | 'terminal';

interface PanelStore {
  activePanel: QuickPanelType | null;
  openPanel: (type: QuickPanelType) => void;
  closePanel: () => void;
  togglePanel: (type: QuickPanelType) => void;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  activePanel: null,

  openPanel: (type) => set({ activePanel: type }),

  closePanel: () => set({ activePanel: null }),

  togglePanel: (type) => {
    const { activePanel } = get();
    if (activePanel === type) {
      set({ activePanel: null });
    } else {
      set({ activePanel: type });
    }
  },
}));
