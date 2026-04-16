/**
 * GitTab - Main Git repository tab component
 * [Source: Story 16.3 - Task 5]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GitFileStatus } from '@hammoc/shared';
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  Loader2,
  Check,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';

import { useGitStatus } from '../../hooks/useGitStatus';
import { useGitStore } from '../../stores/gitStore';
import { GitFileList } from './GitFileList';
import { DiffViewer } from '../DiffViewer';
import { ConfirmModal } from '../ConfirmModal';

export function GitTab() {
  const { t } = useTranslation('common');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { status, isLoading: _statusLoading } = useGitStatus(projectSlug);

  const commits = useGitStore((s) => s.commits);
  const branches = useGitStore((s) => s.branches);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const fetchLog = useGitStore((s) => s.fetchLog);
  const fetchBranches = useGitStore((s) => s.fetchBranches);
  const stageFiles = useGitStore((s) => s.stageFiles);
  const unstageFiles = useGitStore((s) => s.unstageFiles);
  const commitAction = useGitStore((s) => s.commit);
  const pushAction = useGitStore((s) => s.push);
  const pullAction = useGitStore((s) => s.pull);
  const checkoutAction = useGitStore((s) => s.checkout);
  const createBranchAction = useGitStore((s) => s.createBranch);
  const initRepoAction = useGitStore((s) => s.initRepo);
  const fetchDiff = useGitStore((s) => s.fetchDiff);
  const clearError = useGitStore((s) => s.clearError);

  // Local state
  const [commitMessage, setCommitMessage] = useState('');
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [activeBranchIndex, setActiveBranchIndex] = useState(-1);
  const [pendingCheckout, setPendingCheckout] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [diffContent, setDiffContent] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [panelAnimating, setPanelAnimating] = useState(false);

  const branchDropdownRef = useRef<HTMLDivElement>(null);

  // Load branches and log on mount
  useEffect(() => {
    if (!projectSlug) return;
    fetchBranches(projectSlug);
    fetchLog(projectSlug, 20);
  }, [projectSlug, fetchBranches, fetchLog]);

  // Branch select with dirty check
  const handleBranchSelect = useCallback((branch: string) => {
    setBranchDropdownOpen(false);
    setActiveBranchIndex(-1);
    if (branch === status?.branch) return;

    const hasChanges =
      (status?.staged?.length ?? 0) > 0 ||
      (status?.unstaged?.length ?? 0) > 0 ||
      (status?.untracked?.length ?? 0) > 0;

    if (hasChanges) {
      setPendingCheckout(branch);
    } else if (projectSlug) {
      checkoutAction(projectSlug, branch);
    }
  }, [status, projectSlug, checkoutAction]);

  // Branch dropdown outside click
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
        setActiveBranchIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [branchDropdownOpen]);

  // Branch dropdown keyboard
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const branchList = branches?.local ?? [];
      if (e.key === 'Escape') {
        setBranchDropdownOpen(false);
        setActiveBranchIndex(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveBranchIndex((prev) => Math.min(prev + 1, branchList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveBranchIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && activeBranchIndex >= 0 && activeBranchIndex < branchList.length) {
        e.preventDefault();
        handleBranchSelect(branchList[activeBranchIndex]);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [branchDropdownOpen, activeBranchIndex, branches, handleBranchSelect]);

  // Slide panel open/close
  const openDiffPanel = useCallback(async (path: string, staged: boolean) => {
    if (!projectSlug) return;
    setSelectedFile({ path, staged });
    setDiffLoading(true);
    setPanelVisible(true);
    requestAnimationFrame(() => setPanelAnimating(true));
    const diff = await fetchDiff(projectSlug, path, staged);
    setDiffContent(diff);
    setDiffLoading(false);
  }, [projectSlug, fetchDiff]);

  const closeDiffPanel = useCallback(() => {
    setPanelAnimating(false);
    setTimeout(() => {
      setPanelVisible(false);
      setSelectedFile(null);
      setDiffContent('');
    }, 350);
  }, []);

  // Escape key for diff panel
  useEffect(() => {
    if (!panelVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDiffPanel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [panelVisible, closeDiffPanel]);

  // Handlers
  const handleCommit = useCallback(async () => {
    if (!projectSlug || !commitMessage.trim()) return;
    await commitAction(projectSlug, commitMessage.trim());
    setCommitMessage('');
  }, [projectSlug, commitMessage, commitAction]);

  const handleCreateBranch = useCallback(async () => {
    if (!projectSlug || !newBranchName.trim()) return;
    await createBranchAction(projectSlug, newBranchName.trim());
    setNewBranchName('');
    setBranchDropdownOpen(false);
  }, [projectSlug, newBranchName, createBranchAction]);

  if (!projectSlug) return null;

  const staged: GitFileStatus[] = status?.staged ?? [];
  const unstaged: GitFileStatus[] = status?.unstaged ?? [];
  const untracked: string[] = status?.untracked ?? [];
  const allEmpty = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  const commitDisabled = staged.length === 0 || !commitMessage.trim() || isLoading;

  // Git not initialized
  if (status && status.initialized === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="p-4 bg-purple-100 dark:bg-purple-900/30 rounded-2xl mb-4">
          <GitBranch className="w-10 h-10 text-purple-600 dark:text-purple-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {t('git.initTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-300 mb-4">
          {t('git.initMessage')}
        </p>
        <button
          type="button"
          onClick={() => initRepoAction(projectSlug)}
          disabled={isLoading}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('git.initButton')}
        </button>
      </div>
    );
  }

  // Loading state before first status
  if (!status) {
    return (
      <div className="flex items-center gap-2 justify-center h-full text-sm text-gray-500 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('loadingStatus')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</span>
          <button type="button" onClick={clearError} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Bar: Branch selector + Pull/Push */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-300 dark:border-[#3a4d5e]">
        {/* Branch selector */}
        <div className="relative flex-1" ref={branchDropdownRef}>
          <button
            type="button"
            onClick={() => { setBranchDropdownOpen((o) => !o); setActiveBranchIndex(-1); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240] text-sm w-full max-w-xs"
            role="combobox"
            aria-expanded={branchDropdownOpen}
            aria-haspopup="listbox"
            disabled={isLoading}
          >
            <GitBranch className="w-4 h-4 text-gray-500" />
            <span className="truncate text-gray-700 dark:text-gray-200">
              {status?.branch ?? 'main'}
            </span>
          </button>

          {branchDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-[#1c2129] border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto">
              <ul role="listbox" aria-label={t('git.branchList')}>
                {(branches?.local ?? []).map((branch, index) => (
                  <li
                    key={branch}
                    role="option"
                    aria-selected={branch === status?.branch}
                    id={`branch-option-${index}`}
                    className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                      branch === status?.branch
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : activeBranchIndex === index
                          ? 'bg-gray-100 dark:bg-[#263240]'
                          : 'hover:bg-gray-50 dark:hover:bg-[#263240]'
                    } text-gray-700 dark:text-gray-200`}
                    onClick={() => handleBranchSelect(branch)}
                  >
                    {branch === status?.branch && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                    <span className={`truncate ${branch === status?.branch ? '' : 'ml-6'}`}>{branch}</span>
                  </li>
                ))}
              </ul>
              {/* New branch input */}
              <div className="border-t border-gray-300 dark:border-[#3a4d5e] px-3 py-2">
                <div className="flex items-center gap-1">
                  <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateBranch();
                      }
                    }}
                    placeholder={t('git.newBranchPlaceholder')}
                    className="flex-1 text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pull/Push buttons */}
        <button
          type="button"
          onClick={() => pullAction(projectSlug)}
          disabled={isLoading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240] text-sm disabled:opacity-50"
          title={t('git.pull')}
        >
          <ArrowDown className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          {status?.behind !== undefined && (
            <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{status.behind}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => pushAction(projectSlug)}
          disabled={isLoading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240] text-sm disabled:opacity-50"
          title={t('git.push')}
        >
          <ArrowUp className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          {status?.ahead !== undefined && (
            <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{status.ahead}</span>
          )}
        </button>

        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {/* File list section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {allEmpty && status?.initialized !== false ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="w-10 h-10 text-green-400 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-300">{t('git.noChanges')}</p>
            </div>
          ) : (
            <>
              <GitFileList
                title={t('git.stagedChanges')}
                files={staged}
                type="staged"
                onUnstageAll={() => unstageFiles(projectSlug, staged.map((f) => f.path))}
                onUnstageFile={(path) => unstageFiles(projectSlug, [path])}
                onFileClick={openDiffPanel}
                isLoading={isLoading}
              />
              <GitFileList
                title={t('git.changes')}
                files={unstaged}
                type="unstaged"
                onStageAll={() => stageFiles(projectSlug, unstaged.map((f) => f.path))}
                onStageFile={(path) => stageFiles(projectSlug, [path])}
                onFileClick={openDiffPanel}
                isLoading={isLoading}
              />
              <GitFileList
                title={t('git.untracked')}
                files={untracked}
                type="untracked"
                onStageAll={() => stageFiles(projectSlug, untracked)}
                onStageFile={(path) => stageFiles(projectSlug, [path])}
                onFileClick={openDiffPanel}
                isLoading={isLoading}
              />
            </>
          )}

          {/* Commit area */}
          <div className="border border-gray-300 dark:border-[#3a4d5e] rounded-lg p-3 space-y-2">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder={t('git.commitPlaceholder')}
              rows={3}
              className="w-full text-sm bg-transparent border border-gray-300 dark:border-[#3a4d5e] rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleCommit}
              disabled={commitDisabled}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('git.commit')}
            </button>
          </div>

          {/* History section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('git.commitHistory')}</h3>
            {commits.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('git.noCommitHistory')}</p>
            ) : (
              <ul className="space-y-1">
                {commits.map((c) => (
                  <li
                    key={c.hash}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#263240]/30"
                  >
                    <span className="text-xs font-mono text-blue-500 dark:text-blue-400 pt-0.5 flex-shrink-0">
                      {c.hash.slice(0, 7)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{c.message}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {c.author} · {formatRelativeDate(c.date, t)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Branch checkout confirmation */}
      <ConfirmModal
        isOpen={pendingCheckout !== null}
        title={t('git.switchBranchTitle')}
        message={t('git.switchBranchMessage')}
        confirmText={t('git.switchButton')}
        cancelText={t('button.cancel')}
        variant="danger"
        onConfirm={() => {
          if (pendingCheckout && projectSlug) {
            checkoutAction(projectSlug, pendingCheckout);
          }
          setPendingCheckout(null);
        }}
        onCancel={() => setPendingCheckout(null)}
      />

      {/* Diff viewer slide panel */}
      {panelVisible && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 bg-black/30 transition-opacity duration-300 z-40 ${
              panelAnimating ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeDiffPanel}
          />
          {/* Panel */}
          <div
            className={`fixed top-0 right-0 h-full w-[600px] max-w-[80vw] bg-white dark:bg-[#1c2129] shadow-xl z-50 transition-transform duration-300 ease-in-out flex flex-col ${
              panelAnimating ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-[#3a4d5e]">
              <span className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate">
                {selectedFile?.path}
              </span>
              <button
                type="button"
                onClick={closeDiffPanel}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040]"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {/* Panel content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {diffLoading ? (
                <div className="flex items-center gap-2 justify-center h-full text-sm text-gray-500 dark:text-gray-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('loadingStatus')}</span>
                </div>
              ) : (
                <DiffViewer
                  filePath={selectedFile?.path ?? ''}
                  original=""
                  modified={diffContent}
                  layout="inline"
                  responsiveLayout={false}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatRelativeDate(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return t('git.justNow');
  if (diffMin < 60) return t('git.minutesAgo', { count: diffMin });
  if (diffHour < 24) return t('git.hoursAgo', { count: diffHour });
  if (diffDay < 30) return t('git.daysAgo', { count: diffDay });
  return date.toLocaleDateString();
}
