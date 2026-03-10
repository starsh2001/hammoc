/**
 * ProjectTabLayout - Shared layout for project-level views
 * Provides header with project info + tab navigation
 * Tabs: Overview, Sessions, Queue Runner
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LayoutDashboard, FolderOpen, MessageSquare, ListOrdered, GitBranch, Terminal, Kanban, Settings, MoreVertical, Moon, Sun } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useTerminalStore } from '../stores/terminalStore';
import { BrandLogo } from '../components/BrandLogo';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { LayoutToggleButton } from '../components/LayoutToggleButton';
import { ConnectionStatusIndicator } from '../components/ConnectionStatusIndicator';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTheme } from '../hooks/useTheme';
import { useWebSocket } from '../hooks/useWebSocket';

const tabs: Array<{ id: string; labelKey: string; icon: typeof LayoutDashboard; path: string }> = [
  { id: 'overview', labelKey: 'tabs.overview', icon: LayoutDashboard, path: '' },
  { id: 'board', labelKey: 'tabs.board', icon: Kanban, path: '/board' },
  { id: 'sessions', labelKey: 'tabs.sessions', icon: MessageSquare, path: '/sessions' },
  { id: 'queue', labelKey: 'tabs.queue', icon: ListOrdered, path: '/queue' },
  { id: 'files', labelKey: 'tabs.files', icon: FolderOpen, path: '/files' },
  { id: 'git', labelKey: 'tabs.git', icon: GitBranch, path: '/git' },
  { id: 'terminal', labelKey: 'tabs.terminal', icon: Terminal, path: '/terminal' },
];

export function ProjectTabLayout() {
  const { t } = useTranslation('common');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { projects, fetchProjects } = useProjectStore();
  const { connectionStatus, reconnectAttempt, lastError, connect } = useWebSocket();

  // Story 17.5: Terminal access control
  const terminalAccess = useTerminalStore((state) => state.terminalAccess);
  const isTerminalEnabled = terminalAccess?.enabled !== false;
  const isTerminalAccessible = terminalAccess?.allowed ?? true;

  // Ensure project list is loaded (e.g. after a page refresh on /project/:slug)
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);
  const { theme, toggleTheme } = useTheme();

  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(overflowMenuRef, () => setOverflowMenuOpen(false));

  const projectFullPath = useMemo(() => {
    const project = projects.find((p) => p.projectSlug === projectSlug);
    return project?.originalPath || projectSlug || '';
  }, [projects, projectSlug]);

  const projectDirName = useMemo(() => {
    const parts = projectFullPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || projectFullPath;
  }, [projectFullPath]);

  // Determine active tab from URL (reverse order for longest prefix match)
  const activeTabId = useMemo(() => {
    const basePath = `/project/${projectSlug}`;
    for (const tab of [...tabs].reverse()) {
      if (tab.path && location.pathname.startsWith(`${basePath}${tab.path}`)) {
        return tab.id;
      }
    }
    return 'overview';
  }, [location.pathname, projectSlug]);

  const handleBack = () => navigate('/');

  const handleTabClick = (tabPath: string) => {
    navigate(`/project/${projectSlug}${tabPath}`);
  };

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-[#1c2129] transition-colors duration-200">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-slate-50 dark:bg-[#171e24] border-b border-slate-200 dark:border-slate-700/50">
        {/* Top row: project info + actions */}
        <div className="content-container flex items-center justify-between px-4 py-3 min-h-14">
          <div className="flex items-stretch min-w-0 flex-1">
            <button
              onClick={handleBack}
              className="self-center p-2 -ml-2 mr-2 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg text-gray-700 dark:text-gray-200"
              aria-label={t('layout.back')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <BrandLogo />
            <div className="w-px self-stretch bg-gray-200 dark:bg-[#253040] mx-3" />
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold truncate text-gray-900 dark:text-white">{projectDirName}</h1>
              <p className="text-xs text-gray-400 dark:text-gray-400 truncate">{projectFullPath}</p>
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1 ml-4">
            <ConnectionStatusIndicator
              status={connectionStatus}
              reconnectAttempt={reconnectAttempt}
              lastError={lastError}
              onReconnect={connect}
              compact
            />
            <LayoutToggleButton className="hidden sm:block" />
            <ThemeToggleButton className="hidden sm:block" />
            <button
              onClick={() => navigate('/settings')}
              aria-label={t('project.settings')}
              className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#253040] text-gray-700 dark:text-gray-200 transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </button>
            {/* Narrow screen: overflow menu */}
            <div className="relative sm:hidden" ref={overflowMenuRef}>
              <button
                onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg text-gray-700 dark:text-gray-200"
                aria-label={t('project.menuLabel')}
                aria-expanded={overflowMenuOpen}
                aria-haspopup="menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {overflowMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#263240] rounded-lg shadow-lg border border-gray-200 dark:border-[#253040] z-50 py-1"
                >
                  <button
                    role="menuitem"
                    onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] flex items-center gap-2"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? t('project.lightMode') : t('project.darkMode')}
                  </button>
                  <div className="border-t border-gray-200 dark:border-[#253040] my-1" />
                  <button
                    role="menuitem"
                    onClick={() => { navigate('/settings'); setOverflowMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    {t('project.settings')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <nav className="content-container flex px-4" aria-label={t('layout.projectTabs')}>
          {tabs.map((tab) => {
            // Story 17.5: AC1 — hide terminal tab when disabled
            if (tab.id === 'terminal' && !isTerminalEnabled) return null;

            const isActive = activeTabId === tab.id;
            const Icon = tab.icon;

            // Story 17.5: AC4 — disable terminal tab for non-local clients
            const isDisabled = tab.id === 'terminal' && !isTerminalAccessible;

            return (
              <button
                key={tab.id}
                onClick={isDisabled ? undefined : () => handleTabClick(tab.path)}
                disabled={isDisabled}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isDisabled
                    ? 'border-transparent opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-400'
                    : isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-[#2d3a4a]'
                }`}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={isDisabled || undefined}
                aria-label={isDisabled ? t('layout.terminalDisabled') : undefined}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Tab content */}
      <main className="flex-1 overflow-auto">
        <div className="content-container h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
