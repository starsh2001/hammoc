/**
 * TaskNotificationCard - Renders background task notifications in history view
 * Matches the streaming task_notification segment style from MessageArea.
 * Clicking scrolls to the associated Agent tool card when toolUseId is present.
 */

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, Bell } from 'lucide-react';

interface TaskNotificationCardProps {
  status: 'completed' | 'failed' | 'stopped';
  summary?: string;
  toolUseId?: string;
}

export function TaskNotificationCard({ status, summary, toolUseId }: TaskNotificationCardProps) {
  const { t } = useTranslation('chat');
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  const isSuccess = status === 'completed';
  const isFailed = status === 'failed';
  const isClickable = !!toolUseId;

  const handleClick = useCallback(() => {
    if (!toolUseId) return;
    const el = document.getElementById(`tool-${toolUseId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Clear previous highlight timer to avoid overlap
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      el.classList.add('ring-2', 'ring-blue-400', 'rounded-lg');
      highlightTimer.current = setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'rounded-lg'), 1500);
    }
  }, [toolUseId]);

  return (
    <div className="flex justify-center">
      <div
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={isClickable ? handleClick : undefined}
        onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } } : undefined}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${
          isSuccess
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
            : isFailed
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
        }${isClickable ? ' cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      >
        {isSuccess ? (
          <CheckCircle className="w-4 h-4" aria-hidden="true" />
        ) : isFailed ? (
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Bell className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{summary ? t('message.taskStatusWithSummary', { status, summary }) : t('message.taskStatus', { status })}</span>
      </div>
    </div>
  );
}
