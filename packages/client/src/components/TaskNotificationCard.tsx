/**
 * TaskNotificationCard - Renders background task notifications in history view
 * Matches the streaming task_notification segment style from MessageArea.
 */

import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, Bell } from 'lucide-react';

interface TaskNotificationCardProps {
  status: 'completed' | 'failed' | 'stopped';
  summary?: string;
}

export function TaskNotificationCard({ status, summary }: TaskNotificationCardProps) {
  const { t } = useTranslation('chat');

  const isSuccess = status === 'completed';
  const isFailed = status === 'failed';

  return (
    <div className="flex justify-center">
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${
        isSuccess
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
          : isFailed
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
            : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
      }`}>
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
