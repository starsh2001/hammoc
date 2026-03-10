/**
 * ErrorState - Reusable error state component with different error types
 * [Source: Story 3.4 - Task 4]
 */

import { AlertCircle, WifiOff, ServerCrash, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
  errorType: 'not_found' | 'network' | 'server' | 'unknown';
  onRetry?: () => void;
  onNavigateBack?: () => void;
}

export function ErrorState({ errorType, onRetry, onNavigateBack }: ErrorStateProps) {
  const { t } = useTranslation('common');

  const errorConfig = {
    not_found: {
      icon: AlertCircle,
      iconColor: 'text-red-500',
      title: t('error.notFound.title'),
      message: t('error.notFound.message'),
      showRetry: false,
      showBack: true,
    },
    network: {
      icon: WifiOff,
      iconColor: 'text-orange-500',
      title: t('error.network.title'),
      message: t('error.network.message'),
      showRetry: true,
      showBack: false,
    },
    server: {
      icon: ServerCrash,
      iconColor: 'text-red-500',
      title: t('error.server.title'),
      message: t('error.server.message'),
      showRetry: true,
      showBack: false,
    },
    unknown: {
      icon: AlertCircle,
      iconColor: 'text-yellow-500',
      title: t('error.unknown.title'),
      message: t('error.unknown.message'),
      showRetry: true,
      showBack: false,
    },
  };

  const config = errorConfig[errorType];
  const Icon = config.icon;

  return (
    <div className="text-center py-12" role="alert">
      <Icon className={`w-16 h-16 mx-auto ${config.iconColor} mb-4`} aria-hidden="true" />
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
        {config.title}
      </h3>
      <p className="text-gray-500 dark:text-gray-300 mb-4">
        {config.message}
      </p>
      <div className="flex justify-center gap-3">
        {config.showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#1c2129]"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            {t('button.retry')}
          </button>
        )}
        {config.showBack && onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#1c2129]"
          >
            {t('error.goBackToProjects')}
          </button>
        )}
      </div>
    </div>
  );
}
