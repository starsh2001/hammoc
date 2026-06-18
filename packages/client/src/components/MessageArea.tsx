/**
 * MessageArea Component
 * Scrollable container for chat messages with auto-scroll functionality
 * [Source: Story 4.1 - Task 3, Story 4.5 - Task 7, Story 4.8 - Task 3]
 */

import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText, XOctagon, Database, Info } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { StreamingErrorBoundary } from './StreamingErrorBoundary';
import { MessageListSkeleton } from './MessageListSkeleton';
import { StreamingIndicator, SPARKLE_FRAMES } from './StreamingIndicator';
import { CliScreenStallNotice } from './CliScreenStallNotice';
import { ToolCard } from './ToolCard';
import { InteractiveResponseCard } from './InteractiveResponseCard';
import { ThinkingBlock } from './ThinkingBlock';
import { TaskNotificationCard } from './TaskNotificationCard';
import { getContextUsagePercent, isInterruptFillerText } from '@hammoc/shared';
import type { StreamingSegment } from '../stores/chatStore';
import { isTextSegment, isToolSegment, isInteractiveSegment, isThinkingSegment, isSystemSegment, isTaskNotificationSegment, isToolSummarySegment, isResultErrorSegment, useChatStore } from '../stores/chatStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { debugLogger } from '../utils/debugLogger';
import { scrollElementIntoContainer } from '../utils/scrollUtils';
import { formatElapsed, formatTokensK } from '../utils/formatStreamingProgress';
import { ScrollProvider } from '../contexts/ScrollContext';

/**
 * Progress label with animated trailing dots (CLI sparkle mode). The i18n string's own trailing
 * ellipsis is stripped and replaced with `dots` visible dots; the remaining slots of the 3 stay as
 * an invisible spacer so the count can change (1 → 2 → 3) without shifting the text/counter after it.
 */
function GeneratingLabel({ text, dots }: { text: string; dots: number }) {
  const base = text.replace(/[\s.·…]+$/u, '');
  return (
    <>
      {base}
      <span aria-hidden="true">
        {'.'.repeat(dots)}
        <span className="invisible">{'.'.repeat(Math.max(0, 3 - dots))}</span>
      </span>
    </>
  );
}


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
  /** Whether a fork operation is in progress */
  isForking?: boolean;
  /** Whether currently loading older messages (for scroll position preservation) */
  isLoadingMore?: boolean;
}

/**
 * Hook for managing auto-scroll behavior
 */
