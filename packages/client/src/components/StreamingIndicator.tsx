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
 * Braille spinner frames — a uniform 12-frame rotation. The stock cli-spinners "dots" set is 10
 * frames but jumps by two dots at two of its steps, which reads as a skipped/blank frame when
 * cycled quickly; filling the two missing transition glyphs (⠛, ⠶) makes every step move by
 * exactly one dot so it rotates smoothly. A single rotating glyph reads as a
 * clear, distinct motion — chosen over the dot-opacity pulse for CLI generation, where the
 * spinner sits beside the "↓ N tokens · Ns" counter and a more legible "working" cue is wanted.
 * The glyph is cycled in JS because an animated character cannot be expressed as a CSS keyframe;
 * the interval self-gates on variant + visibility so it only runs while actually on screen.
 */
const BRAILLE_FRAMES = ['⠋', '⠛', '⠙', '⠹', '⠸', '⠼', '⠴', '⠶', '⠦', '⠧', '⠇', '⠏'] as const;
const BRAILLE_INTERVAL_MS = 80;

interface StreamingIndicatorProps {
  /** Whether the indicator is visible */
  visible?: boolean;
  /** Visual variant: default (gray pulse), compact (amber bounce), braille (rotating glyph — CLI) */
  variant?: 'default' | 'compact' | 'braille';
}

export function StreamingIndicator({ visible = true, variant = 'default' }: StreamingIndicatorProps) {
  const { t } = useTranslation('chat');

  // Hooks must run unconditionally (before any early return), so the braille frame timer
  // self-gates on variant + visible rather than being conditionally created.
  const isBraille = variant === 'braille';
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!isBraille || !visible) return;
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % BRAILLE_FRAMES.length);
    }, BRAILLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isBraille, visible]);

  if (!visible) return null;

  if (isBraille) {
    return (
      <span
        className="inline-flex items-center font-mono text-base leading-none text-gray-500 dark:text-gray-300"
        aria-live="polite"
        aria-label={t('streaming.ariaLabel')}
      >
        <span className="sr-only">{t('streaming.srText')}</span>
        <span aria-hidden="true">{BRAILLE_FRAMES[frame]}</span>
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
