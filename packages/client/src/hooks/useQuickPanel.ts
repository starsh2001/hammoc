/**
 * useQuickPanel - Convenience hook for quick panel state
 * [Source: Story 19.1 - Task 2]
 */

import { usePanelStore, type QuickPanelType } from '../stores/panelStore';

interface UseQuickPanelReturn {
  activePanel: QuickPanelType | null;
  isOpen: boolean;
  open: (type: QuickPanelType) => void;
  close: () => void;
  toggle: (type: QuickPanelType) => void;
}

export function useQuickPanel(): UseQuickPanelReturn {
  const activePanel = usePanelStore((s) => s.activePanel);
  const open = usePanelStore((s) => s.openPanel);
  const close = usePanelStore((s) => s.closePanel);
  const toggle = usePanelStore((s) => s.togglePanel);

  return {
    activePanel,
    isOpen: activePanel !== null,
    open,
    close,
    toggle,
  };
}
