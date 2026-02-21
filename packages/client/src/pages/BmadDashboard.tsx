/**
 * BmadDashboard - BMad project dashboard page
 * Renders BMad dashboard for BMad projects, falls back to ProjectDashboardPage for non-BMad.
 * [Source: Story 12.2 - Task 3]
 */

import { useParams, useNavigate } from 'react-router-dom';
import { FileText, BarChart3, Zap, Plus, ArrowRight, AlertTriangle } from 'lucide-react';
import type { BmadStatusResponse } from '@bmad-studio/shared';

import { useProjectStore } from '../stores/projectStore.js';
import { useBmadStatus } from '../hooks/useBmadStatus.js';

import { ProjectDashboardPage } from './ProjectDashboardPage.js';

import { generateUUID } from '../utils/uuid.js';

function DashboardSkeleton({ projectName }: { projectName: string }) {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{projectName}</h1>
        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
          BMad
        </span>
        <div className="h-4 w-48 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4"
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
    </div>
  );
}

function DashboardContent({
  data,
  projectSlug,
  projectName,
}: {
  data: BmadStatusResponse;
  projectSlug: string;
  projectName: string;
}) {
  const navigate = useNavigate();

  const totalStories = data.epics.reduce((sum, e) => sum + e.stories.length, 0);
  const doneStories = data.epics.reduce(
    (sum, e) => sum + e.stories.filter((s) => s.status === 'Done').length,
    0,
  );

  const handleNewSession = () => {
    navigate(`/project/${projectSlug}/session/${generateUUID()}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Summary header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{projectName}</h1>
        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
          BMad
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          에픽 {data.epics.length}개 · 스토리 {doneStories}/{totalStories} Done
        </span>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document status card */}
        <div
          role="region"
          aria-label="문서 현황"
          className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">문서 현황</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={data.documents.prd.exists ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {data.documents.prd.exists ? '\u2713' : '\u2717'}
              </span>
              <span className="text-gray-700 dark:text-gray-300">PRD</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={data.documents.architecture.exists ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {data.documents.architecture.exists ? '\u2713' : '\u2717'}
              </span>
              <span className="text-gray-700 dark:text-gray-300">Architecture</span>
            </div>
            {data.auxiliaryDocuments.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">
                  보조 문서 {data.auxiliaryDocuments.reduce((sum, d) => sum + d.fileCount, 0)}개
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Epic progress card */}
        <div
          role="region"
          aria-label="에픽 진행률"
          className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">에픽 진행률</h2>
          </div>
          <div className="space-y-2 text-sm">
            {data.epics.map((epic) => {
              const epicDone = epic.stories.filter((s) => s.status === 'Done').length;
              return (
                <div key={epic.number} className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300 truncate mr-2">
                    {epic.number}. {epic.name}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {epicDone}/{epic.stories.length}
                  </span>
                </div>
              );
            })}
            {data.epics.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">에픽이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Quick actions card */}
        <div
          role="region"
          aria-label="빠른 시작"
          className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">빠른 시작</h2>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleNewSession}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              새 세션 시작
            </button>
            <button
              onClick={() => navigate(`/project/${projectSlug}/sessions`)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              <ArrowRight className="w-4 h-4" />
              세션 목록
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BmadDashboard() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { projects } = useProjectStore();
  const project = projects.find((p) => p.projectSlug === projectSlug);
  const isBmadProject = project?.isBmadProject ?? false;
  const projectName = project?.originalPath.split(/[/\\]/).pop() ?? projectSlug ?? '';

  const { data, isLoading, error, retry } = useBmadStatus(
    isBmadProject ? projectSlug : undefined,
  );

  if (!isBmadProject) {
    return <ProjectDashboardPage />;
  }

  if (isLoading) {
    return <DashboardSkeleton projectName={projectName} />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6"
        >
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h2 className="font-semibold text-red-800 dark:text-red-200">오류 발생</h2>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
          <button
            onClick={retry}
            aria-label="다시 시도"
            className="px-4 py-2 bg-red-100 dark:bg-red-800/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors text-sm font-medium"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!data || !projectSlug) {
    return null;
  }

  return (
    <DashboardContent
      data={data}
      projectSlug={projectSlug}
      projectName={projectName}
    />
  );
}
