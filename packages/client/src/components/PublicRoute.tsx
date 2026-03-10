/**
 * PublicRoute - Route guard for public pages
 * Redirects authenticated users to main page
 * [Source: Story 2.3 - Task 7]
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { LoadingSpinner } from './LoadingSpinner';

interface PublicRouteProps {
  children: React.ReactNode;
}

/**
 * Public route guard
 * - Authenticated users are redirected to main page
 * - Opposite role of AuthGuard
 */
export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const navigate = useNavigate();

  // Trigger auth check so isLoading resolves even when children (LoginPage)
  // are not yet mounted (PublicRoute shows spinner while isLoading is true).
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#1c2129]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
