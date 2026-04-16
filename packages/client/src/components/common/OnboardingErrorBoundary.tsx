import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import i18n from '../../i18n';
import { debugLogger } from '../../utils/debugLogger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Onboarding 페이지 전용 Error Boundary
 * 컴포넌트 에러 발생 시 사용자 친화적 에러 화면 표시
 */
export class OnboardingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    debugLogger.error('Error caught in OnboardingErrorBoundary', { error: error.message, stack: error.stack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-[#1c2129]"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle
              className="w-12 h-12 text-amber-500 mx-auto"
              aria-hidden="true"
            />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {i18n.t('common:error.problemOccurred')}
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              {i18n.t('common:error.loadingError')}
            </p>
            {this.state.error && (
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={i18n.t('common:button.retry')}
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              {i18n.t('common:button.retry')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
