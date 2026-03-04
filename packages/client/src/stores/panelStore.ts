/**
 * Panel Store - Unified quick panel state management
 * [Source: Story 19.1 - Task 1, Story 19.3 - Task 1]
 */

import { create } from 'zustand';

export type QuickPanelType = 'sessions' | 'files' | 'git' | 'terminal';

const PANEL_WIDTH_KEY = 'bmad-panel-width';

export const DEFAULT_PANEL_WIDTH = 320; // 20rem = 320px

function readPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return DEFAULT_PANEL_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 280 ? parsed : DEFAULT_PANEL_WIDTH;
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
}

function writePanelWidth(width: number): void {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(width));
  } catch {
    // quota exceeded — in-memory state is still updated
  }
}

interface PanelStore {
  activePanel: QuickPanelType | null;
  /** Last active panel type — used to restore panel tab on reopen */
  lastActivePanel: QuickPanelType;
  openPanel: (type: QuickPanelType) => void;
  closePanel: () => void;
  togglePanel: (type: QuickPanelType) => void;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  activePanel: null,
  lastActivePanel: 'sessions',

  openPanel: (type) => set({ activePanel: type, lastActivePanel: type }),

  closePanel: () => set({ activePanel: null }),

  togglePanel: (type) => set((state) => {
    if (state.activePanel === type) {
      return { activePanel: null };
    }
    return { activePanel: type, lastActivePanel: type };
  }),

  panelWidth: readPanelWidth(),

  setPanelWidth: (width) => {
    set({ panelWidth: width });
    writePanelWidth(width);
  },

  isDragging: false,
  setIsDragging: (dragging) => set({ isDragging: dragging }),
}));
