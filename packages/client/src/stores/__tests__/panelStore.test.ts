/**
 * panelStore Unit Tests
 * [Source: Story 19.1 - Task 9.1]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelStore } from '../panelStore';

describe('panelStore', () => {
  beforeEach(() => {
    usePanelStore.setState({ activePanel: null });
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
});
