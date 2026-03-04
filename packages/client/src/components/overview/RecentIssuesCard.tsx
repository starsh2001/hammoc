/**
 * RecentIssuesCard - Shows recently registered issues on the overview page
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useBoardStore } from '../../stores/boardStore';
import { STATUS_BADGE_COLOR, STATUS_LABEL } from '../board/constants';

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

export function RecentIssuesCard() {
  const { t } = useTranslation('common');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const { items, fetchBoard } = useBoardStore();

  useEffect(() => {
    if (projectSlug) {
      fetchBoard(projectSlug);
    }
  }, [projectSlug, fetchBoard]);

  // Show only issues, most recent first (reverse order since newer items are appended)
  const recentIssues = items
    .filter((item) => item.type === 'issue')
    .slice(-5)
    .reverse();

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('overview.recentIssues')}</h2>
        <button
          onClick={() => navigate(`/project/${projectSlug}/board`)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          {t('overview.viewBoard')}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {recentIssues.length === 0 ? (
        <div className="py-8 px-5 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/50 mb-3">
            <AlertCircle className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">{t('overview.noIssues')}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {recentIssues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => navigate(`/project/${projectSlug}/board`)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors text-left"
            >
              {issue.severity && (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[issue.severity] ?? SEVERITY_DOT.low}`} />
              )}
              <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                {issue.title}
              </span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE_COLOR[issue.status]}`}>
                {STATUS_LABEL[issue.status]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
