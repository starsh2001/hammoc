/**
 * App Component
 * Story 2.2: Login Page with Authentication
 * Story 2.3: Session Cookie Management
 * Story 2.6: Onboarding Screen
 * Story 3.2: Project List UI
 * Story 3.4: Session List UI
 * Story 3.5: Session History Loading
 * Story 4.7: Connection Status Display - Added toast notifications
 * Story 11.3: TextEditor global mount
 *
 * Main application entry point with routing and auth guard
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { SessionListPage } from './pages/SessionListPage';
import { BmadOverview } from './pages/BmadOverview';
import { ProjectSessionsPage } from './pages/ProjectSessionsPage';
import { ProjectQueuePage } from './pages/ProjectBatchPage';
import { ProjectGitPage } from './pages/ProjectGitPage';
import { ProjectTerminalPage } from './pages/ProjectTerminalPage';
import { ProjectBoardPage } from './pages/ProjectBoardPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectTabLayout } from './layouts/ProjectTabLayout';
import { AuthGuard } from './components/AuthGuard';
import { PublicRoute } from './components/PublicRoute';
import { useTheme } from './hooks/useTheme';
import { usePreferencesStore } from './stores/preferencesStore';
import { TextEditor } from './components/editor/TextEditor';
import { FileExplorerTab } from './components/files/FileExplorerTab.js';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppResumeRecovery } from './hooks/useAppResumeRecovery';

function AppContent() {
  // Initialize server-side preferences (fetches from server, migrates localStorage if needed)
  useEffect(() => {
    usePreferencesStore.getState().init();
  }, []);

  // Recover socket + auth state when browser resumes from background
  useAppResumeRecovery();

  // Initialize theme on app mount
  const { theme } = useTheme();

  useEffect(() => {
    // Ensure theme class is applied on initial render
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route
        path="/onboarding"
        element={
          <AuthGuard>
            <OnboardingPage />
          </AuthGuard>
        }
      />
      <Route
        path="/"
        element={
          <AuthGuard>
            <ProjectListPage />
          </AuthGuard>
        }
      />
      <Route
        path="/project/:projectSlug"
        element={
          <AuthGuard>
            <ProjectTabLayout />
          </AuthGuard>
        }
      >
        <Route index element={<BmadOverview />} />
        <Route path="files" element={<FileExplorerTab />} />
        <Route path="sessions" element={<ProjectSessionsPage />} />
        <Route path="queue" element={<ProjectQueuePage />} />
        <Route path="git" element={<ProjectGitPage />} />
        <Route path="terminal" element={<ProjectTerminalPage />} />
        <Route path="board" element={<ProjectBoardPage />} />
      </Route>
      <Route
        path="/settings"
        element={
          <AuthGuard>
            <SettingsPage />
          </AuthGuard>
        }
      />
      <Route
        path="/settings/:tab"
        element={
          <AuthGuard>
            <SettingsPage />
          </AuthGuard>
        }
      />
      <Route
        path="/project/:projectSlug/session/:sessionId"
        element={
          <AuthGuard>
            <ChatPage />
          </AuthGuard>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster position="top-right" richColors duration={3000} />
        <TextEditor />
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
