/**
 * StreamingErrorBoundary - Error boundary for streaming components
 * [Source: Story 4.5 - Task 16]
 *
 * Features:
 * - Captures errors in streaming components
 * - Displays fallback UI with retry option
 * - Dark/light mode support
 * - Logs errors to console
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import i18n from '../i18n';
import { debugLogger } from '../utils/debugLogger';

interface StreamingErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Custom fallback UI */
  fallback?: ReactNode;
  /** Callback when retry is clicked */
  onRetry?: () => void;
}

interface StreamingErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class StreamingErrorBoundary extends Component<
  StreamingErrorBoundaryProps,
  StreamingErrorBoundaryState
> {
  state: StreamingErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): StreamingErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    debugLogger.error('Error caught in StreamingErrorBoundary', { error: error.message, stack: error.stack });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <div className="text-red-500 dark:text-red-400">
            {i18n.t('common:error.streamingError')}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 text-sm bg-gray-100 dark:bg-[#253040] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-[#2d3a4a] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {i18n.t('common:button.retry')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
