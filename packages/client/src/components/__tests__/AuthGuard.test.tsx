// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from '../AuthGuard';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../services/api/client', () => ({
  api: { get: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  setUnauthorizedHandler: vi.fn(),
}));

vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
  disconnectSocket: vi.fn(),
}));

const renderWithRouter = (initialPath: string = '/protected') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/onboarding" element={<div>Onboarding Page</div>} />
        <Route
          path="/protected"
          element={
            <AuthGuard>
              <div>Protected Content</div>
            </AuthGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
};

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: false,
      isPasswordConfigured: null,
      isLoading: false,
      error: null,
      rateLimitInfo: null,
      checkAuth: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should show spinner when auth is loading', () => {
    useAuthStore.setState({ isLoading: true });
    renderWithRouter();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to /onboarding when password is not configured', async () => {
    useAuthStore.setState({ isPasswordConfigured: false, isLoading: false });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Onboarding Page')).toBeInTheDocument();
    });
  });

  it('should redirect to /login when not authenticated (password exists)', async () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isPasswordConfigured: true,
      isLoading: false,
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('should render children when authenticated', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isPasswordConfigured: true,
      isLoading: false,
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('should call checkAuth on mount', () => {
    const checkAuthMock = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ checkAuth: checkAuthMock });
    renderWithRouter();
    expect(checkAuthMock).toHaveBeenCalled();
  });
});
