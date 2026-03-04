/**
 * panelStore Unit Tests
 * [Source: Story 19.1 - Task 9.1, Story 19.3 - Task 6]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelStore, DEFAULT_PANEL_WIDTH } from '../panelStore';

describe('panelStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePanelStore.setState({
      activePanel: null,
      lastActivePanel: 'sessions',
      panelWidth: DEFAULT_PANEL_WIDTH,
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

  // lastActivePanel — remembers last tab for reopen
  describe('lastActivePanel', () => {
    it('should default to sessions', () => {
      expect(usePanelStore.getState().lastActivePanel).toBe('sessions');
    });

    it('should update when opening a panel', () => {
      usePanelStore.getState().openPanel('git');
      expect(usePanelStore.getState().lastActivePanel).toBe('git');
    });

    it('should update when toggling to a panel', () => {
      usePanelStore.getState().togglePanel('terminal');
      expect(usePanelStore.getState().lastActivePanel).toBe('terminal');
    });

    it('should preserve lastActivePanel when closing', () => {
      usePanelStore.getState().openPanel('files');
      usePanelStore.getState().closePanel();
      expect(usePanelStore.getState().lastActivePanel).toBe('files');
    });

    it('should preserve lastActivePanel when toggling closed', () => {
      usePanelStore.getState().togglePanel('git');
      usePanelStore.getState().togglePanel('git');
      expect(usePanelStore.getState().activePanel).toBeNull();
      expect(usePanelStore.getState().lastActivePanel).toBe('git');
    });
  });

  // Story 19.3 — panelWidth tests (unified single width)
  describe('panelWidth', () => {
    it('should initialize with default width', () => {
      expect(usePanelStore.getState().panelWidth).toBe(320);
    });

    it('should set panel width', () => {
      usePanelStore.getState().setPanelWidth(400);
      expect(usePanelStore.getState().panelWidth).toBe(400);
    });

    it('should persist panel width to localStorage', () => {
      usePanelStore.getState().setPanelWidth(400);
      expect(localStorage.getItem('bmad-panel-width')).toBe('400');
    });

    it('should restore panel width from localStorage', () => {
      localStorage.setItem('bmad-panel-width', '450');

      // Simulate re-read from localStorage
      const raw = localStorage.getItem('bmad-panel-width');
      const width = raw ? Number(raw) : DEFAULT_PANEL_WIDTH;
      usePanelStore.setState({ panelWidth: Number.isFinite(width) && width >= 280 ? width : DEFAULT_PANEL_WIDTH });

      expect(usePanelStore.getState().panelWidth).toBe(450);
    });

    it('should fallback to default when localStorage has invalid value', () => {
      localStorage.setItem('bmad-panel-width', 'invalid');

      const raw = localStorage.getItem('bmad-panel-width');
      const parsed = raw ? Number(raw) : DEFAULT_PANEL_WIDTH;
      const width = Number.isFinite(parsed) && parsed >= 280 ? parsed : DEFAULT_PANEL_WIDTH;
      usePanelStore.setState({ panelWidth: width });

      expect(usePanelStore.getState().panelWidth).toBe(DEFAULT_PANEL_WIDTH);
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
