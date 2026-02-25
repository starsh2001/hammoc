/**
 * QuickGitPanel Component
 * Slide-over panel for quick Git status and commit workflow in chat view
 * [Source: Story 16.4 - Task 1]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, GitBranch, GitCommitHorizontal, Loader2, ExternalLink } from 'lucide-react';
import { useGitStatus } from '../../hooks/useGitStatus';
import { useGitStore } from '../../stores/gitStore';
import { formatRelativeTime } from '../../utils/formatters';

interface QuickGitPanelProps {
  isOpen: boolean;
  projectSlug: string;
  onClose: () => void;
  onNavigateToGitTab?: () => void;
}

export function QuickGitPanel({
  isOpen,
  projectSlug,
  onClose,
  onNavigateToGitTab,
}: QuickGitPanelProps) {
  const { status, refresh, changedFileCount } = useGitStatus(projectSlug);
  const commits = useGitStore((s) => s.commits);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const stageFiles = useGitStore((s) => s.stageFiles);
  const commit = useGitStore((s) => s.commit);
  const initRepo = useGitStore((s) => s.initRepo);
  const fetchLog = useGitStore((s) => s.fetchLog);

  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  // Fetch recent commits when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchLog(projectSlug, 3);
    }
  }, [isOpen, projectSlug, fetchLog]);

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

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || changedFileCount === 0) return;

    const unstaged = status?.unstaged?.map((f) => f.path) ?? [];
    const untracked = status?.untracked ?? [];
    const allFiles = [...unstaged, ...untracked];

    if (allFiles.length > 0) {
      await stageFiles(projectSlug, allFiles);
    }
    await commit(projectSlug, commitMessage.trim());

    // Check if commit succeeded (no error set)
    const currentError = useGitStore.getState().error;
    if (!currentError) {
      setCommitMessage('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      await refresh();
      await fetchLog(projectSlug, 3);
    }
  }, [commitMessage, changedFileCount, status, stageFiles, commit, projectSlug, refresh, fetchLog]);

  const handleInit = useCallback(async () => {
    await initRepo(projectSlug);
    await refresh();
  }, [initRepo, projectSlug, refresh]);

  const handleNavigateToGitTab = useCallback(() => {
    onNavigateToGitTab?.();
    onClose();
  }, [onNavigateToGitTab, onClose]);

  if (!isVisible) return null;

  const isCommitDisabled = !commitMessage.trim() || changedFileCount === 0 || isLoading;
  const recentCommits = commits.slice(0, 3);

  return (
    <>
      {/* Backdrop overlay - desktop only */}
      <div
        data-testid="git-panel-backdrop"
        className={`hidden md:block fixed inset-0 z-40 bg-black/30
                    transition-opacity duration-300 ease-in-out
                    ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="quick-git-panel"
        role="dialog"
        aria-label="퀵 Git 패널"
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
            Git
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error banner */}
          {error && (
            <div
              data-testid="git-error-banner"
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {/* Git not initialized */}
          {status?.initialized === false ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-gray-500 dark:text-gray-400">
                Git 저장소가 초기화되지 않았습니다
              </p>
              <button
                onClick={handleInit}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                           disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" aria-hidden="true" />
                ) : null}
                Git Init
              </button>
            </div>
          ) : (
            <>
              {/* Status summary */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <GitBranch className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <span className="font-medium text-gray-900 dark:text-white" data-testid="current-branch">
                    {status?.branch ?? '—'}
                  </span>
                  {changedFileCount > 0 && (
                    <span
                      data-testid="changed-file-badge"
                      className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium px-2 py-0.5 rounded-full"
                    >
                      {changedFileCount} 변경
                    </span>
                  )}
                </div>
              </div>

              {/* Quick commit section */}
              <div className="space-y-2">
                <textarea
                  data-testid="commit-message-input"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="커밋 메시지 입력..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             rounded-lg text-sm resize-none
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  data-testid="stage-commit-button"
                  onClick={handleCommit}
                  disabled={isCommitDisabled}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium
                             rounded-lg disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-green-500
                             flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <GitCommitHorizontal className="w-4 h-4" aria-hidden="true" />
                  )}
                  Stage All & Commit
                </button>
                {showSuccess && (
                  <p data-testid="commit-success" className="text-sm text-green-600 dark:text-green-400 text-center">
                    커밋 완료
                  </p>
                )}
              </div>

              {/* Recent commits */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  최근 커밋
                </h3>
                {recentCommits.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    커밋 히스토리가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentCommits.map((c) => (
                      <div
                        key={c.hash}
                        className="text-sm border border-gray-100 dark:border-gray-700 rounded-lg p-2"
                      >
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {c.hash.slice(0, 7)}
                          </code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatRelativeTime(c.date)}
                          </span>
                        </div>
                        <p className="text-gray-900 dark:text-white truncate mt-0.5">
                          {c.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer link */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleNavigateToGitTab}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 dark:text-blue-400
                       hover:text-blue-700 dark:hover:text-blue-300 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg py-1.5"
          >
            Git 탭에서 상세 보기
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
