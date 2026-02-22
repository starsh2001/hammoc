/**
 * QuickFileExplorer - Slide-over panel for quick file browsing from chat
 * [Source: Story 14.1 - Task 1]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

import { FileTree } from './FileTree.js';
import { useFileStore } from '../../stores/fileStore.js';

interface QuickFileExplorerProps {
  isOpen: boolean;
  projectSlug: string;
  onClose: () => void;
}

export function QuickFileExplorer({
  isOpen,
  projectSlug,
  onClose,
}: QuickFileExplorerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle open/close with animation + focus save/restore
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
        previousFocusRef.current?.focus();
        previousFocusRef.current = null;
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleTransitionEnd = useCallback(() => {
    if (!isOpen) setIsVisible(false);
  }, [isOpen]);

  // Focus trap and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

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
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleFileSelect = useCallback(
    (path: string) => {
      useFileStore.getState().requestFileNavigation(projectSlug, path);
      onClose();
    },
    [projectSlug, onClose]
  );

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop overlay - desktop only */}
      <div
        data-testid="file-explorer-backdrop"
        className={`hidden md:block fixed inset-0 z-40 bg-black/30
                    transition-opacity duration-300 ease-in-out
                    ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="quick-file-explorer-panel"
        role="dialog"
        aria-label="퀵 파일 탐색기"
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
        <div
          className="flex items-center justify-between px-4 py-3
                        border-b border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            파일 탐색기
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

        {/* File tree */}
        <div className="flex-1 overflow-y-auto">
          <FileTree
            projectSlug={projectSlug}
            basePath="."
            onFileSelect={handleFileSelect}
            showHidden={false}
            enableContextMenu={false}
          />
        </div>
      </div>
    </>
  );
}
