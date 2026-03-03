/**
 * PublicRoute Tests
 * [Source: Story 2.3 - Task 10]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PublicRoute } from '../PublicRoute';
import { useAuthStore } from '../../stores/authStore';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to render with router
const renderPublicRoute = (children: React.ReactNode = <div>Protected Content</div>) => {
  return render(
    <BrowserRouter>
      <PublicRoute>{children}</PublicRoute>
    </BrowserRouter>
  );
};

describe('PublicRoute', () => {
  beforeEach(() => {
    // Reset store state, override checkAuth to prevent it from setting isLoading: true
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      rateLimitInfo: null,
      checkAuth: vi.fn().mockResolvedValue(undefined),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('unauthenticated state', () => {
    it('[HIGH] should render children when not authenticated', () => {
      useAuthStore.setState({ isAuthenticated: false, isLoading: false });

      renderPublicRoute(<div>Login Form</div>);

      expect(screen.getByText('Login Form')).toBeInTheDocument();
    });

    it('should not redirect when not authenticated', () => {
      useAuthStore.setState({ isAuthenticated: false, isLoading: false });

      renderPublicRoute();

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('authenticated state', () => {
    it('[HIGH] should redirect to main page when authenticated', async () => {
      useAuthStore.setState({ isAuthenticated: true, isLoading: false });

      renderPublicRoute();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      });
    });

    it('should not render children when authenticated', () => {
      useAuthStore.setState({ isAuthenticated: true, isLoading: false });

      renderPublicRoute(<div>Login Form</div>);

      expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('[MEDIUM] should show loading spinner when isLoading', () => {
      useAuthStore.setState({ isAuthenticated: false, isLoading: true });

      renderPublicRoute();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should not render children while loading', () => {
      useAuthStore.setState({ isAuthenticated: false, isLoading: true });

      renderPublicRoute(<div>Login Form</div>);

      expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
    });

    it('should not redirect while loading', () => {
      useAuthStore.setState({ isAuthenticated: true, isLoading: true });

      renderPublicRoute();

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('state transitions', () => {
    it('should redirect after loading completes with authenticated state', async () => {
      // Start loading
      useAuthStore.setState({ isAuthenticated: false, isLoading: true });
      const { rerender } = renderPublicRoute();

      expect(mockNavigate).not.toHaveBeenCalled();

      // Complete loading with authenticated state
      await act(async () => {
        useAuthStore.setState({ isAuthenticated: true, isLoading: false });
      });
      rerender(
        <BrowserRouter>
          <PublicRoute>
            <div>Login Form</div>
          </PublicRoute>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      });
    });

    it('should render children after loading completes with unauthenticated state', async () => {
      // Start loading
      useAuthStore.setState({ isAuthenticated: false, isLoading: true });
      const { rerender } = renderPublicRoute(<div>Login Form</div>);

      expect(screen.queryByText('Login Form')).not.toBeInTheDocument();

      // Complete loading with unauthenticated state
      await act(async () => {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false });
      });
      rerender(
        <BrowserRouter>
          <PublicRoute>
            <div>Login Form</div>
          </PublicRoute>
        </BrowserRouter>
      );

      expect(screen.getByText('Login Form')).toBeInTheDocument();
    });
  });
});
