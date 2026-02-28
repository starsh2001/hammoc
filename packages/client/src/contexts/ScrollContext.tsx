/**
 * ScrollContext — shares programmatic scroll capabilities from MessageArea
 * to sibling components (PendingToolsIndicator) and deeply nested children
 * (ThinkingBlock) without prop drilling.
 *
 * All functions in this context:
 * - Scroll ONLY the MessageArea container (never ancestor/page)
 * - Set isProgrammaticScrollRef guard to prevent auto-scroll state corruption
 */

import { createContext, useContext, type ReactNode } from 'react';

export interface ScrollContextValue {
  /** Scroll the message container to make an element visible */
  scrollToElement: (
    elementOrId: HTMLElement | string,
    options?: { block?: 'center' | 'start' | 'end' | 'nearest'; smooth?: boolean },
  ) => void;
  /** Scroll the message container to the bottom */
  scrollToBottom: (options?: { smooth?: boolean }) => void;
  /** Adjust scroll by a delta amount (for position-preserving adjustments) */
  adjustScrollBy: (deltaY: number) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

interface ScrollProviderProps {
  children: ReactNode;
  value: ScrollContextValue;
}

export function ScrollProvider({ children, value }: ScrollProviderProps) {
  return (
    <ScrollContext.Provider value={value}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollContext(): ScrollContextValue | null {
  return useContext(ScrollContext);
}
