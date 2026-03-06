/**
 * QuickPanel - Unified container for all quick panel overlays
 * Provides common header, backdrop, animation, focus management, and content routing.
 * [Source: Story 19.1 - Task 3, Story 19.2 - Tasks 3, 4, Story 19.3 - Task 4]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, History, FolderOpen, GitBranch, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { QuickPanelType } from '../../stores/panelStore';
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
}: QuickPanelProps) {
  const { t } = useTranslation('common');
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [visitedPanels, setVisitedPanels] = useState<Set<QuickPanelType>>(
    () => activePanel ? new Set([activePanel]) : new Set()
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const isOpen = activePanel !== null;

  // Close/reopen overlay on browser back/forward navigation
  useOverlayBackHandler(isOpen, onClose, onReopen);

  // Track visited panels
  useEffect(() => {
    if (activePanel) {
      setVisitedPanels(prev => {
        if (prev.has(activePanel)) return prev;
        return new Set(prev).add(activePanel);
      });
    }
  }, [activePanel]);

  // Reset visited panels when panel closes
  useEffect(() => {
    if (!isOpen) {
      setVisitedPanels(new Set());
    }
  }, [isOpen]);

  // Slide animation: mount/unmount control
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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

  if (!isVisible || !activePanel) return null;

  const config = PANEL_CONFIG[activePanel];

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
            ? 'inset-0 bg-white dark:bg-gray-900'
            : `inset-y-0 right-0 bg-white dark:bg-gray-800
               border-l border-gray-200 dark:border-gray-700 shadow-xl
               transition-transform duration-300 ease-in-out
               ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`
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
          />
        )}
        {/* Common header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-gray-200 dark:border-gray-700">
          <PanelTabSwitcher
            activePanel={activePanel}
            onSwitchPanel={onSwitchPanel}
            terminalAccessible={terminalAccessible}
            gitChangedCount={gitChangedCount}
          />
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded
                       text-gray-700 dark:text-gray-300
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('panel.close')}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content area */}
        <div data-testid="quick-panel-content" className="flex-1 min-h-0 relative">
          {PANEL_TYPES.map(type => (
            visitedPanels.has(type) && (
              <div
                key={type}
                className={`absolute inset-0 overflow-y-auto ${
                  activePanel === type ? '' : 'invisible'
                }`}
                role="tabpanel"
                aria-label={t(PANEL_CONFIG[type].titleKey)}
                data-testid={`quick-panel-content-${type}`}
                {...(activePanel !== type ? { inert: '' as unknown as boolean } : {})}
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
