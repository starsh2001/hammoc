/**
 * QueueLockedBanner - Banner shown on queue-locked sessions
 * [Source: Story 15.4 - Task 2]
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Square, CheckCircle, AlertTriangle, Loader2, ExternalLink, X, Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import type { QueueItem } from '@hammoc/shared';
import { getItemSummary, getItemStatus, ItemStatusIcon } from './queueItemUtils';

export interface QueueLockedBannerProps {
  isRunning: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  isErrored: boolean;
  /** Queue is running on a different session */
  isOnOtherSession?: boolean;
  /** Session ID where queue is currently active */
  activeSessionId?: string | null;
  progress: { current: number; total: number };
  pauseReason: string | undefined;
  errorItem: { index: number; error: string } | null;
  projectSlug: string;
  onPause: () => void;
  onCancelPause?: () => void;
  isPauseRequested?: boolean;
  isWaitingForInput?: boolean;
  onResume: () => void;
  onAbort: () => void;
  /** Dismiss the completed/errored banner */
  onDismiss?: () => void;
  /** Navigate to a session (routes through handleSessionSelect for proper cleanup) */
  onNavigateToSession?: (sessionId: string) => void;
  /** Loop progress when executing inside a @loop block */
  loopProgress?: { iteration: number; max: number; innerIndex: number; innerTotal: number } | null;
  /** Summary of the current item being executed */
  currentItemSummary?: string;
  /** All queue items for the expandable list */
  parsedItems?: QueueItem[];
  /** Set of completed item indices */
  completedItems?: Set<number>;
}

