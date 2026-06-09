/**
 * StreamingIndicator - Visual indicator for active streaming
 * [Source: Story 4.5 - Task 5]
 *
 * Features:
 * - Animated pulsing dots
 * - Screen reader accessible
 * - Dark/light mode support
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Sparkle spinner frames — the Claude Code CLI "working" star, twinkling small→large→small.
 * The interactive `claude` TUI marks generation with a tear/eight-spoked asterisk that grows
 * then shrinks (`· ✢ ✳ ✻ ✽`); the CLI engine's own PTY scrape captured exactly these glyphs
 * (see the `✢ … ✻` spinner examples in cliChatEngine's progress-parser doc), so mirroring them
 * keeps Hammoc's CLI spinner consistent with the real tool the user sees in a terminal. The
 * sequence ping-pongs (…✽ ✻ ✳ ✢ back to ·) so the twinkle eases in and out instead of snapping
 * from the largest glyph straight back to the dot. A single glyph reads as a clearer "working"
 * cue than the dot-opacity pulse — wanted here because the spinner sits beside the
 * "↓ N tokens · Ns" counter. Cycled in JS because an animated character cannot be a CSS keyframe;
 * the interval self-gates on variant + visibility so it only runs while actually on screen.
 */
export const SPARKLE_FRAMES = ['·', '✢', '✳', '✻', '✽', '✻', '✳', '✢'] as const;
const SPARKLE_INTERVAL_MS = 200;

interface StreamingIndicatorProps {
  /** Whether the indicator is visible */
  visible?: boolean;
  /** Visual variant: default (gray pulse), compact (amber bounce), sparkle (twinkling star — CLI) */
  variant?: 'default' | 'compact' | 'sparkle';
  /**
   * sparkle variant only: an externally-driven frame index. MessageArea passes this so the star
   * stays in lockstep with the animated "생성 중…" dots — one shared timer drives both, so the dot
   * count advances together with the star. When omitted, an internal timer drives the rotation.
   */
  frame?: number;
}

export function StreamingIndicator({ visible = true, variant = 'default', frame }: StreamingIndicatorProps) {
  const { t } = useTranslation('chat');

  // Hooks must run unconditionally (before any early return), so the sparkle frame timer
  // self-gates on variant + visible. It is also skipped when a caller drives the frame
  // externally (typeof frame === 'number'), so the two never double-advance the rotation.
  const isSparkle = variant === 'sparkle';
  const externalFrame = isSparkle && typeof frame === 'number';
  const [internalFrame, setInternalFrame] = useState(0);
  useEffect(() => {
    if (!isSparkle || externalFrame || !visible) return;
    const id = setInterval(() => {
      setInternalFrame((f) => (f + 1) % SPARKLE_FRAMES.length);
    }, SPARKLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isSparkle, externalFrame, visible]);

  if (!visible) return null;

  if (isSparkle) {
    const glyph = SPARKLE_FRAMES[(frame ?? internalFrame) % SPARKLE_FRAMES.length];
    return (
      <span
        className="inline-flex items-center font-mono text-sm text-gray-500 dark:text-gray-300"
        aria-live="polite"
        aria-label={t('streaming.ariaLabel')}
      >
        <span className="sr-only">{t('streaming.srText')}</span>
        {/* Fixed-width centered cell: sparkle glyphs vary in advance width (· is narrow, ✽ wide),
            so pin a 1-char box and center each frame to keep the adjacent counter text from jittering. */}
        <span aria-hidden="true" className="inline-block w-[1ch] text-center">{glyph}</span>
      </span>
    );
  }

  const isCompact = variant === 'compact';
  const colorClass = isCompact
    ? 'text-amber-500 dark:text-amber-400'
    : 'text-gray-500 dark:text-gray-300';
  const animClass = isCompact ? 'animate-bounce-dot' : 'animate-pulse';

  return (
    <div
      className={`flex items-center gap-1 ${colorClass}`}
      aria-live="polite"
      aria-label={t('streaming.ariaLabel')}
    >
      <span className="sr-only">{t('streaming.srText')}</span>
      <span
        className={`w-2 h-2 bg-current rounded-full ${animClass}`}
        aria-hidden="true"
      />
      <span
        className={`w-2 h-2 bg-current rounded-full ${animClass}`}
        style={{ animationDelay: '150ms' }}
        aria-hidden="true"
      />
      <span
        className={`w-2 h-2 bg-current rounded-full ${animClass}`}
        style={{ animationDelay: '300ms' }}
        aria-hidden="true"
      />
    </div>
  );
}
