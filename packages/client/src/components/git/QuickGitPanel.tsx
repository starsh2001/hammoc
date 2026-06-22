/**
 * QuickGitPanel Component
 * Content-only panel for quick Git status and commit workflow (rendered inside QuickPanel)
 * [Source: Story 16.4 - Task 1, Story 19.1 - Task 6]
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GitBranch, GitCommitHorizontal, Loader2, ExternalLink, Download, Sparkles, ChevronRight } from 'lucide-react';
import { useGitStatus } from '../../hooks/useGitStatus';
import { useGitStore } from '../../stores/gitStore';
import { formatRelativeTime } from '../../utils/formatters';
import { generateUUID } from '../../utils/uuid';

interface QuickGitPanelProps {
  projectSlug: string;
  onNavigateToGitTab?: () => void;
  /** True when the panel overlays the chat (mobile / narrow). In that case actions
   *  that navigate the chat away (e.g. AI split commit) should close the panel so the
   *  new session is visible; in side-by-side layout the panel stays open. */
  isOverlay?: boolean;
  /** Close the panel (provided by the QuickPanel container). */
  onClose?: () => void;
}

export function QuickGitPanel({
  projectSlug,
  onNavigateToGitTab,
  isOverlay,
  onClose,
}: QuickGitPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { status, refresh, changedFileCount } = useGitStatus(projectSlug);
  const commits = useGitStore((s) => s.commits);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const stageFiles = useGitStore((s) => s.stageFiles);
  const commit = useGitStore((s) => s.commit);
  const initRepo = useGitStore((s) => s.initRepo);
  const fetchLog = useGitStore((s) => s.fetchLog);

  const [commitMessage, setCommitMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch recent commits on mount (mount = panel open)
  useEffect(() => {
    fetchLog(projectSlug, 3);
  }, [projectSlug, fetchLog]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || changedFileCount === 0) return;

    const unstaged = status?.unstaged?.map((f) => f.path) ?? [];
    const untracked = status?.untracked ?? [];
    const allFiles = [...unstaged, ...untracked];

    if (allFiles.length > 0) {
      await stageFiles(projectSlug, allFiles);
    }
    await commit(projectSlug, commitMessage.trim());

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

  const handleSplitCommit = useCallback(() => {
    if (!projectSlug) return;
    // Close the panel only when it overlays the chat, so the new session's split
    // work is visible. In side-by-side layout the panel can stay open alongside it.
    if (isOverlay) onClose?.();
    const newSessionId = generateUUID();
    const params = new URLSearchParams({ task: '%split-commit' });
    navigate(`/project/${projectSlug}/session/${encodeURIComponent(newSessionId)}?${params.toString()}`);
  }, [projectSlug, navigate, isOverlay, onClose]);

  const isCommitDisabled = !commitMessage.trim() || changedFileCount === 0 || isLoading;
  const recentCommits = commits.slice(0, 3);

  return (
    <div className="flex flex-col h-full">
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

        {/* Git not installed */}
        {status?.gitInstalled === false ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-gray-500 dark:text-gray-300">
              {t('git.notInstalled')}
            </p>
            <a
              href="https://git-scm.com/downloads"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <Download className="w-4 h-4" />
              {t('git.installButton')}
            </a>
          </div>
        ) : status?.initialized === false ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-gray-500 dark:text-gray-300">
              {t('git.notInitialized')}
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
              {t('git.initButton')}
            </button>
          </div>
        ) : (
          <>
            {/* Status summary */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="w-4 h-4 text-gray-500 dark:text-gray-300" aria-hidden="true" />
                <span className="font-medium text-gray-900 dark:text-white" data-testid="current-branch">
                  {status?.branch ?? '—'}
                </span>
                {changedFileCount > 0 && (
                  <span
                    data-testid="changed-file-badge"
                    className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {t('git.changesCount', { count: changedFileCount })}
                  </span>
                )}
              </div>
            </div>

            {/* AI split commit */}
            {changedFileCount > 0 && (
              <button
                type="button"
                onClick={handleSplitCommit}
                data-testid="quick-git-split-commit"
                className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-purple-300/80 dark:border-purple-400/30 bg-purple-50/40 dark:bg-purple-500/[0.06] hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-400 dark:hover:border-purple-400/60 transition-colors text-left"
              >
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                    {t('git.splitCommitTitle')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {t('git.splitCommitSubtitle')}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-purple-500 dark:text-purple-400 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}

            {/* Quick commit section */}
            <div className="space-y-2">
              <textarea
                data-testid="commit-message-input"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={t('git.commitMessagePlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#455568]
                           bg-white dark:bg-[#253040] text-gray-900 dark:text-white
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
                {t('git.stageAllCommit')}
              </button>
              {showSuccess && (
                <p data-testid="commit-success" className="text-sm text-green-600 dark:text-green-400 text-center">
                  {t('git.commitSuccess')}
                </p>
              )}
            </div>

            {/* Recent commits */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                {t('git.recentCommits')}
              </h3>
              {recentCommits.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('git.noCommitHistory')}
                </p>
              ) : (
                <div className="space-y-2">
                  {recentCommits.map((c) => (
                    <div
                      key={c.hash}
                      className="text-sm border border-gray-100 dark:border-[#3a4d5e] rounded-lg p-2"
                    >
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-gray-500 dark:text-gray-300 font-mono">
                          {c.hash.slice(0, 7)}
                        </code>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
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
      <div className="px-4 py-3 border-t border-gray-300 dark:border-[#3a4d5e]">
        <button
          onClick={onNavigateToGitTab}
          className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 dark:text-blue-400
                     hover:text-blue-700 dark:hover:text-blue-300 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg py-1.5"
        >
          {t('git.viewInGitTab')}
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
