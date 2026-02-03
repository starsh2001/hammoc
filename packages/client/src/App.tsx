/**
 * App Component
 * Story 2.2: Login Page with Authentication
 * Story 2.3: Session Cookie Management
 * Story 2.6: Onboarding Screen
 * Story 3.2: Project List UI
 * Story 3.4: Session List UI
 * Story 3.5: Session History Loading
 * Story 4.7: Connection Status Display - Added toast notifications
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
import { ChatPage } from './pages/ChatPage';
import { AuthGuard } from './components/AuthGuard';
import { PublicRoute } from './components/PublicRoute';
import { useTheme } from './hooks/useTheme';

function AppContent() {
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
            <SessionListPage />
          </AuthGuard>
        }
      />
      <Route
        path="/project/:projectSlug/session/new"
        element={
          <AuthGuard>
            <ChatPage />
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
    <BrowserRouter>
      <Toaster position="top-right" richColors duration={3000} />
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