export function QueueLockedBanner({
  isRunning,
  isPaused,
  isCompleted,
  isErrored,
  isOnOtherSession,
  activeSessionId,
  progress,
  pauseReason,
  errorItem,
  projectSlug,
  onPause,
  onCancelPause,
  isPauseRequested = false,
  isWaitingForInput = false,
  onResume,
  onAbort,
  onDismiss,
  onNavigateToSession,
  loopProgress,
  currentItemSummary,
  parsedItems,
  completedItems,
}: QueueLockedBannerProps) {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const progressPercent = progress.total > 0
    ? Math.round(((progress.current) / progress.total) * 100)
    : 0;

  const handleAbort = () => {
    if (window.confirm(t('queue.locked.confirmAbort'))) {
      onAbort();
    }
  };

  // Queue running on a different session
  if (isOnOtherSession && activeSessionId) {
    return (
      <div
        role="banner"
        aria-live="polite"
        data-testid="queue-locked-banner"
        className="w-full content-container banner-full-mobile sticky top-0 z-10 shadow-sm transition-all duration-300
                   bg-slate-100 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-600"
      >
        <div className="px-4 py-1.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="text-slate-500 dark:text-slate-400 flex-shrink-0 animate-spin" aria-hidden="true" />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {t('queue.locked.runningInOtherSession', { current: progress.current + 1, total: progress.total })}
            </span>
          </div>
          {onNavigateToSession ? (
            <button
              type="button"
              onClick={() => onNavigateToSession(activeSessionId!)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 flex-shrink-0"
            >
              {t('queue.locked.goToSession')}
              <ExternalLink size={14} aria-hidden="true" />
            </button>
          ) : (
            <Link
              to={`/project/${projectSlug}/session/${encodeURIComponent(activeSessionId)}`}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 flex-shrink-0"
            >
              {t('queue.locked.goToSession')}
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Completed state
  if (isCompleted) {
    return (
      <div
        role="banner"
        aria-live="polite"
        data-testid="queue-locked-banner"
        className="w-full content-container banner-full-mobile sticky top-0 z-10 shadow-sm transition-all duration-300
                   bg-green-100 dark:bg-green-900/40 border-b border-green-300 dark:border-green-700"
      >
        <div className="px-4 py-1.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm text-green-800 dark:text-green-200 font-medium">
              {t('queue.locked.complete', { total: progress.total })}
            </span>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t('queue.locked.closeBanner')}
              className="p-1 rounded-md text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Error completed state (terminal error)
  if (isErrored) {
    return (
      <div
        role="banner"
        aria-live="polite"
        data-testid="queue-locked-banner"
        className="w-full content-container banner-full-mobile sticky top-0 z-10 shadow-sm transition-all duration-300
                   bg-red-100 dark:bg-red-900/40 border-b border-red-300 dark:border-red-700"
      >
        <div className="px-4 py-1.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm text-red-800 dark:text-red-200 font-medium">
              {t('queue.locked.errorStopped')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to={`/project/${projectSlug}/queue`}
              className="text-sm text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
            >
              {t('queue.locked.goToQueueEditor')}
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t('queue.locked.closeBanner')}
                className="p-1 rounded-md text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Determine background color — paused is always amber regardless of error
  let bgClass: string;
  if (isPaused) {
    bgClass = 'bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700';
  } else {
    bgClass = 'bg-indigo-100 dark:bg-indigo-900/40 border-b border-indigo-300 dark:border-indigo-700';
  }

  return (
    <div
      role="banner"
      aria-live="polite"
      aria-label={t('queue.locked.progressAria', { current: progress.current + 1, total: progress.total })}
      data-testid="queue-locked-banner"
      className={`w-full content-container banner-full-mobile sticky top-0 z-10 shadow-sm transition-all duration-300 ${bgClass}`}
    >
      {/* Main row — always single-line (horizontal) */}
      <div className="px-3 sm:px-4 py-1 sm:py-1.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Status icon + progress */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
            {isPaused ? (
              <Pause size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 sm:w-4 sm:h-4" aria-hidden="true" />
            ) : (
              <Loader2 size={14} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 animate-spin sm:w-4 sm:h-4" aria-hidden="true" />
            )}

            <div className="flex items-center gap-1 sm:gap-1.5 flex-1 min-w-0">
              <span className={`font-medium text-xs sm:text-sm whitespace-nowrap ${
                isPaused ? 'text-amber-800 dark:text-amber-200' :
                'text-indigo-800 dark:text-indigo-200'
              }`}>
                {isPaused ? t('queue.locked.paused') :
                 isWaitingForInput ? t('queue.statusWaitingForInput') :
                 isPauseRequested ? t('queue.statusPauseRequested') :
                 t('queue.locked.running')}
              </span>
              <span className={`text-xs sm:text-sm whitespace-nowrap ${
                isPaused ? 'text-amber-600 dark:text-amber-300' :
                'text-indigo-600 dark:text-indigo-300'
              }`}>
                {progress.current + 1}/{progress.total}
              </span>

              {/* Loop progress badge */}
              {loopProgress && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-mono px-1.5 py-0.5 rounded ${
                  isPaused ? 'bg-amber-200/60 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300' :
                  'bg-indigo-200/60 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-300'
                }`}>
                  <Repeat size={10} aria-hidden="true" />
                  {loopProgress.iteration + 1}/{loopProgress.max}
                  <span className="opacity-60 hidden sm:inline">
                    ({loopProgress.innerIndex + 1}/{loopProgress.innerTotal})
                  </span>
                </span>
              )}

              {/* Current item summary - desktop only */}
              {currentItemSummary && (
                <span className={`text-xs truncate hidden sm:inline opacity-70 ${
                  isPaused ? 'text-amber-600 dark:text-amber-300' :
                  'text-indigo-600 dark:text-indigo-300'
                }`}>
                  · {currentItemSummary}{currentItemSummary.length === 100 ? '…' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Control buttons — icon-only on mobile, icon+text on desktop */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {isRunning && !isPaused && !isPauseRequested && (
              <button
                type="button"
                onClick={onPause}
                aria-label={t('queue.locked.pauseQueue')}
                className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 text-xs font-medium rounded-md
                           bg-white/80 dark:bg-[#263240]/80 text-indigo-700 dark:text-indigo-300
                           hover:bg-white dark:hover:bg-[#263240]
                           transition-colors"
              >
                <Pause size={14} className="sm:w-3 sm:h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{t('queue.pause')}</span>
              </button>
            )}
            {isRunning && !isPaused && isPauseRequested && onCancelPause && (
              <button
                type="button"
                onClick={onCancelPause}
                aria-label={t('queue.cancelPause')}
                className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 text-xs font-medium rounded-md
                           bg-amber-500 dark:bg-amber-600 text-white
                           hover:bg-amber-600 dark:hover:bg-amber-500
                           transition-colors"
              >
                <Play size={14} className="sm:w-3 sm:h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{t('queue.cancelPause')}</span>
              </button>
            )}

            {isPaused && (
              <button
                type="button"
                onClick={onResume}
                aria-label={t('queue.locked.resumeQueue')}
                className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 text-xs font-medium rounded-md
                           bg-white/80 dark:bg-[#263240]/80
                           transition-colors text-amber-700 dark:text-amber-300 hover:bg-white dark:hover:bg-[#263240]"
              >
                <Play size={14} className="sm:w-3 sm:h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{t('queue.resume')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAbort}
              aria-label={t('queue.locked.abortQueue')}
              className={`flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 text-xs font-medium rounded-md
                         bg-white/80 dark:bg-[#263240]/80
                         transition-colors ${
                           isPaused
                             ? 'text-amber-700 dark:text-amber-300 hover:bg-white dark:hover:bg-[#263240]'
                             : 'text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-[#263240]'
                         }`}
            >
              <Square size={14} className="sm:w-3 sm:h-3" aria-hidden="true" />
              <span className="hidden sm:inline">{t('queue.abort')}</span>
            </button>

            {/* Queue editor link — desktop only */}
            <Link
              to={`/project/${projectSlug}/queue`}
              className={`text-xs hover:underline hidden sm:flex items-center gap-1 flex-shrink-0 ml-1 ${
                isPaused ? 'text-amber-600 dark:text-amber-400' :
                'text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {t('queue.locked.queueEditor')}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>

            {/* Expand/collapse toggle */}
            {parsedItems && parsedItems.length >= 2 && (
              <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                className={`p-1 rounded transition-colors flex-shrink-0 ${
                  isPaused
                    ? 'text-amber-400 dark:text-amber-500 hover:bg-amber-200/50 dark:hover:bg-amber-800/40'
                    : 'text-indigo-400 dark:text-indigo-500 hover:bg-indigo-200/50 dark:hover:bg-indigo-800/40'
                }`}
                aria-label={expanded ? t('queue.locked.collapseList') : t('queue.locked.expandList')}
              >
                {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`h-0.5 ${
        isPaused ? 'bg-amber-200 dark:bg-amber-800' :
        'bg-indigo-200 dark:bg-indigo-800'
      }`}>
        <div
          className={`h-full transition-all duration-500 ${
            isPaused ? 'bg-amber-500' :
            'bg-indigo-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Expanded item list */}
      {expanded && parsedItems && parsedItems.length > 0 && (
        <div className={`max-h-48 overflow-y-auto border-t ${
          isPaused ? 'border-amber-200 dark:border-amber-800' : 'border-indigo-200 dark:border-indigo-800'
        }`}>
          {parsedItems.map((item, index) => {
            const status = getItemStatus(index, progress.current, isRunning, isPaused, completedItems ?? new Set(), errorItem);
            return (
              <div key={index}>
                <div className={`flex items-center gap-1.5 px-4 py-1 text-xs ${
                  index === progress.current ? (isPaused ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'bg-indigo-50/50 dark:bg-indigo-900/10') : ''
                }`}>
                  <span className="w-4 text-right text-gray-400 flex-shrink-0">{index + 1}</span>
                  <ItemStatusIcon status={status} size="sm" />
                  <span className={`truncate ${
                    status === 'completed' ? 'line-through text-gray-400' :
                    status === 'running' || status === 'paused' ? 'font-medium text-gray-800 dark:text-gray-100' :
                    'text-gray-600 dark:text-gray-300'
                  }`}>
                    {getItemSummary(item, t)}
                  </span>
                  {item.loop && loopProgress && index === progress.current && (
                    <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                      ({loopProgress.iteration + 1}/{loopProgress.max})
                    </span>
                  )}
                </div>
                {/* Loop inner items */}
                {item.loop && item.loop.items.map((inner, iIdx) => {
                  let innerStatus: 'completed' | 'running' | 'paused' | 'pending' = 'pending';
                  if (status === 'completed') {
                    innerStatus = 'completed';
                  } else if (index === progress.current && loopProgress) {
                    if (iIdx < loopProgress.innerIndex) innerStatus = 'completed';
                    else if (iIdx === loopProgress.innerIndex) innerStatus = isPaused ? 'paused' : 'running';
                  }
                  return (
                    <div key={`${index}-${iIdx}`} className="flex items-center gap-1.5 pl-10 pr-4 py-0.5 text-xs">
                      <ItemStatusIcon status={innerStatus} size="sm" />
                      <span className={`truncate ${
                        innerStatus === 'completed' ? 'line-through text-gray-400' :
                        innerStatus === 'running' || innerStatus === 'paused' ? 'font-medium text-gray-800 dark:text-gray-100' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        {getItemSummary(inner, t)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Pause reason */}
      {isPaused && pauseReason && (
        <div className="px-4 py-1 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {pauseReason}
          </p>
        </div>
      )}

      {/* Error item info */}
      {errorItem && (
        <div className="px-4 py-1 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-300">
            {t('queue.errorMessage', { error: `${errorItem.index + 1}: ${errorItem.error}` })}
          </p>
        </div>
      )}
    </div>
  );
}
