/**
 * BmadOverview - BMad project overview page
 * Renders BMad cards on top of ProjectOverviewPage for BMad projects,
 * falls back to ProjectOverviewPage alone for non-BMad.
 * [Source: Story 12.2 - Task 3]
 */

import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Layers, BookOpen } from 'lucide-react';
import type { BmadStatusResponse, BmadEpicStatus } from '@hammoc/shared';

import { useProjectStore } from '../stores/projectStore.js';
import { useBmadStatus } from '../hooks/useBmadStatus.js';
import { BackgroundRefreshIndicator } from '../components/BackgroundRefreshIndicator.js';

import { ProjectOverviewPage } from './ProjectOverviewPage.js';
import { DocumentStatusCard } from '../components/overview/DocumentStatusCard.js';
import { EpicProgressCard } from '../components/overview/EpicProgressCard.js';
import { NextStepRecommender } from '../components/overview/NextStepRecommender.js';
import { RecentIssuesCard } from '../components/overview/RecentIssuesCard.js';

function BmadSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4"
        >
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function computeStats(epics: BmadEpicStatus[]) {
  const totalEpics = epics.length;
  const totalStories = epics.reduce((s, e) => s + (e.plannedStories ?? e.stories.length), 0);
  const doneStories = epics.reduce((s, e) => s + e.stories.filter((st) => st.status === 'Done').length, 0);
  const doneEpics = epics.filter((e) => {
    const planned = e.plannedStories ?? e.stories.length;
    return planned > 0 && e.stories.filter((st) => st.status === 'Done').length >= planned;
  }).length;
  const pct = totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;
  return { totalEpics, doneEpics, totalStories, doneStories, pct };
}

function BmadSummaryCard({ epics, isRefreshing }: { epics: BmadEpicStatus[]; isRefreshing: boolean }) {
  const { t } = useTranslation('common');
  const { totalEpics, doneEpics, totalStories, doneStories, pct } = computeStats(epics);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200 dark:border-blue-800/50 p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: BMad badge + progress */}
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-sm font-semibold px-3 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded-md">
            {t('overview.bmadLabel')}
          </span>
          <BackgroundRefreshIndicator isRefreshing={isRefreshing} />
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{pct}%</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">{t('overview.completedStatus')}</span>
          </div>
        </div>

        {/* Right: Stats */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-white">{doneEpics}/{totalEpics}</span> {t('overview.epicsLabel')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-white">{doneStories}/{totalStories}</span> {t('overview.storiesLabel')}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BmadSection({
  data,
  isLoading,
  isRefreshing,
  error,
  retry,
  projectSlug,
}: {
  data: BmadStatusResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  retry: () => void;
  projectSlug: string;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="px-6 pt-6 space-y-4">
      {/* Loading: show badge + skeleton */}
      {isLoading && (
        <>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200 dark:border-blue-800/50 p-5">
            <span className="text-sm font-semibold px-3 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded-md">
              {t('overview.bmadLabel')}
            </span>
          </div>
          <BmadSkeleton />
        </>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-medium text-red-800 dark:text-red-200">{t('overview.bmadLoadFailed')}</span>
          </div>
          <p className="text-xs text-red-700 dark:text-red-300 mb-2">{error}</p>
          <button
            onClick={retry}
            className="text-xs px-3 py-1 bg-red-100 dark:bg-red-800/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
          >
            {t('button.retry')}
          </button>
        </div>
      )}

      {/* BMad summary + next steps + detail cards */}
      {data && (
        <>
          <BmadSummaryCard epics={data.epics} isRefreshing={isRefreshing} />
          <NextStepRecommender data={data} projectSlug={projectSlug} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DocumentStatusCard
              documents={data.documents}
              auxiliaryDocuments={data.auxiliaryDocuments}
              projectSlug={projectSlug}
            />
            <EpicProgressCard
              epics={data.epics}
              projectSlug={projectSlug}
              storyBasePath={data.config.devStoryLocation}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function BmadOverview() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { projects } = useProjectStore();
  const project = projects.find((p) => p.projectSlug === projectSlug);
  const isBmadProject = project?.isBmadProject ?? false;

  const { data, isLoading, isRefreshing, error, retry } = useBmadStatus(
    isBmadProject ? projectSlug : undefined,
  );

  // For BMad projects, replace the quick-actions slot with recent issues
  const quickActionsSlot = isBmadProject ? <RecentIssuesCard /> : undefined;

  return (
    <>
      {isBmadProject && projectSlug && (
        <>
          <BmadSection
            data={data}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            error={error}
            retry={retry}
            projectSlug={projectSlug}
          />
          {/* Visual separator between BMad and general sections */}
          <div className="mx-6 border-t border-gray-200 dark:border-gray-700" />
        </>
      )}
      <ProjectOverviewPage quickActionsSlot={quickActionsSlot} />
    </>
  );
}
