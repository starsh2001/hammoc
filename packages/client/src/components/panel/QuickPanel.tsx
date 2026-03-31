/**
 * QuickPanel - Unified container for all quick panel overlays
 * Provides common header, backdrop, animation, focus management, and content routing.
 * [Source: Story 19.1 - Task 3, Story 19.2 - Tasks 3, 4, Story 19.3 - Task 4]
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, History, FolderOpen, GitBranch, Terminal, PanelLeft, PanelRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { QuickPanelType, PanelSide } from '../../stores/panelStore';
import { useOverlayBackHandler } from '../../hooks/useOverlayBackHandler';
import { PanelTabSwitcher } from './PanelTabSwitcher';
import { ResizableHandle } from './ResizablePanel';
import { SessionQuickAccessPanel } from '../SessionQuickAccessPanel';
import { QuickFileExplorer } from '../files/QuickFileExplorer';
import { QuickGitPanel } from '../git/QuickGitPanel';
import { QuickTerminal } from '../terminal/QuickTerminal';

export const PANEL_TYPES: QuickPanelType[] = ['sessions', 'files', 'git', 'terminal'];

export const PANEL_CONFIG: Record<QuickPanelType, {
  icon: LucideIcon;
  titleKey: string;
}> = {
  sessions: { icon: History, titleKey: 'panel.sessions' },
  files: { icon: FolderOpen, titleKey: 'panel.files' },
  git: { icon: GitBranch, titleKey: 'panel.git' },
  terminal: { icon: Terminal, titleKey: 'panel.terminal' },
};

interface QuickPanelProps {
  activePanel: QuickPanelType | null;
  onClose: () => void;
  onReopen?: () => void;
  onSwitchPanel: (type: QuickPanelType) => void;
  terminalAccessible?: boolean;
  projectSlug: string;
  currentSessionId?: string;
  onSelectSession?: (sessionId: string) => void;
  onNavigateToGitTab?: () => void;
  onNavigateToTerminalTab?: () => void;
  panelWidth: number;
  onWidthChange: (width: number) => void;
  isMobile: boolean;
  /** Git changed file count for badge on git tab */
  gitChangedCount?: number;
  /** Which side the panel is on */
  panelSide: PanelSide;
  /** Toggle panel side */
  onToggleSide: () => void;
  /** Direction of swipe gesture for mobile slide animation */
  swipeFrom: 'left' | 'right' | null;
}

