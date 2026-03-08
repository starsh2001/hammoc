/**
 * LoadingSpinner - Shared loading indicator component
 * [Source: Story 2.2 - Task 7]
 */

import { useTranslation } from 'react-i18next';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const { t } = useTranslation('common');
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 ${sizeClasses[size]} ${className ?? ''}`}
      role="status"
      aria-label={t('loading')}
    />
  );
}
