/**
 * Panel Store - Unified quick panel state management
 * [Source: Story 19.1 - Task 1, Story 19.3 - Task 1]
 */

import { create } from 'zustand';

export type QuickPanelType = 'sessions' | 'files' | 'git' | 'terminal';
export type PanelSide = 'left' | 'right';

const PANEL_WIDTH_KEY = 'bmad-panel-width';
const PANEL_SIDE_KEY = 'bmad-panel-side';

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

function readPanelSide(): PanelSide {
  try {
    const raw = localStorage.getItem(PANEL_SIDE_KEY);
    return raw === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

function writePanelSide(side: PanelSide): void {
  try {
    localStorage.setItem(PANEL_SIDE_KEY, side);
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
  panelSide: PanelSide;
  setPanelSide: (side: PanelSide) => void;
  togglePanelSide: () => void;
  /** Direction of swipe gesture for mobile slide animation (null = no swipe) */
  swipeFrom: 'left' | 'right' | null;
  openPanelWithSwipe: (type: QuickPanelType, from: 'left' | 'right') => void;
  closePanelWithSwipe: (toward: 'left' | 'right') => void;
  /** Whether default-open has already been applied this session */
  _defaultApplied: boolean;
  /** Apply preferences-based defaults (called once after preferences load) */
  applyDefaults: (opts: { panelDefaultOpen?: boolean; panelDefaultSide?: 'left' | 'right' | 'last' }) => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  activePanel: null,
  lastActivePanel: 'sessions',

  openPanel: (type) => set({ activePanel: type, lastActivePanel: type, swipeFrom: null }),

  closePanel: () => set({ activePanel: null, swipeFrom: null }),

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

  panelSide: readPanelSide(),
  setPanelSide: (side) => {
    set({ panelSide: side });
    writePanelSide(side);
  },
  swipeFrom: null,
  openPanelWithSwipe: (type, from) => set({ activePanel: type, lastActivePanel: type, swipeFrom: from }),
  closePanelWithSwipe: (toward) => set({ activePanel: null, swipeFrom: toward }),

  togglePanelSide: () => set((state) => {
    const newSide = state.panelSide === 'right' ? 'left' : 'right';
    writePanelSide(newSide);
    return { panelSide: newSide };
  }),

  _defaultApplied: false,
  applyDefaults: ({ panelDefaultOpen, panelDefaultSide }) => set((state) => {
    if (state._defaultApplied) return state;

    const updates: Partial<PanelStore> = { _defaultApplied: true };

    // Apply default side from preferences ('last' = keep localStorage value)
    if (panelDefaultSide && panelDefaultSide !== 'last') {
      updates.panelSide = panelDefaultSide;
      writePanelSide(panelDefaultSide);
    }

    // Auto-open on desktop if preference is enabled (default: true)
    const shouldAutoOpen = panelDefaultOpen !== false;
    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    if (shouldAutoOpen && !isMobileScreen && state.activePanel === null) {
      updates.activePanel = state.lastActivePanel;
    }

    return updates;
  }),
}));
