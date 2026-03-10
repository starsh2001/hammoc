/**
 * ProjectListPage - Displays the project list
 * [Source: Story 3.2 - Task 4]
 * [Extended: Story 3.6 - Task 7: New project dialog integration]
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RefreshCw, FolderOpen, AlertCircle, Settings, Plus, Eye, EyeOff, MoreVertical, Moon, Sun } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { BackgroundRefreshIndicator } from '../components/BackgroundRefreshIndicator';
import { generateUUID } from '../utils/uuid';
import { useAuthStore } from '../stores/authStore';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectCardSkeleton } from '../components/ProjectCardSkeleton';
import { DashboardSummaryBar } from '../components/projectStatus/DashboardSummaryBar';
import { NewProjectDialog } from '../components/NewProjectDialog';
import { BrandLogo } from '../components/BrandLogo';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { LayoutToggleButton } from '../components/LayoutToggleButton';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTheme } from '../hooks/useTheme';
import { useDashboard } from '../hooks/useDashboard';
import { api } from '../services/api/client';

function ProjectListPageSkeleton() {
  const { t } = useTranslation('common');
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      aria-label={t('loading')}
      role="status"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ProjectListPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { projects, isLoading, isRefreshing, error, fetchProjects, clearError, deleteProject, setupBmad, bmadVersions, fetchBmadVersions, showHidden, hideProject, unhideProject, setShowHidden } = useProjectStore();
  const { logout } = useAuthStore();
  const { totals, getProjectStatus } = useDashboard();
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [serverVersion, setServerVersion] = useState('');
  const [serverHostname, setServerHostname] = useState('');
  const [serverAddress, setServerAddress] = useState('');

  // Overflow menu state (narrow screens)
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  useClickOutside(overflowMenuRef, () => setOverflowMenuOpen(false));

  // Filter projects based on hidden state (server-based via .hammoc/settings.json)
  const visibleProjects = useMemo(
    () => showHidden ? projects : projects.filter((p) => !p.hidden),
    [projects, showHidden]
  );

  const hiddenCount = useMemo(
    () => projects.filter((p) => p.hidden).length,
    [projects]
  );

  // Fetch server info (version, hostname, IP/port)
  useEffect(() => {
    api.get<{ version: string; hostname: string; localIP: string | null; port: number }>('/server/info')
      .then((data) => {
        setServerVersion(data.version);
        setServerHostname(data.hostname);
        const ip = data.localIP || 'localhost';
        setServerAddress(`${ip}:${data.port}`);
      })
      .catch(() => { /* ignore */ });
  }, []);

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
      const result = await setupBmad(projectSlug, bmadVersion);
      if (result.success) {
        toast.success(t('project.bmadSetupSuccess'));
      } else {
        toast.error(result.error || t('project.bmadSetupFailed'));
      }
    },
    [setupBmad]
  );

  // Handle new project success - navigate to new session
  const handleNewProjectSuccess = useCallback(
    (projectSlug: string, isExisting: boolean, bmadSetupError?: string) => {
      if (isExisting) {
        toast.info(t('project.navigateToExisting'));
        navigate(`/project/${projectSlug}`);
      } else {
        if (bmadSetupError) {
          // NOTE: type is 'info' not 'error' — project creation itself succeeded (PO v1.1)
          toast.info(t('project.createdButBmadFailed', { error: bmadSetupError }), {
            duration: 7000,
          });
        } else {
          toast.success(t('project.newProjectCreated'));
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
      <div className="h-dvh flex flex-col bg-white dark:bg-gray-900 transition-colors duration-200">
        {/* Header */}
        <header className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="content-container flex items-center justify-between px-4 py-3 min-h-16">
            <div className="flex items-center min-w-0 flex-1">
              <BrandLogo />
              <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-3" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">{t('project.title')}</h1>
            </div>
            <div className="flex items-center gap-1 ml-4">
              <LayoutToggleButton className="hidden sm:block" />
              <ThemeToggleButton className="hidden sm:block" />
              <button
                onClick={() => navigate('/settings')}
                aria-label={t('project.settings')}
                className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                <Settings className="w-5 h-5" aria-hidden="true" />
              </button>
              {/* Narrow screen: overflow menu */}
              <div className="relative sm:hidden" ref={overflowMenuRef}>
                <button
                  onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                  aria-label={t('project.menuLabel')}
                  aria-expanded={overflowMenuOpen}
                  aria-haspopup="menu"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                {overflowMenuOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                    <button role="menuitem" onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      {theme === 'dark' ? t('project.lightMode') : t('project.darkMode')}
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button role="menuitem" onClick={() => { navigate('/settings'); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      {t('project.settings')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Error Content */}
        <main className="flex-grow flex flex-col items-center justify-center p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {t('error.errorOccurred')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-center">
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            {t('button.retry')}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="content-container flex items-center justify-between px-4 py-3 min-h-16">
          <div className="flex items-stretch min-w-0 flex-1">
            <BrandLogo />
            <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-3" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center">
                <h1 className="text-base font-semibold text-gray-900 dark:text-white">{t('project.title')}</h1>
                <BackgroundRefreshIndicator isRefreshing={isRefreshing} className="ml-2" />
              </div>
              {(serverVersion || serverHostname) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                  {serverHostname}{serverAddress ? ` (${serverAddress})` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-4">
            {/* New Project Button - wide screen only */}
            <button
              onClick={() => setIsNewProjectDialogOpen(true)}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-500 text-gray-900 dark:text-white text-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('project.newProject')}
            </button>
            <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-gray-700 ml-2" />
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`hidden sm:block p-2 rounded-lg transition-colors ${
                  showHidden
                    ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                aria-label={showHidden ? t('project.hideHidden') : t('project.showHidden', { count: hiddenCount })}
                title={showHidden ? t('project.hideHidden') : t('project.showHidden', { count: hiddenCount })}
              >
                {showHidden ? <Eye className="w-5 h-5" aria-hidden="true" /> : <EyeOff className="w-5 h-5" aria-hidden="true" />}
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-700 dark:text-gray-300"
              aria-label={isLoading || isRefreshing ? t('project.refreshing') : t('project.refresh')}
            >
              <RefreshCw
                className={`w-5 h-5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
            <LayoutToggleButton className="hidden sm:block" />
            <ThemeToggleButton className="hidden sm:block" />
            <button
              onClick={() => navigate('/settings')}
              aria-label={t('project.settings')}
              className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Narrow screen: overflow menu */}
            <div className="relative sm:hidden" ref={overflowMenuRef}>
              <button
                onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                aria-label={t('project.menuLabel')}
                aria-expanded={overflowMenuOpen}
                aria-haspopup="menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {overflowMenuOpen && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                  <button role="menuitem" onClick={() => { setIsNewProjectDialogOpen(true); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    {t('project.newProject')}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button role="menuitem" onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? t('project.lightMode') : t('project.darkMode')}
                  </button>
                  {hiddenCount > 0 && (
                    <button role="menuitem" onClick={() => { setShowHidden(!showHidden); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                      {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      {showHidden ? t('project.hideHidden') : t('project.showHidden', { count: hiddenCount })}
                    </button>
                  )}
                  <button role="menuitem" onClick={() => { handleRefresh(); setOverflowMenuOpen(false); }} disabled={isLoading || isRefreshing} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
                    {t('project.refresh')}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button role="menuitem" onClick={() => { navigate('/settings'); setOverflowMenuOpen(false); }} className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    {t('project.settings')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto" role="main">
        <div className="content-container p-4">
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
              {t('project.empty.title')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {t('project.empty.description')}
            </p>
            <button
              onClick={() => setIsNewProjectDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-600 text-gray-900 dark:text-white rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              {t('project.createNewProject')}
            </button>
          </div>
        )}

        {/* Dashboard Summary Bar */}
        {!isLoading && visibleProjects.length > 0 && (
          <DashboardSummaryBar totals={totals} projectCount={visibleProjects.length} />
        )}

        {/* Project Grid */}
        {!isLoading && visibleProjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                dashboardStatus={getProjectStatus(project.projectSlug)}
              />
            ))}
          </div>
        )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2">
        <div className="content-container flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>Hammoc{serverVersion ? ` v${serverVersion}` : ''}</span>
          <button
            onClick={handleLogout}
            className="hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            {t('project.logout')}
          </button>
        </div>
      </footer>

      {/* New Project Dialog */}
      <NewProjectDialog
        isOpen={isNewProjectDialogOpen}
        onClose={() => setIsNewProjectDialogOpen(false)}
        onSuccess={handleNewProjectSuccess}
      />
    </div>
  );
}
