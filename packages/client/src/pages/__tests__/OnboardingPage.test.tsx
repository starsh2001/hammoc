import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingPage } from '../OnboardingPage';
import { CliStatusProvider } from '../../contexts/CliStatusContext';
import type { CLIStatusResponse } from '@hammoc/shared';

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock authStore
const mockLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      isAuthenticated: true,
      isLoading: false,
      error: null,
      rateLimitInfo: null,
      logout: mockLogout,
      login: vi.fn(),
      checkAuth: vi.fn(),
      clearError: vi.fn(),
    };
    return selector(state);
  }),
}));

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

Object.defineProperty(window, 'isSecureContext', {
  value: true,
  writable: true,
});

const mockCliStatus: CLIStatusResponse = {
  cliInstalled: false,
  authenticated: false,
  apiKeySet: false,
  setupCommands: {
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude (then type /login in interactive mode)',
    apiKey: 'export ANTHROPIC_API_KEY=<your-api-key>',
  },
};

interface WrapperProps {
  children: React.ReactNode;
  value?: {
    cliStatus: CLIStatusResponse | null;
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    isReady: boolean;
  };
}

function Wrapper({ children, value }: WrapperProps) {
  const defaultValue = {
    cliStatus: mockCliStatus,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    isReady: false,
  };

  return (
    <MemoryRouter>
      <CliStatusProvider value={value || defaultValue}>
        {children}
      </CliStatusProvider>
    </MemoryRouter>
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('should render page title', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByText('시작하기')).toBeInTheDocument();
    expect(screen.getByText('Hammoc 설정')).toBeInTheDocument();
  });

  it('should render description text', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(
      screen.getByText('아래 항목을 완료하면 Hammoc를 사용할 수 있습니다.')
    ).toBeInTheDocument();
  });

  it('should render skeleton when loading', () => {
    render(<OnboardingPage />, {
      wrapper: ({ children }) => (
        <Wrapper
          value={{
            cliStatus: null,
            isLoading: true,
            error: null,
            refetch: vi.fn(),
            isReady: false,
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByRole('status', { name: '체크리스트 로딩 중' })).toBeInTheDocument();
  });

  it('should render checklist items when loaded', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByText('Claude Code 설치')).toBeInTheDocument();
    expect(screen.getByText('계정 인증')).toBeInTheDocument();
    expect(screen.getByText('API 키 설정')).toBeInTheDocument();
  });

  it('should render error message when error occurs', () => {
    render(<OnboardingPage />, {
      wrapper: ({ children }) => (
        <Wrapper
          value={{
            cliStatus: null,
            isLoading: false,
            error: 'CLI 상태 확인 실패',
            refetch: vi.fn(),
            isReady: false,
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByText('CLI 상태 확인 실패')).toBeInTheDocument();
  });

  it('should call refetch when refresh button is clicked', async () => {
    const mockRefetch = vi.fn().mockResolvedValue(undefined);

    render(<OnboardingPage />, {
      wrapper: ({ children }) => (
        <Wrapper
          value={{
            cliStatus: mockCliStatus,
            isLoading: false,
            error: null,
            refetch: mockRefetch,
            isReady: false,
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    const refreshButton = screen.getByRole('button', {
      name: 'CLI 상태 다시 확인',
    });
    fireEvent.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('should disable refresh button when loading', () => {
    render(<OnboardingPage />, {
      wrapper: ({ children }) => (
        <Wrapper
          value={{
            cliStatus: mockCliStatus,
            isLoading: true,
            error: null,
            refetch: vi.fn(),
            isReady: false,
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    const refreshButton = screen.getByRole('button', {
      name: 'CLI 상태 확인 중...',
    });
    expect(refreshButton).toBeDisabled();
  });

  it('should navigate to home when isReady becomes true', async () => {
    render(<OnboardingPage />, {
      wrapper: ({ children }) => (
        <Wrapper
          value={{
            cliStatus: {
              ...mockCliStatus,
              cliInstalled: true,
              authenticated: true,
            },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            isReady: true,
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    expect(
      screen.getByText('✓ 설정이 완료되었습니다. 이동 중...')
    ).toBeInTheDocument();

    // Wait for navigation to be called (after 500ms delay in component)
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      },
      { timeout: 2000 }
    );
  });

  it('should have main landmark role', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should have proper aria-labelledby on main', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('aria-labelledby', 'onboarding-title');
  });

  it('should render back button with proper aria-label', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(
      screen.getByRole('button', { name: '뒤로 가기 (로그아웃)' })
    ).toBeInTheDocument();
  });

  it('should render checklist as a list', () => {
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByRole('list', { name: '설정 체크리스트' })).toBeInTheDocument();
  });
});
