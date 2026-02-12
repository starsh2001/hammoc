/**
 * MessageArea Component
 * Scrollable container for chat messages with auto-scroll functionality
 * [Source: Story 4.1 - Task 3, Story 4.5 - Task 7, Story 4.8 - Task 3]
 */

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, RefreshCw, Bell, FileText, XOctagon, Database, Info } from 'lucide-react';
import { StreamingMessage } from './StreamingMessage';
import { StreamingErrorBoundary } from './StreamingErrorBoundary';
import { StreamingIndicator } from './StreamingIndicator';
import { ToolCard } from './ToolCard';
import { InteractiveResponseCard } from './InteractiveResponseCard';
import { ThinkingBlock } from './ThinkingBlock';
import type { StreamingSegment } from '../stores/chatStore';
import { isTextSegment, isToolSegment, isInteractiveSegment, isThinkingSegment, isSystemSegment, isTaskNotificationSegment, isToolSummarySegment, isResultErrorSegment, useChatStore } from '../stores/chatStore';


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

  // Track programmatic scroll to avoid false "scrolled up" detection
  const isProgrammaticScrollRef = useRef(false);

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
    if (!isUserScrolledUp && bottomRef.current && !isLoadingMore) {
      // During streaming, use instant scroll to prevent race condition:
      // smooth animation can lag behind new content → handleScroll detects "not near bottom"
      // → isUserScrolledUp becomes true → auto-scroll permanently stops
      const useSmooth = smooth && !isInitialMountRef.current && !isStreaming;
      isProgrammaticScrollRef.current = true;
      bottomRef.current.scrollIntoView({
        behavior: useSmooth ? 'smooth' : 'auto',
        block: 'end',
      });
      // Reset programmatic scroll flag after a tick (allows scroll event to fire and be ignored)
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
      isInitialMountRef.current = false;
    }
  }, [dependencies, isUserScrolledUp, smooth, isLoadingMore, isStreaming]);

  // Force scroll to bottom (for "new messages" button)
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setIsUserScrolledUp(false);
  }, []);

  // Handle mobile keyboard show/hide (visualViewport resize)
  // When keyboard opens/closes and user is near bottom, scroll to bottom
  useEffect(() => {
    if (!window.visualViewport) {
      console.log('[MessageArea] visualViewport not supported');
      return;
    }

    const handleViewportResize = () => {
      const container = containerRef.current;
      if (!container || !bottomRef.current) {
        console.log('[MessageArea] viewport resize - missing refs');
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isNearBottom = distanceFromBottom < threshold;

      console.log('[MessageArea] viewport resize', {
        scrollTop,
        scrollHeight,
        clientHeight,
        distanceFromBottom,
        threshold,
        isNearBottom,
        viewportHeight: window.visualViewport?.height,
      });

      // If user is near bottom, maintain scroll at bottom (for keyboard open/close)
      if (isNearBottom) {
        console.log('[MessageArea] scrolling to bottom');
        bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        setIsUserScrolledUp(false);
      }
    };

    const vv = window.visualViewport;
    vv.addEventListener('resize', handleViewportResize);
    return () => {
      vv.removeEventListener('resize', handleViewportResize);
    };
  }, [threshold]);

  return {
    containerRef,
    bottomRef,
    isUserScrolledUp,
    scrollToBottom,
    handleScroll,
  };
}

export function MessageArea({
  children,
  scrollDependencies = [],
  emptyState,
  autoScrollOptions,
  streamingSegments = [],
  isStreaming = false,
  isCompacting = false,
  isLoadingMore = false,
  segmentsPendingClear = false,
}: MessageAreaProps) {
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

  const { containerRef, bottomRef, isUserScrolledUp, scrollToBottom, handleScroll } =
    useAutoScroll(allScrollDependencies, { ...autoScrollOptions, isLoadingMore, isStreaming });

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
        aria-label="메시지 목록"
        aria-live="polite"
        data-testid="message-area"
        className="flex-1 flex items-center justify-center overflow-hidden bg-white dark:bg-gray-900"
      >
        {emptyState}
      </section>
    );
  }

  const isLastSegmentIndex = (index: number) => index === streamingSegments.length - 1;

  return (
    <section
      role="log"
      aria-label="메시지 목록"
      aria-live="polite"
      data-testid="message-area"
      className="flex-1 overflow-hidden bg-white dark:bg-gray-900 relative"
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
        tabIndex={0}
      >
      <div className="content-container px-4 pt-4 pb-4 space-y-4">
        {/* History messages - always show (segments append to history) */}
        {children}

        {/* Streaming segments - rendered in order */}
        {shouldRenderSegments && streamingSegments.map((seg, index) => {
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
              <div key={seg.toolCall.id}>
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
                />
              </div>
            );
          }

          if (isTaskNotificationSegment(seg)) {
            const isSuccess = seg.status === 'completed';
            const isFailed = seg.status === 'failed';
            return (
              <div key={`seg-task-${seg.taskId}-${index}`} className="flex justify-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${
                  isSuccess
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                    : isFailed
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
                }`}>
                  {isSuccess ? (
                    <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  ) : isFailed ? (
                    <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Bell className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>Task {seg.status}{seg.summary ? `: ${seg.summary}` : ''}</span>
                </div>
              </div>
            );
          }

          if (isToolSummarySegment(seg)) {
            return (
              <div key={`seg-summary-${index}`} className="flex justify-start">
                <div className="max-w-[80%] bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" aria-hidden="true" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      Tool Summary
                    </span>
                    <span className="text-xs text-blue-500 dark:text-blue-400">
                      ({seg.precedingToolUseIds.length} tools)
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{seg.summary}</p>
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
                      Error: {errorLabel}
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
                  <div className="mt-2 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {seg.totalCostUSD != null && <span>Cost: ${seg.totalCostUSD.toFixed(4)}</span>}
                    {seg.numTurns != null && <span>Turns: {seg.numTurns}</span>}
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
                    Error: {errorLabel}
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
                <div className="mt-2 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                  {err.totalCostUSD != null && <span>Cost: ${err.totalCostUSD.toFixed(4)}</span>}
                  {err.numTurns != null && <span>Turns: {err.numTurns}</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Compaction in progress: show amber indicator (highest priority) */}
        {isStreaming && isCompacting && !streamingSegments.some(s => s.type === 'text' && s.content.trim()) && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm border border-amber-200 dark:border-amber-800">
              <Database className="w-4 h-4 animate-pulse" aria-hidden="true" />
              <span>
                {streamingSegments.length === 0 || streamingSegments.every(s => s.type === 'system')
                  ? '컨텍스트 압축 중...'
                  : '컨텍스트 압축 완료 — 응답 재생성 중...'}
              </span>
              <StreamingIndicator />
            </div>
          </div>
        )}

        {/* Normal streaming indicator: text is being generated (not compacting) */}
        {isStreaming && !isCompacting && streamingSegments.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-gray-50 dark:bg-gray-800 rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
              <StreamingIndicator />
            </div>
          </div>
        )}

        {/* Waiting indicator: streaming started but no content yet (not compacting) */}
        {isStreaming && !isCompacting && streamingSegments.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-gray-50 dark:bg-gray-800 rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
              <StreamingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} aria-hidden="true" />
      </div>
      </div>

      {/* "Scroll to bottom" button when user scrolled up */}
      {isUserScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 bg-blue-100 hover:bg-blue-200
                     dark:bg-blue-500 dark:hover:bg-blue-600 text-gray-900 dark:text-white rounded-full
                     shadow-lg transition-colors focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:ring-offset-2"
          aria-label="최신 메시지로 스크롤"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
    </section>
  );
}
