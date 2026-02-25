import { Check, X, Circle, Copy, CheckCheck } from 'lucide-react';
import { useState, useCallback } from 'react';
import { OnboardingChecklistItem } from '../../types/onboarding';
import { debugLogger } from '../../utils/debugLogger';

interface ChecklistItemProps {
  item: OnboardingChecklistItem;
  onCopySuccess?: () => void; // 복사 성공 콜백 (부모에서 토스트 표시)
  onCopyError?: () => void; // 복사 실패 콜백
}

export function ChecklistItem({
  item,
  onCopySuccess,
  onCopyError,
}: ChecklistItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (item.command) {
      try {
        // Secure Context 확인 (선택적)
        if (!window.isSecureContext) {
          debugLogger.warn('Clipboard API requires secure context (HTTPS)');
          onCopyError?.();
          return;
        }
        await navigator.clipboard.writeText(item.command);
        setCopied(true);
        onCopySuccess?.();
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        // NotAllowedError (HTTP) 또는 기타 에러
        debugLogger.error('Clipboard write failed', { error: err instanceof Error ? err.message : String(err) });
        onCopyError?.();
      }
    }
  }, [item.command, onCopySuccess, onCopyError]);

  // 상태 아이콘 렌더링 (aria-label 포함)
  const renderStatusIcon = () => {
    switch (item.status) {
      case 'complete':
        return <Check className="w-5 h-5 text-green-500" aria-hidden="true" />;
      case 'incomplete':
        return <X className="w-5 h-5 text-red-500" aria-hidden="true" />;
      case 'optional':
        return <Circle className="w-5 h-5 text-gray-400" aria-hidden="true" />;
    }
  };

  // 상태 텍스트 (스크린 리더용)
  const getStatusText = () => {
    switch (item.status) {
      case 'complete':
        return '완료됨';
      case 'incomplete':
        return '미완료';
      case 'optional':
        return '선택 사항';
    }
  };

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-200 hover:shadow-sm"
      role="listitem"
      aria-label={`${item.label}: ${getStatusText()}`}
    >
      <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
        {renderStatusIcon()}
      </div>
      <div className="flex-grow">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">
            {item.label}
          </span>
          <span className="sr-only">{getStatusText()}</span>
          {item.isOptional && (
            <span
              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="선택 항목"
            >
              선택
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {item.description}
          </p>
        )}
        {item.status !== 'complete' && item.command && (
          <div className="mt-2 flex items-center gap-2">
            <code
              className="flex-grow px-3 py-2 text-sm rounded bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-mono"
              aria-label={`명령어: ${item.command}`}
            >
              {item.command}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              aria-label={copied ? '복사됨' : '명령어 복사'}
              title={copied ? '복사됨' : '복사'}
            >
              {copied ? (
                <CheckCheck
                  className="w-4 h-4 text-green-500"
                  aria-hidden="true"
                />
              ) : (
                <Copy className="w-4 h-4 text-gray-500" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
