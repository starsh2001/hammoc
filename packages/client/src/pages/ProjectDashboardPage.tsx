/**
 * ProjectDashboardPage - Project dashboard view (placeholder)
 */

import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, ListOrdered, Plus, ArrowRight } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useEffect } from 'react';
import { formatRelativeTime } from '../utils/formatters';
import { generateUUID } from '../utils/uuid';

export function ProjectDashboardPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const { sessions, fetchSessions, isLoading } = useSessionStore();

  useEffect(() => {
    if (projectSlug) {
      fetchSessions(projectSlug);
    }
  }, [projectSlug, fetchSessions]);

  const recentSessions = sessions.slice(0, 5);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
  const activeSessions = sessions.filter((s) => s.isStreaming).length;

  const handleNewSession = () => {
    const newSessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${newSessionId}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{sessions.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">총 세션</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalMessages}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">총 메시지</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <ListOrdered className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeSessions}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">활성 세션</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions + Recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent sessions */}
        <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">최근 세션</h2>
            <button
              onClick={() => navigate(`/project/${projectSlug}/sessions`)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              모두 보기
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p>아직 세션이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentSessions.map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => navigate(`/project/${projectSlug}/session/${session.sessionId}`)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      {session.isStreaming && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                      {session.name && (
                        <span className="text-[11px] font-medium px-1.5 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {session.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {session.firstPrompt || '(빈 세션)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    <span>{session.messageCount}개</span>
                    <span>{formatRelativeTime(session.modified)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">빠른 시작</h2>
            <div className="space-y-2">
              <button
                onClick={handleNewSession}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                새 세션 시작
              </button>
              <button
                onClick={() => navigate(`/project/${projectSlug}/queue`)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                <ListOrdered className="w-4 h-4" />
                큐 작업 실행
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
