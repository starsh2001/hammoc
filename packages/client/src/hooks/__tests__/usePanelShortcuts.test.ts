/**
 * usePanelShortcuts Hook Tests
 * [Source: Story 19.4 - Task 6]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePanelShortcuts } from '../usePanelShortcuts';

const mockTogglePanel = vi.fn();

vi.mock('../../stores/panelStore', () => ({
  usePanelStore: (selector: (s: { togglePanel: typeof mockTogglePanel }) => unknown) =>
    selector({ togglePanel: mockTogglePanel }),
}));

const dispatchKeydown = (key: string, options?: Partial<KeyboardEventInit>) => {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    altKey: true,
    bubbles: true,
    ...options,
  }));
};

describe('usePanelShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-PS-1: Alt+1 toggles sessions
  it('calls togglePanel("sessions") on Alt+1', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('1');
    expect(mockTogglePanel).toHaveBeenCalledWith('sessions');
  });

  // TC-PS-2: Alt+2 toggles files
  it('calls togglePanel("files") on Alt+2', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('2');
    expect(mockTogglePanel).toHaveBeenCalledWith('files');
  });

  // TC-PS-3: Alt+3 toggles git
  it('calls togglePanel("git") on Alt+3', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('3');
    expect(mockTogglePanel).toHaveBeenCalledWith('git');
  });

  // TC-PS-4: Alt+4 toggles terminal
  it('calls togglePanel("terminal") on Alt+4', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('4');
    expect(mockTogglePanel).toHaveBeenCalledWith('terminal');
  });

  // TC-PS-5: Ctrl+1 does not trigger
  it('does not call togglePanel on Ctrl+1', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('1', { altKey: false, ctrlKey: true });
    expect(mockTogglePanel).not.toHaveBeenCalled();
  });

  // TC-PS-6: Alt+5 does not trigger
  it('does not call togglePanel on Alt+5', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('5');
    expect(mockTogglePanel).not.toHaveBeenCalled();
  });

  // TC-PS-7: Plain number without Alt does not trigger
  it('does not call togglePanel on plain number key without Alt', () => {
    renderHook(() => usePanelShortcuts());

    dispatchKeydown('1', { altKey: false });
    expect(mockTogglePanel).not.toHaveBeenCalled();
  });

  // TC-PS-8: Does not trigger when INPUT is focused
  it('does not call togglePanel when input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() => usePanelShortcuts());

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: '1',
      altKey: true,
      bubbles: true,
    }));
    expect(mockTogglePanel).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  // TC-PS-9: Does not trigger when TEXTAREA is focused
  it('does not call togglePanel when textarea is focused', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    renderHook(() => usePanelShortcuts());

    textarea.dispatchEvent(new KeyboardEvent('keydown', {
      key: '1',
      altKey: true,
      bubbles: true,
    }));
    expect(mockTogglePanel).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  // TC-PS-10: Cleanup removes event listener on unmount
  it('removes event listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => usePanelShortcuts());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
