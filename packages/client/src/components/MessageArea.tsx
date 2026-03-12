/**
 * MessageArea Component
 * Scrollable container for chat messages with auto-scroll functionality
 * [Source: Story 4.1 - Task 3, Story 4.5 - Task 7, Story 4.8 - Task 3]
 */

import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, RefreshCw, FileText, XOctagon, Database, Info } from 'lucide-react';
import { StreamingMessage } from './StreamingMessage';
import { StreamingErrorBoundary } from './StreamingErrorBoundary';
import { StreamingIndicator } from './StreamingIndicator';
import { ToolCard } from './ToolCard';
import { InteractiveResponseCard } from './InteractiveResponseCard';
import { ThinkingBlock } from './ThinkingBlock';
import { TaskNotificationCard } from './TaskNotificationCard';
import { getContextUsagePercent } from '@hammoc/shared';
import type { StreamingSegment } from '../stores/chatStore';
import { isTextSegment, isToolSegment, isInteractiveSegment, isThinkingSegment, isSystemSegment, isTaskNotificationSegment, isToolSummarySegment, isResultErrorSegment, useChatStore } from '../stores/chatStore';
import { debugLogger } from '../utils/debugLogger';
import { scrollElementIntoContainer } from '../utils/scrollUtils';
import { ScrollProvider } from '../contexts/ScrollContext';


interface UseAutoScrollOptions {
  /** Threshold in pixels - auto-scroll when within this distance from bottom */
  threshold?: number;
  /** Use smooth scroll animation */
  smooth?: boolean;
  /** Whether currently loading older messages (for scroll position preservation) */
  isLoadingMore?: boolean;
  /** Whether currently streaming (disables smooth scroll to prevent race conditions) */
  isStreaming?: boolean;
}

interface MessageAreaProps {
  /** Child elements to render (messages) */
  children: ReactNode;
  /** Dependencies that trigger auto-scroll check */
  scrollDependencies?: unknown[];
  /** Empty state content when no children */
  emptyState?: ReactNode;
  /** Auto-scroll options */
  autoScrollOptions?: UseAutoScrollOptions;
  /** Streaming segments (ordered text/tool segments) */
  streamingSegments?: StreamingSegment[];
  /** Whether currently streaming (for waiting indicator before first segment) */
  isStreaming?: boolean;
  /** Whether context compaction is in progress */
  isCompacting?: boolean;
  /** Whether currently loading older messages (for scroll position preservation) */
  isLoadingMore?: boolean;
  /** Whether segments are pending clear (post-streaming, awaiting history fetch) */
  segmentsPendingClear?: boolean;
}

/**
 * Hook for managing auto-scroll behavior
 */