export function QuickPanel({
  activePanel,
  onClose,
  onReopen,
  onSwitchPanel,
  terminalAccessible,
  projectSlug,
  currentSessionId,
  onSelectSession,
  onNavigateToGitTab,
  onNavigateToTerminalTab,
  panelWidth,
  onWidthChange,
  isMobile,
  gitChangedCount,
  panelSide,
  onToggleSide,
  swipeFrom,
}: QuickPanelProps) {
  const { t } = useTranslation('common');
  // Initialize to open state if panel is already active on mount
  // (prevents re-playing slide-in animation on remount during session switch)
  const [isVisible, setIsVisible] = useState(activePanel !== null);
  const [isAnimating, setIsAnimating] = useState(activePanel !== null);
  const [visitedPanels, setVisitedPanels] = useState<Set<QuickPanelType>>(
    () => activePanel ? new Set([activePanel]) : new Set()
  );

  // Track the last non-null active panel so we can render content during close animation
  const displayPanelRef = useRef<QuickPanelType>(activePanel ?? 'sessions');
  if (activePanel) displayPanelRef.current = activePanel;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Suppress transition briefly when side changes while panel is open
  const [suppressTransition, setSuppressTransition] = useState(false);
  const prevSideRef = useRef(panelSide);
  const suppressRafRef = useRef<number>(0);
  useEffect(() => {
    if (prevSideRef.current !== panelSide && isVisible) {
      // Cancel any pending RAF from a previous rapid toggle
      if (suppressRafRef.current) cancelAnimationFrame(suppressRafRef.current);
      setSuppressTransition(true);
      suppressRafRef.current = requestAnimationFrame(() => {
        suppressRafRef.current = requestAnimationFrame(() => {
          suppressRafRef.current = 0;
          setSuppressTransition(false);
        });
      });
    }
    prevSideRef.current = panelSide;
    return () => {
      if (suppressRafRef.current) {
        cancelAnimationFrame(suppressRafRef.current);
        suppressRafRef.current = 0;
      }
    };
  }, [panelSide, isVisible]);

  const isOpen = activePanel !== null;

  // Close/reopen overlay on browser back/forward navigation
  // Only intercept back button in overlay mode; sidebar mode should not affect navigation
  useOverlayBackHandler(isOpen, onClose, onReopen, !isMobile);

  // Track visited panels
  useEffect(() => {
    if (activePanel) {
      setVisitedPanels(prev => {
        if (prev.has(activePanel)) return prev;
        return new Set(prev).add(activePanel);
      });
    }
  }, [activePanel]);

  // Reset visited panels after close animation completes (isVisible becomes false)
  useEffect(() => {
    if (!isVisible && !isOpen) {
      setVisitedPanels(new Set());
    }
  }, [isVisible, isOpen]);

  // Slide animation: mount/unmount control
  // Opening: setIsVisible(true) creates the DOM, then useLayoutEffect forces a
  // reflow and sets isAnimating — this guarantees the browser has computed the
  // initial off-screen position before transitioning to translate-x-0.
  // Closing: setIsAnimating(false) triggers slide-out, then setTimeout unmounts.
  const needsAnimateRef = useRef(false);
  // Incremented on each open to trigger useLayoutEffect even when isVisible is already true
  // (handles reopen-during-close race where setIsVisible(true) is a no-op).
  const [openNonce, setOpenNonce] = useState(0);
  useEffect(() => {
    if (isOpen) {
      needsAnimateRef.current = true;
      setIsVisible(true);
      setOpenNonce((n) => n + 1);
    } else {
      needsAnimateRef.current = false;
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Trigger slide-in after DOM is created — runs before browser paint
  useLayoutEffect(() => {
    if (needsAnimateRef.current && isVisible && panelRef.current) {
      needsAnimateRef.current = false;
      // Force reflow so the browser computes the initial off-screen position;
      // this makes the subsequent class change a genuine computed-style transition.
      void panelRef.current.offsetHeight;
      setIsAnimating(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, openNonce]);

  // Fallback: onTransitionEnd as safety net
  const handleTransitionEnd = useCallback(() => {
    if (!isOpen) setIsVisible(false);
  }, [isOpen]);

  // Focus management: save/restore + auto-focus close button (mobile only)
  // Desktop: sidebar coexistence — no focus steal so user can keep typing in chat
  useEffect(() => {
    if (isMobile) {
      if (isOpen) {
        previousFocusRef.current = document.activeElement;
        setTimeout(() => closeButtonRef.current?.focus(), 0);
      } else if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }
  }, [isOpen, isMobile]);

  // Escape key + focus trap (focus trap is mobile-only for full-screen modal)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap only on mobile (full-screen modal)
      if (isMobile && e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isMobile]);

  // Content rendering per panel type
  const renderPanelContent = (type: QuickPanelType) => {
    switch (type) {
      case 'sessions':
        return (
          <SessionQuickAccessPanel
            projectSlug={projectSlug}
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession ?? (() => {})}
            autoFocusSearch={isMobile}
          />
        );
      case 'files':
        return <QuickFileExplorer projectSlug={projectSlug} />;
      case 'git':
        return (
          <QuickGitPanel
            projectSlug={projectSlug}
            onNavigateToGitTab={onNavigateToGitTab}
          />
        );
      case 'terminal':
        return (
          <QuickTerminal
            projectSlug={projectSlug}
            onNavigateToTerminalTab={onNavigateToTerminalTab}
          />
        );
      default:
        return null;
    }
  };

  if (!isVisible) return null;

  const displayPanel = activePanel ?? displayPanelRef.current;
  const config = PANEL_CONFIG[displayPanel];

  return (
    <>
      {/* Backdrop overlay - mobile only (desktop uses sidebar coexistence) */}
      {isMobile && (
        <div
          data-testid="quick-panel-backdrop"
          aria-hidden="true"
          className={`fixed inset-0 z-40 bg-black/30
                      transition-opacity duration-300 ease-in-out
                      ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
      )}

      {/* Panel container */}
      <div
        ref={panelRef}
        data-testid="quick-panel"
        role={isMobile ? 'dialog' : 'complementary'}
        aria-modal={isMobile ? true : undefined}
        aria-label={t(config.titleKey)}
        className={`fixed z-50 flex flex-col ${
          isMobile
            ? `inset-0 bg-[var(--bg-page)]${
                swipeFrom
                  ? ` transition-transform duration-300 ease-in-out ${
                      isAnimating ? 'translate-x-0'
                        : swipeFrom === 'left' ? '-translate-x-full' : 'translate-x-full'
                    }`
                  : ''
              }`
            : `inset-y-0 ${panelSide === 'right' ? 'right-0' : 'left-0'} bg-[var(--bg-page)]
               ${panelSide === 'right'
                 ? 'border-l border-slate-600 dark:border-slate-700/50'
                 : 'border-r border-slate-600 dark:border-slate-700/50'} shadow-xl
               ${suppressTransition ? '' : 'transition-transform duration-300 ease-in-out'}
               ${isAnimating
                 ? 'translate-x-0'
                 : panelSide === 'right' ? 'translate-x-full' : '-translate-x-full'}`
        }`}
        style={!isMobile ? { width: `${panelWidth}px` } : undefined}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Resize handle - desktop only */}
        {!isMobile && (
          <ResizableHandle
            width={panelWidth}
            onWidthChange={onWidthChange}
            minWidth={280}
            maxWidthRatio={0.6}
            panelSide={panelSide}
          />
        )}
        {/* Common header */}
        <div className="flex items-center justify-between px-4 py-[14.5px] min-h-16
                        bg-[#243648] dark:bg-[#171e24]
                        border-b border-slate-200 dark:border-slate-700/50">
          <PanelTabSwitcher
            activePanel={displayPanel}
            onSwitchPanel={onSwitchPanel}
            terminalAccessible={terminalAccessible}
            gitChangedCount={gitChangedCount}
          />
          <div className="flex items-center gap-1">
            {!isMobile && (
              <button
                onClick={onToggleSide}
                className="p-1 hover:bg-white/10 dark:hover:bg-gray-700 rounded
                           text-white/80 dark:text-gray-200
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={t('panel.moveToOtherSide')}
                title={t('panel.moveToOtherSide')}
                data-testid="panel-side-toggle"
              >
                {panelSide === 'right'
                  ? <PanelLeft className="w-4 h-4" aria-hidden="true" />
                  : <PanelRight className="w-4 h-4" aria-hidden="true" />
                }
              </button>
            )}
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-1 hover:bg-white/10 dark:hover:bg-gray-700 rounded
                         text-white/80 dark:text-gray-200
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('panel.close')}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div data-testid="quick-panel-content" className="flex-1 min-h-0 relative">
          {PANEL_TYPES.map(type => (
            visitedPanels.has(type) && (
              <div
                key={type}
                className={`absolute inset-0 overflow-y-auto ${
                  displayPanel === type ? '' : 'invisible'
                }`}
                role="tabpanel"
                aria-label={t(PANEL_CONFIG[type].titleKey)}
                data-testid={`quick-panel-content-${type}`}
                {...(displayPanel !== type ? { inert: '' as unknown as boolean } : {})}
              >
                {renderPanelContent(type)}
              </div>
            )
          ))}
        </div>
      </div>
    </>
  );
}
