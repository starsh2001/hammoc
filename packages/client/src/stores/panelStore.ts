/**
 * Panel Store - Unified quick panel state management
 * [Source: Story 19.1 - Task 1, Story 19.3 - Task 1]
 */

import { create } from 'zustand';

export type QuickPanelType = 'sessions' | 'files' | 'git' | 'terminal';

const PANEL_WIDTHS_KEY = 'bmad-panel-widths';

export const DEFAULT_PANEL_WIDTHS: Record<QuickPanelType, number> = {
  sessions: 320, // md:w-80 = 20rem = 320px
  files: 320,    // md:w-80
  git: 320,      // md:w-80
  terminal: 384, // md:w-96 = 24rem = 384px
};

function readPanelWidths(): Record<QuickPanelType, number> {
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    if (!raw) return { ...DEFAULT_PANEL_WIDTHS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PANEL_WIDTHS, ...parsed };
  } catch {
    return { ...DEFAULT_PANEL_WIDTHS };
  }
}

function writePanelWidths(widths: Record<QuickPanelType, number>): void {
  try {
    localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    // quota exceeded — in-memory state is still updated
  }
}

interface PanelStore {
  activePanel: QuickPanelType | null;
  openPanel: (type: QuickPanelType) => void;
  closePanel: () => void;
  togglePanel: (type: QuickPanelType) => void;
  panelWidths: Record<QuickPanelType, number>;
  setPanelWidth: (type: QuickPanelType, width: number) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
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

  panelWidths: readPanelWidths(),

  setPanelWidth: (type, width) => {
    const updated = { ...get().panelWidths, [type]: width };
    set({ panelWidths: updated });
    writePanelWidths(updated);
  },

  isDragging: false,
  setIsDragging: (dragging) => set({ isDragging: dragging }),
}));