function useAutoScroll(
  dependencies: unknown[],
  options: UseAutoScrollOptions = {}
) {
  const { threshold = 100, smooth = true, isLoadingMore = false, isStreaming = false } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Track initial mount to skip smooth scroll on first render
  const isInitialMountRef = useRef(true);

  // Track scroll state before loading more messages
  const prevScrollHeightRef = useRef<number>(0);
  const wasLoadingMoreRef = useRef<boolean>(false);

  // Track programmatic scroll to avoid false "scrolled up" detection.
  // Uses a counter instead of a boolean to handle overlapping smooth scrolls correctly:
  // each scroll increments the counter, and only resets when its own epoch matches.
  const isProgrammaticScrollRef = useRef(false);
  const scrollEpochRef = useRef(0);

  // Track "at bottom" state via ref for visualViewport resize handler.
  // The state variable isUserScrolledUp can't be used directly in the resize handler
  // because the handler closure would capture a stale value.
  const isAtBottomRef = useRef(true);

  // Track guard-reset timers for cleanup on unmount
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper: schedule guard reset after a programmatic scroll completes.
  // Uses epoch counter so that overlapping scrolls don't clear each other's guard.
  // Also tries `scrollend` event for accurate timing, with setTimeout fallback.
  const scheduleGuardReset = useCallback((smooth: boolean, onReset?: () => void) => {
    const epoch = ++scrollEpochRef.current;
    isProgrammaticScrollRef.current = true;

    const doReset = () => {
      // Only reset if no newer scroll has started since this one
      if (scrollEpochRef.current === epoch) {
        isProgrammaticScrollRef.current = false;
        onReset?.();
      }
    };

    if (!smooth) {
      requestAnimationFrame(doReset);
      return;
    }

    // For smooth scrolls: prefer `scrollend` event for accurate timing,
    // with a 600ms fallback for browsers that don't support it.
    const container = containerRef.current;
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (guardTimerRef.current) { clearTimeout(guardTimerRef.current); guardTimerRef.current = null; }
      container?.removeEventListener('scrollend', onScrollEnd);
      doReset();
    };

    const onScrollEnd = () => settle();

    if (container) {
      container.addEventListener('scrollend', onScrollEnd, { once: true });
    }
    guardTimerRef.current = setTimeout(settle, 600);
  }, []);

  // Cleanup guard timer on unmount
  useEffect(() => {
    return () => {
      if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
    };
  }, []);

  // Capture scroll height when starting to load more
  useEffect(() => {
    if (isLoadingMore && !wasLoadingMoreRef.current && containerRef.current) {
      prevScrollHeightRef.current = containerRef.current.scrollHeight;
    }
    wasLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Detect when user scrolls up
  const handleScroll = useCallback(() => {
    // Skip scroll detection during programmatic scroll
    if (isProgrammaticScrollRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;

    isAtBottomRef.current = isNearBottom;
    setIsUserScrolledUp(!isNearBottom);
  }, [threshold]);

  // Handle scroll position preservation after loading older messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // If we just finished loading more, preserve scroll position
    if (!isLoadingMore && prevScrollHeightRef.current > 0) {
      const newScrollHeight = container.scrollHeight;
      const heightDiff = newScrollHeight - prevScrollHeightRef.current;

      if (heightDiff > 0) {
        // Adjust scroll position to keep user at the same visual position
        container.scrollTop += heightDiff;
      }
      prevScrollHeightRef.current = 0;
      return;
    }

    // Normal auto-scroll behavior (for new messages at bottom)
    if (!isUserScrolledUp && !isLoadingMore) {
      // During streaming, use instant scroll to prevent race condition:
      // smooth animation can lag behind new content → handleScroll detects "not near bottom"
      // → isUserScrolledUp becomes true → auto-scroll permanently stops
      const useSmooth = smooth && !isInitialMountRef.current && !isStreaming;

      if (!useSmooth && container) {
        // Instant scroll: use scrollTop instead of scrollIntoView to prevent
        // mobile browsers from scrolling the entire page (pushing InputArea off-screen)
        scheduleGuardReset(false);
        container.scrollTop = container.scrollHeight;
      } else if (container) {
        // Smooth scroll: use container.scrollTo instead of scrollIntoView to prevent
        // mobile browsers from scrolling ancestor containers / the entire page
        scheduleGuardReset(true);
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }

      isAtBottomRef.current = true;
      isInitialMountRef.current = false;
    }
  }, [dependencies, isUserScrolledUp, smooth, isLoadingMore, isStreaming]);

  // Force scroll to bottom (for "new messages" button and ScrollContext)
  const scrollToBottom = useCallback((options?: { smooth?: boolean }) => {
    const container = containerRef.current;
    if (!container) return;

    const useSmooth = options?.smooth ?? true;
    scheduleGuardReset(useSmooth);

    if (useSmooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }

    isAtBottomRef.current = true;
    setIsUserScrolledUp(false);
  }, [scheduleGuardReset]);

  // Scroll to a specific element within the container (for ScrollContext)
  const scrollToElement = useCallback((
    elementOrId: HTMLElement | string,
    options: { block?: 'center' | 'start' | 'end' | 'nearest'; smooth?: boolean } = {},
  ) => {
    const container = containerRef.current;
    if (!container) return;

    const element = typeof elementOrId === 'string'
      ? document.getElementById(elementOrId)
      : elementOrId;
    if (!element) return;

    // After programmatic scroll completes, sync position state so auto-scroll
    // correctly knows whether we're at bottom. Without this, isUserScrolledUp
    // remains false after scrolling to a mid-page element, causing auto-scroll
    // to immediately yank the user back to bottom on the next content update.
    const syncState = () => {
      const c = containerRef.current;
      if (c) {
        const isNearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < threshold;
        isAtBottomRef.current = isNearBottom;
        setIsUserScrolledUp(!isNearBottom);
      }
    };

    scheduleGuardReset(options.smooth ?? false, syncState);
    scrollElementIntoContainer(container, element, options);
  }, [threshold, scheduleGuardReset]);

  // Adjust scroll by a delta amount (for position-preserving adjustments like ThinkingBlock toggle)
  const adjustScrollBy = useCallback((deltaY: number) => {
    const container = containerRef.current;
    if (!container || deltaY === 0) return;

    scheduleGuardReset(false);
    container.scrollTop += deltaY;
  }, [scheduleGuardReset]);

  // Keep scroll at bottom when the container height changes (e.g., textarea grows
  // from multiline input, keyboard opens/closes). Without this, the container's
  // clientHeight shrinks but scrollTop stays unchanged, hiding bottom content.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current && containerRef.current) {
        scheduleGuardReset(false);
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [scheduleGuardReset]);

  // Handle mobile keyboard show/hide (visualViewport resize)
  // When keyboard opens/closes and user is near bottom, scroll to bottom.
  // Debounced to ignore rapid resize events from textarea adjustHeight (layout reflow).
  useEffect(() => {
    if (!window.visualViewport) {
      debugLogger.info('visualViewport not supported');
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleViewportResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const container = containerRef.current;
        if (!container) return;

        // Use the pre-resize "at bottom" state from the ref.
        // We can't recalculate isNearBottom here because the container has already
        // resized (keyboard opened → clientHeight shrunk → distanceFromBottom
        // jumped by keyboard height, exceeding threshold even though user was at bottom).
        if (isAtBottomRef.current) {
          scheduleGuardReset(false);
          container.scrollTop = container.scrollHeight;
          setIsUserScrolledUp(false);
        }
      }, 100);
    };

    const vv = window.visualViewport;
    vv.addEventListener('resize', handleViewportResize);
    return () => {
      vv.removeEventListener('resize', handleViewportResize);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [threshold, scheduleGuardReset]);

  return {
    containerRef,
    bottomRef,
    isUserScrolledUp,
    scrollToBottom,
    scrollToElement,
    adjustScrollBy,
    handleScroll,
  };
}

