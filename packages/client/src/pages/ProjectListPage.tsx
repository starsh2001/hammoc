/**
 * ProjectListPage - Displays the project list
 * [Source: Story 3.2 - Task 4]
 * [Extended: Story 3.6 - Task 7: New project dialog integration]
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw, FolderOpen, AlertCircle, Settings, Plus, Eye, EyeOff, MoreVertical, Moon, Sun, LogOut } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { generateUUID } from '../utils/uuid';
import { useAuthStore } from '../stores/authStore';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectCardSkeleton } from '../components/ProjectCardSkeleton';
import { SettingsMenu } from '../components/SettingsMenu';
import { NewProjectDialog } from '../components/NewProjectDialog';
import { BrandLogo } from '../components/BrandLogo';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTheme } from '../hooks/useTheme';

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
  const { projects, isLoading, error, fetchProjects, clearError, deleteProject, setupBmad, bmadVersions, fetchBmadVersions, showHidden, hideProject, unhideProject, setShowHidden } = useProjectStore();
  const { logout } = useAuthStore();
  const [showSettings, setShowSettings] = useState(false);
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);

  // Overflow menu state (narrow screens)
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  useClickOutside(overflowMenuRef, () => setOverflowMenuOpen(false));

  // Filter projects based on hidden state (server-based via .bmad-studio/settings.json)
  const visibleProjects = useMemo(
    () => showHidden ? projects : projects.filter((p) => !p.hidden),
    [projects, showHidden]
  );

  const hiddenCount = useMemo(
    () => projects.filter((p) => p.hidden).length,
    [projects]
  );

  // Fetch projects and BMad versions on mount
  useEffect(() => {
    fetchProjects();
    fetchBmadVersions();
  }, [fetchProjects, fetchBmadVersions]);

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

  // Handle BMad setup for existing project
  const handleSetupBmad = useCallback(
    async (projectSlug: string, bmadVersion: string) => {
      await setupBmad(projectSlug, bmadVersion);
    },
    [setupBmad]
  );

  // Handle new project success - navigate to new session
  const handleNewProjectSuccess = useCallback(
    (projectSlug: string, isExisting: boolean, bmadSetupError?: string) => {
      if (isExisting) {
        toast.info('기존 프로젝트로 이동합니다.');
        navigate(`/project/${projectSlug}`);
      } else {
        if (bmadSetupError) {
          // NOTE: type is 'info' not 'error' — project creation itself succeeded (PO v1.1)
          toast.info(`프로젝트가 생성되었지만 BMad 설정에 실패했습니다: ${bmadSetupError}`, {
            duration: 7000,
          });
        } else {
          toast.success('새 프로젝트가 생성되었습니다.');
        }
        const newSessionId = generateUUID();
        navigate(`/project/${projectSlug}/session/${newSessionId}`);
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
          <div className="flex items-center gap-2">
            <ThemeToggleButton className="hidden sm:block" />
            <div className="relative hidden sm:block">
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
            {/* Narrow screen: overflow menu */}
            <div className="relative sm:hidden" ref={overflowMenuRef}>
              <button
                onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                aria-label="메뉴"
                aria-expanded={overflowMenuOpen}
                aria-haspopup="menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {overflowMenuOpen && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                  <button role="menuitem" onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? '라이트 모드' : '다크 모드'}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button role="menuitem" onClick={() => { handleLogout(); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <LogOut className="w-4 h-4" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
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
          {/* New Project Button - wide screen only, leftmost */}
          <button
            onClick={() => setIsNewProjectDialogOpen(true)}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-500 text-gray-900 dark:text-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            새 프로젝트
          </button>

          {/* Wide screen: inline buttons */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`hidden sm:block p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                showHidden
                  ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              aria-label={showHidden ? '숨긴 항목 감추기' : `숨긴 항목 보기 (${hiddenCount})`}
              title={showHidden ? '숨긴 항목 감추기' : `숨긴 항목 보기 (${hiddenCount})`}
            >
              {showHidden ? <Eye className="w-5 h-5" aria-hidden="true" /> : <EyeOff className="w-5 h-5" aria-hidden="true" />}
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            aria-label={isLoading ? '새로고침 중...' : '새로고침'}
          >
            <RefreshCw
              className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
          <ThemeToggleButton className="hidden sm:block" />
          <div className="relative hidden sm:block">
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

          {/* Narrow screen: overflow menu */}
          <div className="relative sm:hidden" ref={overflowMenuRef}>
            <button
              onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
              aria-label="메뉴"
              aria-expanded={overflowMenuOpen}
              aria-haspopup="menu"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {overflowMenuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                <button role="menuitem" onClick={() => { setIsNewProjectDialogOpen(true); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  새 프로젝트
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button role="menuitem" onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {theme === 'dark' ? '라이트 모드' : '다크 모드'}
                </button>
                {hiddenCount > 0 && (
                  <button role="menuitem" onClick={() => { setShowHidden(!showHidden); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {showHidden ? '숨긴 항목 감추기' : `숨긴 항목 보기 (${hiddenCount})`}
                  </button>
                )}
                <button role="menuitem" onClick={() => { handleRefresh(); setOverflowMenuOpen(false); }} disabled={isLoading} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  새로고침
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button role="menuitem" onClick={() => { handleLogout(); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  로그아웃
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4" role="main">
        {/* Loading State */}
        {isLoading && <ProjectListPageSkeleton />}

        {/* Empty State */}
        {!isLoading && visibleProjects.length === 0 && (
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
        {!isLoading && visibleProjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.projectSlug}
                project={project}
                onClick={handleProjectClick}
                onDelete={handleProjectDelete}
                onSetupBmad={handleSetupBmad}
                onHide={hideProject}
                onUnhide={showHidden ? unhideProject : undefined}
                isHidden={!!project.hidden}
                bmadVersions={bmadVersions}
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
