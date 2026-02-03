/**
 * StreamingIndicator - Visual indicator for active streaming
 * [Source: Story 4.5 - Task 5]
 *
 * Features:
 * - Animated pulsing dots
 * - Screen reader accessible
 * - Dark/light mode support
 */

interface StreamingIndicatorProps {
  /** Whether the indicator is visible */
  visible?: boolean;
}

export function StreamingIndicator({ visible = true }: StreamingIndicatorProps) {
  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-1 text-gray-500 dark:text-gray-400"
      aria-live="polite"
      aria-label="Claude가 응답을 생성하고 있습니다"
    >
      <span className="sr-only">Claude is thinking...</span>
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
