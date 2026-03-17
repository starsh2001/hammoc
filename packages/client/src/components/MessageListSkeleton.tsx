/**
 * MessageListSkeleton - Loading skeleton for message list
 * [Source: Story 3.5 - Task 6]
 */

import { useTranslation } from 'react-i18next';

interface MessageListSkeletonProps {
  /** Number of skeleton messages to display (default: 5) */
  count?: number;
}

export function MessageListSkeleton({ count = 5 }: MessageListSkeletonProps) {
  const { t } = useTranslation('chat');
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-label={t('messageListSkeleton.ariaLabel')}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonMessage key={index} isUser={index % 2 === 0} />
      ))}
      <span className="sr-only">{t('messageListSkeleton.srText')}</span>
    </div>
  );
}

function SkeletonMessage({ isUser }: { isUser: boolean }) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] md:max-w-[80%] p-3 shadow-sm ${
          isUser
            ? 'bg-blue-100 dark:bg-blue-600/40 rounded-l-lg rounded-tr-lg'
            : 'bg-gray-50 dark:bg-[#263240] rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-[#253040]'
        }`}
      >
        {/* Bot icon + name for assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded" />
            <div className="w-12 h-3 bg-gray-300 dark:bg-gray-600 rounded" />
          </div>
        )}
        {/* Content lines */}
        <div className="space-y-2">
          <div
            className={`h-4 rounded ${
              isUser ? 'bg-blue-200 dark:bg-blue-500/30' : 'bg-gray-200 dark:bg-[#253040]'
            }`}
            style={{ width: '85%' }}
          />
          <div
            className={`h-4 rounded ${
              isUser ? 'bg-blue-200 dark:bg-blue-500/30' : 'bg-gray-200 dark:bg-[#253040]'
            }`}
            style={{ width: '60%' }}
          />
        </div>
        {/* Timestamp */}
        <div
          className={`mt-2 h-3 w-16 rounded ${
            isUser ? 'bg-blue-200 dark:bg-blue-500/30' : 'bg-gray-200 dark:bg-[#253040]'
          }`}
        />
      </div>
    </div>
  );
}
