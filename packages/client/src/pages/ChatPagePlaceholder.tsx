/**
 * ChatPagePlaceholder - Placeholder component for chat page
 * [Source: Story 3.4 - Task 5]
 *
 * Note: This placeholder will be replaced with actual ChatPage in:
 * - Story 3.5: Session History Loading
 * - Story 4.x: Core Chat Interface
 */

import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';

export function ChatPagePlaceholder() {
  const { t } = useTranslation('common');
  const { projectSlug, sessionId } = useParams<{
    projectSlug: string;
    sessionId?: string;
  }>();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(`/project/${projectSlug}`);
  };

  const isNewSession = sessionId === 'new';

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            aria-label={t('chatPlaceholder.backToSessions')}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="ml-2 text-lg font-semibold">
            {isNewSession ? t('chatPlaceholder.newSession') : t('chatPlaceholder.chat')}
          </h1>
        </div>
      </header>

      {/* Placeholder Content */}
      <div className="flex flex-col items-center justify-center p-8 mt-20">
        <MessageSquare className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
          {t('chatPlaceholder.preparingPage')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center">
          {t('chatPlaceholder.futureStory')}
          <br />
          {isNewSession
            ? 'Story 4.x: Core Chat Interface'
            : 'Story 3.5: Session History Loading'}
        </p>
      </div>
    </div>
  );
}
