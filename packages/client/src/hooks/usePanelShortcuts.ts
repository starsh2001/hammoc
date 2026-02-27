/**
 * usePanelShortcuts - Global keyboard shortcuts for quick panel toggle
 * Alt+1: Sessions, Alt+2: Files, Alt+3: Git, Alt+4: Terminal
 * [Source: Story 19.4 - Task 4]
 *
 * Must be called once at page level (ChatPage).
 * Only active when no input/textarea is focused.
 */

import { useEffect } from 'react';
import { usePanelStore } from '../stores/panelStore';
import type { QuickPanelType } from '../stores/panelStore';

export function usePanelShortcuts() {
  const togglePanel = usePanelStore((s) => s.togglePanel);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if modifier other than Alt is held
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!e.altKey) return;

      // Skip if user is typing in an input field
      const target = e.target;
      if (target instanceof HTMLElement) {
        const isInputFocused = target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.isContentEditable
          || target.closest('[role="textbox"]');
        if (isInputFocused) return;
      }

      const panelMap: Record<string, QuickPanelType> = {
        '1': 'sessions',
        '2': 'files',
        '3': 'git',
        '4': 'terminal',
      };

      const panelType = panelMap[e.key];
      if (panelType) {
        e.preventDefault();
        togglePanel(panelType);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);
}
