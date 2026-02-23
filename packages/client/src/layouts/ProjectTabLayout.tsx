/**
 * ProjectTabLayout - Shared layout for project-level views
 * Provides header with project info + tab navigation
 * Tabs: Dashboard, Sessions, Queue Runner
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, FolderOpen, MessageSquare, ListOrdered, GitBranch, Terminal, Settings, MoreVertical, Moon, Sun, LogOut } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useAuthStore } from '../stores/authStore';
import { BrandLogo } from '../components/BrandLogo';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { LayoutToggleButton } from '../components/LayoutToggleButton';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTheme } from '../hooks/useTheme';

const tabs = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, path: '' },
  { id: 'sessions', label: '세션', icon: MessageSquare, path: '/sessions' },
  { id: 'queue', label: '큐 러너', icon: ListOrdered, path: '/queue' },
  { id: 'files', label: '파일', icon: FolderOpen, path: '/files' },
  { id: 'git', label: 'Git', icon: GitBranch, path: '/git' },
  { id: 'terminal', label: '터미널', icon: Terminal, path: '/terminal' },
] as const;

export function ProjectTabLayout() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { projects, fetchProjects } = useProjectStore();
  const { logout } = useAuthStore();

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
    return 'dashboard';
  }, [location.pathname, projectSlug]);

  const handleBack = () => navigate('/');

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleTabClick = (tabPath: string) => {
    navigate(`/project/${projectSlug}${tabPath}`);
  };

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {/* Top row: project info + actions */}
        <div className="content-container flex items-center justify-between px-4 py-3 min-h-14">
          <div className="flex items-center min-w-0 flex-1">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              aria-label="뒤로 가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <BrandLogo />
            <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-3" />
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold truncate text-gray-900 dark:text-white">{projectDirName}</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{projectFullPath}</p>
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1 ml-4">
            <LayoutToggleButton className="hidden sm:block" />
            <ThemeToggleButton className="hidden sm:block" />
            <button
              onClick={() => navigate('/settings')}
              aria-label="설정"
              className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              onClick={handleLogout}
              aria-label="로그아웃"
              className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 transition-colors"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Narrow screen: overflow menu */}
            <div className="relative sm:hidden" ref={overflowMenuRef}>
              <button
                onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                aria-label="메뉴"
                aria-expanded={overflowMenuOpen}
                aria-haspopup="menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {overflowMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1"
                >
                  <button
                    role="menuitem"
                    onClick={() => { toggleTheme(); setOverflowMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? '라이트 모드' : '다크 모드'}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button
                    role="menuitem"
                    onClick={() => { navigate('/settings'); setOverflowMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    설정
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button
                    role="menuitem"
                    onClick={() => { handleLogout(); setOverflowMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <nav className="content-container flex px-4" aria-label="프로젝트 탭">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.path)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
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
