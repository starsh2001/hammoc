/**
 * ProjectOverviewPage - Project overview view
 */

import { useParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Clock,
  Zap,
  Plus,
  ArrowRight,
  ListOrdered,
  FolderOpen,
  MessageCircle,
} from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { BackgroundRefreshIndicator } from '../components/BackgroundRefreshIndicator';
import { useEffect, type ReactNode } from 'react';
import { formatRelativeTime } from '../utils/formatters';
import { generateUUID } from '../utils/uuid';

interface ProjectOverviewPageProps {
  /** Optional slot to replace the default "Quick Start" card with custom content (e.g. BMad recommendations) */
  quickActionsSlot?: ReactNode;
}

export function ProjectOverviewPage({ quickActionsSlot }: ProjectOverviewPageProps = {}) {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const { sessions, fetchSessions, isLoading, isRefreshing } = useSessionStore();

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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 rounded-xl border border-blue-200/60 dark:border-blue-800/40 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-200/30 dark:bg-blue-700/10 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative flex items-center gap-3">
            <div className="p-2.5 bg-blue-500 dark:bg-blue-500 rounded-xl shadow-sm">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{sessions.length}</p>
              <p className="text-sm text-blue-700/70 dark:text-blue-300/70">총 세션</p>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-50 to-purple-100/50 dark:from-violet-950/40 dark:to-purple-900/20 rounded-xl border border-violet-200/60 dark:border-violet-800/40 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-violet-200/30 dark:bg-violet-700/10 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative flex items-center gap-3">
            <div className="p-2.5 bg-violet-500 dark:bg-violet-500 rounded-xl shadow-sm">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalMessages}</p>
              <p className="text-sm text-violet-700/70 dark:text-violet-300/70">총 메시지</p>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-950/40 dark:to-green-900/20 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-200/30 dark:bg-emerald-700/10 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500 dark:bg-emerald-500 rounded-xl shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeSessions}</p>
              <p className="text-sm text-emerald-700/70 dark:text-emerald-300/70">활성 세션</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions + Recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent sessions */}
        <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-white">최근 세션</h2>
              <BackgroundRefreshIndicator isRefreshing={isRefreshing} />
            </div>
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
            <div className="py-12 px-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700/50 mb-4">
                <MessageCircle className="w-7 h-7 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">아직 세션이 없습니다</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">새 세션을 시작하여 AI와 대화를 나눠보세요</p>
              <button
                onClick={handleNewSession}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                첫 세션 시작하기
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentSessions.map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => navigate(`/project/${projectSlug}/session/${session.sessionId}`)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors text-left"
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

        {/* Quick actions — replaced by slot when provided (e.g. BMad recommendations) */}
        <div className="space-y-4">
          {quickActionsSlot ?? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
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
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100/80 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  <ListOrdered className="w-4 h-4" />
                  큐 작업 실행
                </button>
                <button
                  onClick={() => navigate(`/project/${projectSlug}/files`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100/80 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  <FolderOpen className="w-4 h-4" />
                  파일 탐색
                </button>
              </div>
            </div>
          )}

          {/* Active streaming banner */}
          {activeSessions > 0 && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 rounded-xl border border-green-200/60 dark:border-green-800/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                  {activeSessions}개 세션 활성
                </span>
              </div>
              <p className="text-xs text-green-700/70 dark:text-green-300/60">
                현재 AI가 응답을 생성하고 있습니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
