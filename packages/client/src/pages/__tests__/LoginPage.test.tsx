/**
 * LoginPage Tests
 * [Source: Story 2.2 - Task 11, Story 2.3 - Task 10]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';
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
const renderLoginPage = () => {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      rateLimitInfo: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render password input field', () => {
      renderLoginPage();

      expect(screen.getByLabelText('패스워드')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('패스워드를 입력하세요')).toBeInTheDocument();
    });

    it('should render login button', () => {
      renderLoginPage();

      expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
    });

    it('should render BMad Studio title', () => {
      renderLoginPage();

      expect(screen.getByText('BMad Studio')).toBeInTheDocument();
    });

    it('should apply dark mode classes', () => {
      renderLoginPage();

      // Find the outermost container with min-h-screen class
      const container = screen.getByText('BMad Studio').closest('.min-h-screen');
      expect(container?.className).toContain('dark:bg-gray-900');
    });

    // Story 2.3 - rememberMe checkbox tests
    it('[HIGH] should render "자동 로그인 유지" checkbox', () => {
      renderLoginPage();

      expect(screen.getByLabelText('자동 로그인 유지')).toBeInTheDocument();
    });

    it('[HIGH] should have checkbox checked by default (rememberMe=true)', () => {
      renderLoginPage();

      const checkbox = screen.getByLabelText('자동 로그인 유지');
      expect(checkbox).toBeChecked();
    });

    it('[MEDIUM] should toggle checkbox state on click', async () => {
      renderLoginPage();

      const checkbox = screen.getByLabelText('자동 로그인 유지');
      expect(checkbox).toBeChecked();

      await userEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();

      await userEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it('[MEDIUM] should toggle checkbox when clicking label (htmlFor connection)', async () => {
      renderLoginPage();

      const label = screen.getByText('자동 로그인 유지');
      const checkbox = screen.getByLabelText('자동 로그인 유지');

      expect(checkbox).toBeChecked();
      await userEvent.click(label);
      expect(checkbox).not.toBeChecked();
    });

    it('[LOW] should have aria-describedby for screen reader description', () => {
      renderLoginPage();

      const checkbox = screen.getByLabelText('자동 로그인 유지');
      expect(checkbox).toHaveAttribute('aria-describedby', 'rememberMe-description');

      // Check that the description element exists
      const description = document.getElementById('rememberMe-description');
      expect(description).toBeInTheDocument();
      expect(description).toHaveTextContent('브라우저를 닫아도 로그인이 30일간 유지됩니다');
    });

    it('[LOW] should have sr-only class for hidden description', () => {
      renderLoginPage();

      const description = document.getElementById('rememberMe-description');
      expect(description?.className).toContain('sr-only');
    });
  });

  describe('form submission', () => {
    it('should call login on button click', async () => {
      const loginSpy = vi.fn().mockResolvedValue(true);
      useAuthStore.setState({ login: loginSpy });

      renderLoginPage();

      const passwordInput = screen.getByLabelText('패스워드');
      const loginButton = screen.getByRole('button', { name: '로그인' });

      await userEvent.type(passwordInput, 'test-password');
      await userEvent.click(loginButton);

      expect(loginSpy).toHaveBeenCalledWith('test-password', true);
    });

    it('should submit form on Enter key', async () => {
      const loginSpy = vi.fn().mockResolvedValue(true);
      useAuthStore.setState({ login: loginSpy });

      renderLoginPage();

      const passwordInput = screen.getByLabelText('패스워드');

      await userEvent.type(passwordInput, 'test-password{enter}');

      expect(loginSpy).toHaveBeenCalledWith('test-password', true);
    });

    it('[HIGH] should pass rememberMe value to login', async () => {
      const loginSpy = vi.fn().mockResolvedValue(true);
      useAuthStore.setState({ login: loginSpy });

      renderLoginPage();

      const passwordInput = screen.getByLabelText('패스워드');
      const checkbox = screen.getByLabelText('자동 로그인 유지');
      const loginButton = screen.getByRole('button', { name: '로그인' });

      // Uncheck rememberMe
      await userEvent.click(checkbox);

      await userEvent.type(passwordInput, 'test-password');
      await userEvent.click(loginButton);

      expect(loginSpy).toHaveBeenCalledWith('test-password', false);
    });

    it('should navigate to home on successful login', async () => {
      const loginSpy = vi.fn().mockResolvedValue(true);
      useAuthStore.setState({ login: loginSpy });

      renderLoginPage();

      const passwordInput = screen.getByLabelText('패스워드');
      await userEvent.type(passwordInput, 'correct-password{enter}');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      });
    });
  });

  describe('error handling', () => {
    it('should display error message', () => {
      useAuthStore.setState({ error: '패스워드가 올바르지 않습니다.' });

      renderLoginPage();

      expect(screen.getByRole('alert')).toHaveTextContent('패스워드가 올바르지 않습니다.');
    });
  });

  describe('rate limiting', () => {
    it('should display rate limit countdown', async () => {
      vi.useFakeTimers();

      useAuthStore.setState({
        error: '로그인 시도 횟수를 초과했습니다.',
        rateLimitInfo: { retryAfter: 30, remainingAttempts: 0 },
      });

      renderLoginPage();

      expect(screen.getByRole('alert')).toHaveTextContent('30초 후에 다시 시도해주세요');

      vi.useRealTimers();
    });

    it('should disable input and button during rate limit', () => {
      useAuthStore.setState({
        rateLimitInfo: { retryAfter: 30, remainingAttempts: 0 },
      });

      renderLoginPage();

      expect(screen.getByLabelText('패스워드')).toBeDisabled();
      expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
    });

    it('should disable checkbox during rate limit', () => {
      useAuthStore.setState({
        rateLimitInfo: { retryAfter: 30, remainingAttempts: 0 },
      });

      renderLoginPage();

      expect(screen.getByLabelText('자동 로그인 유지')).toBeDisabled();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when isLoading', () => {
      useAuthStore.setState({ isLoading: true });

      renderLoginPage();

      expect(screen.getByRole('button')).toHaveTextContent('로그인 중...');
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should disable input and button when loading', () => {
      useAuthStore.setState({ isLoading: true });

      renderLoginPage();

      expect(screen.getByLabelText('패스워드')).toBeDisabled();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should disable checkbox when loading', () => {
      useAuthStore.setState({ isLoading: true });

      renderLoginPage();

      expect(screen.getByLabelText('자동 로그인 유지')).toBeDisabled();
    });
  });

  describe('authentication redirect', () => {
    it('should redirect to home if already authenticated', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      renderLoginPage();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      });
    });
  });
});
