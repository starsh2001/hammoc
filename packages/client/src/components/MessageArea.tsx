/**
 * MessageArea Component
 * Scrollable container for chat messages with auto-scroll functionality
 * [Source: Story 4.1 - Task 3, Story 4.5 - Task 7, Story 4.8 - Task 3]
 */

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { ChevronDown, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { StreamingMessage } from './StreamingMessage';
import { StreamingErrorBoundary } from './StreamingErrorBoundary';
import { StreamingIndicator } from './StreamingIndicator';
import { ToolPathDisplay } from './ToolPathDisplay';
import { PermissionCard } from './PermissionCard';
import { InteractiveResponseCard } from './InteractiveResponseCard';
import { ToolDetailToggle } from './ToolDetailToggle';
import { ToolResultRenderer } from './ToolResultRenderer';
import type { StreamingSegment } from '../stores/chatStore';
import { isTextSegment, isToolSegment, isInteractiveSegment, useChatStore } from '../stores/chatStore';
import { getToolIcon, getToolDisplayName, formatDuration } from '../utils/toolUtils';

/** Real-time elapsed timer for pending tool calls (streaming only) */
function ToolTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto" aria-label={`실행 시간: ${formatDuration(elapsed)}`}>
      {formatDuration(elapsed)}
    </span>
  );
}


interface UseAutoScrollOptions {
  /** Threshold in pixels - auto-scroll when within this distance from bottom */
  threshold?: number;
  /** Use smooth scroll animation */
  smooth?: boolean;
  /** Whether currently loading older messages (for scroll position preservation) */
  isLoadingMore?: boolean;
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
  /** Whether currently loading older messages (for scroll position preservation) */
  isLoadingMore?: boolean;
}

/**
 * Hook for managing auto-scroll behavior
 */
