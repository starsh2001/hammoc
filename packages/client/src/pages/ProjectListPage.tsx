/**
 * ProjectListPage - Displays the project list
 * [Source: Story 3.2 - Task 4]
 * [Extended: Story 3.6 - Task 7: New project dialog integration]
 */

import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FolderOpen, AlertCircle, Settings, Plus } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useAuthStore } from '../stores/authStore';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectCardSkeleton } from '../components/ProjectCardSkeleton';
import { SettingsMenu } from '../components/SettingsMenu';
import { NewProjectDialog } from '../components/NewProjectDialog';
import { BrandLogo } from '../components/BrandLogo';

function ProjectListPageSkeleton() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-label="로딩 중"
      role="status"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const { projects, isLoading, error, fetchProjects, clearError, deleteProject } = useProjectStore();
  const { logout } = useAuthStore();
  const [showSettings, setShowSettings] = useState(false);
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  // Handle project card click
  const handleProjectClick = useCallback(
    (projectSlug: string) => {
      navigate(`/project/${projectSlug}`);
    },
    [navigate]
  );

  // Handle refresh (force reload from server)
  const handleRefresh = useCallback(async () => {
    await fetchProjects();
  }, [fetchProjects]);

  // Handle retry after error (force reload from server)
  const handleRetry = useCallback(() => {
    clearError();
    fetchProjects();
  }, [clearError, fetchProjects]);

  // Handle project delete
  const handleProjectDelete = useCallback(
    async (projectSlug: string, deleteFiles?: boolean) => {
      await deleteProject(projectSlug, deleteFiles);
    },
    [deleteProject]
  );

  // Handle new project success - navigate to new session
  const handleNewProjectSuccess = useCallback(
    (projectSlug: string, isExisting: boolean) => {
      if (isExisting) {
        // Navigate to existing project's session list
        navigate(`/project/${projectSlug}`);
      } else {
        // Navigate to new session in the newly created project
        navigate(`/project/${projectSlug}/session/new`);
      }
    },
    [navigate]
  );

  // Error state
  if (error) {
    return (
      <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <BrandLogo />
          <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">프로젝트</h1>
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              aria-label="설정 메뉴"
              aria-expanded={showSettings}
              aria-haspopup="menu"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </button>
            <SettingsMenu
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              onLogout={handleLogout}
            />
          </div>
        </header>

        {/* Error Content */}
        <main className="flex-grow flex flex-col items-center justify-center p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            오류가 발생했습니다
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-center">
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            다시 시도
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
        <BrandLogo />
        <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">프로젝트</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {/* New Project Button */}
          <button
            onClick={() => setIsNewProjectDialogOpen(true)}
            className="p-2 rounded-lg bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-500 text-gray-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            aria-label="새 프로젝트"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            aria-label={isLoading ? '새로고침 중...' : '새로고침'}
          >
            <RefreshCw
              className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              aria-label="설정 메뉴"
              aria-expanded={showSettings}
              aria-haspopup="menu"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </button>
            <SettingsMenu
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4" role="main">
        {/* Loading State */}
        {isLoading && <ProjectListPageSkeleton />}

        {/* Empty State */}
        {!isLoading && projects.length === 0 && (
          <div className="text-center py-12">
            <FolderOpen
              className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4"
              aria-hidden="true"
            />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              프로젝트가 없습니다
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Claude Code로 프로젝트를 시작하면 여기에 표시됩니다.
            </p>
            <button
              onClick={() => setIsNewProjectDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-600 text-gray-900 dark:text-white rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              새 프로젝트 만들기
            </button>
          </div>
        )}

        {/* Project Grid */}
        {!isLoading && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.projectSlug}
                project={project}
                onClick={handleProjectClick}
                onDelete={handleProjectDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* New Project Dialog */}
      <NewProjectDialog
        isOpen={isNewProjectDialogOpen}
        onClose={() => setIsNewProjectDialogOpen(false)}
        onSuccess={handleNewProjectSuccess}
      />
    </div>
  );
}
