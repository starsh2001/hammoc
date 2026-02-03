/**
 * ErrorState - Reusable error state component with different error types
 * [Source: Story 3.4 - Task 4]
 */

import { AlertCircle, WifiOff, ServerCrash, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  errorType: 'not_found' | 'network' | 'server' | 'unknown';
  onRetry?: () => void;
  onNavigateBack?: () => void;
}

const errorConfig = {
  not_found: {
    icon: AlertCircle,
    iconColor: 'text-red-500',
    title: '프로젝트를 찾을 수 없습니다',
    message: '요청하신 프로젝트가 존재하지 않거나 삭제되었습니다.',
    showRetry: false,
    showBack: true,
  },
  network: {
    icon: WifiOff,
    iconColor: 'text-orange-500',
    title: '네트워크 연결 오류',
    message: '인터넷 연결을 확인하고 다시 시도해주세요.',
    showRetry: true,
    showBack: false,
  },
  server: {
    icon: ServerCrash,
    iconColor: 'text-red-500',
    title: '서버 오류',
    message: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    showRetry: true,
    showBack: false,
  },
  unknown: {
    icon: AlertCircle,
    iconColor: 'text-yellow-500',
    title: '오류가 발생했습니다',
    message: '세션 목록을 불러오는 중 문제가 발생했습니다.',
    showRetry: true,
    showBack: false,
  },
};

export function ErrorState({ errorType, onRetry, onNavigateBack }: ErrorStateProps) {
  const config = errorConfig[errorType];
  const Icon = config.icon;

  return (
    <div className="text-center py-12" role="alert">
      <Icon className={`w-16 h-16 mx-auto ${config.iconColor} mb-4`} aria-hidden="true" />
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
        {config.title}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        {config.message}
      </p>
      <div className="flex justify-center gap-3">
        {config.showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            다시 시도
          </button>
        )}
        {config.showBack && onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            프로젝트 목록으로 돌아가기
          </button>
        )}
      </div>
    </div>
  );
}