function useAutoScroll(
  dependencies: unknown[],
  options: UseAutoScrollOptions = {}
) {
  const { threshold = 100, smooth = true, isLoadingMore = false } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Track initial mount to skip smooth scroll on first render
  const isInitialMountRef = useRef(true);

  // Track scroll state before loading more messages
  const prevScrollHeightRef = useRef<number>(0);
  const wasLoadingMoreRef = useRef<boolean>(false);

  // Capture scroll height when starting to load more
  useEffect(() => {
    if (isLoadingMore && !wasLoadingMoreRef.current && containerRef.current) {
      prevScrollHeightRef.current = containerRef.current.scrollHeight;
    }
    wasLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Detect when user scrolls up
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;

    // When user scrolls to bottom, snap to exact position
    if (isNearBottom && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

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
      // Use instant scroll on initial mount, smooth scroll for subsequent updates
      const useSmooth = smooth && !isInitialMountRef.current;
      bottomRef.current.scrollIntoView({
        behavior: useSmooth ? 'smooth' : 'auto',
        block: 'end',
      });
      isInitialMountRef.current = false;
    }
  }, [dependencies, isUserScrolledUp, smooth, isLoadingMore]);

  // Force scroll to bottom (for "new messages" button)
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setIsUserScrolledUp(false);
  }, []);

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
  isLoadingMore = false,
}: MessageAreaProps) {
  // Include streaming segments length in scroll dependencies for auto-scroll during streaming
  const lastTextContent = streamingSegments.length > 0
    ? streamingSegments.filter(isTextSegment).map((s) => s.content).join('')
    : '';
  const allScrollDependencies = [
    ...scrollDependencies,
    lastTextContent,
    streamingSegments.length,
  ];

  const { containerRef, bottomRef, isUserScrolledUp, scrollToBottom, handleScroll } =
    useAutoScroll(allScrollDependencies, { ...autoScrollOptions, isLoadingMore });

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
        className="flex-1 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-900"
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
      className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900 relative"
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 pt-4 pb-0 space-y-4"
        tabIndex={0}
      >
        {/* History messages */}
        {children}

        {/* Streaming segments - rendered in order */}
        {streamingSegments.map((seg, index) => {
          if (isTextSegment(seg)) {
            // A text segment is still being streamed only if it's the last segment
            const isStillStreaming = isLastSegmentIndex(index);
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
            // Edit/Write → PermissionCard delegation with WebSocket connection (Story 7.1)
            if (seg.toolCall.name === 'Edit' || seg.toolCall.name === 'Write') {
              return (
                <div key={seg.toolCall.id}>
                  <PermissionCard
                    toolName={seg.toolCall.name}
                    toolInput={seg.toolCall.input}
                    status={seg.status === 'completed' ? 'completed' : seg.status === 'error' ? 'error' : 'pending'}
                    onApprove={() => {
                      useChatStore.getState().respondToInteractive(seg.toolCall.id, { approved: true });
                    }}
                    onReject={() => {
                      useChatStore.getState().respondToInteractive(seg.toolCall.id, { approved: false });
                    }}
                  />
                </div>
              );
            }

            const rawDisplayInfo =
              seg.toolCall.input?.file_path ||
              seg.toolCall.input?.path ||
              seg.toolCall.input?.pattern ||
              seg.toolCall.input?.command;
            const displayInfo = typeof rawDisplayInfo === 'string' ? rawDisplayInfo : null;
            const toolDisplayName = getToolDisplayName(seg.toolCall.name);
            const ToolIcon = getToolIcon(seg.toolCall.name);

            // Extract todos from TodoWrite input for real-time checklist display
            const todos = seg.toolCall.name === 'TodoWrite' && Array.isArray(seg.toolCall.input?.todos)
              ? (seg.toolCall.input.todos as Array<{ content: string; status: string }>)
              : null;

            return (
              <div key={seg.toolCall.id}>
                <div
                  className="flex justify-start"
                  role="listitem"
                  aria-label={
                    seg.status === 'completed'
                      ? `도구 완료: ${toolDisplayName}`
                      : seg.status === 'error'
                        ? `도구 실패: ${toolDisplayName}`
                        : `도구 실행 중: ${toolDisplayName}`
                  }
                >
                  <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <ToolIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {toolDisplayName}
                      </span>
                      {seg.status === 'completed' ? (
                        <CheckCircle
                          className="w-4 h-4 text-green-500 animate-scale-in"
                          aria-hidden="true"
                        />
                      ) : seg.status === 'error' ? (
                        <AlertCircle
                          className="w-4 h-4 text-red-500 animate-error-pop"
                          aria-hidden="true"
                        />
                      ) : (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" aria-hidden="true" />
                      )}
                      {seg.status !== 'pending' && seg.toolCall.duration != null && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto" aria-label={`실행 시간: ${formatDuration(seg.toolCall.duration)}`}>
                          {formatDuration(seg.toolCall.duration)}
                        </span>
                      )}
                      {seg.status === 'pending' && seg.toolCall.startedAt != null && (
                        <ToolTimer startedAt={seg.toolCall.startedAt} />
                      )}
                    </div>
                    {displayInfo && <ToolPathDisplay displayInfo={displayInfo} toolName={seg.toolCall.name} />}
                    <ToolDetailToggle toolName={seg.toolCall.name} input={seg.toolCall.input} toolCallId={seg.toolCall.id} />
                    {todos && todos.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        {todos.map((todo, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="flex-shrink-0 mt-0.5">
                              {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '▸' : '○'}
                            </span>
                            <span className={todo.status === 'completed' ? 'line-through opacity-60' : ''}>
                              {todo.content}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {seg.status === 'completed' && seg.toolCall.output &&
                  seg.toolCall.name !== 'Edit' && seg.toolCall.name !== 'Write' && seg.toolCall.name !== 'TodoWrite' && (
                  <ToolResultRenderer
                    toolName={seg.toolCall.name}
                    toolInput={seg.toolCall.input}
                    result={seg.toolCall.output}
                  />
                )}
                {seg.status === 'error' && (
                  <div className="text-xs text-red-500 mt-1 ml-2">
                    Tool 실행 실패: {seg.toolCall.output || '알 수 없는 오류'}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Waiting indicator: streaming started but no segments received yet */}
        {isStreaming && streamingSegments.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-white dark:bg-gray-800 rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
              <StreamingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} aria-hidden="true" />
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
