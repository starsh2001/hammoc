import { Check, X, Circle, Copy, CheckCheck } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { OnboardingChecklistItem } from '../../types/onboarding';
import { debugLogger } from '../../utils/debugLogger';

interface ChecklistItemProps {
  item: OnboardingChecklistItem;
  onCopySuccess?: () => void; // Copy success callback (parent shows toast)
  onCopyError?: () => void; // Copy error callback
}

export function ChecklistItem({
  item,
  onCopySuccess,
  onCopyError,
}: ChecklistItemProps) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (item.command) {
      try {
        // Secure Context check (optional)
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
        // NotAllowedError (HTTP) or other errors
        debugLogger.error('Clipboard write failed', { error: err instanceof Error ? err.message : String(err) });
        onCopyError?.();
      }
    }
  }, [item.command, onCopySuccess, onCopyError]);

  // Render status icon (with aria-label)
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

  // Status text (for screen readers)
  const getStatusText = () => {
    switch (item.status) {
      case 'complete':
        return t('onboarding.statusComplete');
      case 'incomplete':
        return t('onboarding.statusIncomplete');
      case 'optional':
        return t('onboarding.statusOptional');
    }
  };

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-[#253040] bg-white dark:bg-[#263240] transition-all duration-200 hover:shadow-sm"
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
              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#253040] text-gray-500 dark:text-gray-300"
              aria-label={t('onboarding.optionalTagAria')}
            >
              {t('onboarding.optionalTag')}
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
            {item.description}
          </p>
        )}
        {item.status !== 'complete' && item.command && (
          <div className="mt-2 flex items-center gap-2">
            <code
              className="flex-grow px-3 py-2 text-sm rounded bg-gray-100 dark:bg-[#1c2129] text-gray-800 dark:text-gray-200 font-mono"
              aria-label={t('onboarding.commandAria', { command: item.command })}
            >
              {item.command}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#263240]"
              aria-label={copied ? t('onboarding.copied') : t('onboarding.copyCommand')}
              title={copied ? t('onboarding.copied') : t('onboarding.copy')}
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
