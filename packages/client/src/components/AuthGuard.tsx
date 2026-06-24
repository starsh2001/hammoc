/**
 * AuthGuard - Protected route wrapper (BS-9 redesign)
 *
 * Redirect chain (strict priority order):
 * 1. !isPasswordConfigured → /onboarding (fresh install, needs wizard)
 * 2. !isAuthenticated → /login (returning user, needs login)
 * 3. !onboardingComplete → /onboarding (authenticated but wizard incomplete)
 * 4. else → render children
 */

import { useEffect, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { LoadingSpinner } from './LoadingSpinner';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading: authLoading, isPasswordConfigured, checkAuth } = useAuthStore();
  const location = useLocation();

  const prefsLoaded = usePreferencesStore((s) => s.loaded);
  const onboardingComplete = usePreferencesStore((s) => s.preferences.onboardingComplete);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Initialize preferences if authenticated (needed to read onboardingComplete)
  useEffect(() => {
    if (isAuthenticated && !prefsLoaded) {
      usePreferencesStore.getState().init();
    }
  }, [isAuthenticated, prefsLoaded]);

  // 1. Auth loading — show spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#1c2129]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // 2. No password configured → wizard (fresh install)
  if (isPasswordConfigured === false) {
    return <Navigate to="/onboarding" replace />;
  }

  // 3. Not authenticated → login page
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 4. Wait for preferences to load before checking onboardingComplete
  if (!prefsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#1c2129]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // 5. Authenticated but onboarding incomplete → wizard
  if (!onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  // 6. All good — render children
  return <>{children}</>;
}
