/**
 * MessageArea Component
 * Scrollable container for chat messages with auto-scroll functionality
 * [Source: Story 4.1 - Task 3, Story 4.5 - Task 7]
 */

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { ChevronDown, Wrench, Loader2, CheckCircle } from 'lucide-react';
import { StreamingMessage } from './StreamingMessage';
import { StreamingErrorBoundary } from './StreamingErrorBoundary';
import { ToolPathDisplay } from './ToolPathDisplay';
import type { StreamingMessageState, StreamingToolCall } from '../stores/chatStore';

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
  /** Current streaming message state (Story 4.5) */
  streamingMessage?: StreamingMessageState | null;
  /** Streaming tool calls (shown during streaming) */
  streamingToolCalls?: StreamingToolCall[];
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
  streamingMessage,
  streamingToolCalls = [],
  isLoadingMore = false,
}: MessageAreaProps) {
  // Include streaming message content in scroll dependencies for auto-scroll during streaming
  const allScrollDependencies = [
    ...scrollDependencies,
    streamingMessage?.content,
  ];

  const { containerRef, bottomRef, isUserScrolledUp, scrollToBottom, handleScroll } =
    useAutoScroll(allScrollDependencies, { ...autoScrollOptions, isLoadingMore });

  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : children !== null && children !== undefined;
  const hasContent = hasChildren || streamingMessage;

  // Show empty state if no children and no streaming
  if (!hasContent && emptyState) {
    return (
      <section
        role="log"
        aria-label="메시지 목록"
        aria-live="polite"
        data-testid="message-area"
        className="flex-1 flex items-center justify-center overflow-y-auto bg-gray-50 dark:bg-gray-900"
      >
        {emptyState}
      </section>
    );
  }

  return (
    <section
      role="log"
      aria-label="메시지 목록"
      aria-live="polite"
      data-testid="message-area"
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 relative"
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-4 space-y-4"
        tabIndex={0}
      >
        {/* History messages */}
        {children}

        {/* Streaming tool calls - shown before streaming message */}
        {streamingToolCalls.map((toolCall) => {
          // Extract display info from tool input based on tool type
          // file_path: Read/Write, path: Grep, pattern: Glob, command: Bash
          const rawDisplayInfo = toolCall.input?.file_path || toolCall.input?.path || toolCall.input?.pattern || toolCall.input?.command;
          const displayInfo = typeof rawDisplayInfo === 'string' ? rawDisplayInfo : null;
          const isCompleted = toolCall.status === 'completed';

          return (
            <div
              key={toolCall.id}
              className="flex justify-start"
              role="listitem"
              aria-label={isCompleted ? `도구 완료: ${toolCall.name}` : `도구 실행 중: ${toolCall.name}`}
            >
              <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-500" aria-hidden="true" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {toolCall.name}
                  </span>
                  {isCompleted ? (
                    <CheckCircle
                      className="w-4 h-4 text-green-500 animate-scale-in"
                      aria-hidden="true"
                    />
                  ) : (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" aria-hidden="true" />
                  )}
                </div>
                {displayInfo && <ToolPathDisplay displayInfo={displayInfo} toolName={toolCall.name} />}
              </div>
            </div>
          );
        })}

        {/* Streaming message - rendered after history messages, wrapped in error boundary */}
        {streamingMessage && (
          <StreamingErrorBoundary>
            <StreamingMessage
              content={streamingMessage.content}
              isComplete={false}
            />
          </StreamingErrorBoundary>
        )}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* "Scroll to bottom" button when user scrolled up */}
      {isUserScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 bg-blue-600 hover:bg-blue-700
                     dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-full
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