/** Imperative handle exposed to parent components via ref */
export interface MessageAreaHandle {
  scrollToElement: (
    elementOrId: HTMLElement | string,
    options?: { block?: 'center' | 'start' | 'end' | 'nearest'; smooth?: boolean },
  ) => void;
  scrollToBottom: (options?: { smooth?: boolean }) => void;
  adjustScrollBy: (deltaY: number) => void;
}

export const MessageArea = forwardRef<MessageAreaHandle, MessageAreaProps>(function MessageArea({
  children,
  scrollDependencies = [],
  emptyState,
  autoScrollOptions,
  streamingSegments = [],
  isStreaming = false,
  isCompacting = false,
  isLoadingMore = false,
  segmentsPendingClear = false,
}, ref) {
  const { t } = useTranslation('chat');
  // Include streaming content changes in scroll dependencies for auto-scroll during streaming
  const lastTextContent = streamingSegments.length > 0
    ? streamingSegments.filter(isTextSegment).map((s) => s.content).join('')
    : '';
  // Track thinking content growth for auto-scroll during thinking
  const thinkingContentLength = streamingSegments
    .filter(isThinkingSegment)
    .reduce((acc, s) => acc + s.content.length, 0);
  // Track tool status changes for auto-scroll when tool results arrive
  const toolStatuses = streamingSegments
    .filter(isToolSegment)
    .map((s) => s.status)
    .join(',');
  const allScrollDependencies = [
    ...scrollDependencies,
    lastTextContent,
    streamingSegments.length,
    thinkingContentLength,
    toolStatuses,
  ];

  const { containerRef, bottomRef, isUserScrolledUp, scrollToBottom, scrollToElement, adjustScrollBy, handleScroll } =
    useAutoScroll(allScrollDependencies, { ...autoScrollOptions, isLoadingMore, isStreaming });

  // Expose scroll functions to parent via ref
  useImperativeHandle(ref, () => ({
    scrollToElement,
    scrollToBottom,
    adjustScrollBy,
  }), [scrollToElement, scrollToBottom, adjustScrollBy]);

  // Provide scroll functions to children via context
  const scrollContextValue = useMemo(() => ({
    scrollToElement,
    scrollToBottom,
    adjustScrollBy,
  }), [scrollToElement, scrollToBottom, adjustScrollBy]);

  // Determine whether to render streaming segments:
  // - Always render during active streaming
  // - Render while pending clear (post-streaming fallback until history loads)
  // - Hide once segments have been cleared (history is authoritative)
  const shouldRenderSegments = isStreaming || (segmentsPendingClear === true && streamingSegments.length > 0);

  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : children !== null && children !== undefined;
  const hasContent = hasChildren || streamingSegments.length > 0;

  // Show empty state if no children and no streaming
  if (!hasContent && emptyState) {
    return (
      <section
        role="log"
        aria-label={t('messageArea.ariaLabel')}
        aria-live="polite"
        data-testid="message-area"
        className="flex-1 flex items-center justify-center overflow-y-auto bg-white dark:bg-[#1c2129]"
      >
        {emptyState}
      </section>
    );
  }

  // Hide segments after a pending permission/interactive to prevent content
  // from appearing below unanswered approval buttons (parallel tool execution).
  const visibleSegments = (() => {
    const blockIdx = streamingSegments.findIndex((seg) =>
      (seg.type === 'tool' && seg.permissionStatus === 'waiting') ||
      (seg.type === 'interactive' && seg.status === 'waiting')
    );
    return blockIdx === -1 ? streamingSegments : streamingSegments.slice(0, blockIdx + 1);
  })();

  const isLastSegmentIndex = (index: number) => index === visibleSegments.length - 1;

  return (
    <ScrollProvider value={scrollContextValue}>
    <section
      role="log"
      aria-label={t('messageArea.ariaLabel')}
      aria-live="polite"
      data-testid="message-area"
      className="flex-1 overflow-hidden bg-white dark:bg-[#1c2129] relative"
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain"
        tabIndex={0}
      >
      <div className="content-container px-4 pt-4 pb-4 space-y-4">
        {/* History messages - always show (segments append to history) */}
        {children}

        {/* Streaming segments - rendered in order (hidden after pending permission) */}
        {shouldRenderSegments && visibleSegments.map((seg, index) => {
          if (isThinkingSegment(seg)) {
            // Thinking is still streaming only if it's the last segment and overall streaming is active
            const isThinkingStillStreaming = isStreaming && isLastSegmentIndex(index);
            return (
              <div key={`seg-thinking-${index}`} className="flex justify-start">
                <div className="max-w-[90%] md:max-w-[80%]">
                  <ThinkingBlock content={seg.content} isStreaming={isThinkingStillStreaming} />
                </div>
              </div>
            );
          }

          if (isSystemSegment(seg)) {
            const isCompact = seg.subtype === 'compact';
            const Icon = isCompact ? Database : Info;
            const colorClasses = isCompact
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
            return (
              <div key={`seg-system-${index}`} className="flex justify-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${colorClasses}`}>
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{seg.message}</span>
                </div>
              </div>
            );
          }

          if (isTextSegment(seg)) {
            // Skip empty/whitespace-only text segments (e.g., before thinking blocks)
            if (!seg.content.trim()) return null;
            // A text segment is still being streamed only if it's the last segment AND actively streaming
            const isStillStreaming = isStreaming && isLastSegmentIndex(index);
            return (
              <StreamingErrorBoundary key={`seg-text-${index}`}>
                <StreamingMessage
                  content={seg.content}
                  isComplete={!isStillStreaming}
                />
              </StreamingErrorBoundary>
            );
          }

          if (isInteractiveSegment(seg)) {
            return (
              <div key={`seg-interactive-${seg.id}`}>
                <InteractiveResponseCard
                  type={seg.interactionType}
                  toolName={seg.toolCall?.name}
                  toolInput={seg.toolCall?.input}
                  choices={seg.choices}
                  questions={seg.questions}
                  multiSelect={seg.multiSelect}
                  status={seg.status}
                  response={seg.response}
                  errorMessage={seg.errorMessage}
                  onRespond={(approved, value) => {
                    useChatStore.getState().respondToInteractive(seg.id, { approved, value });
                  }}
                />
              </div>
            );
          }

          if (isToolSegment(seg)) {
            return (
              <div key={seg.toolCall.id} id={`tool-${seg.toolCall.id}`}>
                <ToolCard
                  toolName={seg.toolCall.name}
                  toolInput={seg.toolCall.input}
                  status={seg.status === 'error' ? 'error' : seg.status === 'completed' ? 'completed' : 'pending'}
                  startedAt={seg.toolCall.startedAt}
                  duration={seg.toolCall.duration}
                  output={seg.toolCall.output}
                  permissionStatus={seg.permissionStatus}
                  onPermissionRespond={seg.permissionStatus === 'waiting' ? (approved) => {
                    useChatStore.getState().respondToolPermission(seg.toolCall.id, approved);
                  } : undefined}
                  onPlanModeExit={seg.toolCall.name === 'ExitPlanMode' && seg.permissionStatus === 'waiting' ? (mode) => {
                    useChatStore.getState().setPermissionMode(mode);
                    useChatStore.getState().respondToolPermission(seg.toolCall.id, true);
                  } : undefined}
                />
              </div>
            );
          }

          if (isTaskNotificationSegment(seg)) {
            return (
              <TaskNotificationCard
                key={`seg-task-${seg.taskId}-${index}`}
                status={seg.status}
                summary={seg.summary}
                toolUseId={seg.toolUseId}
              />
            );
          }

          if (isToolSummarySegment(seg)) {
            return (
              <div key={`seg-summary-${index}`} className="flex justify-start">
                <div className="max-w-[80%] bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" aria-hidden="true" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      {t('message.toolSummary')}
                    </span>
                    <span className="text-xs text-blue-500 dark:text-blue-400">
                      ({t('message.toolCount', { count: seg.precedingToolUseIds.length })})
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{seg.summary}</p>
                </div>
              </div>
            );
          }

          if (isResultErrorSegment(seg)) {
            const errorLabel = seg.subtype.replace(/^error_/, '').replace(/_/g, ' ');
            return (
              <div key={`seg-error-${index}`} className="flex justify-start">
                <div className="max-w-[90%] bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2">
                    <XOctagon className="w-5 h-5 text-red-500" aria-hidden="true" />
                    <span className="text-sm font-bold text-red-700 dark:text-red-400">
                      {t('message.error', { label: errorLabel })}
                    </span>
                  </div>
                  {seg.result && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{seg.result}</p>
                  )}
                  {seg.errors && seg.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-red-500">
                      {seg.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex gap-4 text-xs text-gray-500 dark:text-gray-300">
                    {seg.totalCostUSD != null && <span>{t('message.cost', { amount: seg.totalCostUSD.toFixed(4) })}</span>}
                    {seg.numTurns != null && <span>{t('message.turns', { count: seg.numTurns })}</span>}
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Last result error (persisted after streaming completes) */}
        {!isStreaming && useChatStore.getState().lastResultError && (() => {
          const err = useChatStore.getState().lastResultError!;
          const errorLabel = err.subtype.replace(/^error_/, '').replace(/_/g, ' ');
          return (
            <div className="flex justify-start">
              <div className="max-w-[90%] bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <XOctagon className="w-5 h-5 text-red-500" aria-hidden="true" />
                  <span className="text-sm font-bold text-red-700 dark:text-red-400">
                    {t('message.error', { label: errorLabel })}
                  </span>
                </div>
                {err.result && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err.result}</p>
                )}
                {err.errors && err.errors.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-red-500">
                    {err.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-4 text-xs text-gray-500 dark:text-gray-300">
                  {err.totalCostUSD != null && <span>{t('message.cost', { amount: err.totalCostUSD.toFixed(4) })}</span>}
                  {err.numTurns != null && <span>{t('message.turns', { count: err.numTurns })}</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Compaction in progress: show amber indicator (highest priority, persists even when text arrives) */}
        {isStreaming && isCompacting && (() => {
          const ctx = useChatStore.getState().contextUsage;
          const usagePct = ctx && ctx.contextWindow > 0
            ? getContextUsagePercent(ctx.inputTokens + ctx.cacheCreationInputTokens + ctx.cacheReadInputTokens, ctx.contextWindow)
            : null;
          const hasResponse = streamingSegments.length > 0 && !streamingSegments.every(s => s.type === 'system');
          return (
            <div className="flex justify-center animate-fadeInUp">
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm border border-amber-200 dark:border-amber-800">
                <Database className="w-4 h-4 animate-pulse" aria-hidden="true" />
                <span>
                  {hasResponse
                    ? t('compaction.complete')
                    : usagePct !== null
                      ? t('compaction.inProgress', { percent: usagePct })
                      : t('compaction.inProgressNoPercent')}
                </span>
                <StreamingIndicator variant="compact" />
              </div>
            </div>
          );
        })()}

        {/* Normal streaming indicator: text is being generated (not compacting) */}
        {isStreaming && !isCompacting && streamingSegments.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-gray-50 dark:bg-[#263240] rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-[#253040] p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <StreamingIndicator />
                <span className="text-sm text-gray-500 dark:text-gray-300">{t('streaming.generating')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Waiting indicator: streaming started but no content yet (not compacting) */}
        {isStreaming && !isCompacting && streamingSegments.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-gray-50 dark:bg-[#263240] rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-[#253040] p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <StreamingIndicator />
                <span className="text-sm text-gray-500 dark:text-gray-300">{t('streaming.waiting')}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} aria-hidden="true" />
      </div>
      </div>

      {/* "Scroll to bottom" button when user scrolled up */}
      {isUserScrolledUp && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 right-4 p-2 bg-blue-100 hover:bg-blue-200
                     dark:bg-blue-500 dark:hover:bg-blue-600 text-gray-900 dark:text-white rounded-full
                     shadow-lg transition-colors focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:ring-offset-2"
          aria-label={t('messageArea.scrollToBottom')}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
    </section>
    </ScrollProvider>
  );
});
