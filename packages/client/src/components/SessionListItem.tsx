/**
 * SessionListItem - Session list item component
 * [Source: Story 3.4 - Task 3]
 */

import { MessageSquare } from 'lucide-react';
import type { SessionListItem as SessionListItemType } from '@bmad-studio/shared';
import { formatRelativeTime } from '../utils/formatters';

interface SessionListItemProps {
  session: SessionListItemType;
  onClick: (sessionId: string) => void;
}

export function SessionListItem({ session, onClick }: SessionListItemProps) {
  const handleClick = () => {
    onClick(session.sessionId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      aria-label={`세션: ${session.firstPrompt || '새 세션'}. 메시지 ${session.messageCount}개. ${formatRelativeTime(session.modified)}`}
    >
      {/* First Prompt Preview */}
      <p className="text-gray-900 dark:text-white font-medium truncate mb-2">
        {session.firstPrompt || '새 세션'}
      </p>

      {/* Meta Info */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          <span>{session.messageCount}개 메시지</span>
        </div>
        <span>{formatRelativeTime(session.modified)}</span>
      </div>
    </button>
  );
}