function useAutoScroll(
  depSignature: string,
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

  // Track whether the user is physically touching/dragging the scroll area.
  // Used to distinguish genuine user scroll from trackpad inertia events.
  const userTouchActiveRef = useRef(false);

  // Detect genuine user scroll interaction (wheel with meaningful delta, or
  // active touch) to immediately override the programmatic scroll guard.
  // Without this, user scroll attempts during the guard window (up to 600ms
  // for smooth scroll) are silently ignored, making scroll seem "stuck".
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cancelGuardOnUserInput = () => {
      if (isProgrammaticScrollRef.current) {
        isProgrammaticScrollRef.current = false;
        // Bump epoch so any pending guard-reset callbacks become no-ops
        scrollEpochRef.current++;
      }
    };

    // For wheel: require meaningful deltaY to filter out trackpad inertia.
    // Normalize deltaMode: 0=pixels, 1=lines (~16px), 2=pages (~800px)
    const handleWheel = (e: WheelEvent) => {
      const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
      if (Math.abs(e.deltaY) * multiplier > 2) {
        cancelGuardOnUserInput();
      }
    };

    // For touch: only cancel guard while finger is actively on screen
    const handleTouchStart = () => { userTouchActiveRef.current = true; };
    const handleTouchEnd = () => { userTouchActiveRef.current = false; };
    const handleTouchMove = () => {
      if (userTouchActiveRef.current) {
        cancelGuardOnUserInput();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

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
    const localTimer = { id: null as ReturnType<typeof setTimeout> | null };

    const settle = () => {
      if (settled) return;
      settled = true;
      // Only clear this call's own timer — avoid clearing a newer call's timer
      if (localTimer.id !== null) { clearTimeout(localTimer.id); localTimer.id = null; }
      container?.removeEventListener('scrollend', onScrollEnd);
      doReset();
    };

    const onScrollEnd = () => settle();

    if (container) {
      container.addEventListener('scrollend', onScrollEnd, { once: true });
    }
    localTimer.id = setTimeout(settle, 600);
    // Store latest timer for cleanup on unmount
    guardTimerRef.current = localTimer.id;
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
  }, [depSignature, isUserScrolledUp, smooth, isLoadingMore, isStreaming]);

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

/**
 * Build a stable, value-comparable signature of everything that should trigger an auto-scroll,
 * returned as a STRING (compared by value). The auto-scroll effect keys off this so it fires only
 * when scroll-relevant content actually changes — never on a cosmetic re-render. In CLI mode the
 * spinner frame, the 1-second elapsed clock, and the "↓ N tokens" counter re-render MessageArea
 * several times a second; none of those are inputs here, so they no longer move the scroll
 * position. (The previous dependency was a fresh ARRAY every render, so the effect ran — and
 * snapped a scrolled-up reader back to the bottom — on every spinner tick.) Streaming text uses
 * total LENGTH (grows as it streams) instead of the joined string, and tool *statuses* are
 * included so a pending→done transition, which appends result content, still scrolls.
 */
export function computeScrollSignature(
  scrollDependencies: unknown[],
  streamingSegments: StreamingSegment[],
): string {
  const streamingTextLength = streamingSegments
    .filter(isTextSegment)
    .reduce((acc, s) => acc + s.content.length, 0);
  const thinkingContentLength = streamingSegments
    .filter(isThinkingSegment)
    .reduce((acc, s) => acc + s.content.length, 0);
  const toolStatuses = streamingSegments
    .filter(isToolSegment)
    .map((s) => s.status)
    .join(',');
  const depPart = scrollDependencies
    .map((d) => (Array.isArray(d) ? d.length : d == null ? '' : typeof d === 'object' ? '·' : String(d)))
    .join(',');
  return [depPart, streamingTextLength, streamingSegments.length, thinkingContentLength, toolStatuses].join('|');
}

export const MessageArea = forwardRef<MessageAreaHandle, MessageAreaProps>(function MessageArea({
  children,
  scrollDependencies = [],
  emptyState,
  autoScrollOptions,
  streamingSegments = [],
  isStreaming = false,
  isCompacting = false,
  isForking = false,
  isLoadingMore = false,
}, ref) {
  const { t } = useTranslation('chat');
  // Value-comparable content signature (see computeScrollSignature) so auto-scroll fires only on
  // genuine content change — never on a cosmetic CLI spinner / elapsed-clock / token-counter tick.
  const scrollSignature = computeScrollSignature(scrollDependencies, streamingSegments);

  const { containerRef, bottomRef, isUserScrolledUp, scrollToBottom, scrollToElement, adjustScrollBy, handleScroll } =
    useAutoScroll(scrollSignature, { ...autoScrollOptions, isLoadingMore, isStreaming });

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

  // Detect buffer replay restoration (stream:status received but buffer not yet processed)
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const isRestoringStream = isStreaming && streamingMessageId === 'restoring';

  // Story 32.7: transient CLI generation progress ("↓ N tokens · Ns"). Additive next
  // to the streaming indicators below — null in SDK mode (real token streaming), so the
  // indicators keep their existing text unchanged. Its presence is the CLI-mode signal
  // (the SDK engine never emits it) and also switches the spinner to the sparkle variant.
  const generationProgress = useChatStore((s) => s.generationProgress);

  // Story 36.2: CLI pre-generation phase (launching/submitting/waiting); null in SDK mode
  // and once the first block arrives. Drives the waiting-indicator label + sparkle spinner
  // so the ~3s boot/inject window reads as "working" instead of a frozen spinner.
  const cliPhase = useChatStore((s) => s.cliPhase);

  // Card entrance animation (Advanced toggle, default ON): streaming cards bubble in
  // (fade + slide up) one by one as they mount, instead of popping in all at once.
  // Applies to BOTH engines, streaming segments only — history/reload is left static.
  const cardEntranceAnimation = usePreferencesStore((s) => s.preferences.cardEntranceAnimation ?? true);

  // Elapsed seconds SCRAPED from claude's spinner (generationProgress.elapsedSeconds) — the user opted
  // for the parsed value over a client-side wall-clock so the counter matches the claude/mirror screen
  // exactly. Accepted trade-off: the scraped value freezes when the token count stalls and reads 0 on
  // counter-only frames, so the clock can hitch instead of ticking smoothly. CLI-style format: "Ns" under
  // a minute, "Nm Ns" otherwise (700s → "11m 40s"). See formatElapsed.
  const elapsedClock = formatElapsed(generationProgress?.elapsedSeconds ?? 0);
  // Story 37.11: while claude's spinner reports the THINKING phase, the LEFT indicator label reads
  // "Thinking" (vs "Generating response") — see `thinkingActive` below. The RIGHT counter is ALWAYS the
  // plain token/elapsed readout, so "Thinking" isn't duplicated on both sides (the user's report). The
  // reasoning content itself streams separately as a provisional `∴` card when it lands.
  const thinkingActive = generationProgress?.thinking === true;
  const generationProgressLabel = generationProgress
    // Story 37.2 fallback: before claude paints the first "↓ N tokens" counter only the elapsed clock
    // exists (tokens 0). Show the time alone instead of "↓ 0 토큰", which reads as a stalled counter.
    ? (generationProgress.tokens > 0
        ? t('streaming.generationProgress', { tokens: formatTokensK(generationProgress.tokens), time: elapsedClock })
        : elapsedClock)
    : null;

  // Story 36.2: localized phase label, shown in the waiting indicator before the first block.
  const cliPhaseLabel = cliPhase ? t(`streaming.cliPhase.${cliPhase}`) : null;

  // CLI sparkle spinner + the "생성 중…" dots share ONE timer so they advance together. Gated on
  // CLI mode (project override > global pref > sdk) and isStreaming — NOT on a progress/phase
  // signal having arrived — so the sparkle shows from the very first frame instead of flashing the
  // SDK pulse dots at send time or across the phase→generation gap. The 100ms tick is held for 2
  // ticks per glyph (≈200ms, half speed), and the dot count cycles 1 → 2 → 3 once per full spin of
  // the star (one turn of SPARKLE_FRAMES). frame is handed to StreamingIndicator so the two never
  // drift. (SDK mode keeps the static i18n label + its own CSS-pulse dots.)
  const engineModeOverride = useChatStore((s) => s.projectSettings?.engineModeOverride);
  const globalEngineMode = usePreferencesStore((s) => s.preferences.engineMode);
  const isCliMode = (engineModeOverride ?? globalEngineMode ?? 'sdk') === 'cli';
  const sparkleActive = isStreaming && isCliMode;
  const [spinnerTick, setSpinnerTick] = useState(0);
  useEffect(() => {
    if (!sparkleActive) {
      setSpinnerTick(0);
      return;
    }
    const id = setInterval(() => setSpinnerTick((tk) => tk + 1), 100);
    return () => clearInterval(id);
  }, [sparkleActive]);
  const spinnerFrame = Math.floor(spinnerTick / 2);
  const dotCount = Math.floor(((spinnerFrame % SPARKLE_FRAMES.length) * 3) / SPARKLE_FRAMES.length) + 1;

  // Show compaction hint when waiting too long with high context usage
  const isWaitingWithNoContent = isStreaming && !isCompacting && !isRestoringStream && streamingSegments.length === 0;
  const [showCompactionHint, setShowCompactionHint] = useState(false);
  useEffect(() => {
    if (!isWaitingWithNoContent) {
      setShowCompactionHint(false);
      return;
    }
    const ctx = useChatStore.getState().contextUsage;
    const usagePct = ctx && ctx.contextWindow > 0
      ? getContextUsagePercent(ctx.inputTokens + ctx.cacheCreationInputTokens + ctx.cacheReadInputTokens, ctx.contextWindow)
      : 0;
    if (usagePct < 95) return;
    const timer = setTimeout(() => setShowCompactionHint(true), 10000);
    return () => clearTimeout(timer);
  }, [isWaitingWithNoContent]);

  // Render streaming segments during active streaming or while awaiting confirmation (abort)
  const shouldRenderSegments = isStreaming || streamingSegments.length > 0;

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
        {/* History messages - kept mounted to preserve scroll/local state */}
        <div className={`space-y-4${isRestoringStream ? ' invisible' : ''}`}>
          {children}
        </div>

        {/* Stream restoring overlay — skeleton shown briefly while buffer replay is being processed */}
        {isRestoringStream && (
          <MessageListSkeleton count={3} />
        )}

        {/* Streaming segments - rendered in order (hidden after pending permission, hidden during restore) */}
        {!isRestoringStream && shouldRenderSegments && visibleSegments.map((seg, index) => {
          // Story 37.11/37.12: a PROVISIONAL segment is a CLI screen scrape (live estimate). The card is
          // dimmed (wrapper below) AND a "preview" chip sits beside that card's OWN title (tool name /
          // "Claude" / thinking header) — passed into each card component here.
          const segProvisional = (seg as { provisional?: boolean }).provisional === true;
          const el: ReactNode = (() => {
          if (isThinkingSegment(seg)) {
            // Thinking is still streaming only if it's the last segment and overall streaming is active
            const isThinkingStillStreaming = isStreaming && isLastSegmentIndex(index);
            return (
              <div key={`seg-thinking-${index}`} className="flex justify-start">
                <div className="max-w-[90%] md:max-w-[80%]">
                  <ThinkingBlock content={seg.content} isStreaming={isThinkingStillStreaming} provisional={segProvisional} />
                </div>
              </div>
            );
          }

          if (isSystemSegment(seg)) {
            const isAbort = seg.subtype === 'abort';
            const isCompact = seg.subtype === 'compact';
            const Icon = isAbort ? XOctagon : isCompact ? Database : Info;
            const colorClasses = isAbort
              ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
              : isCompact
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
            // Skip harness interrupt/empty-turn filler (e.g. "No response requested.")
            // so it never flashes as a live bubble; the authoritative reload omits it too.
            if (isInterruptFillerText(seg.content)) return null;
            const isStillStreaming = isStreaming && isLastSegmentIndex(index);
            const startedAt = useChatStore.getState().streamingStartedAt;
            return (
              <StreamingErrorBoundary key={`seg-text-${index}`}>
                <MessageBubble
                  message={{
                    id: `streaming-text-${index}`,
                    type: 'assistant',
                    content: seg.content,
                    timestamp: startedAt?.toISOString() ?? new Date().toISOString(),
                  }}
                  isStreaming={isStillStreaming}
                  provisional={segProvisional}
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
                  provisional={segProvisional}
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
          })();
          if (el == null) return null;
          // Story 37.11 (AC4): a PROVISIONAL card is a CLI grid SCREEN-SCRAPE (preview estimate) not yet
          // replaced by the file-parsed authoritative copy — DIM it (opacity, not a color-only cue) and
          // tag it for a11y + selectors. The WORDED "preview" indicator no longer rides each card; it sits
          // once on the streaming status line (the in-progress response's title) — see
          // `hasProvisionalSegments` above. The turn-end authoritative reload clears streamingSegments, so
          // the dimming disappears on completion. `data-provisional` is the locale-independent test hook.
          const isProvisional = segProvisional;
          const card: ReactNode = isProvisional ? (
            <div
              key={`seg-prov-${index}`}
              className="opacity-[0.65] transition-opacity"
              data-provisional="true"
              aria-label={t('streamingMessage.provisionalAriaLabel')}
            >
              {el}
            </div>
          ) : el;
          // Bubble each streaming card in as it mounts. A new segment mounts fresh → the
          // animation plays once; an existing segment keeps the same wrapper key, so its
          // text can keep growing without replaying. Toggle off → original static render.
          if (!cardEntranceAnimation) return card;
          return <div key={`seg-anim-${index}`} className="animate-fadeInUp">{card}</div>;
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
            <div className="max-w-[80%] bg-gray-50 dark:bg-[#263240] rounded-r-lg rounded-tl-lg border border-gray-300 dark:border-[#3a4d5e] p-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <StreamingIndicator variant={sparkleActive ? 'sparkle' : 'default'} frame={sparkleActive ? spinnerFrame : undefined} />
                <span className="text-sm text-gray-500 dark:text-gray-300">
                  {(() => {
                    const label = thinkingActive ? t('streaming.thinking') : t('streaming.generating');
                    return sparkleActive ? <GeneratingLabel text={label} dots={dotCount} /> : label;
                  })()}
                </span>
                {generationProgressLabel && (
                  <span className="text-xs text-gray-400 dark:text-gray-400 tabular-nums">{generationProgressLabel}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Waiting indicator: streaming started but no content yet (not compacting) */}
        {isWaitingWithNoContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-gray-50 dark:bg-[#263240] rounded-r-lg rounded-tl-lg border border-gray-300 dark:border-[#3a4d5e] p-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <StreamingIndicator variant={sparkleActive ? 'sparkle' : 'default'} frame={sparkleActive ? spinnerFrame : undefined} />
                <span className="text-sm text-gray-500 dark:text-gray-300">
                  {(() => {
                    const label = thinkingActive
                      ? t('streaming.thinking')
                      : (cliPhaseLabel ?? (isForking ? t('streaming.forking') : t('streaming.waiting')));
                    return sparkleActive ? <GeneratingLabel text={label} dots={dotCount} /> : label;
                  })()}
                  {!isForking && !cliPhaseLabel && showCompactionHint && (
                    <span className="text-amber-600 dark:text-amber-400"> ({t('streaming.compactionHint')})</span>
                  )}
                </span>
                {generationProgressLabel && (
                  <span className="text-xs text-gray-400 dark:text-gray-400 tabular-nums">{generationProgressLabel}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Soft "CLI screen looks frozen" affordance — self-gates on stalled + streaming. */}
        <CliScreenStallNotice />

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
