/**
 * QueueLockedBanner - Banner shown on queue-locked sessions
 * [Source: Story 15.4 - Task 2]
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Square, CheckCircle, AlertTriangle, Loader2, ExternalLink, X } from 'lucide-react';

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
  currentPromptPreview: string | undefined;
  pauseReason: string | undefined;
  errorItem: { index: number; error: string } | null;
  projectSlug: string;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
  /** Dismiss the completed/errored banner */
  onDismiss?: () => void;
  /** Navigate to a session (routes through handleSessionSelect for proper cleanup) */
  onNavigateToSession?: (sessionId: string) => void;
}

export function QueueLockedBanner({
  isRunning,
  isPaused,
  isCompleted,
  isErrored,
  isOnOtherSession,
  activeSessionId,
  progress,
  currentPromptPreview,
  pauseReason,
  errorItem,
  projectSlug,
  onPause,
  onResume,
  onAbort,
  onDismiss,
  onNavigateToSession,
}: QueueLockedBannerProps) {
  const { t } = useTranslation('common');
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
              to={`/project/${projectSlug}/session/${activeSessionId}`}
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

  // Paused with error (e.g., QUEUE_STOP)
  const isPausedWithError = isPaused && !!errorItem;

  // Determine background color
  let bgClass: string;
  if (isPausedWithError) {
    bgClass = 'bg-red-100 dark:bg-red-900/40 border-b border-red-300 dark:border-red-700';
  } else if (isPaused) {
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
            {isPausedWithError ? (
              <AlertTriangle size={14} className="text-red-600 dark:text-red-400 flex-shrink-0 sm:w-4 sm:h-4" aria-hidden="true" />
            ) : isPaused ? (
              <Pause size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 sm:w-4 sm:h-4" aria-hidden="true" />
            ) : (
              <Loader2 size={14} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 animate-spin sm:w-4 sm:h-4" aria-hidden="true" />
            )}

            <div className="flex items-center gap-1 sm:gap-1.5 flex-1 min-w-0">
              <span className={`font-medium text-xs sm:text-sm whitespace-nowrap ${
                isPausedWithError ? 'text-red-800 dark:text-red-200' :
                isPaused ? 'text-amber-800 dark:text-amber-200' :
                'text-indigo-800 dark:text-indigo-200'
              }`}>
                {isPausedWithError ? t('queue.locked.errorPaused') :
                 isPaused ? t('queue.locked.paused') :
                 t('queue.locked.running')}
              </span>
              <span className={`text-xs sm:text-sm whitespace-nowrap ${
                isPausedWithError ? 'text-red-600 dark:text-red-300' :
                isPaused ? 'text-amber-600 dark:text-amber-300' :
                'text-indigo-600 dark:text-indigo-300'
              }`}>
                {progress.current + 1}/{progress.total}
              </span>

              {/* Prompt preview - desktop only */}
              {currentPromptPreview && (
                <span className={`text-xs truncate hidden sm:inline opacity-70 ${
                  isPausedWithError ? 'text-red-600 dark:text-red-300' :
                  isPaused ? 'text-amber-600 dark:text-amber-300' :
                  'text-indigo-600 dark:text-indigo-300'
                }`}>
                  · {currentPromptPreview}{currentPromptPreview.length >= 100 ? '…' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Control buttons — icon-only on mobile, icon+text on desktop */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {isRunning && !isPaused && (
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

            {isPaused && (
              <button
                type="button"
                onClick={onResume}
                aria-label={t('queue.locked.resumeQueue')}
                className={`flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 text-xs font-medium rounded-md
                           bg-white/80 dark:bg-[#263240]/80
                           transition-colors ${
                             isPausedWithError
                               ? 'text-red-700 dark:text-red-300 hover:bg-white dark:hover:bg-[#263240]'
                               : 'text-amber-700 dark:text-amber-300 hover:bg-white dark:hover:bg-[#263240]'
                           }`}
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
                           isPausedWithError
                             ? 'text-red-700 dark:text-red-300 hover:bg-white dark:hover:bg-[#263240]'
                             : isPaused
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
                isPausedWithError ? 'text-red-600 dark:text-red-400' :
                isPaused ? 'text-amber-600 dark:text-amber-400' :
                'text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {t('queue.locked.queueEditor')}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`h-0.5 ${
        isPausedWithError ? 'bg-red-200 dark:bg-red-800' :
        isPaused ? 'bg-amber-200 dark:bg-amber-800' :
        'bg-indigo-200 dark:bg-indigo-800'
      }`}>
        <div
          className={`h-full transition-all duration-500 ${
            isPausedWithError ? 'bg-red-500' :
            isPaused ? 'bg-amber-500' :
            'bg-indigo-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Pause reason */}
      {isPaused && pauseReason && !errorItem && (
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
