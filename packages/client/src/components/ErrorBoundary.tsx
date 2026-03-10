/**
 * ErrorBoundary - Catches unhandled React errors and shows a recovery UI
 * Prevents the entire app from becoming a white screen on runtime errors.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import i18n from '../i18n';
import { debugLogger } from '../utils/debugLogger';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    debugLogger.error('Uncaught error in ErrorBoundary', { error: error.message, stack: error.stack });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1c2129] p-4">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {i18n.t('common:error.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-300 mb-6">
            {i18n.t('common:error.unexpectedDescription')}
          </p>
          {this.state.error && (
            <details className="mb-6 text-left">
              <summary className="text-xs text-gray-400 dark:text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                {i18n.t('common:error.details')}
              </summary>
              <pre className="mt-2 p-3 bg-gray-100 dark:bg-[#263240] rounded-lg text-xs text-red-600 dark:text-red-400 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-[#2d3a4a]
                         text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#263240] transition-colors"
            >
              {i18n.t('common:button.retry')}
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white
                         hover:bg-blue-700 transition-colors"
            >
              {i18n.t('common:error.reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
