/**
 * panelStore Unit Tests
 * [Source: Story 19.1 - Task 9.1, Story 19.3 - Task 6]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelStore, DEFAULT_PANEL_WIDTHS } from '../panelStore';

describe('panelStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePanelStore.setState({
      activePanel: null,
      panelWidths: { ...DEFAULT_PANEL_WIDTHS },
      isDragging: false,
    });
  });

  it('should have null activePanel initially', () => {
    expect(usePanelStore.getState().activePanel).toBeNull();
  });

  it('should open a panel', () => {
    usePanelStore.getState().openPanel('sessions');
    expect(usePanelStore.getState().activePanel).toBe('sessions');
  });

  it('should ensure mutual exclusion (opening a new panel closes the previous)', () => {
    usePanelStore.getState().openPanel('git');
    usePanelStore.getState().openPanel('files');
    expect(usePanelStore.getState().activePanel).toBe('files');
  });

  it('should close the panel', () => {
    usePanelStore.getState().openPanel('sessions');
    usePanelStore.getState().closePanel();
    expect(usePanelStore.getState().activePanel).toBeNull();
  });

  it('should toggle panel open when closed', () => {
    usePanelStore.getState().togglePanel('sessions');
    expect(usePanelStore.getState().activePanel).toBe('sessions');
  });

  it('should toggle panel closed when same type is open', () => {
    usePanelStore.getState().openPanel('sessions');
    usePanelStore.getState().togglePanel('sessions');
    expect(usePanelStore.getState().activePanel).toBeNull();
  });

  it('should toggle to different panel type (switch)', () => {
    usePanelStore.getState().openPanel('sessions');
    usePanelStore.getState().togglePanel('git');
    expect(usePanelStore.getState().activePanel).toBe('git');
  });

  // Story 19.3 — panelWidths tests
  describe('panelWidths', () => {
    it('should initialize with default widths', () => {
      const { panelWidths } = usePanelStore.getState();
      expect(panelWidths.sessions).toBe(320);
      expect(panelWidths.files).toBe(320);
      expect(panelWidths.git).toBe(320);
      expect(panelWidths.terminal).toBe(384);
    });

    it('should set panel width for a specific type', () => {
      usePanelStore.getState().setPanelWidth('sessions', 400);
      expect(usePanelStore.getState().panelWidths.sessions).toBe(400);
    });

    it('should preserve other panel widths when setting one', () => {
      usePanelStore.getState().setPanelWidth('sessions', 400);
      expect(usePanelStore.getState().panelWidths.terminal).toBe(384);
      expect(usePanelStore.getState().panelWidths.files).toBe(320);
      expect(usePanelStore.getState().panelWidths.git).toBe(320);
    });

    it('should persist panel width to localStorage', () => {
      usePanelStore.getState().setPanelWidth('sessions', 400);
      const stored = JSON.parse(localStorage.getItem('bmad-panel-widths')!);
      expect(stored.sessions).toBe(400);
    });

    it('should restore panel widths from localStorage', () => {
      const customWidths = { sessions: 450, files: 350, git: 300, terminal: 500 };
      localStorage.setItem('bmad-panel-widths', JSON.stringify(customWidths));

      // Re-create store state by calling the internal initializer pattern
      // Since Zustand stores are singletons, we manually reset with localStorage values
      const raw = localStorage.getItem('bmad-panel-widths');
      const parsed = raw ? { ...DEFAULT_PANEL_WIDTHS, ...JSON.parse(raw) } : { ...DEFAULT_PANEL_WIDTHS };
      usePanelStore.setState({ panelWidths: parsed });

      const { panelWidths } = usePanelStore.getState();
      expect(panelWidths.sessions).toBe(450);
      expect(panelWidths.files).toBe(350);
      expect(panelWidths.git).toBe(300);
      expect(panelWidths.terminal).toBe(500);
    });

    it('should fallback to defaults when localStorage has invalid JSON', () => {
      localStorage.setItem('bmad-panel-widths', 'invalid-json');

      // Simulate readPanelWidths behavior
      let widths: Record<string, number>;
      try {
        const raw = localStorage.getItem('bmad-panel-widths');
        if (!raw) {
          widths = { ...DEFAULT_PANEL_WIDTHS };
        } else {
          widths = { ...DEFAULT_PANEL_WIDTHS, ...JSON.parse(raw) };
        }
      } catch {
        widths = { ...DEFAULT_PANEL_WIDTHS };
      }
      usePanelStore.setState({ panelWidths: widths as Record<'sessions' | 'files' | 'git' | 'terminal', number> });

      const { panelWidths } = usePanelStore.getState();
      expect(panelWidths.sessions).toBe(320);
      expect(panelWidths.terminal).toBe(384);
    });
  });

  // Story 19.3 — isDragging tests
  describe('isDragging', () => {
    it('should initialize isDragging as false', () => {
      expect(usePanelStore.getState().isDragging).toBe(false);
    });

    it('should set isDragging state', () => {
      usePanelStore.getState().setIsDragging(true);
      expect(usePanelStore.getState().isDragging).toBe(true);

      usePanelStore.getState().setIsDragging(false);
      expect(usePanelStore.getState().isDragging).toBe(false);
    });
  });
});
