/**
 * QuickPanel - Unified container for all quick panel overlays
 * Provides common header, backdrop, animation, focus management, and content routing.
 * [Source: Story 19.1 - Task 3]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, History, FolderOpen, GitBranch, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { QuickPanelType } from '../../stores/panelStore';
import { SessionQuickAccessPanel } from '../SessionQuickAccessPanel';
import { QuickFileExplorer } from '../files/QuickFileExplorer';
import { QuickGitPanel } from '../git/QuickGitPanel';
import { QuickTerminal } from '../terminal/QuickTerminal';

const PANEL_CONFIG: Record<QuickPanelType, {
  icon: LucideIcon;
  title: string;
  widthClass: string;
}> = {
  sessions: { icon: History, title: '세션 목록', widthClass: 'md:w-80' },
  files: { icon: FolderOpen, title: '파일 탐색기', widthClass: 'md:w-80' },
  git: { icon: GitBranch, title: 'Git', widthClass: 'md:w-80' },
  terminal: { icon: Terminal, title: '터미널', widthClass: 'md:w-96' },
};

interface QuickPanelProps {
  activePanel: QuickPanelType | null;
  onClose: () => void;
  projectSlug: string;
  currentSessionId?: string;
  onSelectSession?: (sessionId: string) => void;
  onNavigateToGitTab?: () => void;
  onNavigateToTerminalTab?: () => void;
}

export function QuickPanel({
  activePanel,
  onClose,
  projectSlug,
  currentSessionId,
  onSelectSession,
  onNavigateToGitTab,
  onNavigateToTerminalTab,
}: QuickPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const isOpen = activePanel !== null;

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

  // Focus management: save/restore + auto-focus close button
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setTimeout(() => closeButtonRef.current?.focus(), 0);
    } else if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
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
  }, [isOpen, onClose]);

  // Content routing
  const renderContent = () => {
    switch (activePanel) {
      case 'sessions':
        return (
          <SessionQuickAccessPanel
            projectSlug={projectSlug}
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession ?? (() => {})}
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

  const config = activePanel ? PANEL_CONFIG[activePanel] : null;
  if (!config) return null;

  const IconComponent = config.icon;

  return (
    <>
      {/* Backdrop overlay - desktop only */}
      <div
        data-testid="quick-panel-backdrop"
        aria-hidden="true"
        className={`hidden md:block fixed inset-0 z-40 bg-black/30
                    transition-opacity duration-300 ease-in-out
                    ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel container */}
      <div
        ref={panelRef}
        data-testid="quick-panel"
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
        className={`fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col
                    md:inset-auto md:top-0 md:right-0 md:bottom-0 ${config.widthClass}
                    md:bg-white md:dark:bg-gray-800
                    md:border-l md:border-gray-200 md:dark:border-gray-700 md:shadow-xl
                    md:transition-transform md:duration-300 md:ease-in-out
                    ${isAnimating ? 'md:translate-x-0' : 'md:translate-x-full'}`}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Common header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <IconComponent className="w-5 h-5 mr-2 text-gray-700 dark:text-gray-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {config.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded
                       text-gray-700 dark:text-gray-300
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="패널 닫기"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content area */}
        <div data-testid="quick-panel-content" className="flex-1 overflow-y-auto min-h-0">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
