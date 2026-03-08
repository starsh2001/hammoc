/**
 * StreamingIndicator - Visual indicator for active streaming
 * [Source: Story 4.5 - Task 5]
 *
 * Features:
 * - Animated pulsing dots
 * - Screen reader accessible
 * - Dark/light mode support
 */

import { useTranslation } from 'react-i18next';

interface StreamingIndicatorProps {
  /** Whether the indicator is visible */
  visible?: boolean;
  /** Visual variant: default (gray pulse), compact (amber bounce) */
  variant?: 'default' | 'compact';
}

export function StreamingIndicator({ visible = true, variant = 'default' }: StreamingIndicatorProps) {
  const { t } = useTranslation('chat');
  if (!visible) return null;

  const isCompact = variant === 'compact';
  const colorClass = isCompact
    ? 'text-amber-500 dark:text-amber-400'
    : 'text-gray-500 dark:text-gray-400';
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
