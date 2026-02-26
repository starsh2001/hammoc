/**
 * QuickTerminal Component
 * Slide-over panel for quick terminal access in chat view
 * [Source: Story 17.4 - Task 3]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Terminal, ExternalLink, Loader2, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../hooks/useTerminal';
import { TerminalEmulator } from './TerminalEmulator';

interface QuickTerminalProps {
  isOpen: boolean;
  projectSlug: string;
  onClose: () => void;
  onNavigateToTerminalTab?: () => void;
}

export function QuickTerminal({
  isOpen,
  projectSlug,
  onClose,
  onNavigateToTerminalTab,
}: QuickTerminalProps) {
  const { terminalId, terminals, terminalAccess, create } = useTerminal(projectSlug);

  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Handle open/close with animation
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

  const handleTransitionEnd = useCallback(() => {
    if (!isOpen) setIsVisible(false);
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setTimeout(() => closeButtonRef.current?.focus(), 0);
    } else if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  // Create terminal if none exists
  useEffect(() => {
    if (isOpen && terminals.size === 0) {
      create();
    }
  }, [isOpen, terminals.size, create]);

  // Focus trap and Escape key handling
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

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop overlay - desktop only */}
      <div
        data-testid="terminal-panel-backdrop"
        className={`hidden md:block fixed inset-0 z-40 bg-black/30
                    transition-opacity duration-300 ease-in-out
                    ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="quick-terminal-panel"
        role="dialog"
        aria-label="퀵 터미널 패널"
        aria-modal="true"
        className={`fixed inset-0 z-50 bg-white dark:bg-gray-900
                    md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-96
                    md:bg-white md:dark:bg-gray-800
                    md:border-l md:border-gray-200 md:dark:border-gray-700 md:shadow-xl
                    md:transition-transform md:duration-300 md:ease-in-out
                    ${isAnimating ? 'md:translate-x-0' : 'md:translate-x-full'}
                    flex flex-col`}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-gray-700 dark:text-gray-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              터미널
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToTerminalTab && (
              <button
                onClick={onNavigateToTerminalTab}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600
                           dark:text-blue-400 dark:hover:text-blue-300 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
              >
                터미널 탭에서 열기
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="닫기"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Terminal area */}
        <div className="flex-1 min-h-0">
          {terminalAccess && !terminalAccess.allowed ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center" role="alert">
              <ShieldAlert className="w-8 h-8 text-amber-500 dark:text-amber-400 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                {!terminalAccess.enabled
                  ? '터미널 기능이 비활성화되어 있습니다'
                  : '보안상 로컬 네트워크 외부에서는 터미널을 이용할 수 없습니다'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {!terminalAccess.enabled
                  ? '설정에서 터미널을 활성화하세요.'
                  : '로컬 네트워크에서 접속해 주세요.'}
              </p>
            </div>
          ) : terminalId ? (
            <TerminalEmulator terminalId={terminalId} autoFocus />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
