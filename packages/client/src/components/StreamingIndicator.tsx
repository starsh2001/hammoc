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
}

export function StreamingIndicator({ visible = true }: StreamingIndicatorProps) {
  const { t } = useTranslation('chat');
  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-1 text-gray-500 dark:text-gray-400"
      aria-live="polite"
      aria-label={t('streaming.ariaLabel')}
    >
      <span className="sr-only">{t('streaming.srText')}</span>
      <span
        className="w-2 h-2 bg-current rounded-full animate-pulse"
        aria-hidden="true"
      />
      <span
        className="w-2 h-2 bg-current rounded-full animate-pulse"
        style={{ animationDelay: '150ms' }}
        aria-hidden="true"
      />
      <span
        className="w-2 h-2 bg-current rounded-full animate-pulse"
        style={{ animationDelay: '300ms' }}
        aria-hidden="true"
      />
    </div>
  );
}
