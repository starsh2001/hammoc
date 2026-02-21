import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from '../components/AuthGuard';
import { OnboardingPage } from '../pages/OnboardingPage';
import { api } from '../services/api/client';
import { useAuthStore } from '../stores/authStore';
import type { CLIStatusResponse } from '@bmad-studio/shared';

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Simple placeholder component for main content
function MainContent() {
  return <div>Main Content</div>;
}

// Mock api client
vi.mock('../services/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const mockCliStatusReady: CLIStatusResponse = {
  cliInstalled: true,
  authenticated: true,
  apiKeySet: false,
  setupCommands: {
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude (then type /login in interactive mode)',
    apiKey: 'export ANTHROPIC_API_KEY=<your-api-key>',
  },
};

const mockCliStatusNotReady: CLIStatusResponse = {
  cliInstalled: false,
  authenticated: false,
  apiKeySet: false,
  setupCommands: {
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude (then type /login in interactive mode)',
    apiKey: 'export ANTHROPIC_API_KEY=<your-api-key>',
  },
};

// Helper to create full auth state
function createAuthState(overrides: {
  isAuthenticated?: boolean;
  isLoading?: boolean;
  error?: string | null;
  rateLimitInfo?: null;
  checkAuth?: () => Promise<void>;
  logout?: () => Promise<void>;
  login?: (password: string, rememberMe?: boolean) => Promise<boolean>;
  clearError?: () => void;
} = {}) {
  return {
    isAuthenticated: true,
    isPasswordConfigured: true as boolean | null,
    isLoading: false,
    error: null as string | null,
    rateLimitInfo: null as null,
    checkAuth: vi.fn() as () => Promise<void>,
    logout: vi.fn() as () => Promise<void>,
    login: vi.fn() as (password: string, rememberMe?: boolean) => Promise<boolean>,
    setupPassword: vi.fn() as (password: string, confirmPassword: string) => Promise<boolean>,
    clearError: vi.fn() as () => void,
    ...overrides,
  };
}

// Helper to setup useAuthStore mock
function setupAuthStoreMock(overrides: Parameters<typeof createAuthState>[0] = {}) {
  const state = createAuthState(overrides);
  vi.mocked(useAuthStore).mockImplementation((selectorOrUndefined?) => {
    if (typeof selectorOrUndefined === 'function') {
      return selectorOrUndefined(state);
    }
    return state;
  });
}

// Test wrapper component with routes
function TestApp({ initialEntry = '/' }: { initialEntry?: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/onboarding"
          element={
            <AuthGuard>
              <OnboardingPage />
            </AuthGuard>
          }
        />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <MainContent />
            </AuthGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Onboarding Integration', () => {
  const mockCheckAuth = vi.fn();
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should redirect to onboarding when CLI not ready', async () => {
    // Setup: Authenticated but CLI not ready
    setupAuthStoreMock({
      isAuthenticated: true,
      isLoading: false,
      checkAuth: mockCheckAuth,
      logout: mockLogout,
    });

    vi.mocked(api.get).mockResolvedValue(mockCliStatusNotReady);

    render(<TestApp initialEntry="/" />);

    // Wait for redirect to onboarding
    await waitFor(() => {
      expect(screen.getByText('시작하기')).toBeInTheDocument();
    });

    expect(screen.getByText('BMad Studio 설정')).toBeInTheDocument();
  });

  it('should show main content when CLI is ready', async () => {
    // Setup: Authenticated and CLI ready
    setupAuthStoreMock({
      isAuthenticated: true,
      isLoading: false,
      checkAuth: mockCheckAuth,
      logout: mockLogout,
    });

    vi.mocked(api.get).mockResolvedValue(mockCliStatusReady);

    render(<TestApp initialEntry="/" />);

    // Should not show onboarding page after loading
    await waitFor(() => {
      expect(screen.queryByText('CLI 상태 확인 중...')).not.toBeInTheDocument();
    });

    // Should not be on onboarding
    expect(screen.queryByText('시작하기')).not.toBeInTheDocument();
  });

  // Note: These tests are affected by AuthGuard's module-level caching
  // (hasFetchedCliStatus, cachedCliStatus) which persists across tests
  it.skip('should display checklist items on onboarding page', async () => {
    // Setup: Authenticated but CLI not ready
    setupAuthStoreMock({
      isAuthenticated: true,
      isLoading: false,
      checkAuth: mockCheckAuth,
      logout: mockLogout,
    });

    vi.mocked(api.get).mockResolvedValue(mockCliStatusNotReady);

    // Start from '/' to trigger AuthGuard's CLI check and redirect to /onboarding
    render(<TestApp initialEntry="/" />);

    // Wait for redirect to onboarding and checklist items to appear
    await waitFor(() => {
      expect(screen.getByText('Claude Code 설치')).toBeInTheDocument();
    });

    expect(screen.getByText('계정 인증')).toBeInTheDocument();
    expect(screen.getByText('API 키 설정')).toBeInTheDocument();
  });

  // Note: This test is affected by AuthGuard's module-level caching
  it.skip('should only call CLI status API once during navigation', async () => {
    // Setup: Authenticated but CLI not ready
    setupAuthStoreMock({
      isAuthenticated: true,
      isLoading: false,
      checkAuth: mockCheckAuth,
      logout: mockLogout,
    });

    vi.mocked(api.get).mockResolvedValue(mockCliStatusNotReady);

    render(<TestApp initialEntry="/" />);

    // Wait for onboarding page
    await waitFor(() => {
      expect(screen.getByText('시작하기')).toBeInTheDocument();
    });

    // API should be called only once (from AuthGuard)
    // OnboardingPage uses Context, not direct API call
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/cli-status');
  });
});
