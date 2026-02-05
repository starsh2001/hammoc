/**
 * SessionQuickAccessPanel Component
 * Side panel / full-screen modal for quick session switching
 * [Source: Story 5.7 - Task 2]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, MessageSquare, Loader2 } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { formatRelativeTime } from '../utils/formatters';

interface SessionQuickAccessPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Project slug for fetching sessions */
  projectSlug: string;
  /** Currently active session ID for highlighting */
  currentSessionId?: string;
  /** Callback when a session is selected */
  onSelectSession: (sessionId: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Callback for new session creation */
  onNewSession?: () => void;
}

export function SessionQuickAccessPanel({
  isOpen,
  projectSlug,
  currentSessionId,
  onSelectSession,
  onClose,
  onNewSession,
}: SessionQuickAccessPanelProps) {
  const { sessions, isLoading, fetchSessions } = useSessionStore();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Handle open/close with animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      // Fallback: on mobile, CSS transitions (md: prefixed) don't apply,
      // so onTransitionEnd never fires. Use a timeout to ensure cleanup.
      const timer = setTimeout(() => setIsVisible(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleTransitionEnd = useCallback(() => {
    if (!isOpen) setIsVisible(false);
  }, [isOpen]);

  // Fetch sessions when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchSessions(projectSlug);
    }
  }, [isOpen, projectSlug, fetchSessions]);

  // Focus trap and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the close button when panel opens
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap: Tab/Shift+Tab cycling within panel
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
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop overlay - desktop only */}
      <div
        data-testid="session-panel-backdrop"
        className={`hidden md:block fixed inset-0 z-40 bg-black/30
                    transition-opacity duration-300 ease-in-out
                    ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="session-quick-access-panel"
        role="dialog"
        aria-label="세션 목록 패널"
        aria-modal="true"
        className={`fixed inset-0 z-50 bg-white dark:bg-gray-900
                    md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-80
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            세션 목록
          </h2>
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

        {/* New session button */}
        {onNewSession && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={onNewSession}
              className="w-full flex items-center gap-2 px-3 py-2
                         text-blue-600 dark:text-blue-400
                         hover:bg-blue-50 dark:hover:bg-blue-900/20
                         rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="새 세션"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm font-medium">새 세션</span>
            </button>
          </div>
        )}

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="loading-indicator">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden="true" />
              <span className="sr-only">로딩 중</span>
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8" data-testid="empty-state">
              세션이 없습니다
            </p>
          ) : (
            sessions.map((session) => {
              const isCurrent = session.sessionId === currentSessionId;
              return (
                <button
                  key={session.sessionId}
                  onClick={() => onSelectSession(session.sessionId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${isCurrent
                      ? 'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20 border-gray-200 dark:border-gray-700'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400'
                    }`}
                  data-testid={`session-item-${session.sessionId}`}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {session.firstPrompt || '(빈 세션)'}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" aria-hidden="true" />
                      {session.messageCount}
                    </span>
                    <span>{formatRelativeTime(session.modified)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
